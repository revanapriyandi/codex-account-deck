const path = require("node:path");
function layout(config, env = process.env) {
  if (!["isolated-test", "desktop"].includes(config.mode))
    throw Error("Unsupported launch mode");
  if (!path.isAbsolute(config.dataRoot))
    throw Error("dataRoot must be absolute");
  const root = path.resolve(config.dataRoot),
    isolated = config.mode === "isolated-test";
  const home = isolated
    ? path.join(root, "codex-home")
    : path.resolve(config.codexHome ?? path.join(env.USERPROFILE, ".codex"));
  const profile = isolated
    ? path.join(root, "desktop-profile")
    : config.browserProfile;
  if (!profile || !path.isAbsolute(profile))
    throw Error("An existing absolute browser profile is required");
  const contains = (a, b) => {
    const r = path.relative(a, b);
    return (
      r === "" ||
      (!r.startsWith(".." + path.sep) && r !== ".." && !path.isAbsolute(r))
    );
  };
  if (
    !isolated &&
    (contains(root, home) ||
      contains(home, root) ||
      contains(root, profile) ||
      contains(profile, root))
  )
    throw Error("Add-on data must be separate from Codex profiles");
  return { root, home, profile: path.resolve(profile), isolated };
}
module.exports = { layout };
