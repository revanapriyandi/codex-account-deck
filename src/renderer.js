(() => {
  if (
    location.origin !== "app://-" ||
    location.pathname !== "/index.html" ||
    window.top !== window ||
    !globalThis.electronBridge ||
    globalThis.__codexSwitcher
  )
    return;
  const pending = new Map(),
    originals = new Map(),
    rows = new Map(),
    triggers = new Map();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let state = { accounts: [], activeId: null },
    busy = false,
    panel,
    list,
    message,
    add,
    save,
    close,
    standalone,
    popover,
    anchor,
    hoverTimer,
    leaveTimer,
    exitTimer,
    openedByKeyboard = false;
  const style = document.createElement("style");
  style.id = "codex-switcher-style";
  style.textContent = globalThis.__codexSwitcherStyles;
  document.head.append(style);
  function el(tag, text, attrs = {}) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  }
  function button(label, handler, className = "") {
    const b = el("button", label, { type: "button", class: className });
    b.addEventListener("click", handler);
    return b;
  }
  function request(action, args = {}) {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID(),
        timeout = setTimeout(() => {
          pending.delete(id);
          reject(
            Error(
              "Helper belum merespons. Tutup Codex lalu buka kembali melalui shortcut add-on.",
            ),
          );
        }, 240000);
      pending.set(id, { resolve, reject, timeout });
      globalThis.__codexSwitcherRequest(JSON.stringify({ id, action, args }));
    });
  }
  function reply(id, data, error) {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    clearTimeout(p.timeout);
    error ? p.reject(Error(error)) : p.resolve(data);
  }
  function setBlocked(value) {
    if (!value) {
      for (const [node, was] of originals) node.inert = was;
      originals.clear();
      return;
    }
    function visit(parent) {
      for (const node of parent.children) {
        if (
          node === panel ||
          node.tagName === "SCRIPT" ||
          node.tagName === "STYLE"
        )
          continue;
        if (panel && node.contains(panel)) {
          visit(node);
          continue;
        }
        if (!originals.has(node)) originals.set(node, node.inert);
        node.inert = true;
      }
    }
    visit(document.body);
  }
  function makePanel() {
    if (panel) return;
    panel = el("section", null, {
      id: "codex-account-panel",
      "aria-label": "Akun ChatGPT",
    });
    const head = el("div", null, { class: "cs-heading" });
    head.append(el("span", "Akun ChatGPT"));
    close = button("×", () => hide(true), "cs-close");
    close.setAttribute("aria-label", "Tutup daftar akun");
    head.append(close);
    list = el("div", null, {
      class: "cs-accounts",
      role: "group",
      "aria-label": "Pilih akun",
    });
    message = el("p", "", {
      class: "cs-status",
      role: "status",
      "aria-live": "polite",
    });
    const actions = el("div", null, { class: "cs-actions" });
    add = button(
      "+  Tambah akun",
      () => perform("add", {}, "Selesaikan login resmi di browser…"),
      "cs-add",
    );
    save = button(
      "Simpan akun ini",
      () => perform("save-current", {}, "Menyimpan akun…"),
      "cs-save",
    );
    actions.append(add, save);
    panel.append(head, list, message, actions);
    panel.addEventListener("pointerenter", () => clearTimeout(leaveTimer));
    panel.addEventListener("pointerleave", () => scheduleHide());
    panel.addEventListener("click", (e) => e.stopPropagation());
    panel.addEventListener("pointerdown", (e) => e.stopPropagation());
    panel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        hide(true);
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      const choices = [
        ...panel.querySelectorAll("button:not(:disabled):not([hidden])"),
      ].filter((n) => !n.closest("[hidden]"));
      let i = choices.indexOf(document.activeElement);
      i =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? choices.length - 1
            : (i + (e.key === "ArrowUp" ? -1 : 1) + choices.length) %
              choices.length;
      choices[i]?.focus();
    });
  }
  function render(text = "", error = false) {
    if (!panel) return;
    const keep = new Set();
    for (const account of state.accounts) {
      keep.add(account.id);
      let row = rows.get(account.id);
      if (!row) {
        const wrap = el("div", null, { class: "cs-account-row" });
        const choose = button(
          "",
          () => perform("switch", { id: account.id }, "Menghubungkan akun…"),
          "cs-account",
        );
        choose.dataset.accountId = account.id;
        choose.setAttribute("role", "menuitemradio");
        const avatar = el("span", "", {
            class: "cs-avatar",
            "aria-hidden": "true",
          }),
          info = el("span", null, { class: "cs-info" }),
          label = el("span", "", { class: "cs-label" }),
          plan = el("span", "", { class: "cs-plan" }),
          mark = el("span", "", { class: "cs-mark", "aria-hidden": "true" });
        info.append(label, plan);
        choose.append(avatar, info, mark);
        const remove = button(
          "×",
          () =>
            perform(
              "remove",
              { id: account.id },
              "Menghapus akun dari daftar…",
            ),
          "cs-remove",
        );
        wrap.append(choose, remove);
        list.append(wrap);
        row = { wrap, choose, avatar, label, plan, mark, remove };
        rows.set(account.id, row);
      }
      const active = account.id === state.activeId;
      row.label.textContent = account.label;
      row.avatar.textContent = account.label.slice(0, 2).toUpperCase();
      row.plan.textContent = active
        ? "Sedang digunakan"
        : account.plan || "ChatGPT";
      row.mark.textContent = active ? "✓" : "";
      row.choose.disabled = busy || active;
      row.choose.setAttribute("aria-checked", String(active));
      row.wrap.dataset.active = String(active);
      row.remove.hidden = active;
      row.remove.disabled = busy;
      row.remove.setAttribute(
        "aria-label",
        "Hapus " + account.label + " dari daftar",
      );
    }
    for (const [id, row] of rows)
      if (!keep.has(id)) {
        row.wrap.remove();
        rows.delete(id);
      }
    let empty = list.querySelector(".cs-empty");
    if (!state.accounts.length && !empty) {
      empty = el(
        "p",
        "Simpan akun yang sedang digunakan, lalu tambahkan akun lain.",
        { class: "cs-empty" },
      );
      list.append(empty);
    } else if (state.accounts.length) empty?.remove();
    message.textContent = text;
    message.hidden = !text;
    message.setAttribute("role", error ? "alert" : "status");
    panel.dataset.busy = String(busy);
    panel.setAttribute("aria-busy", String(busy));
    add.disabled = save.disabled = close.disabled = busy;
    save.hidden = state.accounts.some((a) => a.id === state.activeId);
    if (state.recoveryRequired) {
      for (const b of panel.querySelectorAll("button")) b.disabled = true;
      close.disabled = false;
      message.hidden = false;
      message.textContent =
        "Pemulihan belum terverifikasi. Tutup Codex lalu buka kembali melalui shortcut add-on.";
      message.setAttribute("role", "alert");
    }
  }
  function scheduleHide() {
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      if (
        !busy &&
        !panel?.contains(document.activeElement) &&
        !panel?.matches(":hover") &&
        !anchor?.matches(":hover")
      )
        hide(false);
    }, 280);
  }
  function hide(instant = false, dismiss = false) {
    if (busy) return;
    clearTimeout(hoverTimer);
    clearTimeout(leaveTimer);
    clearTimeout(exitTimer);
    if (!panel) return;
    panel.dataset.open = "false";
    anchor?.setAttribute("aria-expanded", "false");
    const finish = () => {
      panel.hidden = true;
      if (popover?.isConnected && popover.matches(":popover-open"))
        popover.hidePopover();
      standalone?.close();
      if (openedByKeyboard)
        (anchor?.isConnected
          ? anchor
          : document.querySelector('button[aria-label="Open profile menu"]')
        )?.focus();
      if (dismiss && anchor?.isConnected)
        anchor.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
    };
    if (instant || reduced.matches) finish();
    else exitTimer = setTimeout(finish, 160);
  }
  function mountDialog(rect) {
    if (popover?.isConnected && popover.matches(":popover-open"))
      popover.hidePopover();
    if (!standalone) {
      standalone = el("dialog", null, {
        id: "codex-switcher-dialog",
        "aria-label": "Pilih akun ChatGPT",
      });
      standalone.addEventListener("cancel", (e) => {
        e.preventDefault();
        if (!busy) hide(true);
      });
      document.body.append(standalone);
    }
    standalone.dataset.anchored = String(!!rect);
    if (rect) {
      Object.assign(standalone.style, {
        margin: "0",
        inset: "auto",
        left: Math.max(8, Math.min(rect.x, innerWidth - rect.width - 8)) + "px",
        top: Math.max(8, rect.y) + "px",
        width: rect.width + "px",
        maxHeight: Math.max(120, innerHeight - Math.max(8, rect.y) - 8) + "px",
      });
    } else standalone.removeAttribute("style");
    standalone.append(panel);
    if (anchor?.isConnected)
      anchor.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    if (!standalone.open) standalone.showModal();
  }
  async function open(options = {}) {
    if (busy) return;
    makePanel();
    clearTimeout(hoverTimer);
    clearTimeout(exitTimer);
    clearTimeout(leaveTimer);
    openedByKeyboard = options.instant === true;
    anchor = options.anchor ?? null;
    if (anchor?.isConnected) {
      if (!popover)
        popover = el("div", null, {
          class: "cs-popover",
          popover: "manual",
          role: "menu",
          "aria-label": "Pilih akun ChatGPT",
        });
      const menu = anchor.closest('[role="menu"]');
      menu.append(popover);
      popover.append(panel);
      if (!popover.matches(":popover-open")) popover.showPopover();
      anchor.setAttribute("aria-expanded", "true");
    } else {
      mountDialog();
    }
    panel.hidden = false;
    panel.dataset.instant = String(openedByKeyboard);
    panel.dataset.open = "false";
    panel.getBoundingClientRect();
    panel.dataset.open = "true";
    busy = true;
    render("Memuat akun…");
    try {
      state = await request("list");
      busy = false;
      render();
      if (
        anchor?.isConnected &&
        popover?.isConnected &&
        popover.matches(":popover-open")
      ) {
        const r = anchor.getBoundingClientRect(),
          menu = anchor.closest('[role="menu"]').getBoundingClientRect(),
          w = popover.getBoundingClientRect().width,
          h = popover.getBoundingClientRect().height;
        Object.assign(popover.style, {
          left:
            (menu.right + w + 8 < innerWidth
              ? menu.right + 8
              : Math.max(8, menu.left - w - 8)) + "px",
          top: Math.max(8, Math.min(r.y, innerHeight - h - 8)) + "px",
        });
      }
      if (openedByKeyboard)
        panel.querySelector(".cs-account:not(:disabled),.cs-add")?.focus();
    } catch (e) {
      busy = false;
      render(e.message, true);
    }
  }
  async function perform(action, args, text) {
    if (busy) return;
    clearTimeout(hoverTimer);
    clearTimeout(leaveTimer);
    if (action === "switch" || action === "add")
      mountDialog(panel.getBoundingClientRect());
    busy = true;
    render(text);
    try {
      await request(action, args);
      state = await request("list");
      busy = false;
      render(
        action === "add"
          ? "Akun siap dipilih."
          : action === "switch"
            ? "Akun berhasil diganti."
            : "Tersimpan.",
      );
      if (action === "switch") {
        panel.dataset.success = "true";
        exitTimer = setTimeout(
          () => {
            panel.dataset.success = "false";
            hide(openedByKeyboard, true);
          },
          reduced.matches || openedByKeyboard ? 0 : 220,
        );
      }
    } catch (e) {
      busy = false;
      state = await request("list").catch(() => state);
      render(e.message, true);
    }
  }
  function wireMenu() {
    for (const menu of document.querySelectorAll('[role="menu"]')) {
      if (
        menu.closest("#codex-account-panel") ||
        ![...menu.querySelectorAll('[role="menuitem"]')].some((n) =>
          /^(Log out|Sign out|Keluar)$/i.test(n.textContent.trim()),
        )
      )
        continue;
      const row = menu.querySelector('[role="menuitem"]');
      if (!row) continue;
      if (triggers.has(row)) {
        const data = triggers.get(row);
        if (row.dataset.codexAccountTrigger !== "true")
          row.dataset.codexAccountTrigger = "true";
        if (menu.dataset.codexAccountMenu !== "true")
          menu.dataset.codexAccountMenu = "true";
        if (!row.contains(data.chevron))
          (row.querySelector("[data-menu-row-content]") ?? row).append(
            data.chevron,
          );
        continue;
      }
      const before = new Map(
        ["aria-haspopup", "aria-expanded", "aria-controls", "title"].map(
          (k) => [k, row.getAttribute(k)],
        ),
      );
      const chevron = el("span", "›", {
        class: "cs-chevron",
        "aria-hidden": "true",
      });
      (row.querySelector("[data-menu-row-content]") ?? row).append(chevron);
      row.dataset.codexAccountTrigger = "true";
      menu.dataset.codexAccountMenu = "true";
      row.setAttribute("aria-haspopup", "menu");
      row.setAttribute("aria-expanded", "false");
      row.setAttribute("aria-controls", "codex-account-panel");
      row.setAttribute("title", "Pilih akun ChatGPT");
      const enter = (e) => {
        if (
          e.pointerType !== "mouse" ||
          !matchMedia("(hover: hover) and (pointer: fine)").matches ||
          busy
        )
          return;
        clearTimeout(leaveTimer);
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => open({ anchor: row }), 180);
      };
      const leave = () => {
        clearTimeout(hoverTimer);
        scheduleHide();
      };
      const click = (e) => {
        if (panel?.contains(e.target)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (panel?.isConnected && !panel.hidden && anchor === row)
          hide(e.detail === 0);
        else open({ anchor: row, instant: e.detail === 0 });
      };
      const key = (e) => {
        if (["Enter", " ", "ArrowRight"].includes(e.key)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          open({ anchor: row, instant: true });
        }
      };
      row.addEventListener("pointerenter", enter);
      row.addEventListener("pointerleave", leave);
      row.addEventListener("click", click, true);
      row.addEventListener("keydown", key, true);
      triggers.set(row, { menu, chevron, before, enter, leave, click, key });
    }
    for (const [row] of triggers) if (!row.isConnected) triggers.delete(row);
    if (busy && panel && !panel.isConnected) {
      mountDialog();
    }
  }
  const observer = new MutationObserver(wireMenu);
  observer.observe(document, {
    childList: true,
    characterData: true,
    subtree: true,
  });
  wireMenu();
  async function rpc(method, params) {
    if (
      !new Set(["account/read", "thread/loaded/list", "thread/read"]).has(
        method,
      )
    )
      throw Error("Unsupported read operation");
    return new Promise((resolve, reject) => {
      const id = "account-switcher-read-" + crypto.randomUUID(),
        timer = setTimeout(() => {
          window.removeEventListener("message", listener);
          reject(Error("Codex backend tidak merespons"));
        }, 20000);
      function listener(e) {
        const d = e.data;
        if (d?.type !== "mcp-response" || d.message?.id !== id) return;
        clearTimeout(timer);
        window.removeEventListener("message", listener);
        d.message.error
          ? reject(Error("Codex backend menolak pemeriksaan akun"))
          : resolve(d.message.result);
      }
      window.addEventListener("message", listener);
      electronBridge
        .sendMessageFromView({
          type: "mcp-request",
          hostId: "local",
          request: { id, method, params },
        })
        .catch((e) => {
          clearTimeout(timer);
          window.removeEventListener("message", listener);
          reject(e);
        });
    });
  }
  globalThis.__codexSwitcher = {
    getStatus: () => ({
      busy: busy || pending.size > 0,
      open: !!panel?.isConnected && !panel.hidden,
      pending: pending.size,
    }),
    reply,
    open,
    rpc,
    setBlocked,
    progress(phase) {
      if (!busy) return;
      const labels = {
        preflight: "Memeriksa akun dan pekerjaan aktif…",
        credentials: "Menyiapkan akun yang dipilih…",
        reconnect: "Menghubungkan akun…",
        verify: "Memastikan akun siap digunakan…",
        rollback: "Mengembalikan akun sebelumnya…",
        restored: "Akun sebelumnya sudah dipulihkan.",
      };
      if (labels[phase]) render(labels[phase]);
    },
    restart: () =>
      electronBridge.sendMessageFromView({
        type: "codex-app-server-restart",
        hostId: "local",
        intent: "reconnect",
        remoteControlEnabled: false,
      }),
    dispose() {
      clearTimeout(hoverTimer);
      clearTimeout(leaveTimer);
      clearTimeout(exitTimer);
      observer.disconnect();
      setBlocked(false);
      panel?.remove();
      popover?.remove();
      standalone?.remove();
      style.remove();
      for (const [row, data] of triggers) {
        row.removeEventListener("pointerenter", data.enter);
        row.removeEventListener("pointerleave", data.leave);
        row.removeEventListener("click", data.click, true);
        row.removeEventListener("keydown", data.key, true);
        data.chevron.remove();
        delete row.dataset.codexAccountTrigger;
        delete data.menu.dataset.codexAccountMenu;
        for (const [k, v] of data.before)
          v == null ? row.removeAttribute(k) : row.setAttribute(k, v);
      }
      for (const p of pending.values()) {
        clearTimeout(p.timeout);
        p.reject(Error("Add-on dicopot"));
      }
      pending.clear();
      delete globalThis.__codexSwitcher;
    },
  };
})();
