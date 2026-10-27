const fs = require("node:fs/promises"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { identityFromAuth } = require("./vault.cjs");
async function writeAuthAtomic(file, auth) {
  const temp = file + ".switcher-" + crypto.randomUUID() + ".tmp";
  try {
    await fs.writeFile(temp, JSON.stringify(auth) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    await fs.rename(temp, file);
  } finally {
    await fs.unlink(temp).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
}
class AccountManager {
  constructor({ authFile, vault, backend, journalFile, onPhase = () => {} }) {
    this.authFile = path.resolve(authFile);
    this.vault = vault;
    this.backend = backend;
    this.journalFile = journalFile;
    this.onPhase = onPhase;
    this.switching = false;
    this.recoveryRequired = false;
  }
  async verify(id) {
    const actual = await (this.backend.waitForIdentity
      ? this.backend.waitForIdentity(id)
      : this.backend.identity());
    if (actual.id !== id)
      throw Error(
        "Backend account identity did not match the selected account",
      );
    return actual;
  }
  async clearJournal() {
    if (this.journalFile)
      await fs.unlink(this.journalFile).catch((e) => {
        if (e.code !== "ENOENT") throw e;
      });
  }
  async recover() {
    if (!this.journalFile) return false;
    let record;
    try {
      record = JSON.parse(await fs.readFile(this.journalFile, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return false;
      throw e;
    }
    this.recoveryRequired = true;
    await this.backend.block(true);
    if (record.schema !== 1 || !/^[a-f0-9]{64}$/.test(record.previousId))
      throw Error("Invalid recovery journal");
    await this.backend.assertIdle();
    const previous = await this.vault.read(record.previousId);
    await writeAuthAtomic(this.authFile, previous);
    await this.backend.restart();
    await this.verify(record.previousId);
    await this.clearJournal();
    this.recoveryRequired = false;
    await this.backend.block(false);
    return true;
  }
  async current() {
    const auth = JSON.parse(await fs.readFile(this.authFile, "utf8"));
    return { auth, identity: identityFromAuth(auth) };
  }
  async list() {
    const current = await this.current().catch(() => null);
    return {
      accounts: await this.vault.list(),
      activeId: current?.identity.id ?? null,
      switching: this.switching,
      recoveryRequired: this.recoveryRequired,
    };
  }
  async saveCurrent() {
    if (this.switching || this.recoveryRequired)
      throw Error("Account switching or recovery is in progress");
    const { auth } = await this.current();
    return this.vault.save(auth);
  }
  async switchTo(id) {
    if (this.switching || this.recoveryRequired)
      throw Error("Account switching is unavailable until recovery completes");
    this.switching = true;
    let previous,
      modified = false,
      recovered = true,
      gate = false;
    const started = Date.now(),
      phase = (name) => {
        try {
          this.onPhase({ phase: name, elapsedMs: Date.now() - started });
        } catch {}
      };
    try {
      const target = await this.vault.read(id);
      if (identityFromAuth(target).type !== "chatgpt")
        throw Error("This add-on switches stored ChatGPT accounts only");
      gate = true;
      await this.backend.block(true);
      await this.backend.assertIdle();
      previous = await this.current();
      phase("preflight");
      if ((await this.backend.identity()).id !== previous.identity.id)
        throw Error(
          "Stored credentials do not match the active backend. Sign in again before switching.",
        );
      if (previous.identity.id === id) return previous.identity;
      await this.vault.save(previous.auth);
      await this.backend.assertIdle();
      if (this.journalFile)
        await writeAuthAtomic(this.journalFile, {
          schema: 1,
          previousId: previous.identity.id,
          targetId: id,
        });
      modified = true;
      phase("credentials");
      await writeAuthAtomic(this.authFile, target);
      phase("reconnect");
      await this.backend.restart();
      phase("verify");
      const actual = await this.verify(id);
      const file = await this.current();
      if (actual.id !== id || file.identity.id !== id)
        throw Error(
          "Backend account identity did not match the selected account",
        );
      await this.vault.save(file.auth);
      await this.clearJournal();
      phase("complete");
      return actual;
    } catch (error) {
      if (modified && previous) {
        try {
          const latest = await this.current().catch(() => null);
          if (latest?.identity.id === previous.identity.id) previous = latest;
          else if (latest?.identity.id === id)
            await this.vault.save(latest.auth);
          phase("rollback");
          await writeAuthAtomic(this.authFile, previous.auth);
          await this.backend.restart();
          await this.verify(previous.identity.id);
          await this.clearJournal();
          phase("restored");
        } catch {
          recovered = false;
          this.recoveryRequired = true;
        }
      }
      if (!recovered)
        throw Error(
          "Account switch failed; could not verify recovery. Close Codex and sign in again before continuing.",
        );
      if (modified)
        throw Error(
          "Account switch failed; previous account restored. Sign in again to the selected account and retry.",
        );
      throw error;
    } finally {
      this.switching = false;
      if (gate && recovered) await this.backend.block(false);
    }
  }
}
module.exports = { AccountManager, writeAuthAtomic };
