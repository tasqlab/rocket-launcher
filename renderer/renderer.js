const { ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");
const https = require("https");

let loadingInterval = null;

// -------------------------
// STATUS TEXT
// -------------------------
function setStatus(msg) {
  const el = document.getElementById("status");
  if (el) el.textContent = msg;
  console.log(msg);
}

// -------------------------
// LOADING BAR
// -------------------------
function startLoadingBar() {
  const container = document.getElementById("loadingBarContainer");
  const bar = document.getElementById("loadingBar");

  container.style.display = "block";
  bar.style.width = "0%";

  let progress = 0;

  loadingInterval = setInterval(() => {
    progress += 3;
    if (progress > 95) progress = 95;
    bar.style.width = progress + "%";
  }, 120);
}

function stopLoadingBar() {
  const container = document.getElementById("loadingBarContainer");
  const bar = document.getElementById("loadingBar");

  if (loadingInterval) {
    clearInterval(loadingInterval);
    loadingInterval = null;
  }

  bar.style.width = "100%";

  setTimeout(() => {
    container.style.display = "none";
    bar.style.width = "0%";
  }, 400);
}

// -------------------------
// VERSION LOADING
// -------------------------
function getInstalledVersions() {
  const versionsDir = path.join(__dirname, "..", "game", "versions");

  try {
    if (!fs.existsSync(versionsDir)) {
      setStatus("No versions directory: " + versionsDir);
      return [];
    }

    const folders = fs.readdirSync(versionsDir);
    const versions = folders.filter(folder => {
      const jsonPath = path.join(versionsDir, folder, folder + ".json");
      return fs.existsSync(jsonPath);
    });

    console.log("Found versions:", versions);
    return versions;
  } catch (err) {
    setStatus("Error reading versions: " + err.message);
    return [];
  }
}

function loadVersions() {
  const dropdown = document.getElementById("versionSelect");
  dropdown.innerHTML = "";

  const versions = getInstalledVersions();

  if (versions.length === 0) {
    const opt = document.createElement("option");
    opt.textContent = "No versions found";
    dropdown.appendChild(opt);
    return;
  }

  versions.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    dropdown.appendChild(opt);
  });
}

// -------------------------
// UUID LOOKUP (ONLINE MODE)
// -------------------------
function resolveUuid(username) {
  return new Promise((resolve, reject) => {
    const url = `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`;
    https
      .get(url, res => {
        if (res.statusCode === 204) {
          return resolve(null);
        }
        if (res.statusCode !== 200) {
          return reject(new Error("HTTP " + res.statusCode));
        }
        let data = "";
        res.on("data", chunk => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            resolve(json.id || null);
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

// -------------------------
// MODPACK APPLY
// -------------------------
function applyModpack(versionId) {
  const modpackRoot = path.join(__dirname, "..", "game", "modpacks", "MyPack");
  const versionFolder = path.join(modpackRoot, versionId);

  const modsSrc = path.join(versionFolder, "mods");
  const configSrc = path.join(versionFolder, "config");

  const modsDst = path.join(__dirname, "..", "game", "mods");
  const configDst = path.join(__dirname, "..", "game", "config");

  // Clear mods
  if (fs.existsSync(modsDst)) {
    fs.rmSync(modsDst, { recursive: true, force: true });
  }
  fs.mkdirSync(modsDst, { recursive: true });

  // Copy mods
  if (fs.existsSync(modsSrc)) {
    for (const file of fs.readdirSync(modsSrc)) {
      fs.copyFileSync(path.join(modsSrc, file), path.join(modsDst, file));
    }
  }

  // Clear config
  if (fs.existsSync(configDst)) {
    fs.rmSync(configDst, { recursive: true, force: true });
  }
  fs.mkdirSync(configDst, { recursive: true });

  // Copy config
  if (fs.existsSync(configSrc)) {
    for (const file of fs.readdirSync(configSrc)) {
      const src = path.join(configSrc, file);
      const dst = path.join(configDst, file);

      if (fs.lstatSync(src).isDirectory()) {
        fs.cpSync(src, dst, { recursive: true });
      } else {
        fs.copyFileSync(src, dst);
      }
    }
  }
}

// -------------------------
// IPC EVENTS FROM MAIN
// -------------------------
ipcRenderer.on("mc-started", () => {
  stopLoadingBar();
  setStatus("Minecraft is starting...");
});

ipcRenderer.on("mc-crashed", (event, code) => {
  stopLoadingBar();
  const launchBtn = document.getElementById("launchBtn");
  launchBtn.disabled = false;
  setStatus("Minecraft crashed (code " + code + ").");
});

// -------------------------
// MAIN UI LOGIC
// -------------------------
window.addEventListener("DOMContentLoaded", () => {
  loadVersions();

  const launchBtn = document.getElementById("launchBtn");
  const usernameInput = document.getElementById("usernameInput");
  const versionSelect = document.getElementById("versionSelect");
  const onlineCheckbox = document.getElementById("onlineCheckbox");
  const modeLabel = document.getElementById("modeLabel");

  onlineCheckbox.addEventListener("change", () => {
    modeLabel.textContent = onlineCheckbox.checked ? "Online mode" : "Offline mode";
  });

  launchBtn.onclick = async () => {
    if (launchBtn.disabled) return;

    const version = versionSelect.value;
    const username = usernameInput.value || "Player";
    const online = onlineCheckbox.checked;

    launchBtn.disabled = true;
    startLoadingBar();
    setStatus("Preparing launch...");

    // Apply modpack for this version
    applyModpack(version);

    let uuid = null;

    if (online) {
      try {
        setStatus("Resolving UUID for " + username + "...");
        uuid = await resolveUuid(username);
        if (!uuid) {
          setStatus("No Mojang account found. Using offline mode.");
        } else {
          setStatus("UUID resolved. Launching in pseudo-online mode...");
        }
      } catch (e) {
        setStatus("UUID lookup failed. Using offline mode.");
      }
    }

    const payload = {
      versionId: version,
      username,
      online: !!(online && uuid),
      uuid
    };

    const result = await ipcRenderer.invoke("download-and-launch", payload);

    if (!result.ok) {
      stopLoadingBar();
      launchBtn.disabled = false;
      setStatus("Error: " + result.error);
      return;
    }

    setStatus("Launching... please wait.");
  };

  // Window controls
  document.getElementById("closeBtn").onclick = () => ipcRenderer.send("window-close");
  document.getElementById("minBtn").onclick = () => ipcRenderer.send("window-minimize");
  document.getElementById("maxBtn").onclick = () => ipcRenderer.send("window-toggle-maximize");
});
