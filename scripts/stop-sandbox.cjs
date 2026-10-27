const fs = require("node:fs"),
  path = require("node:path");
const { Cdp } = require("../src/cdp.cjs");
const { DesktopBackend } = require("../src/backend.cjs");
(async () => {
  const root = path.resolve(process.argv[2] ?? "");
  if (!process.argv[2]) throw Error("Supply the sandbox data directory");
  const cfg = JSON.parse(
    fs
      .readFileSync(path.join(root, "launch-config.json"), "utf8")
      .replace(/^\uFEFF/, ""),
  );
  if (cfg.mode !== "isolated-test" || path.resolve(cfg.dataRoot) !== root)
    throw Error("This command closes only a recorded isolated sandbox");
  const port = Number(
    fs
      .readFileSync(
        path.join(root, "desktop-profile/DevToolsActivePort"),
        "utf8",
      )
      .split(/\r?\n/)[0],
  );
  if (!(port > 0 && port < 65536)) throw Error("Invalid sandbox port");
  const targets = await fetch("http://127.0.0.1:" + port + "/json/list").then(
      (r) => r.json(),
    ),
    target = targets.find((t) => t.url === "app://-/index.html");
  if (!target) throw Error("No sandbox app target");
  const c = await Cdp.connect(target.webSocketDebuggerUrl);
  try {
    const b = new DesktopBackend({
      clients: new Map([["main", { ready: true, cdp: c }]]),
    });
    await b.assertIdle();
    await c
      .evaluate('electronBridge.sendMessageFromView({type:"quit-app"})')
      .catch((e) => {
        if (!/closed/.test(e.message)) throw e;
      });
  } finally {
    c.close();
  }
  const end = Date.now() + 15000;
  while (fs.existsSync(path.join(root, "helper.lock")) && Date.now() < end)
    await new Promise((r) => setTimeout(r, 150));
  if (fs.existsSync(path.join(root, "helper.lock")))
    throw Error("Sandbox closed, but helper cleanup is still pending");
  console.log("Idle sandbox closed normally and helper cleanup completed.");
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
