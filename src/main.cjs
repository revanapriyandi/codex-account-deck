const fs = require("node:fs"),
  fsp = require("node:fs/promises"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { Cdp } = require("./cdp.cjs");
const { Vault } = require("./vault.cjs");
const { AccountManager } = require("./manager.cjs");
const { DesktopBackend } = require("./backend.cjs");
const { findPackage, runPowerShell } = require("./windows.cjs");
const { inspectInstalledPackage } = require("./compatibility.cjs");
const { layout } = require("./layout.cjs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cfgPath = process.argv[2];
if (!cfgPath) throw Error("A configuration file is required");
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8").replace(/^\uFEFF/, ""));
const { root, home, profile, isolated } = layout(cfg);
fs.mkdirSync(root, { recursive: true });
const lock = path.join(root, "helper.lock");
if (fs.existsSync(lock)) {
  const pid = Number(fs.readFileSync(lock, "utf8"));
  let alive = false;
  if (Number.isSafeInteger(pid) && pid > 0)
    try {
      process.kill(pid, 0);
      alive = true;
    } catch {}
  if (alive) process.exit(2);
  fs.unlinkSync(lock);
}
try {
  fs.writeFileSync(lock, String(process.pid), { flag: "wx" });
} catch {
  process.exit(2);
}
const statusPath = path.join(root, "helper-status.json");
function status(state, extra = {}) {
  fs.writeFileSync(
    statusPath,
    JSON.stringify(
      {
        state,
        pid: process.pid,
        updatedAt: new Date().toISOString(),
        ...extra,
      },
      null,
      2,
    ),
  );
}
let child,
  closing = false,
  login = null;
const clients = new Map();
async function close() {
  if (closing) return;
  closing = true;
  login?.kill();
  for (const c of clients.values()) {
    try {
      await c.cdp.evaluate("globalThis.__codexSwitcher?.dispose()");
    } catch {}
    c.cdp.close();
  }
  try {
    await fsp.unlink(lock);
  } catch {}
  let previous;
  try {
    previous = JSON.parse(fs.readFileSync(statusPath, "utf8"));
  } catch {}
  if (!["error", "incompatible"].includes(previous?.state)) status("stopped");
}
process.on("SIGTERM", () => close().finally(() => process.exit(0)));
process.on("SIGINT", () => close().finally(() => process.exit(0)));
async function main() {
  status("checking");
  const pkg = inspectInstalledPackage(await findPackage());
  if (!pkg.compatibility.enabled) {
    status("incompatible", {
      reason: pkg.compatibility.reason,
      appVersion: pkg.appVersion,
    });
    if (!isolated)
      spawn(pkg.executable, [], {
        windowsHide: true,
        detached: true,
        stdio: "ignore",
      }).unref();
    return;
  }
  const nativeIdentity = (
    await runPowerShell(path.join(__dirname, "package-identity.ps1"))
  ).trim();
  if (nativeIdentity !== path.basename(pkg.installLocation))
    throw Error(
      "Package identity is missing; refusing to launch Codex with an unverified updater context",
    );
  if (!isolated) {
    const running = JSON.parse(
      await runPowerShell(path.join(__dirname, "running-desktop.ps1"), [
        "-Executable",
        pkg.executable,
      ]),
    );
    if (running.length)
      throw Error(
        "Close the running Codex window normally, then open Codex Account Deck. No running window was stopped.",
      );
    if (!fs.existsSync(home) || !fs.existsSync(profile))
      throw Error(
        "Original Codex profiles were not found; refusing to create an empty desktop profile",
      );
  } else {
    for (const p of [home, profile]) fs.mkdirSync(p, { recursive: true });
    const config = path.join(home, "config.toml");
    if (!fs.existsSync(config))
      fs.writeFileSync(config, 'cli_auth_credentials_store = "file"\n');
  }
  const marker = path.join(profile, "DevToolsActivePort");
  if (fs.existsSync(marker)) fs.unlinkSync(marker);
  const env = { ...process.env, CODEX_HOME: home };
  if (isolated) env.CODEX_ELECTRON_USER_DATA_PATH = profile;
  else delete env.CODEX_ELECTRON_USER_DATA_PATH;
  for (const key of [
    "OPENAI_API_KEY",
    "CODEX_API_KEY",
    "CODEX_ACCESS_TOKEN",
    "CODEX_AUTH_TOKEN",
    "CODEX_CLI_PATH",
  ])
    delete env[key];
  const flags = [
    "--remote-debugging-port=0",
    "--remote-debugging-address=127.0.0.1",
  ];
  if (isolated) flags.push("--user-data-dir=" + profile, "--no-first-run");
  child = spawn(pkg.executable, flags, {
    env,
    windowsHide: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.on("error", () =>
    status("error", {
      reason: "Could not start the official Codex executable",
    }),
  );
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  child.once("exit", () => close());
  status("starting", {
    desktopPid: child.pid,
    appVersion: pkg.appVersion,
    packageIdentityVerified: true,
  });
  const vault = new Vault(path.join(root, "saved-accounts"));
  const backend = new DesktopBackend({
    clients,
    authFile: path.join(home, "auth.json"),
  });
  const manager = new AccountManager({
    authFile: path.join(home, "auth.json"),
    vault,
    backend,
    journalFile: path.join(root, "transaction.json"),
    onPhase: (event) => {
      fs.appendFileSync(
        path.join(root, "transitions.jsonl"),
        JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n",
      );
      for (const c of clients.values())
        if (c.ready)
          c.cdp
            .evaluate(
              "__codexSwitcher.progress(" + JSON.stringify(event.phase) + ")",
            )
            .catch(() => {});
    },
  });
  let recovered = false;
  async function addAccount() {
    if (login || manager.switching)
      throw Error("Login atau perpindahan akun lain masih berlangsung");
    const temp = path.join(root, "login-" + crypto.randomUUID());
    await fsp.mkdir(temp);
    const loginEnv = { ...env, CODEX_HOME: temp };
    const p = spawn(
      pkg.cli,
      ["-c", 'cli_auth_credentials_store="file"', "login"],
      { env: loginEnv, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    login = p;
    const timeout = setTimeout(() => p.kill(), 150000);
    p.stdout.on("data", () => {});
    p.stderr.on("data", () => {});
    try {
      await new Promise((resolve, reject) => {
        p.once("error", () => reject(Error("Tidak bisa memulai login resmi")));
        p.once("exit", (code) =>
          code === 0
            ? resolve()
            : reject(Error("Login belum selesai atau dibatalkan")),
        );
      });
      const file = path.join(temp, "auth.json");
      const auth = JSON.parse(await fsp.readFile(file, "utf8"));
      return await vault.save(auth);
    } finally {
      clearTimeout(timeout);
      login = null;
      await fsp.unlink(path.join(temp, "auth.json")).catch(() => {});
    }
  }
  async function action(message) {
    if (
      !message ||
      typeof message.id !== "string" ||
      message.id.length > 64 ||
      typeof message.action !== "string"
    )
      throw Error("Permintaan add-on tidak valid");
    if (login && message.action !== "list")
      throw Error(
        "Selesaikan login yang sedang berjalan sebelum melakukan aksi lain",
      );
    switch (message.action) {
      case "list":
        return manager.list();
      case "save-current":
        return manager.saveCurrent();
      case "add":
        return addAccount();
      case "switch":
        return manager.switchTo(message.args?.id);
      case "remove":
        if (manager.switching || manager.recoveryRequired)
          throw Error("Perpindahan atau pemulihan akun masih berlangsung");
        return vault.remove(message.args?.id);
      default:
        throw Error("Aksi tidak didukung");
    }
  }
  const source =
    "globalThis.__codexSwitcherMode=" +
    JSON.stringify(cfg.mode) +
    ";globalThis.__codexSwitcherStyles=" +
    JSON.stringify(
      fs.readFileSync(path.join(__dirname, "renderer.css"), "utf8"),
    ) +
    ";" +
    fs.readFileSync(path.join(__dirname, "renderer.js"), "utf8");
  let endpoint;
  const start = Date.now();
  while (!closing && Date.now() - start < 45000) {
    if (fs.existsSync(marker)) {
      const port = Number(fs.readFileSync(marker, "utf8").split(/\r?\n/)[0]);
      if (port > 0 && port < 65536) {
        endpoint = "http://127.0.0.1:" + port;
        break;
      }
    }
    await sleep(300);
  }
  if (!endpoint) throw Error("Endpoint lokal Codex tidak tersedia");
  while (!closing) {
    let targets;
    try {
      targets = await fetch(endpoint + "/json/list", {
        signal: AbortSignal.timeout(5000),
      }).then((r) => r.json());
    } catch {
      await sleep(1000);
      continue;
    }
    for (const target of targets.filter(
      (t) => t.type === "page" && t.url === "app://-/index.html",
    )) {
      if (clients.has(target.id)) continue;
      const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
      const entry = { cdp, ready: false };
      clients.set(target.id, entry);
      cdp.on("Runtime.bindingCalled", async (e) => {
        if (e.name !== "__codexSwitcherRequest" || e.payload.length > 4096)
          return;
        let m;
        try {
          const context = await cdp.evaluate(
            "({origin:location.origin,path:location.pathname,isMain:window.top===window})",
            e.executionContextId,
          );
          if (
            context.origin !== "app://-" ||
            context.path !== "/index.html" ||
            !context.isMain
          )
            return;
          m = JSON.parse(e.payload);
          const data = await action(m);
          await cdp.evaluate(
            `__codexSwitcher.reply(${JSON.stringify(m.id)},${JSON.stringify(data ?? null)},null)`,
            e.executionContextId,
          );
        } catch (error) {
          if (m?.id)
            try {
              await cdp.evaluate(
                `__codexSwitcher.reply(${JSON.stringify(m.id)},null,${JSON.stringify(error.message)})`,
                e.executionContextId,
              );
            } catch {}
        }
      });
      await cdp.send("Runtime.enable");
      await cdp.send("Runtime.addBinding", { name: "__codexSwitcherRequest" });
      await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
        source:
          'document.addEventListener("DOMContentLoaded",()=>{' +
          source +
          "},{once:true});",
      });
      for (let i = 0; i < 20 && !closing; i++) {
        try {
          const ready = await cdp.evaluate(
            'location.origin==="app://-"&&location.pathname==="/index.html"&&!!document.body&&typeof electronBridge==="object"',
          );
          if (ready) {
            await cdp.evaluate(source);
            entry.ready = true;
            break;
          }
        } catch {}
        await sleep(400);
      }
      if (entry.ready) {
        if (!recovered) {
          await manager.recover();
          recovered = true;
        }
        status("ready", {
          desktopPid: child.pid,
          appVersion: pkg.appVersion,
          packageIdentityVerified: true,
          profileIsolated: isolated,
        });
        if (isolated && !cfg.silentPanel)
          await cdp.evaluate("__codexSwitcher.open()");
      }
    }
    for (const [id, c] of clients)
      if (!targets.some((t) => t.id === id)) {
        c.cdp.close();
        clients.delete(id);
      }
    await sleep(1500);
  }
}
main()
  .catch((error) => {
    status("error", { reason: error.message });
  })
  .finally(async () => {
    await close();
  });
