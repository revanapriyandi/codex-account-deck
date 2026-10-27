const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const { AccountManager } = require("../src/manager.cjs");
const { identityFromAuth } = require("../src/vault.cjs");
function fixture(user) {
  const id =
    "e30." +
    Buffer.from(
      JSON.stringify({
        sub: user,
        email: user + "@example.invalid",
        "https://api.openai.com/auth": {
          chatgpt_account_id: "account-" + user,
          chatgpt_user_id: user,
        },
      }),
    ).toString("base64url") +
    ".sig";
  return {
    auth_mode: "chatgpt",
    tokens: {
      id_token: id,
      access_token: "test-access-" + user,
      refresh_token: "test-refresh-" + user,
      account_id: "account-" + user,
    },
  };
}
async function setup() {
  const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "codex-switcher-manager-"),
    ),
    file = path.join(dir, "auth.json"),
    a = fixture("a"),
    b = fixture("b"),
    saved = new Map();
  await fs.writeFile(file, JSON.stringify(a));
  const vault = {
    async save(auth) {
      const i = identityFromAuth(auth);
      saved.set(i.id, structuredClone(auth));
      return i;
    },
    async read(id) {
      return structuredClone(saved.get(id));
    },
    async list() {
      return [...saved.values()].map(identityFromAuth);
    },
  };
  await vault.save(b);
  let restarts = 0,
    blocked = false;
  const backend = {
    async assertIdle() {},
    async block(value) {
      blocked = value;
    },
    async restart() {
      restarts++;
    },
    async identity() {
      return identityFromAuth(JSON.parse(await fs.readFile(file)));
    },
  };
  const manager = new AccountManager({ authFile: file, vault, backend });
  return {
    dir,
    file,
    a,
    b,
    vault,
    backend,
    manager,
    get restarts() {
      return restarts;
    },
    get blocked() {
      return blocked;
    },
  };
}
test("switches A to B and snapshots current rotated credentials before leaving", async () => {
  const x = await setup();
  try {
    x.a.tokens.refresh_token = "rotated-a";
    await fs.writeFile(x.file, JSON.stringify(x.a));
    const got = await x.manager.switchTo(identityFromAuth(x.b).id);
    assert.equal(got.id, identityFromAuth(x.b).id);
    assert.equal(
      (await x.vault.read(identityFromAuth(x.a).id)).tokens.refresh_token,
      "rotated-a",
    );
    assert.equal(x.restarts, 1);
    assert.equal(x.blocked, false);
  } finally {
    await fs.rm(x.dir, { recursive: true, force: true });
  }
});
test("refuses switch during active work without writing auth file", async () => {
  const x = await setup();
  try {
    x.backend.assertIdle = async () => {
      throw Error("Active work");
    };
    const before = await fs.readFile(x.file);
    await assert.rejects(
      x.manager.switchTo(identityFromAuth(x.b).id),
      /Active work/,
    );
    assert.deepEqual(await fs.readFile(x.file), before);
    assert.equal(x.restarts, 0);
    assert.equal(x.blocked, false);
  } finally {
    await fs.rm(x.dir, { recursive: true, force: true });
  }
});
test("restores previous credentials if backend identity does not match target", async () => {
  const x = await setup();
  try {
    x.backend.identity = async () => identityFromAuth(x.a);
    await assert.rejects(
      x.manager.switchTo(identityFromAuth(x.b).id),
      /previous account restored/,
    );
    assert.equal(
      identityFromAuth(JSON.parse(await fs.readFile(x.file))).id,
      identityFromAuth(x.a).id,
    );
    assert.equal(x.restarts, 2);
    assert.equal(x.blocked, false);
  } finally {
    await fs.rm(x.dir, { recursive: true, force: true });
  }
});
test("retains request gate when rollback cannot be verified", async () => {
  const x = await setup();
  try {
    let calls = 0;
    x.backend.identity = async () =>
      ++calls === 1 ? identityFromAuth(x.a) : { id: "incorrect" };
    await assert.rejects(
      x.manager.switchTo(identityFromAuth(x.b).id),
      /could not verify recovery/,
    );
    assert.equal(x.blocked, true);
  } finally {
    await fs.rm(x.dir, { recursive: true, force: true });
  }
});
test("rejects a stale auth file before changing credentials", async () => {
  const x = await setup();
  try {
    x.backend.identity = async () => ({ id: "other" });
    const before = await fs.readFile(x.file);
    await assert.rejects(
      x.manager.switchTo(identityFromAuth(x.b).id),
      /active backend/,
    );
    assert.deepEqual(await fs.readFile(x.file), before);
    assert.equal(x.restarts, 0);
  } finally {
    await fs.rm(x.dir, { recursive: true, force: true });
  }
});
test("journal recovers the previous account after helper interruption", async () => {
  const x = await setup();
  try {
    await x.vault.save(x.a);
    x.manager.journalFile = path.join(x.dir, "transaction.json");
    await fs.writeFile(
      x.manager.journalFile,
      JSON.stringify({
        schema: 1,
        previousId: identityFromAuth(x.a).id,
        targetId: identityFromAuth(x.b).id,
      }),
    );
    await fs.writeFile(x.file, JSON.stringify(x.b));
    assert.equal(await x.manager.recover(), true);
    assert.equal(
      (await x.manager.current()).identity.id,
      identityFromAuth(x.a).id,
    );
    await assert.rejects(fs.access(x.manager.journalFile), { code: "ENOENT" });
  } finally {
    await fs.rm(x.dir, { recursive: true, force: true });
  }
});
