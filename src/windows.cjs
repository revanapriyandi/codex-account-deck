const path = require("node:path"),
  { spawn } = require("node:child_process");
const powershell = path.join(
  process.env.SystemRoot ?? "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
);
function runPowerShell(script, args = [], input, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      powershell,
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", script, ...args],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    const chunks = [];
    let n = 0;
    const timer = setTimeout(() => child.kill(), timeout);
    child.stdout.on("data", (d) => {
      n += d.length;
      if (n > 1024 * 1024) child.kill();
      else chunks.push(d);
    });
    child.stderr.on("data", () => {});
    child.on("error", () => {
      clearTimeout(timer);
      reject(Error("Windows helper could not start"));
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve(
            Buffer.concat(chunks)
              .toString("utf8")
              .replace(/^\uFEFF/, ""),
          )
        : reject(Error("Windows helper failed (" + code + ")"));
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}
async function findPackage() {
  return JSON.parse(
    await runPowerShell(path.join(__dirname, "find-package.ps1")),
  );
}
module.exports = { powershell, runPowerShell, findPackage };
