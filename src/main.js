const { app, BrowserWindow, ipcMain, net, autoUpdater, dialog, Tray, Menu, Notification, nativeImage, shell, protocol } = require('electron');
if (require('electron-squirrel-startup')) {
  app.quit();
  process.exit(0);
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'anixflow', privileges: { secure: true, standard: true, supportFetchAPI: true, bypassCSP: true, stream: true } },
  { scheme: 'anixflow-cache', privileges: { secure: true, standard: true, supportFetchAPI: true, bypassCSP: true } }
]);

const { initDownloader } = require('./downloader');
const path = require('node:path');
const crypto = require('crypto');
const o = require('openurl');
const serve = require('electron-serve').default;
const loadURL = serve({ directory: './public' });
const fs = require('fs');
const rpc = require("@xhayper/discord-rpc");

function loadEnv() {
  const envPath = app.isPackaged 
    ? path.join(process.resourcesPath, '.env') 
    : path.join(__dirname, '..', '.env');
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

function isKodikDomain(host) {
  if (!host) return false;
  const kodikDomains = ['kodik.biz', 'vlp.to', 'vovacdn.net', 'vrbcdn.net', 'kodikplayer.com'];
  const lowerHost = host.toLowerCase();
  return kodikDomains.some(domain => lowerHost === domain || lowerHost.endsWith('.' + domain));
}

function hexEncodeUrl(url) {
  return Buffer.from(url, 'utf8').toString('hex');
}

function hexDecodeUrl(hexStr) {
  return Buffer.from(hexStr, 'hex').toString('utf8');
}

function isBlockedImageDomain(urlStr) {
  try {
    const host = new URL(urlStr).host.toLowerCase();
    const blockedDomains = ['kinopoisk', 'yandex', 'anixart', 'shikimori', 'anixmirai', 'vk.com'];
    return blockedDomains.some(domain => host.includes(domain));
  } catch (e) {
    return false;
  }
}

function getProxyImageUrl(originalUrl) {
  return `https://images.weserv.nl/?url=${encodeURIComponent(originalUrl)}&w=300&output=webp`;
}

let ImageCachePath;
try {
  ImageCachePath = path.join(app.getPath("userData"), "image_cache");
} catch (_) {
  ImageCachePath = path.join(process.cwd(), "temp_image_cache");
}

if (!fs.existsSync(ImageCachePath)) {
  try {
    fs.mkdirSync(ImageCachePath, { recursive: true });
  } catch (e) {
    console.error("Failed to create image cache directory:", e);
  }
}

const cacheInFlight = new Map();

async function handleAnixflowCacheRequest(req) {
  try {
    const rawUrl = typeof req === 'string' ? req : (req?.url || '');
    const hexUrl = rawUrl.replace(/^anixflow-cache:\/\//, '').replace(/\/$/, '');
    const originalUrl = hexDecodeUrl(hexUrl);

    if (!originalUrl) {
      return new Response(null, { status: 400 });
    }

    const hash = crypto.createHash('md5').update(originalUrl).digest('hex');
    let ext = '.jpg';
    try {
      const urlObj = new URL(originalUrl);
      ext = path.extname(urlObj.pathname) || '.jpg';
    } catch (_) {}

    const filePath = path.join(ImageCachePath, `${hash}${ext}`);
    const normalizedPath = filePath.replace(/\\/g, '/');

    if (fs.existsSync(filePath)) {
      if (typeof net !== 'undefined' && net.fetch) {
        return net.fetch(`file:///${normalizedPath}`);
      } else {
        const fileData = await fs.promises.readFile(filePath);
        return new Response(fileData, { headers: { 'Content-Type': 'image/jpeg' } });
      }
    } else {
      if (!cacheInFlight.has(filePath)) {
        const isBlocked = isBlockedImageDomain(originalUrl);
        const proxyUrl = getProxyImageUrl(originalUrl);

        const bufferPromise = (async () => {
          try {
            let response = null;
            if (isBlocked) {
              if (typeof net !== 'undefined' && net.fetch) {
                response = await net.fetch(proxyUrl, {
                  headers: { 'User-Agent': UserAgent, 'Referer': 'https://anixart.tv/' }
                });
              } else if (typeof fetch !== 'undefined') {
                response = await fetch(proxyUrl, {
                  headers: { 'User-Agent': UserAgent, 'Referer': 'https://anixart.tv/' }
                });
              }
            } else {
              try {
                const fetchFn = (typeof net !== 'undefined' && net.fetch) ? net.fetch : fetch;
                response = await fetchFn(originalUrl, {
                  headers: { 'User-Agent': UserAgent, 'Referer': 'https://anixart.tv/' }
                });
                if (!response || !response.ok) {
                  response = await fetchFn(proxyUrl, {
                    headers: { 'User-Agent': UserAgent, 'Referer': 'https://anixart.tv/' }
                  });
                }
              } catch (e) {
                const fetchFn = (typeof net !== 'undefined' && net.fetch) ? net.fetch : fetch;
                response = await fetchFn(proxyUrl, {
                  headers: { 'User-Agent': UserAgent, 'Referer': 'https://anixart.tv/' }
                });
              }
            }

            if (!response || !response.ok) return null;
            const buffer = await response.arrayBuffer();
            await fs.promises.writeFile(filePath, Buffer.from(buffer));
            return buffer;
          } catch (err) {
            console.error("Image cache promise error:", err);
            return null;
          }
        })();

        bufferPromise.finally(() => cacheInFlight.delete(filePath));
        cacheInFlight.set(filePath, bufferPromise);
      }

      const buffer = await cacheInFlight.get(filePath);
      if (!buffer) return new Response(null, { status: 502 });
      return new Response(buffer, { headers: { 'Content-Type': 'image/jpeg' } });
    }
  } catch (e) {
    console.error("Cache protocol error:", e);
    return new Response(null, { status: 500 });
  }
}

const { SibnetParser } = require('anixartjs');

const isDebugMode = process.argv.includes('--debug') || process.argv.includes('-d');
if (isDebugMode) {
  console.log('[DEBUG] Running AniXFlow in DEBUG mode');
}

/**
 * @type {BrowserWindow}
 */
let mainWindow;
let tray = null;
let isQuitting = false;

const server = 'https://update.electronjs.org';
const feed = `${server}/MjKey/AniXFlow/${process.platform}-${process.arch}/${app.getVersion()}`;
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
    const res = await net.fetch("https://api.github.com/repos/MjKey/AniXFlow/releases/latest", {
      headers: { "User-Agent": "AniXFlowApp" }
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
        releaseUrl: data.html_url || "https://github.com/MjKey/AniXFlow/releases",
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
        title: 'Обновление AniXFlow',
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
    path.join(__dirname, 'public', 'assets', 'icons', 'anixflow-icon.png'),
    path.join(__dirname, 'public', 'assets', 'icons', 'anidesk-icon.png'),
    path.join(process.resourcesPath || '', 'icon', 'icon.ico'),
    path.join(app.getAppPath(), 'icon', 'icon.ico'),
    path.join(app.getAppPath(), 'public', 'assets', 'icons', 'anixflow-icon.png'),
    path.join(app.getAppPath(), 'public', 'assets', 'icons', 'anidesk-icon.png')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.join(__dirname, 'public', 'assets', 'icons', 'anixflow-icon.png');
}

function createTray() {
  if (tray) return;
  const iconPath = getAppIconPath();
  const trayIcon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  tray = new Tray(trayIcon);
  tray.setToolTip('AniXFlow');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Показать AniXFlow',
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
    title: 'AniXFlow — Live Debug Console',
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

  initDownloader(mainWindow);

  mainWindow.webContents.session.webRequest.onBeforeRequest(
    { urls: ['*://*/*'] },
    (details, callback) => {
      const { url, resourceType } = details;
      try {
        if (url && url.startsWith('http') && resourceType === 'image') {
          const cdnProxyEnabled = settingsManager.get('EnableCdnProxy') ?? false;
          const isBlocked = isBlockedImageDomain(url);

          if (cdnProxyEnabled || isBlocked) {
            const hexUrl = hexEncodeUrl(url);
            return callback({ redirectURL: `anixflow-cache://${hexUrl}` });
          }
        }
      } catch (e) {
        console.error("Image proxy intercept error:", e);
      }
      callback({});
    }
  );

  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    (details, callback) => {
      const { url, requestHeaders } = details;
      let host = '';
      try {
        host = new URL(url).host;
      } catch (_) {}

      if (isDebugMode) {
        sendDebugLog('net', `-> [${details.method}] ${url}`);
      }

      UpsertKeyValue(requestHeaders, 'Referer', null);
      UpsertKeyValue(requestHeaders, 'Access-Control-Allow-Origin', ['*']);

      if (host === "video.sibnet.ru") {
        UpsertKeyValue(requestHeaders, 'Referer', url);
      }

      if (!isKodikDomain(host) && host !== "video.sibnet.ru") {
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
  try {
    protocol.handle('anixflow', handleAnixflowRequest);
    protocol.handle('anixflow-cache', (req) => handleAnixflowCacheRequest(req));
  } catch (e) {
    console.error("Protocol handler registration error:", e);
  }

  if (process.platform === 'win32') {
    app.setAppUserModelId('com.mjkey.anixflow');
  }
  initDownloader(ipcMain, app, shell);
  createTray();
  createWindow();
  if (isDebugMode) {
    createDebugWindow();
  }
  initAutoUpdater();
});

app.on('before-quit', () => {
  isQuitting = true;
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

ipcMain.handle("proxy:toggle", (_, enabled) => {
  const current = settingsManager.get("EnableCdnProxy") ?? false;
  const newValue = enabled !== undefined ? !!enabled : !current;
  settingsManager.set("EnableCdnProxy", newValue);
  return newValue;
});

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
  const iconPath = path.join(__dirname, 'public', 'assets', 'icons', 'anixflow-icon.png');
  const notif = new Notification({
    title: title || 'AniXFlow',
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

async function handleAnixflowRequest(request) {
  try {
    const urlStr = request.url;
    const rawPath = urlStr.replace(/^anixflow:\/\//i, '').replace(/\/$/, '');
    let filePath;

    if (/^[0-9a-fA-F]+$/.test(rawPath) && rawPath.length % 2 === 0) {
      try {
        filePath = Buffer.from(rawPath, 'hex').toString('utf8');
      } catch (_) {
        filePath = decodeURIComponent(rawPath);
      }
    } else {
      filePath = decodeURIComponent(rawPath);
    }
    filePath = filePath.replace(/\\/g, '/');

    if (!fs.existsSync(filePath)) {
      return new Response('File not found', { status: 404 });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const rangeHeader = request.headers ? (request.headers.get ? request.headers.get('range') : request.headers['range']) : null;

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      let start, end;
      if (parts[0] === '') {
        const suffixLength = parseInt(parts[1], 10);
        start = Math.max(0, fileSize - suffixLength);
        end = fileSize - 1;
      } else {
        start = parseInt(parts[0], 10);
        end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      }

      if (isNaN(start) || start >= fileSize) {
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${fileSize}` }
        });
      }
      end = Math.min(end, fileSize - 1);
      const chunkSize = end - start + 1;

      const fileStream = fs.createReadStream(filePath, { start, end });
      const { Readable } = require('stream');
      const nodeReadable = Readable.toWeb ? Readable.toWeb(fileStream) : fileStream;

      return new Response(nodeReadable, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunkSize),
          'Content-Type': 'video/mp4',
        },
      });
    } else {
      const fileStream = fs.createReadStream(filePath);
      const { Readable } = require('stream');
      const nodeReadable = Readable.toWeb ? Readable.toWeb(fileStream) : fileStream;

      return new Response(nodeReadable, {
        status: 200,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': String(fileSize),
          'Content-Type': 'video/mp4',
        },
      });
    }
  } catch (e) {
    console.error("anixflow protocol error:", e);
    return new Response(null, { status: 500 });
  }
}

module.exports = {
  isKodikDomain,
  hexEncodeUrl,
  hexDecodeUrl,
  isBlockedImageDomain,
  getProxyImageUrl,
  handleAnixflowCacheRequest,
  handleAnixflowRequest,
  settingsManager
};
