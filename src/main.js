const { app, BrowserWindow, ipcMain, net, autoUpdater, dialog, Tray, Menu, Notification, nativeImage, shell } = require('electron');
if (require('electron-squirrel-startup')) {
  app.quit();
  process.exit(0);
}
const path = require('node:path');
const o = require('openurl');
const serve = require('electron-serve').default;
const loadURL = serve({ directory: './public' });
const fs = require('fs');
const rpc = require("@xhayper/discord-rpc");

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
    fs.promises.writeFile(this.filePath, JSON.stringify(settings, null, 2))
      .catch(e => console.error('Settings write error:', e));
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

const isFirstInstance = app.requestSingleInstanceLock();

if (!isFirstInstance) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

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

  mainWindow.once('ready-to-show', async () => {
    mainWindow.show();
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
  createTray();
  createWindow();
  if (isDebugMode) {
    createDebugWindow();
  }
  initAutoUpdater();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});

app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  event.preventDefault();
  callback(true);
});

ipcMain.handle("analytics:trackEvent", () => {});
ipcMain.handle("power:sleep", () => {
  const { exec } = require('child_process');
  if (process.platform === 'win32') {
    exec('rundll32.exe powrprof.dll,SetSuspendState 0,1,0');
  } else if (process.platform === 'linux') {
    exec('systemctl suspend');
  }
});
ipcMain.handle("power:shutdown", () => {
  const { exec } = require('child_process');
  if (process.platform === 'win32') {
    exec('shutdown /s /t 0');
  } else if (process.platform === 'linux') {
    exec('shutdown -h now');
  }
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
  if (mainWindow.isMaximized()) {
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
  if (link) shell.openExternal(link);
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

    const totalBytes = parseInt(res.headers.get('content-length') || '0', 10);
    let downloadedBytes = 0;

    const fileStream = fs.createWriteStream(filePath);
    const reader = res.body.getReader();

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
    fileStream.end();

    return { success: true, filePath };
  } catch (e) {
    console.error("Episode download error:", e);
    return { success: false, error: e.message };
  }
});
