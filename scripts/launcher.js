const { spawn } = require("child_process");
const path = require("path");
const { BrowserWindow } = require("electron");

function substituteArgs(args, username, uuid, online) {
  return args.map(arg => {
    if (typeof arg !== "string") return arg;

    return arg
      .replace("${auth_player_name}", username)
      .replace("${auth_uuid}", uuid || "00000000000000000000000000000000")
      .replace("${auth_access_token}", online ? "0" : "0")
      .replace("${user_type}", online ? "mojang" : "legacy");
  });
}

function buildClasspath(versionId, versionJson, versionsDir, libDir) {
  const sep = process.platform === "win32" ? ";" : ":";
  const libs = [];

  if (versionJson.libraries) {
    for (const lib of versionJson.libraries) {
      if (lib.downloads && lib.downloads.artifact) {
        const artifactPath = path.join(libDir, lib.downloads.artifact.path);
        libs.push(artifactPath);
      }
    }
  }

  const jarPath = path.join(versionsDir, versionId, versionId + ".jar");
  libs.push(jarPath);

  return libs.join(sep);
}

async function launchMinecraft({ versionId, versionJson, gameDir, versionsDir, nativesDir, libDir, username, online, uuid }) {
  const javaPath = "java";

  const classpath = buildClasspath(versionId, versionJson, versionsDir, libDir);
  const nativesPath = path.join(nativesDir, versionId);

  const args = [];

  args.push("-Djava.library.path=" + nativesPath);
  args.push("-cp", classpath);

  const mainClass = versionJson.mainClass || "net.minecraft.client.main.Main";
  args.push(mainClass);

  // Replace placeholders in game args
  let gameArgs = versionJson.arguments?.game || [];
  gameArgs = substituteArgs(gameArgs, username, uuid, online);

  args.push(...gameArgs);

  console.log("Launching:", javaPath, args.join(" "));

  const child = spawn(javaPath, args, {
    cwd: gameDir,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let notified = false;

  child.stdout.on("data", data => {
    const line = data.toString();
    process.stdout.write(line);

    if (!notified && (line.includes("LWJGL") || line.includes("Setting user:") || line.includes("Client thread"))) {
      notified = true;
      const win = BrowserWindow.getAllWindows()[0];
      if (win) win.webContents.send("mc-started");
    }
  });

  child.stderr.on("data", data => {
    process.stderr.write(data.toString());
  });

  child.on("exit", code => {
    console.log("Minecraft exited with code", code);

    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (code !== 0) {
        win.webContents.send("mc-crashed", code);
      }
    }
});

}

module.exports = {
  launchMinecraft
};
