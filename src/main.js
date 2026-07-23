const { app, BrowserWindow, ipcMain, net, autoUpdater, dialog, Tray, Menu, Notification, nativeImage } = require('electron');
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
const DefaultSettings = {
  AutoUpdate: true,
  EnableRPC: false,
  EnableDevTools: false,
  MinimizeToTray: true,
  EnableEpisodeNotifications: true,
  PreferredDubber: ""
};

// Memory & performance optimization switches
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512');

// Linux WebGPU/ANGLE fallback
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('use-gl', 'angle');
  app.commandLine.appendSwitch('use-angle', 'vulkan');
  app.commandLine.appendSwitch(
    'enable-features',
    'Vulkan,VulkanFromANGLE,DefaultANGLEVulkan',
  );
  app.commandLine.appendSwitch('enable-unsafe-webgpu');
}

const discordRpcClient = new rpc.Client({
  clientId: rpcClientId,
  transport: 'ipc'
});

discordRpcClient.on('ready', () => {
  if (isDebugMode) console.log("[DEBUG] [RPC] Hooked!");
});

const SettingsFirst = fs.existsSync(SettingsPath) ? JSON.parse(fs.readFileSync(SettingsPath)) : DefaultSettings;

if (app.isPackaged && SettingsFirst.AutoUpdate) {
  autoUpdater.on("checking-for-update", () => {
    if (isDebugMode) console.log("[DEBUG] Checking for updates...");
  });

  autoUpdater.on("update-available", () => {
    if (isDebugMode) console.log("[DEBUG] Update available");
  });

  autoUpdater.on("update-not-available", () => {
    if (isDebugMode) console.log("[DEBUG] Update not available");
  });

  autoUpdater.on('error', (message) => {
    console.error('AutoUpdater error:', message);
  });

  autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
    const dialogOpts = {
      type: 'info',
      buttons: ['Перезапустить', 'Позже'],
      title: 'Обновление AniDeskPlus',
      message: process.platform === 'win32' ? releaseNotes : releaseName,
      detail: 'Новая версия скачана, перезапустите приложение для установки.'
    };

    dialog.showMessageBox(dialogOpts).then((returnValue) => {
      if (returnValue.response === 0) {
        isQuitting = true;
        autoUpdater.quitAndInstall();
      }
    });
  });

  try {
    autoUpdater.setFeedURL({ url: feed });
    setTimeout(() => {
      try {
        if (isDebugMode) console.log("[DEBUG] Triggering autoUpdater.checkForUpdates()");
        autoUpdater.checkForUpdates();
      } catch (e) {
        console.error("AutoUpdater check error:", e);
      }
    }, 5000);
  } catch (e) {
    console.error("AutoUpdater setup error:", e);
  }
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

function isDev() {
  return !app.isPackaged || isDebugMode;
}

function createTray() {
  if (tray) return;
  const iconPath = path.join(__dirname, 'public', 'assets', 'icons', 'anidesk-icon.png');
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
    icon: "./public/assets/icons/anidesk-icon.png",
    show: false,
  });

  if (isDebugMode || SettingsFirst.EnableDevTools) {
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
    const settings = fs.existsSync(SettingsPath) ? JSON.parse(fs.readFileSync(SettingsPath)) : DefaultSettings;
    const minimizeToTray = settings.MinimizeToTray ?? DefaultSettings.MinimizeToTray;

    if (!isQuitting && minimizeToTray) {
      event.preventDefault();
      mainWindow.hide();
    } else {
      mainWindow = null;
    }
  });

  mainWindow.once('ready-to-show', async () => {
    mainWindow.show();
  });

function sendDebugLog(type, message, data = null) {
  if (isDebugMode && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('debug:log', {
      timestamp: new Date().toLocaleTimeString(),
      type,
      message: typeof message === 'object' ? JSON.stringify(message) : String(message),
      data
    });
  }
}

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

ipcMain.handle("settings:get", (_, key) => {
  const settings = fs.existsSync(SettingsPath) ? JSON.parse(fs.readFileSync(SettingsPath)) : DefaultSettings;
  return settings?.[key] ?? DefaultSettings?.[key] ?? null;
});

ipcMain.handle("settings:set", (_, key, value) => {
  const settings = fs.existsSync(SettingsPath) ? JSON.parse(fs.readFileSync(SettingsPath)) : DefaultSettings;
  settings[key] = value;
  fs.writeFileSync(SettingsPath, JSON.stringify(settings, null, 2));
});

ipcMain.handle("settings:getAll", (_) => {
  const settings = fs.existsSync(SettingsPath) ? JSON.parse(fs.readFileSync(SettingsPath)) : DefaultSettings;
  return { ...DefaultSettings, ...settings };
});

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
  const settings = fs.existsSync(SettingsPath) ? JSON.parse(fs.readFileSync(SettingsPath)) : DefaultSettings;
  const minimizeToTray = settings.MinimizeToTray ?? DefaultSettings.MinimizeToTray;

  if (!isQuitting && minimizeToTray && mainWindow) {
    mainWindow.hide();
  } else if (mainWindow) {
    mainWindow.close();
  }
});

ipcMain.handle("window:getSize", (_) => {
  return mainWindow ? mainWindow.getSize() : [1280, 720];
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
  o.open(link);
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
  const currentVersion = app.getVersion();
  if (app.isPackaged && autoUpdater) {
    try {
      autoUpdater.checkForUpdates();
    } catch (e) {
      console.error("AutoUpdater error:", e);
    }
  }

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
        status: isNewer ? "update_available" : "latest",
        latestVersion: latestTag,
        currentVersion: cleanCurrent,
        releaseUrl: data.html_url || "https://github.com/MjKey/AniDeskPlus/releases"
      };
    }
  } catch (e) {
    console.error("GitHub release check error:", e);
    return { status: "error", message: e.message, currentVersion };
  }

  return { status: "latest", currentVersion };
});

ipcMain.handle("debug:send", (_, { type, message, data }) => {
  sendDebugLog(type, message, data);
});
