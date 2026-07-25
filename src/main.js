const { app, BrowserWindow, ipcMain, net, autoUpdater, dialog, Tray, Menu, Notification, nativeImage, shell } = require('electron');
if (require('electron-squirrel-startup')) {
  app.quit();
  process.exit(0);
}
const path = require('node:path');
const dgram = require('dgram');
const o = require('openurl');
const serve = require('electron-serve').default;
const loadURL = serve({ directory: './public' });
const fs = require('fs');
const rpc = require("@xhayper/discord-rpc");

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('anideskplus', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('anideskplus');
}

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    try {
      const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx > 0) {
          const key = trimmed.slice(0, idx).trim();
          let val = trimmed.slice(idx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    } catch (e) {
      console.error('Error loading .env file:', e);
    }
  }
}
loadEnv();

const { SibnetParser } = require('anixartjs');

const isDebugMode = process.argv.includes('--debug') || process.argv.includes('-d');
if (isDebugMode) {
  console.log('[DEBUG] Running AniDeskPlus in DEBUG mode');
}

/**
 * @type {BrowserWindow}
 */
let mainWindow;
let tray = null;
let isQuitting = false;

const server = 'https://update.electronjs.org';
const feed = `${server}/MjKey/AniDeskPlus/${process.platform}-${process.arch}/${app.getVersion()}`;
const UserAgent = "AnixartApp/9.0 BETA 3-25021818 (Android 9; SDK 28; x86_64; ROG ASUS AI2201_B; ru)";
const rpcClientId = '1372649290438148137';
const SettingsPath = path.join(app.getPath("userData"), "settings.json");
const DefaultSettings = require('./shared/defaultSettings.json');

class SettingsManager {
  constructor(filePath, defaults) {
    this.filePath = filePath;
    this.defaults = defaults;
    this._cache = null;
    this._writeQueue = Promise.resolve();
  }

  _load() {
    if (this._cache) return this._cache;
    try {
      if (fs.existsSync(this.filePath)) {
        this._cache = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      } else {
        this._cache = { ...this.defaults };
      }
    } catch (e) {
      console.error('Settings load error:', e);
      this._cache = { ...this.defaults };
    }
    return this._cache;
  }

  get(key) {
    const settings = this._load();
    return settings?.[key] ?? this.defaults?.[key] ?? null;
  }

  set(key, value) {
    const settings = this._load();
    settings[key] = value;
    this._cache = settings;
    const tempPath = `${this.filePath}.tmp`;
    const data = JSON.stringify(settings, null, 2);
    this._writeQueue = this._writeQueue.then(async () => {
      await fs.promises.writeFile(tempPath, data, 'utf-8');
      await fs.promises.rename(tempPath, this.filePath);
    }).catch(e => console.error('Settings write error:', e));
  }

  getAll() {
    return { ...this.defaults, ...this._load() };
  }
}

const settingsManager = new SettingsManager(SettingsPath, DefaultSettings);
const SettingsFirst = settingsManager.getAll();

let updateStatusCache = { status: 'idle', currentVersion: app.getVersion() };

function broadcastUpdaterStatus(statusData) {
  updateStatusCache = { ...statusData, currentVersion: app.getVersion() };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:status', updateStatusCache);
  }
}

async function checkForUpdatesGitHub() {
  const currentVersion = app.getVersion();
  try {
    const res = await net.fetch("https://api.github.com/repos/MjKey/AniDeskPlus/releases/latest", {
      headers: { "User-Agent": "AniDeskPlusApp" }
    });
    if (res.ok) {
      const data = await res.json();
      const latestTag = (data.tag_name || "").replace(/^v/, "").trim();
      const cleanCurrent = (currentVersion || "").replace(/^v/, "").trim();
      const isNewer = compareVersions(latestTag, cleanCurrent) > 0;
      return {
        status: isNewer ? "available" : "latest",
        latestVersion: latestTag,
        currentVersion: cleanCurrent,
        releaseUrl: data.html_url || "https://github.com/MjKey/AniDeskPlus/releases",
        text: isNewer ? `Доступно обновление v${latestTag}!` : `У вас установлена последняя версия (v${cleanCurrent})`
      };
    }
  } catch (e) {
    console.error("GitHub release check error:", e);
    return { status: "error", text: "Ошибка при проверке обновлений.", currentVersion };
  }
  return { status: "latest", currentVersion };
}

function initAutoUpdater() {
  if (!SettingsFirst.AutoUpdate) return;

  if (app.isPackaged) {
    autoUpdater.on("checking-for-update", () => {
      if (isDebugMode) console.log("[DEBUG] Squirrel checking for updates...");
      broadcastUpdaterStatus({ status: "checking", text: "Проверка обновлений..." });
    });

    autoUpdater.on("update-available", () => {
      if (isDebugMode) console.log("[DEBUG] Squirrel update available - downloading");
      broadcastUpdaterStatus({ status: "downloading", text: "Найдено обновление! Идет фоновая загрузка..." });
    });

    autoUpdater.on("update-not-available", () => {
      if (isDebugMode) console.log("[DEBUG] Squirrel update not available");
      broadcastUpdaterStatus({ status: "latest", text: `У вас установлена последняя версия (v${app.getVersion()})` });
    });

    autoUpdater.on('error', async (err) => {
      if (isDebugMode) console.log('[DEBUG] Squirrel AutoUpdater error, falling back to GitHub API:', err?.message || err);
      const ghStatus = await checkForUpdatesGitHub();
      broadcastUpdaterStatus(ghStatus);
    });

    autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
      if (isDebugMode) console.log("[DEBUG] Squirrel update downloaded");
      broadcastUpdaterStatus({
        status: "downloaded",
        text: "Обновление скачано и готово к установке!",
        releaseNotes,
        releaseName
      });

      const dialogOpts = {
        type: 'info',
        buttons: ['Перезапустить и обновить', 'Позже'],
        title: 'Обновление AniDeskPlus',
        message: process.platform === 'win32' ? (releaseName || 'Новая версия готова!') : releaseName,
        detail: 'Новая версия успешно скачана. Перезапустить приложение сейчас для установки?'
      };

      if (mainWindow && !mainWindow.isDestroyed()) {
        dialog.showMessageBox(mainWindow, dialogOpts).then((returnValue) => {
          if (returnValue.response === 0) {
            isQuitting = true;
            autoUpdater.quitAndInstall();
          }
        });
      }
    });

    try {
      autoUpdater.setFeedURL({ url: feed });
    } catch (e) {
      console.error("AutoUpdater setFeedURL error:", e);
    }
  }

  setTimeout(async () => {
    try {
      if (app.isPackaged) {
        autoUpdater.checkForUpdates();
      } else {
        const status = await checkForUpdatesGitHub();
        broadcastUpdaterStatus(status);
      }
    } catch (e) {
      const status = await checkForUpdatesGitHub();
      broadcastUpdaterStatus(status);
    }
  }, 5000);
}

let pendingDeepLinkPayload = null;

function parseDeepLinkUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const urlStr = rawUrl.trim().replace(/^"+|"+$/g, '');
  if (!urlStr.toLowerCase().startsWith('anideskplus://')) return null;

  try {
    const parsed = new URL(urlStr);
    const roomCode = parsed.searchParams.get('room') || 
                     parsed.searchParams.get('roomCode') || 
                     parsed.searchParams.get('code');
    if (roomCode) {
      return { roomCode, action: 'join' };
    }
  } catch (e) {
    // URL constructor failed, fallback to regex
  }

  const match = urlStr.match(/(?:room|roomCode|code)=([A-Za-z0-9_-]+)/i);
  if (match && match[1]) {
    return { roomCode: match[1], action: 'join' };
  }

  return null;
}

function handleDeepLinkUrl(urlStr) {
  const payload = parseDeepLinkUrl(urlStr);
  if (!payload) return false;

  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send('together:deep-link', payload);
  } else {
    pendingDeepLinkPayload = payload;
  }
  return true;
}

function checkCommandLineForDeepLink(argv) {
  if (!Array.isArray(argv)) return;
  for (const arg of argv) {
    if (typeof arg === 'string' && arg.toLowerCase().startsWith('anideskplus://')) {
      if (handleDeepLinkUrl(arg)) break;
    }
  }
}

const isFirstInstance = app.requestSingleInstanceLock();

if (!isFirstInstance) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    checkCommandLineForDeepLink(commandLine);
  });
}

app.on('open-url', (event, urlStr) => {
  event.preventDefault();
  handleDeepLinkUrl(urlStr);
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

const discordRpcClient = new rpc.Client({ clientId: rpcClientId });

if (SettingsFirst.EnableRPC) {
  discordRpcClient.login().catch(console.error);
}

let debugWindow = null;

function isDev() {
  return !app.isPackaged;
}

function getAppIconPath() {
  const candidates = [
    path.join(__dirname, 'icon', 'icon.ico'),
    path.join(__dirname, 'public', 'assets', 'icons', 'anidesk-icon.png'),
    path.join(process.resourcesPath || '', 'icon', 'icon.ico'),
    path.join(app.getAppPath(), 'icon', 'icon.ico'),
    path.join(app.getAppPath(), 'public', 'assets', 'icons', 'anidesk-icon.png')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.join(__dirname, 'public', 'assets', 'icons', 'anidesk-icon.png');
}

function createTray() {
  if (tray) return;
  const iconPath = getAppIconPath();
  const trayIcon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  tray = new Tray(trayIcon);
  tray.setToolTip('AniDeskPlus');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Показать AniDeskPlus',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Выйти',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createDebugWindow() {
  if (debugWindow && !debugWindow.isDestroyed()) {
    debugWindow.focus();
    return;
  }
  debugWindow = new BrowserWindow({
    width: 850,
    height: 600,
    title: 'AniDeskPlus — Live Debug Console',
    icon: getAppIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false
    }
  });

  const debugHtmlPath = path.join(__dirname, 'public', 'debug.html');
  debugWindow.loadFile(debugHtmlPath);

  debugWindow.on('closed', () => {
    debugWindow = null;
  });
}

function sendDebugLog(type, message, data = null) {
  const payload = {
    timestamp: new Date().toLocaleTimeString(),
    type,
    message: typeof message === 'object' ? JSON.stringify(message) : String(message),
    data
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('debug:log', payload);
  }
  if (debugWindow && !debugWindow.isDestroyed()) {
    debugWindow.webContents.send('debug:log', payload);
  }
}

function UpsertKeyValue(obj, keyToChange, value) {
  const keyToChangeLower = keyToChange.toLowerCase();
  for (const key of Object.keys(obj)) {
    if (key.toLowerCase() === keyToChangeLower) {
      obj[key] = value;
      return;
    }
  }

  obj[keyToChange] = value;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    titleBarStyle: 'hidden',
    width: 1280,
    height: 720,
    minHeight: 720,
    minWidth: 1280,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      devTools: SettingsFirst.EnableDevTools || isDebugMode
    },
    icon: getAppIconPath(),
    show: false,
  });

  if (SettingsFirst.EnableDevTools) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  if (isDev()) {
    mainWindow.loadURL('http://localhost:8080/');
  } else {
    loadURL(mainWindow);
  }

  mainWindow.on('close', function (event) {
    const minimizeToTray = settingsManager.get('MinimizeToTray');

    if (!isQuitting && minimizeToTray) {
      event.preventDefault();
      mainWindow.hide();
    } else {
      mainWindow = null;
    }
  });

  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('fullscreen:changed', true);
  });

  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('fullscreen:changed', false);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingDeepLinkPayload && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('together:deep-link', pendingDeepLinkPayload);
      pendingDeepLinkPayload = null;
    }
  });

  mainWindow.once('ready-to-show', async () => {
    mainWindow.show();
    if (pendingDeepLinkPayload && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('together:deep-link', pendingDeepLinkPayload);
      pendingDeepLinkPayload = null;
    }
  });

  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    (details, callback) => {
      const { url, requestHeaders } = details;
      const host = new URL(url).host;

      if (isDebugMode) {
        sendDebugLog('net', `-> [${details.method}] ${url}`);
      }

      UpsertKeyValue(requestHeaders, 'Referer', null);
      UpsertKeyValue(requestHeaders, 'Access-Control-Allow-Origin', ['*']);

      if (host === "video.sibnet.ru") {
        UpsertKeyValue(requestHeaders, 'Referer', url);
      }

      if (host !== "kodikplayer.com" && host !== "video.sibnet.ru") {
        UpsertKeyValue(requestHeaders, 'sec-ch-ua-platform', "Android");
        UpsertKeyValue(requestHeaders, 'sec-ch-ua-mobile', "?1");
        UpsertKeyValue(requestHeaders, 'sec-ch-ua', "AnixartApp");
        UpsertKeyValue(requestHeaders, 'User-Agent', UserAgent);
      }
      callback({ requestHeaders });
    },
  );

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const { responseHeaders, statusCode, url } = details;
    if (isDebugMode) {
      sendDebugLog('net', `<- [${statusCode}] ${url}`);
    }
    UpsertKeyValue(responseHeaders, 'Access-Control-Allow-Origin', ['*']);
    UpsertKeyValue(responseHeaders, 'Access-Control-Allow-Headers', ['*']);
    callback({
      responseHeaders,
    });
  });
}

app.on('ready', () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.mjkey.anideskplus');
  }
  checkCommandLineForDeepLink(process.argv);
  createTray();
  createWindow();
  if (isDebugMode) {
    createDebugWindow();
  }
  initAutoUpdater();
});

app.on('before-quit', () => {
  isQuitting = true;
  stopLanDiscoveryInternal();
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});

ipcMain.handle("analytics:trackEvent", () => {});
ipcMain.handle("power:sleep", () => {
  const { execFile } = require('child_process');
  if (process.platform === 'win32') {
    execFile('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']);
  } else if (process.platform === 'linux') {
    execFile('systemctl', ['suspend']);
  } else if (process.platform === 'darwin') {
    execFile('pmset', ['sleepnow']);
  }
});
ipcMain.handle("power:shutdown", () => {
  const { execFile } = require('child_process');
  if (process.platform === 'win32') {
    execFile('shutdown.exe', ['/s', '/t', '0']);
  } else if (process.platform === 'linux') {
    execFile('shutdown', ['-h', 'now']);
  } else if (process.platform === 'darwin') {
    execFile('shutdown', ['-h', 'now']);
  }
});

ipcMain.handle('netElec:fetch', async (event, url, requestInfo) => {
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid URL provided');
  }
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Unsupported protocol');
  }
  const response = await net.fetch(url, requestInfo);
  const textData = await response.text();
  const headersObj = {};
  response.headers.forEach((val, key) => {
    headersObj[key] = val;
  });
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: headersObj,
    text: textData
  };
});

ipcMain.handle("app:quit", () => {
  isQuitting = true;
  app.quit();
});

ipcMain.handle("settings:get", (_, key) => settingsManager.get(key));

ipcMain.handle("settings:set", (_, key, value) => {
  settingsManager.set(key, value);
});

ipcMain.handle("settings:getAll", (_) => settingsManager.getAll());

ipcMain.handle("window:minimize", (_) => {
  mainWindow.minimize();
});

ipcMain.handle("window:maximize", (_) => {
  if (!mainWindow) return;
  if (mainWindow.isFullScreen()) {
    mainWindow.setFullScreen(false);
  } else if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.handle("window:close", (_) => {
  const minimizeToTray = settingsManager.get('MinimizeToTray');

  if (!isQuitting && minimizeToTray && mainWindow) {
    mainWindow.hide();
  } else if (mainWindow) {
    mainWindow.close();
  }
});

ipcMain.handle("window:getSize", (_) => {
  return mainWindow ? mainWindow.getSize() : [1280, 720];
});

ipcMain.handle("window:isFullScreen", (_) => {
  return mainWindow ? mainWindow.isFullScreen() : false;
});

ipcMain.handle("window:enterFullScreen", (_) => {
  if (mainWindow) mainWindow.setFullScreen(true);
});

ipcMain.handle("window:leaveFullScreen", (_) => {
  if (mainWindow) mainWindow.setFullScreen(false);
});

ipcMain.handle("sibnet:parse", async (_, link) => {
  const res = await SibnetParser.getDirectLink(link);
  return res;
});

ipcMain.handle("winApi:openLink", (_, link) => {
  if (!link || typeof link !== 'string') return false;
  try {
    const parsed = new URL(link);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      shell.openExternal(link);
      return true;
    }
  } catch (e) {
    console.error("Invalid link URL:", e);
  }
  return false;
});

ipcMain.handle("discordRPC:setActivity", (_, activity) => {
  if (SettingsFirst.EnableRPC) {
    discordRpcClient.user?.setActivity(activity).then(() => {
      if (isDebugMode) console.log("[DEBUG] [RPC] Activity set!");
    }).catch(console.error);
  }
});

ipcMain.handle("prc:getVersions", (_) => {
  return {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    anidesk: app.getVersion(),
    node: process.versions.node,
    isDebug: isDebugMode
  };
});

ipcMain.handle("prc:isDebug", (_) => isDebugMode);

ipcMain.handle("notify:send", (_, { title, body, releaseId }) => {
  if (!Notification.isSupported()) return false;
  const iconPath = path.join(__dirname, 'public', 'assets', 'icons', 'anidesk-icon.png');
  const notif = new Notification({
    title: title || 'AniDeskPlus',
    body: body || '',
    icon: fs.existsSync(iconPath) ? iconPath : undefined
  });

  notif.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      if (releaseId) {
        mainWindow.webContents.send('navigate:release', releaseId);
      }
    }
  });

  notif.show();
  return true;
});

function compareVersions(v1, v2) {
  if (!v1 || !v2) return 0;
  const p1 = String(v1).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const p2 = String(v2).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}

ipcMain.handle("updater:check", async (_) => {
  broadcastUpdaterStatus({ status: "checking", text: "Проверка обновлений..." });

  if (app.isPackaged) {
    try {
      autoUpdater.checkForUpdates();
      return updateStatusCache;
    } catch (e) {
      console.error("Squirrel check error, fallback to GitHub:", e);
    }
  }

  const ghStatus = await checkForUpdatesGitHub();
  broadcastUpdaterStatus(ghStatus);
  return ghStatus;
});

ipcMain.handle("updater:install", async (_) => {
  if (app.isPackaged) {
    try {
      isQuitting = true;
      autoUpdater.quitAndInstall();
      return true;
    } catch (e) {
      console.error("quitAndInstall error:", e);
    }
  }
  return false;
});

ipcMain.handle("debug:send", (_, { type, message, data }) => {
  sendDebugLog(type, message, data);
});

ipcMain.handle("shikimori:exchangeCode", async (_, { authCode, domain }) => {
  if (!authCode) return null;

  const SHIKI_CLIENT_ID = process.env.SHIKIMORI_CLIENT_ID || '';
  const SHIKI_CLIENT_SECRET = process.env.SHIKIMORI_CLIENT_SECRET || '';
  const SHIKI_REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob";

  try {
    const tokenUrl = `https://${domain || 'shikimori.io'}/oauth/token`;
    const res = await net.fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: SHIKI_CLIENT_ID,
        client_secret: SHIKI_CLIENT_SECRET,
        code: authCode.trim(),
        redirect_uri: SHIKI_REDIRECT_URI
      })
    });

    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error("Shikimori OAuth error:", e);
    return null;
  }
});

ipcMain.handle("shikimori:refreshToken", async (_, { refreshToken, domain }) => {
  if (!refreshToken) return null;

  const SHIKI_CLIENT_ID = process.env.SHIKIMORI_CLIENT_ID || '';
  const SHIKI_CLIENT_SECRET = process.env.SHIKIMORI_CLIENT_SECRET || '';

  try {
    const tokenUrl = `https://${domain || 'shikimori.io'}/oauth/token`;
    const res = await net.fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: SHIKI_CLIENT_ID,
        client_secret: SHIKI_CLIENT_SECRET,
        refresh_token: refreshToken.trim()
      })
    });

    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error("Shikimori refresh token error:", e);
    return null;
  }
});

ipcMain.handle("download:episode", async (event, { url, defaultFileName, referer }) => {
  if (!url) return { success: false, error: "No URL provided" };

  try {
    const win = BrowserWindow.getFocusedWindow();
    const sanitizedName = (defaultFileName || "episode.mp4").replace(/[\/\\?%*:|"<>]/g, "_");

    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: "Сохранить серию",
      defaultPath: sanitizedName,
      filters: [
        { name: "Видео файлы (*.mp4, *.mkv, *.ts)", extensions: ["mp4", "mkv", "ts"] },
        { name: "Все файлы", extensions: ["*"] }
      ]
    });

    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }

    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    };
    if (referer) {
      headers["Referer"] = referer;
    }

    const targetUrl = url.startsWith("//") ? `https:${url}` : url;
    const res = await net.fetch(targetUrl, { headers });
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}` };
    }

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const isM3u8Url = targetUrl.includes(".m3u8");

    if (isM3u8Url || contentType.includes("mpegurl") || contentType.includes("x-mpegurl")) {
      let manifestText = await res.text();
      let currentPlaylistUrl = targetUrl;

      if (manifestText.includes("#EXT-X-STREAM-INF")) {
        const lines = manifestText.split("\n").map(l => l.trim());
        let bestSubUrl = null;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith("#EXT-X-STREAM-INF")) {
            const nextLine = lines[i + 1];
            if (nextLine && !nextLine.startsWith("#")) {
              bestSubUrl = nextLine;
              if (lines[i].includes("1080") || lines[i].includes("720")) {
                break;
              }
            }
          }
        }
        if (bestSubUrl) {
          currentPlaylistUrl = new URL(bestSubUrl, targetUrl).toString();
          const subRes = await net.fetch(currentPlaylistUrl, { headers });
          if (subRes.ok) {
            manifestText = await subRes.text();
          }
        }
      }

      const lines = manifestText.split("\n").map(l => l.trim());
      const segments = [];
      for (const line of lines) {
        if (line && !line.startsWith("#")) {
          const absoluteSegmentUrl = new URL(line, currentPlaylistUrl).toString();
          segments.push(absoluteSegmentUrl);
        }
      }

      if (segments.length === 0) {
        return { success: false, error: "Не найдены сегменты видео в HLS плейлисте." };
      }

      const fileStream = fs.createWriteStream(filePath);
      const totalSegments = segments.length;
      let downloadFailed = false;

      try {
        for (let i = 0; i < totalSegments; i++) {
          const segUrl = segments[i];
          const segRes = await net.fetch(segUrl, { headers });
          if (!segRes.ok) {
            throw new Error(`HTTP ${segRes.status} on segment ${i + 1}/${totalSegments}`);
          }
          const reader = segRes.body.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              fileStream.write(value);
            }
          } finally {
            if (reader) reader.releaseLock?.();
          }

          if (event.sender) {
            const percent = Math.round(((i + 1) / totalSegments) * 100);
            event.sender.send("download:progress", {
              filePath,
              downloadedBytes: i + 1,
              totalBytes: totalSegments,
              percent
            });
          }
        }
      } catch (err) {
        downloadFailed = true;
        fileStream.destroy(err);
        throw err;
      } finally {
        if (!downloadFailed) {
          fileStream.end();
        } else if (!fileStream.destroyed) {
          fileStream.destroy();
        }
      }
      return { success: true, filePath };
    } else {
      const totalBytes = parseInt(res.headers.get('content-length') || '0', 10);
      let downloadedBytes = 0;

      const fileStream = fs.createWriteStream(filePath);
      let streamFailed = false;

      try {
        const reader = res.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fileStream.write(value);
            downloadedBytes += value.length;
            if (totalBytes > 0 && event.sender) {
              const percent = Math.round((downloadedBytes / totalBytes) * 100);
              event.sender.send("download:progress", {
                filePath,
                downloadedBytes,
                totalBytes,
                percent
              });
            }
          }
        } finally {
          if (reader) reader.releaseLock?.();
        }
      } catch (err) {
        streamFailed = true;
        fileStream.destroy(err);
        throw err;
      } finally {
        if (!streamFailed) {
          fileStream.end();
        } else if (!fileStream.destroyed) {
          fileStream.destroy();
        }
      }

      return { success: true, filePath };
    }
  } catch (e) {
    console.error("Episode download error:", e);
    return { success: false, error: e.message };
  }
});

let lanSocket = null;
let lanAnnounceInterval = null;
let currentLanParams = null;

function stopLanDiscoveryInternal() {
  if (lanAnnounceInterval) {
    clearInterval(lanAnnounceInterval);
    lanAnnounceInterval = null;
  }
  if (lanSocket) {
    try {
      lanSocket.removeAllListeners();
      lanSocket.close();
    } catch (e) {
      console.error('Error closing LAN socket:', e);
    }
    lanSocket = null;
  }
  currentLanParams = null;
}

function startLanDiscoveryInternal({ roomCode, peerId, nickname }) {
  stopLanDiscoveryInternal();

  currentLanParams = { roomCode, peerId, nickname };

  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  lanSocket = socket;

  socket.on('error', (err) => {
    if (isDebugMode) console.error('LAN Discovery socket error:', err);
  });

  socket.on('message', (msg, rinfo) => {
    try {
      const data = JSON.parse(msg.toString('utf-8'));
      if (data && data.type === 'TOGETHER_LAN_ANNOUNCE') {
        if (data.peerId && data.peerId === peerId) {
          return;
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('together:lan-peer-found', {
            ...data,
            address: rinfo.address
          });
        }
      }
    } catch (e) {
      // ignore invalid messages
    }
  });

  socket.bind(49494, () => {
    try {
      socket.setBroadcast(true);
    } catch (e) {
      if (isDebugMode) console.error('Failed to set socket broadcast:', e);
    }

    const sendAnnouncement = () => {
      if (!lanSocket || !currentLanParams) return;
      const announcement = JSON.stringify({
        type: 'TOGETHER_LAN_ANNOUNCE',
        roomCode: currentLanParams.roomCode,
        peerId: currentLanParams.peerId,
        nickname: currentLanParams.nickname || '',
        port: 49494,
        timestamp: Date.now()
      });
      const messageBuffer = Buffer.from(announcement);
      try {
        socket.send(messageBuffer, 0, messageBuffer.length, 49494, '255.255.255.255', (err) => {
          if (err && isDebugMode) {
            console.error('LAN announcement send error:', err);
          }
        });
      } catch (err) {
        if (isDebugMode) {
          console.error('LAN announcement exception:', err);
        }
      }
    };

    sendAnnouncement();
    lanAnnounceInterval = setInterval(sendAnnouncement, 3000);
  });
}

ipcMain.handle('together:lan-start', (_, options) => {
  if (!options || typeof options !== 'object') {
    return { success: false, error: 'Invalid options' };
  }
  try {
    startLanDiscoveryInternal(options);
    return { success: true };
  } catch (err) {
    console.error('Failed to start LAN discovery:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('together:lan-stop', () => {
  try {
    stopLanDiscoveryInternal();
    return { success: true };
  } catch (err) {
    console.error('Failed to stop LAN discovery:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('together:get-pending-deep-link', () => {
  const payload = pendingDeepLinkPayload;
  pendingDeepLinkPayload = null;
  return payload;
});
