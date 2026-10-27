const { identityFromAuth } = require("./vault.cjs");
class DesktopBackend {
  constructor({ clients, authFile }) {
    this.clients = clients;
    this.authFile = authFile;
  }
  primary() {
    const c = [...this.clients.values()].find((c) => c.ready);
    if (!c) throw Error("Jendela Codex uji belum siap");
    return c.cdp;
  }
  async rpc(method, params) {
    return this.primary().evaluate(
      `__codexSwitcher.rpc(${JSON.stringify(method)},${JSON.stringify(params)})`,
    );
  }
  async block(value) {
    for (const c of this.clients.values())
      if (c.ready)
        await c.cdp.evaluate(`__codexSwitcher.setBlocked(${!!value})`);
  }
  async assertIdle() {
    let cursor = null;
    do {
      const page = await this.rpc("thread/loaded/list", { cursor, limit: 100 });
      if (!Array.isArray(page.data))
        throw Error(
          "Format pemeriksaan pekerjaan berubah; perpindahan dibatalkan",
        );
      for (const threadId of page.data) {
        const result = await this.rpc("thread/read", {
          threadId,
          includeTurns: false,
        });
        const type = result.thread?.status?.type;
        if (!type || !["idle", "notLoaded", "systemError"].includes(type))
          throw Error(
            "Masih ada pekerjaan aktif. Tunggu pekerjaan selesai sebelum berpindah akun.",
          );
      }
      cursor = page.nextCursor ?? null;
    } while (cursor);
  }
  async restart() {
    await this.primary().evaluate(
      "__codexSwitcher.restart()",
      undefined,
      65000,
    );
  }
  async waitForIdentity(id, { timeout = 30000, interval = 400 } = {}) {
    const end = Date.now() + timeout;
    let last;
    do {
      try {
        const actual = await this.identity();
        if (actual.id === id) return actual;
        last = Error(
          "Backend account identity did not match the selected account",
        );
      } catch (error) {
        last = error;
      }
      if (Date.now() < end) await new Promise((r) => setTimeout(r, interval));
    } while (Date.now() < end);
    throw last;
  }
  async identity() {
    const fs = require("node:fs/promises");
    const stored = identityFromAuth(
      JSON.parse(await fs.readFile(this.authFile, "utf8")),
    );
    const r = await this.rpc("account/read", { refreshToken: false });
    if (stored.type !== "chatgpt" || r.account?.type !== "chatgpt")
      throw Error("Backend belum menggunakan akun ChatGPT yang dipilih");
    if (
      (r.account.email ?? "").toLowerCase() !== stored.label.toLowerCase() ||
      r.workspaceRouting?.chatgptAccountId !== stored.accountId
    )
      throw Error("Identitas backend tidak cocok dengan akun tersimpan");
    return stored;
  }
}
module.exports = { DesktopBackend };
