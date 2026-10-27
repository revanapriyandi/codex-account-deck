const test = require("node:test"),
  assert = require("node:assert/strict");
const { DesktopBackend } = require("../src/backend.cjs");
test("waits for identity across transient backend reconnection", async () => {
  const backend = new DesktopBackend({ clients: new Map() });
  let calls = 0;
  backend.identity = async () => {
    if (++calls < 3) throw Error("connecting");
    return { id: "b" };
  };
  assert.equal(
    (await backend.waitForIdentity("b", { timeout: 200, interval: 1 })).id,
    "b",
  );
  assert.equal(calls, 3);
});
test("does not accept a different account when verification expires", async () => {
  const backend = new DesktopBackend({ clients: new Map() });
  backend.identity = async () => ({ id: "wrong" });
  await assert.rejects(
    backend.waitForIdentity("b", { timeout: 10, interval: 1 }),
    /identity did not match/,
  );
});
test("restart timeout exceeds renderer RPC deadline", async () => {
  let timeout;
  const backend = new DesktopBackend({
    clients: new Map([
      [
        "main",
        {
          ready: true,
          cdp: {
            evaluate: async (_e, _ctx, t) => {
              timeout = t;
            },
          },
        },
      ],
    ]),
  });
  await backend.restart();
  assert.equal(timeout, 65000);
});
