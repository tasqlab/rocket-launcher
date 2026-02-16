const fs = require("fs");
const path = require("path");
const https = require("https");
const unzip = require("extract-zip");

const GAME_DIR = path.join(__dirname, "..", "game");
const LIB_DIR = path.join(GAME_DIR, "libraries");
const VERSIONS_DIR = path.join(GAME_DIR, "versions");
const NATIVES_DIR = path.join(GAME_DIR, "natives");
const ASSETS_DIR = path.join(GAME_DIR, "assets");

function download(url, dest) {
    return new Promise((resolve, reject) => {
        if (fs.existsSync(dest)) return resolve();

        fs.mkdirSync(path.dirname(dest), { recursive: true });

        https.get(url, res => {
            if (res.statusCode !== 200) {
                return reject(new Error("HTTP " + res.statusCode + " for " + url));
            }

            const file = fs.createWriteStream(dest);
            res.pipe(file);
            file.on("finish", () => file.close(resolve));
        }).on("error", reject);
    });
}

async function downloadVanilla(versionId) {
    const manifestUrl = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
    const manifestPath = path.join(GAME_DIR, "version_manifest.json");
    await download(manifestUrl, manifestPath);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const entry = manifest.versions.find(v => v.id === versionId);

    if (!entry) {
        throw new Error("Version not found in manifest: " + versionId);
    }

    const versionDir = path.join(VERSIONS_DIR, versionId);
    const versionJsonPath = path.join(versionDir, versionId + ".json");
    fs.mkdirSync(versionDir, { recursive: true });

    await download(entry.url, versionJsonPath);
    const versionJson = JSON.parse(fs.readFileSync(versionJsonPath, "utf8"));

    const clientUrl = versionJson.downloads.client.url;
    const clientJarPath = path.join(versionDir, versionId + ".jar");
    await download(clientUrl, clientJarPath);

    if (versionJson.assetIndex) {
        const assetIndexUrl = versionJson.assetIndex.url;
        const assetIndexPath = path.join(
            ASSETS_DIR,
            "indexes",
            versionJson.assetIndex.id + ".json"
        );
        await download(assetIndexUrl, assetIndexPath);
    }

    for (const lib of versionJson.libraries) {
        if (lib.downloads && lib.downloads.artifact) {
            const artifact = lib.downloads.artifact;
            const libPath = path.join(LIB_DIR, artifact.path);
            await download(artifact.url, libPath);
        }

        if (lib.downloads && lib.downloads.classifiers && lib.downloads.classifiers["natives-windows-x86_64"]) {
            const native = lib.downloads.classifiers["natives-windows-x86_64"];
            const nativePath = path.join(LIB_DIR, native.path);
            await download(native.url, nativePath);

            const extractTo = path.join(NATIVES_DIR, versionId);
            fs.mkdirSync(extractTo, { recursive: true });
            await unzip(nativePath, { dir: extractTo });
        }
    }

    return versionJson;
}

async function downloadVersion(versionId) {
    console.log("Downloading version:", versionId);

    fs.mkdirSync(GAME_DIR, { recursive: true });
    fs.mkdirSync(LIB_DIR, { recursive: true });
    fs.mkdirSync(VERSIONS_DIR, { recursive: true });
    fs.mkdirSync(NATIVES_DIR, { recursive: true });
    fs.mkdirSync(ASSETS_DIR, { recursive: true });

    const jsonPath = path.join(VERSIONS_DIR, versionId, versionId + ".json");

    // If preinstalled (Fabric, OptiFine, etc.), just use it
    if (fs.existsSync(jsonPath)) {
        console.log("Using preinstalled version:", versionId);
        return JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    }

    // Otherwise, treat as vanilla and download
    return await downloadVanilla(versionId);
}

module.exports = {
    downloadVersion,
    GAME_DIR,
    LIB_DIR,
    VERSIONS_DIR,
    NATIVES_DIR,
    ASSETS_DIR
};
