const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { downloadVersion, GAME_DIR, VERSIONS_DIR, NATIVES_DIR, LIB_DIR } = require("./scripts/downloadversion");
const { launchMinecraft } = require("./scripts/launcher");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    frame: false,
    backgroundColor: "#1b1b1b",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});

// download + launch, now accepts online/uuid
ipcMain.handle("download-and-launch", async (event, payload) => {
  const { versionId, username, online, uuid } = payload;
  try {
    const versionJson = await downloadVersion(versionId);
    await launchMinecraft({
      versionId,
      versionJson,
      gameDir: GAME_DIR,
      versionsDir: VERSIONS_DIR,
      nativesDir: NATIVES_DIR,
      libDir: LIB_DIR,
      username: username || "Player",
      online,
      uuid
    });
    return { ok: true };
  } catch (err) {
    console.error("download-and-launch error:", err);
    return { ok: false, error: err.message };
  }
});

// window controls
ipcMain.on("window-minimize", () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on("window-toggle-maximize", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});

ipcMain.on("window-close", () => {
  if (mainWindow) mainWindow.close();
});
