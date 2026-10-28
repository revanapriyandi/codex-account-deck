const fs = require("node:fs"),
  crypto = require("node:crypto"),
  path = require("node:path");
const certified = [
  {
    packageVersion: "26.1021.3705.0",
    appVersion: "26.1021.31345",
    preloadSha256:
      "a3e622f8d80a83e58fb3cfcc640fa7e14e6461cccdae9ef7d7b0c821dde256b7",
    mainSha256:
      "2327d031e32c8d80c0dbf9bd81144466a90f8e49d3bc64e6604c23fbab900d7f",
    backendSha256:
      "a42052ee3309565865f2d20fc45dee297935cbb50d1fc1a404b90c18d824b93c",
  },
  {
    packageVersion: "26.1023.6123.0",
    appVersion: "26.1023.50603",
    preloadSha256:
      "e9e6bb0d8c781368f5fb177c30b2832587b9881be3eff03b1550a669fba599c0",
    mainSha256:
      "9a4d60010bcceb6310ef6a357cae924db06df1babe3c4dd91310da2b5f39cf1f",
    backendSha256:
      "4ec7ba9b620cc5949183c532287ae9da2f6bb5d4f7be0a0e4565a9b4170394c1",
  },
];
const packageEntries = {
  "26.1021.3705.0": [".vite/build/main-BPBEjAxi.js", ".vite/build/src-Dl21kCYQ.js"],
  "26.1023.6123.0": [".vite/build/main-CP9z2iYn.js", ".vite/build/src-tOjGKoT3.js"],
};
function evaluateCompatibility(identity) {
  const match = certified.find((c) =>
    Object.keys(c).every((key) => c[key] === identity[key]),
  );
  return {
    enabled: !!match,
    reason: match
      ? "Versi dan bridge dikenali."
      : "Versi atau bridge Codex belum diverifikasi. Add-on dinonaktifkan; Codex resmi tetap dapat digunakan.",
  };
}
function readAsarEntries(file, names) {
  const fd = fs.openSync(file, "r");
  try {
    const prefix = Buffer.alloc(16);
    fs.readSync(fd, prefix, 0, 16, 0);
    const headerSize = prefix.readUInt32LE(4),
      jsonSize = prefix.readUInt32LE(12);
    if (jsonSize > 32 * 1024 * 1024 || headerSize < jsonSize)
      throw Error("Unsupported ASAR header");
    const h = Buffer.alloc(jsonSize);
    fs.readSync(fd, h, 0, jsonSize, 16);
    const tree = JSON.parse(h.toString());
    const out = {};
    for (const name of names) {
      let node = tree;
      for (const segment of name.split("/")) {
        node = node.files?.[segment];
        if (!node) throw Error("Required app entry is absent");
      }
      if (node.unpacked || node.link || node.size > 8 * 1024 * 1024)
        throw Error("Unsupported app entry");
      const b = Buffer.alloc(node.size);
      fs.readSync(fd, b, 0, b.length, 8 + headerSize + Number(node.offset));
      out[name] = b;
    }
    return out;
  } finally {
    fs.closeSync(fd);
  }
}
function inspectInstalledPackage(pkg) {
  const resources = path.join(pkg.installLocation, "app", "resources"),
    executable = path.join(pkg.installLocation, "app", "ChatGPT.exe"),
    cli = path.join(resources, "codex.exe");
  try {
    const [mainEntry, backendEntry] = packageEntries[pkg.version] ?? [];
    if (!mainEntry || !backendEntry) throw Error("Unreviewed package version");
    const entries = readAsarEntries(path.join(resources, "app.asar"), [
        "package.json",
        ".vite/build/preload.js",
        mainEntry,
        backendEntry,
      ]),
      metadata = JSON.parse(entries["package.json"]),
      digest = (name) =>
        crypto.createHash("sha256").update(entries[name]).digest("hex");
    const identity = {
      packageVersion: pkg.version,
      appVersion: metadata.version,
      preloadSha256: digest(".vite/build/preload.js"),
      mainSha256: digest(mainEntry),
      backendSha256: digest(backendEntry),
    };
    return {
      ...pkg,
      ...identity,
      resources,
      executable,
      cli,
      compatibility: evaluateCompatibility(identity),
    };
  } catch {
    return {
      ...pkg,
      resources,
      executable,
      cli,
      compatibility: {
        enabled: false,
        reason: "Struktur paket Codex belum dikenali. Add-on dinonaktifkan.",
      },
    };
  }
}
module.exports = {
  evaluateCompatibility,
  inspectInstalledPackage,
  readAsarEntries,
};
