const test = require("node:test"),
  assert = require("node:assert/strict");
const { evaluateCompatibility, inspectInstalledPackage } = require("../src/compatibility.cjs");
const supported = {
  packageVersion: "26.1021.3705.0",
  appVersion: "26.1021.31345",
  preloadSha256:
    "a3e622f8d80a83e58fb3cfcc640fa7e14e6461cccdae9ef7d7b0c821dde256b7",
  mainSha256:
    "2327d031e32c8d80c0dbf9bd81144466a90f8e49d3bc64e6604c23fbab900d7f",
  backendSha256:
    "a42052ee3309565865f2d20fc45dee297935cbb50d1fc1a404b90c18d824b93c",
};
test("rejects unknown app versions without modifying or invoking Codex", () => {
  const r = evaluateCompatibility({ ...supported, appVersion: "99.1.1" });
  assert.equal(r.enabled, false);
  assert.match(r.reason, /belum diverifikasi/);
});
test("rejects known version when bridge digest differs", () => {
  const r = evaluateCompatibility({
    ...supported,
    preloadSha256: "0".repeat(64),
  });
  assert.equal(r.enabled, false);
});
test("accepts certified package and exact bridge digest", () => {
  assert.equal(evaluateCompatibility(supported).enabled, true);
});
test("resolves reviewed update bundle paths while rejecting altered contents", (t) => {
  const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deck-package-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = {
    "package.json": JSON.stringify({ version: "26.1023.50603" }),
    ".vite/build/preload.js": "altered-preload",
    ".vite/build/main-CP9z2iYn.js": "altered-main",
    ".vite/build/src-tOjGKoT3.js": "altered-backend",
  };
  const tree = { files: {} }, contents = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const parts = name.split("/");
    let parent = tree;
    for (const part of parts.slice(0, -1)) parent = parent.files[part] ??= { files: {} };
    const data = Buffer.from(text);
    parent.files[parts.at(-1)] = { size: data.length, offset: String(offset) };
    contents.push(data);
    offset += data.length;
  }
  const json = Buffer.from(JSON.stringify(tree)), prefix = Buffer.alloc(16);
  prefix.writeUInt32LE(json.length + 8, 4);
  prefix.writeUInt32LE(json.length, 12);
  fs.mkdirSync(path.join(root, "app/resources"), { recursive: true });
  fs.writeFileSync(path.join(root, "app/resources/app.asar"), Buffer.concat([prefix, json, ...contents]));
  const result = inspectInstalledPackage({ installLocation: root, version: "26.1023.6123.0" });
  assert.equal(result.appVersion, "26.1023.50603");
  assert.match(result.backendSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.compatibility.enabled, false);
  assert.match(result.compatibility.reason, /belum diverifikasi/);
});
