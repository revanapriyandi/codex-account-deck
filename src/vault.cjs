const fs = require("node:fs/promises"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { spawn } = require("node:child_process");
function jwtClaims(token) {
  try {
    return JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    );
  } catch {
    return {};
  }
}
function identityFromAuth(auth) {
  if (
    auth?.tokens?.access_token &&
    auth.tokens.refresh_token &&
    auth.tokens.id_token
  ) {
    const claims = jwtClaims(auth.tokens.id_token),
      c = claims["https://api.openai.com/auth"] ?? {};
    const accountId = auth.tokens.account_id ?? c.chatgpt_account_id,
      userId = c.chatgpt_user_id ?? claims.sub;
    if (!accountId || !userId)
      throw Error("ChatGPT account identity is missing");
    const id = crypto
      .createHash("sha256")
      .update("chatgpt\0" + accountId + "\0" + userId)
      .digest("hex");
    return {
      id,
      type: "chatgpt",
      accountId,
      userId,
      label: claims.email ?? "Akun ChatGPT",
      plan: c.chatgpt_plan_type ?? null,
    };
  }
  if (
    typeof auth?.OPENAI_API_KEY === "string" &&
    auth.OPENAI_API_KEY.length > 0
  ) {
    const id = crypto
      .createHash("sha256")
      .update("apikey\0" + auth.OPENAI_API_KEY)
      .digest("hex");
    return {
      id,
      type: "apikey",
      label: "API key · " + id.slice(0, 6),
      accountId: null,
      userId: null,
      plan: null,
    };
  }
  throw Error("Unsupported or missing stored authentication");
}
function protect(mode, data) {
  return new Promise((resolve, reject) => {
    if (process.platform !== "win32")
      return reject(Error("Windows DPAPI is required"));
    const native = path.join(__dirname, "CredentialHost.exe"),
      useNative = require("node:fs").existsSync(native);
    const exe = useNative
      ? native
      : path.join(
          process.env.SystemRoot ?? "C:\\Windows",
          "System32",
          "WindowsPowerShell",
          "v1.0",
          "powershell.exe",
        );
    const args = useNative
      ? [mode]
      : [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          path.join(__dirname, "protect.ps1"),
          "-Mode",
          mode,
        ];
    const p = spawn(exe, args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const chunks = [];
    let bytes = 0;
    const timer = setTimeout(() => p.kill(), 15000);
    p.stdout.on("data", (b) => {
      bytes += b.length;
      if (bytes > 4 * 1024 * 1024) {
        p.kill();
        return;
      }
      chunks.push(b);
    });
    p.stderr.on("data", () => {});
    p.on("error", () => {
      clearTimeout(timer);
      reject(Error("Credential protection process could not start"));
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(Error("Credential protection failed"));
      const raw = Buffer.concat(chunks).toString().trim();
      if (!/^[A-Za-z0-9+/=]*$/.test(raw))
        return reject(Error("Invalid credential protection result"));
      resolve(Buffer.from(raw, "base64"));
    });
    p.stdin.on("error", () => {});
    p.stdin.end(data.toString("base64"));
  });
}
function checkedId(id) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw Error("Invalid account id");
  return id;
}
class Vault {
  constructor(dir) {
    this.dir = path.resolve(dir);
  }
  async save(auth) {
    const identity = identityFromAuth(auth),
      plain = Buffer.from(JSON.stringify(auth));
    let encrypted;
    try {
      encrypted = await protect("Protect", plain);
    } finally {
      plain.fill(0);
    }
    await fs.mkdir(this.dir, { recursive: true });
    const file = path.join(this.dir, identity.id + ".json"),
      temp = file + "." + crypto.randomUUID() + ".tmp";
    await fs.writeFile(
      temp,
      JSON.stringify({
        schema: 1,
        identity,
        updatedAt: new Date().toISOString(),
        ciphertext: encrypted.toString("base64"),
      }) + "\n",
      { flag: "wx" },
    );
    await fs.rename(temp, file);
    return identity;
  }
  async list() {
    let names;
    try {
      names = await fs.readdir(this.dir);
    } catch (e) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
    const out = [];
    for (const name of names) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      const item = JSON.parse(
        await fs.readFile(path.join(this.dir, name), "utf8"),
      );
      if (item.schema !== 1 || item.identity?.id !== name.slice(0, -5))
        throw Error("Invalid saved account record");
      out.push(item.identity);
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }
  async read(id) {
    const file = path.join(this.dir, checkedId(id) + ".json");
    const item = JSON.parse(await fs.readFile(file, "utf8"));
    if (item.schema !== 1 || item.identity?.id !== id)
      throw Error("Invalid saved account record");
    const plain = await protect(
      "Unprotect",
      Buffer.from(item.ciphertext, "base64"),
    );
    try {
      const auth = JSON.parse(plain.toString("utf8"));
      if (identityFromAuth(auth).id !== id)
        throw Error("Saved account identity mismatch");
      return auth;
    } finally {
      plain.fill(0);
    }
  }
  async remove(id) {
    await fs.unlink(path.join(this.dir, checkedId(id) + ".json"));
  }
}
module.exports = { Vault, identityFromAuth };
