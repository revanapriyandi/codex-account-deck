const { EventEmitter } = require("node:events");
class Cdp extends EventEmitter {
  constructor(ws) {
    super();
    this.ws = ws;
    this.next = 0;
    this.pending = new Map();
    ws.addEventListener("message", (e) => {
      let o;
      try {
        o = JSON.parse(e.data);
      } catch {
        return;
      }
      if (o.id != null) {
        const p = this.pending.get(o.id);
        if (!p) return;
        this.pending.delete(o.id);
        clearTimeout(p.timer);
        o.error ? p.reject(Error(o.error.message)) : p.resolve(o.result);
      } else this.emit(o.method, o.params);
    });
    ws.addEventListener("close", () => {
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(Error("CDP connection closed"));
      }
      this.pending.clear();
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener(
        "error",
        () => reject(Error("CDP connection failed")),
        { once: true },
      );
    });
    return new Cdp(ws);
  }
  send(method, params = {}, timeout = 12000) {
    return new Promise((resolve, reject) => {
      const id = ++this.next;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error("CDP timeout: " + method));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression, contextId, timeout = 25000) {
    const r = await this.send(
      "Runtime.evaluate",
      {
        expression,
        returnByValue: true,
        awaitPromise: true,
        ...(contextId == null ? {} : { contextId }),
      },
      timeout,
    );
    if (r.exceptionDetails)
      throw Error(
        r.exceptionDetails.exception?.description ?? r.exceptionDetails.text,
      );
    return r.result.value;
  }
  close() {
    this.ws.close();
  }
}
module.exports = { Cdp };
