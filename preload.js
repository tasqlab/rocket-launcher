const { contextBridge, ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");

console.log(">>> PRELOAD IS RUNNING <<<");

const GAME_DIR = path.join(__dirname, "game");
const VERSIONS_DIR = path.join(GAME_DIR, "versions");

contextBridge.exposeInMainWorld("launcherAPI", {
    getInstalledVersions: () => {
        try {
            if (!fs.existsSync(VERSIONS_DIR)) return [];

            const folders = fs.readdirSync(VERSIONS_DIR);
            const versions = folders.filter(folder => {
                const jsonPath = path.join(VERSIONS_DIR, folder, folder + ".json");
                return fs.existsSync(jsonPath);
            });

            console.log("Found versions:", versions);
            return versions;
        } catch (err) {
            console.error("Error reading versions:", err);
            return [];
        }
    },

    downloadAndLaunch: (versionId, username) =>
        ipcRenderer.invoke("download-and-launch", versionId, username),

    windowMinimize: () => ipcRenderer.send("window-minimize"),
    windowToggleMaximize: () => ipcRenderer.send("window-toggle-maximize"),
    windowClose: () => ipcRenderer.send("window-close")
});
