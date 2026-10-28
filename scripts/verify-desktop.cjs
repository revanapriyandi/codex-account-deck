const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { Cdp } = require("../src/cdp.cjs"),
  { identityFromAuth } = require("../src/vault.cjs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wait(c, expression, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await c.evaluate(expression)) return;
    await sleep(100);
  }
  const state = await c
    .evaluate("globalThis.__codexSwitcher?.getStatus?.()")
    .catch(() => null);
  throw Error("Desktop condition timed out: " + JSON.stringify(state));
}
async function click(c, selector) {
  await c.evaluate(
    `document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'nearest'})`,
  );
  await sleep(250);
  const p = await c.evaluate(
    `(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n)throw Error(${JSON.stringify("Control missing: " + selector.replace(/[a-f0-9]{64}/g, "[account]"))});const r=n.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(!n.contains(document.elementFromPoint(x,y)))throw Error('Control is obscured');return{x,y}})()`,
  );
  await c.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    button: "left",
    clickCount: 1,
    ...p,
  });
  await c.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    button: "left",
    clickCount: 1,
    ...p,
  });
}
async function rpc(c, method, params) {
  const allowed = new Set([
    "account/read",
    "model/list",
    "thread/start",
    "turn/start",
    "thread/turns/list",
    "thread/archive",
    "thread/read",
  ]);
  if (!allowed.has(method)) throw Error("Unsupported verification operation");
  return c.evaluate(
    `new Promise((resolve,reject)=>{const id='switcher-e2e-'+crypto.randomUUID(),timer=setTimeout(()=>{window.removeEventListener('message',listener);reject(Error('Backend verification timed out'));},30000);function listener(e){const d=e.data;if(d?.type!=='mcp-response'||d.message?.id!==id)return;clearTimeout(timer);window.removeEventListener('message',listener);d.message.error?reject(Error(${JSON.stringify("Backend rejected " + method + ": ")}+d.message.error.code)):resolve(d.message.result);}window.addEventListener('message',listener);electronBridge.sendMessageFromView({type:'mcp-request',hostId:'local',request:{id,method:${JSON.stringify(method)},params:${JSON.stringify(params)}}}).catch(reject);})`,
    undefined,
    35000,
  );
}
async function open(c) {
  if (
    await c.evaluate(
      'document.querySelector("#codex-account-panel")?.hidden===false&&!!document.querySelector("[data-codex-account-trigger]")',
    )
  )
    return;
  await c.evaluate('document.querySelector("#codex-switcher-dialog")?.close()');
  if (
    !(await c.evaluate(
      '!!document.querySelector("[data-codex-account-trigger]")',
    ))
  ) {
    await wait(c, '!!document.querySelector(\'button[aria-label="Open profile menu"]\')', 30000);
    await click(c, 'button[aria-label="Open profile menu"]');
  }
  await wait(c, '!!document.querySelector("[data-codex-account-trigger]")');
  await click(c, "[data-codex-account-trigger]");
  await wait(
    c,
    'document.querySelector("#codex-account-panel")?.dataset.busy==="false"',
  );
}
async function finishTurn(c, threadId) {
  const end = Date.now() + 90000;
  while (Date.now() < end) {
    const result = await rpc(c, "thread/turns/list", {
        threadId,
        limit: 1,
        itemsView: "full",
      }),
      turn = result.data?.[0];
    if (["completed", "failed", "interrupted"].includes(turn?.status))
      return turn;
    await sleep(500);
  }
  throw Error("Model turn did not finish before the test deadline");
}
(async () => {
  const uiOnly = process.argv.includes("--ui-only");
  const root = path.resolve(process.argv[2] ?? "");
  if (!process.argv[2])
    throw Error("Supply the isolated sandbox data directory");
  const cfg = JSON.parse(
    fs
      .readFileSync(path.join(root, "launch-config.json"), "utf8")
      .replace(/^\uFEFF/, ""),
  );
  if (cfg.mode !== "isolated-test" || path.resolve(cfg.dataRoot) !== root)
    throw Error(
      "Real-account verification runs only on a recorded isolated sandbox",
    );
  const port = Number(
    fs
      .readFileSync(
        path.join(root, "desktop-profile/DevToolsActivePort"),
        "utf8",
      )
      .split(/\r?\n/)[0],
  );
  if (!(port > 0 && port < 65536)) throw Error("Invalid CDP port");
  const targets = await fetch("http://127.0.0.1:" + port + "/json/list").then(
      (r) => r.json(),
    ),
    target = targets.find((t) => t.url === "app://-/index.html");
  if (!target) throw Error("Sandbox window not found");
  const c = await Cdp.connect(target.webSocketDebuggerUrl);
  const authFile = path.join(root, "codex-home/auth.json"),
    current = () =>
      identityFromAuth(JSON.parse(fs.readFileSync(authFile, "utf8"))),
    original = current(),
    accounts = fs
      .readdirSync(path.join(root, "saved-accounts"))
      .filter((n) => /^[a-f0-9]{64}\.json$/.test(n))
      .map(
        (n) =>
          JSON.parse(fs.readFileSync(path.join(root, "saved-accounts", n)))
            .identity,
      ),
    second = accounts.find((a) => a.id !== original.id);
  if (!second) throw Error("Save two distinct ChatGPT accounts first");
  const report = {
    scope: uiOnly ? "ui-roundtrip" : "full-desktop",
    isolated: true,
    mainFrameNavigations: 0,
    transitions: [],
    modelRequests: [],
    activeWorkRefused: false,
    chatPreserved: false,
    projectsPreserved: false,
    reducedMotion: false,
    originalRestored: false,
    passed: false,
  };
  const threads = [];
  function projectIds() {
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(path.join(root, "codex-home/state_5.sqlite"), {
      readOnly: true,
    });
    try {
      return db.prepare("SELECT id FROM projects ORDER BY id").all().map((p) => p.id);
    } finally {
      db.close();
    }
  }
  async function switchTo(label, account) {
    console.log("Opening account list for " + label);
    await open(c);
    assert.equal(
      await c.evaluate(
        'document.querySelectorAll("[data-codex-switcher-item]").length',
      ),
      0,
    );
    const start = Date.now();
    await click(c, '.cs-account[data-account-id="' + account.id + '"]');
    await wait(
      c,
      "!__codexSwitcher.getStatus().busy&&!__codexSwitcher.getStatus().open",
      180000,
    );
    const actual = await rpc(c, "account/read", { refreshToken: false });
    assert.equal(current().id, account.id);
    assert.equal(actual.workspaceRouting?.chatgptAccountId, account.accountId);
    report.transitions.push({
      account: label,
      elapsedMs: Date.now() - start,
      backendMatched: true,
      autoClosed: true,
    });
  }
  try {
    await c.send("Page.enable");
    await c.send("Page.bringToFront");
    const frame = (await c.send("Page.getFrameTree")).frameTree.frame;
    await c.evaluate('globalThis.__switcherVerificationMarker="preserved"');
    c.on("Page.frameNavigated", (e) => {
      if (e.frame.id === frame.id) report.mainFrameNavigations++;
    });
    const before = projectIds();
    report.projectCount = before.length;
    report.projectVerification = "read-only local SQLite registry";
    for (const [label, account] of [
      ["A", original],
      ["B", second],
    ]) {
      if (label === "B") await switchTo("B", account);
      if (uiOnly) continue;
      const models = await rpc(c, "model/list", { limit: 100 }),
        model =
          models.data.find((m) => m.model === "gpt-6-luna" && !m.hidden) ??
          models.data.find((m) => m.isDefault && !m.hidden) ??
          models.data.find((m) => !m.hidden);
      if (!model) throw Error("No model is available");
      const thread = await rpc(c, "thread/start", {
        cwd: root,
        ephemeral: false,
        model: model.model,
        modelProvider: "openai",
      });
      threads.push(thread.thread.id);
      await rpc(c, "turn/start", {
        threadId: thread.thread.id,
        model: model.model,
        effort: "low",
        input: [
          {
            type: "text",
            text: "Reply exactly OK. Do not use tools, browse, or read files.",
            text_elements: [],
          },
        ],
      });
      const turn = await finishTurn(c, thread.thread.id),
        text = (turn.items ?? [])
          .filter((i) => i.type === "agentMessage")
          .map((i) => i.text ?? "")
          .join("\n")
          .trim();
      const entry = {
        account: label,
        completed: turn.status === "completed",
        expectedText: /^OK[.!]?$/.test(text),
        toolsUsed: (turn.items ?? []).some((i) =>
          /commandExecution|fileChange|mcpToolCall/.test(i.type),
        ),
      };
      report.modelRequests.push(entry);
      assert.ok(entry.completed && entry.expectedText && !entry.toolsUsed);
      console.log("Model request " + label + " passed");
    }
    if (!uiOnly) {
      const read = await rpc(c, "thread/read", {
        threadId: threads[0],
        includeTurns: false,
      });
      report.chatPreserved = read.thread?.id === threads[0];
      assert.ok(report.chatPreserved);
    }
    await switchTo("A", original);
    report.originalRestored = true;
    const after = projectIds();
    report.projectsPreserved =
      JSON.stringify(before) === JSON.stringify(after);
    assert.ok(report.projectsPreserved);
    await open(c);
    await c.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    report.reducedMotion = await c.evaluate(
      'getComputedStyle(document.querySelector("#codex-account-panel")).transform==="none"&&getComputedStyle(document.querySelector("#codex-account-panel")).transitionDuration==="0s"',
    );
    await c.send("Emulation.setEmulatedMedia", { features: [] });
    if (!uiOnly) {
      const models = await rpc(c, "model/list", { limit: 100 }),
        model = models.data.find((m) => !m.hidden);
      const active = await rpc(c, "thread/start", {
        cwd: root,
        ephemeral: false,
        model: model.model,
        modelProvider: "openai",
      });
      threads.push(active.thread.id);
      await rpc(c, "turn/start", {
        threadId: active.thread.id,
        model: model.model,
        input: [
          {
            type: "text",
            text: "Count from 1 to 500, one integer per line. Do not use tools, browse, or read files.",
            text_elements: [],
          },
        ],
      });
      await click(c, '.cs-account[data-account-id="' + second.id + '"]');
      await wait(
        c,
        'document.querySelector("#codex-account-panel")?.dataset.busy==="false"',
        60000,
      );
      report.activeWorkRefused = await c.evaluate(
        'document.querySelector(".cs-status")?.getAttribute("role")==="alert"&&/pekerjaan aktif/.test(document.querySelector(".cs-status").textContent)&&!document.querySelector("#codex-account-panel").hidden',
      );
      assert.equal(current().id, original.id);
      assert.ok(report.activeWorkRefused);
      await finishTurn(c, active.thread.id);
    }
    report.sameDocument =
      (await c.send("Page.getFrameTree")).frameTree.frame.loaderId ===
        frame.loaderId &&
      (await c.evaluate('__switcherVerificationMarker==="preserved"'));
    report.passed =
      report.mainFrameNavigations === 0 &&
      report.sameDocument &&
      report.reducedMotion &&
      (uiOnly || report.activeWorkRefused);
  } catch (error) {
    report.error = error.message;
    report.passed = false;
  } finally {
    if (current().id !== original.id)
      try {
        await switchTo("recovery-A", original);
      } catch {
        report.recoveryFailed = true;
      }
    report.originalRestored = current().id === original.id;
    for (const threadId of threads)
      try {
        const r = await rpc(c, "thread/read", {
          threadId,
          includeTurns: false,
        });
        if (
          ["idle", "notLoaded", "systemError"].includes(r.thread?.status?.type)
        )
          await rpc(c, "thread/archive", { threadId });
      } catch {}
    c.close();
    const file = path.join(
      root,
      uiOnly ? "ui-verification-report.json" : "verification-report.json",
    );
    fs.writeFileSync(file, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
    process.exitCode = report.passed ? 0 : 1;
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
