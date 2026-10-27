const test = require("node:test"),
  assert = require("node:assert/strict"),
  path = require("node:path"),
  os = require("node:os");
const { layout } = require("../src/layout.cjs");
test("desktop mode preserves the supplied original chat and browser profiles", () => {
  const base = os.tmpdir(),
    home = path.join(base, "original-codex"),
    profile = path.join(base, "original-browser");
  const got = layout({
    mode: "desktop",
    dataRoot: path.join(base, "addon"),
    codexHome: home,
    browserProfile: profile,
  });
  assert.equal(got.home, home);
  assert.equal(got.profile, profile);
  assert.equal(got.isolated, false);
});
test("test mode keeps all chat and browser state isolated", () => {
  const dataRoot = path.join(os.tmpdir(), "addon-test");
  const got = layout({ mode: "isolated-test", dataRoot });
  assert.equal(got.home, path.join(dataRoot, "codex-home"));
  assert.equal(got.profile, path.join(dataRoot, "desktop-profile"));
});
test("refuses an add-on directory overlapping the original chat data", () => {
  const home = path.join(os.tmpdir(), "original");
  assert.throws(
    () =>
      layout({
        mode: "desktop",
        dataRoot: path.join(home, "addon"),
        codexHome: home,
        browserProfile: path.join(os.tmpdir(), "browser"),
      }),
    /separate/,
  );
});
