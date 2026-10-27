const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { Vault, identityFromAuth } = require("../src/vault.cjs");
test("account identity preserves same-email registrations separately", () => {
  const jwt = (user, account) =>
    "e30." +
    Buffer.from(
      JSON.stringify({
        email: "same@example.invalid",
        "https://api.openai.com/auth": {
          chatgpt_user_id: user,
          chatgpt_account_id: account,
        },
      }),
    ).toString("base64url") +
    ".signature";
  const a = identityFromAuth({
    tokens: {
      id_token: jwt("user-a", "workspace-a"),
      access_token: "a",
      refresh_token: "a",
      account_id: "workspace-a",
    },
  });
  const b = identityFromAuth({
    tokens: {
      id_token: jwt("user-b", "workspace-b"),
      access_token: "b",
      refresh_token: "b",
      account_id: "workspace-b",
    },
  });
  assert.equal(a.label, b.label);
  assert.notEqual(a.id, b.id);
});
test("Windows DPAPI vault round trip hides tokens in every persisted file", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switcher-vault-"));
  try {
    const secret = "sk-vault-test-" + require("node:crypto").randomUUID();
    const auth = { auth_mode: "apikey", OPENAI_API_KEY: secret };
    const v = new Vault(dir);
    const item = await v.save(auth);
    assert.deepEqual(await v.read(item.id), auth);
    const list = await v.list();
    assert.equal(list.length, 1);
    assert.equal(JSON.stringify(list).includes(secret), false);
    for (const n of fs.readdirSync(dir))
      assert.equal(
        fs.readFileSync(path.join(dir, n), "utf8").includes(secret),
        false,
      );
    await v.remove(item.id);
    assert.deepEqual(await v.list(), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("rejects traversal ids before file reads", async () => {
  const v = new Vault(os.tmpdir());
  await assert.rejects(v.read("../auth"), /Invalid account id/);
});
