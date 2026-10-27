const test = require("node:test"),
  assert = require("node:assert/strict");
const { evaluateCompatibility } = require("../src/compatibility.cjs");
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
