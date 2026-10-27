const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  { execFile } = require("node:child_process"),
  { promisify } = require("node:util");
const exec = promisify(execFile),
  repo = path.resolve(__dirname, "..");
async function ps(file, args) {
  return exec(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.join(repo, file),
      ...args,
    ],
    { timeout: 90000, windowsHide: true },
  );
}
test(
  "install and reinstall are idempotent; uninstall preserves data and unrelated files",
  { skip: process.platform !== "win32", timeout: 180000 },
  async () => {
    const temp = await fs.mkdtemp(
        path.join(os.tmpdir(), "codex-switcher-install-"),
      ),
      root = path.join(temp, "installed");
    try {
      await ps("Install.ps1", [
        "-InstallRoot",
        root,
        "-Sandbox",
        "-NoShortcuts",
      ]);
      const before = await fs.readFile(path.join(root, "app/src/main.cjs"));
      const saved = path.join(root, "data/saved-accounts");
      await fs.mkdir(saved, { recursive: true });
      await fs.writeFile(
        path.join(saved, "a".repeat(64) + ".json"),
        "encrypted-fixture",
      );
      await fs.writeFile(path.join(root, "app/user-note.txt"), "keep");
      await ps("Install.ps1", [
        "-InstallRoot",
        root,
        "-Sandbox",
        "-NoShortcuts",
      ]);
      assert.deepEqual(
        await fs.readFile(path.join(root, "app/src/main.cjs")),
        before,
      );
      await ps("Uninstall.ps1", ["-InstallRoot", root]);
      assert.equal(
        await fs.readFile(path.join(root, "app/user-note.txt"), "utf8"),
        "keep",
      );
      assert.equal(
        await fs.readFile(path.join(saved, "a".repeat(64) + ".json"), "utf8"),
        "encrypted-fixture",
      );
      await assert.rejects(fs.access(path.join(root, "app/src/main.cjs")), {
        code: "ENOENT",
      });
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  },
);
test(
  "uninstall validates every manifest path before removing anything",
  { skip: process.platform !== "win32", timeout: 120000 },
  async () => {
    const temp = await fs.mkdtemp(
        path.join(os.tmpdir(), "codex-switcher-uninstall-"),
      ),
      root = path.join(temp, "installed");
    try {
      await ps("Install.ps1", [
        "-InstallRoot",
        root,
        "-Sandbox",
        "-NoShortcuts",
      ]);
      const marker = path.join(root, "installation.json"),
        record = JSON.parse(
          (await fs.readFile(marker, "utf8")).replace(/^\uFEFF/, ""),
        );
      record.files.push({ path: "../outside.txt" });
      await fs.writeFile(marker, JSON.stringify(record));
      await assert.rejects(ps("Uninstall.ps1", ["-InstallRoot", root]));
      await fs.access(path.join(root, "app/src/main.cjs"));
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  },
);
