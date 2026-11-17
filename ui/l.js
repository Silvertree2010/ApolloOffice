(() => {
  const A = window.AO, { get, post, esc, $ } = A;
  const SRC = { tiles: "Workers", stage: "Office", queue: "Queue", prs: "Pull requests", log: "Log", approvals: "Waiting for you", costs: "Costs", machines: "Machines", pipelines: "Pipelines", team: "Team", merges: "Merges", repohealth: "Repositories" };
  const CL = { tiles: { x: 0, y: 0, w: 100, h: 6 }, stage: { x: 0, y: 6, w: 72, h: 94 }, queue: { x: 72, y: 6, w: 28, h: 36 }, prs: { x: 72, y: 42, w: 28, h: 29 }, log: { x: 72, y: 71, w: 28, h: 29 }, approvals: { x: 51, y: 13, w: 20, h: 30 }, costs: { x: 51, y: 43, w: 20, h: 25 }, machines: { x: 51, y: 68, w: 20, h: 32 }, pipelines: { x: 30, y: 13, w: 21, h: 30 }, team: { x: 30, y: 43, w: 21, h: 30 }, merges: { x: 30, y: 73, w: 21, h: 27 }, repohealth: { x: 0, y: 60, w: 30, h: 40 } };
  const OLS = [{ tiles: [0, 0, 100, 13], stage: [0, 13, 71, 87], queue: [71, 13, 29, 34], prs: [71, 47, 29, 29], log: [71, 76, 29, 24] }, { tiles: [0, 0, 100, 8], stage: [0, 8, 57, 56], queue: [57, 8, 43, 52], prs: [57, 60, 43, 40], log: [0, 64, 57, 36] }, { tiles: [0, 0, 100, 6], stage: [0, 6, 57, 58], queue: [57, 6, 43, 54], prs: [57, 60, 43, 40], log: [0, 64, 57, 36] }, { tiles: [0, 0, 100, 6], stage: [0, 6, 67, 66], queue: [67, 6, 33, 56], prs: [67, 62, 33, 38], log: [0, 72, 67, 28] }];
  const BASE = ["tiles", "stage", "queue", "prs", "log"];
  const IC = {
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    off: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    open: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>', dn: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>',
  };
  const ic = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${IC[k]}</svg>`;
  let L = null, edit = false, sel = null, tmo = 0, hist = [];
  const lay = $("lay");
  const el = (k) => document.querySelector(`[data-lp="${k}"]`);
  const sc = () => L.scenes.find((s) => s.id === L.cur);
  const fresh = (id, n) => ({ id, n, items: Object.fromEntries(Object.entries(CL).map(([k, v], i) => [k, { ...v, v: BASE.includes(k), z: i + 1, lk: false }])) });
  const norm = (x) => {
    const o = { cur: "classic", scenes: [] };
    for (const s of Array.isArray(x?.scenes) ? x.scenes : []) {
      if (!/^[a-z0-9-]{1,24}$/.test(s?.id || "")) continue;
      const it = {};
      for (const k of Object.keys(SRC)) { const v = s.items?.[k] || { ...CL[k], v: BASE.includes(k) }; it[k] = { x: +v.x || 0, y: +v.y || 0, w: +v.w || 20, h: +v.h || 20, v: v.v !== false, z: +v.z || 1, lk: !!v.lk }; }
      if (OLS.some((OL) => BASE.every((k) => OL[k].every((n, i) => it[k][["x", "y", "w", "h"][i]] === n)))) for (const k of BASE) Object.assign(it[k], CL[k]);
      o.scenes.push({ id: s.id, n: String(s.n || "Scene").slice(0, 40), items: it });
    }
    o.cur = o.scenes.some((s) => s.id === x?.cur) ? x.cur : "classic";
    return o;
  };
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const place = (s, k, v) => {
    const os = Object.entries(s.items).filter(([x, w]) => x !== k && w.v).map(([, w]) => w);
    for (const [w, h] of [[v.w, v.h], [24, 30], [20, 24], [16, 20]]) {
      for (let y = 0; y + h <= 100; y += 2) for (let x = 0; x + w <= 100; x += 2) { const r = { x, y, w, h }; if (!os.some((o) => hit(r, o))) return r; }
    }
    const r = lay.getBoundingClientRect(), ax = (r.width || 1200) / 100, ay = (r.height || 700) / 100;
    const big = os.filter((o) => o.w * ax >= 360 || o.h * ay >= 300).sort((a, b) => b.w * ax * b.h * ay - a.w * ax * a.h * ay)[0];
    if (big) {
      if (big.w * ax >= big.h * ay) { const w = Math.round(big.w * 0.34); big.w -= w; return { x: big.x + big.w, y: big.y, w, h: big.h }; }
      const h = Math.round(big.h * 0.36); big.h -= h; return { x: big.x, y: big.y + big.h, w: big.w, h };
    }
    return { x: v.x, y: v.y, w: v.w, h: v.h };
  };
  const save = () => { clearTimeout(tmo); tmo = setTimeout(() => post({ layout: L }, "/api/set").catch(() => {}), 350); };
  const snap = () => { hist.push(JSON.stringify(L)); if (hist.length > 60) hist.shift(); };
  const uid = (p) => { let i = 1; while (L.scenes.some((s) => s.id === p + i)) i++; return p + i; };

  const apply = () => {
    const s = L && sc();
    document.body.classList.toggle("lay", !!s);
    for (const k of Object.keys(SRC)) {
      const e = el(k); if (!e) continue;
      if (!s) { e.style.cssText = ""; e.classList.remove("lph"); continue; }
      const v = s.items[k];
      e.style.left = `calc(${v.x}% + 5px)`; e.style.top = `calc(${v.y}% + 5px)`; e.style.width = `calc(${v.w}% - 10px)`; e.style.height = `calc(${v.h}% - 10px)`; e.style.zIndex = v.z;
      e.classList.toggle("lph", !v.v);
    }
    window.dispatchEvent(new Event("resize"));
    if (edit) overlays();
  };

  const overlays = () => {
    lay.querySelectorAll(".lo,.lgr").forEach((x) => x.remove());
    const s = sc(); if (!s) return;
    lay.insertAdjacentHTML("beforeend", `<div class="lgr"></div>`);
    for (const [k, v] of Object.entries(s.items)) {
      if (!v.v) continue;
      const o = document.createElement("div");
      o.className = "lo" + (k === sel ? " on" : "") + (v.lk ? " lk" : "");
      o.dataset.k = k;
      o.style.cssText = `left:calc(${v.x}% + 5px);top:calc(${v.y}% + 5px);width:calc(${v.w}% - 10px);height:calc(${v.h}% - 10px);z-index:${40 + v.z}`;
      o.innerHTML = `<b>${esc(SRC[k])}</b>${["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((h) => `<i data-h="${h}"></i>`).join("")}`;
      o.addEventListener("pointerdown", (e) => drag(e, k));
      lay.appendChild(o);
    }
  };
  const drag = (e, k) => {
    if (e.button) return;
    e.preventDefault();
    sel = k; dock();
    const s = sc(), v = s.items[k];
    lay.querySelectorAll(".lo").forEach((o) => o.classList.toggle("on", o.dataset.k === k));
    if (v.lk) return;
    const h = e.target.dataset.h || "", r = lay.getBoundingClientRect(), sx = e.clientX, sy = e.clientY, o0 = { ...v };
    const others = Object.entries(s.items).filter(([x, w]) => x !== k && w.v).map(([, w]) => w);
    const sn = (val, keys) => { let best = Math.round(val), bd = 1.2; for (const t of keys) { const d = Math.abs(t - val); if (d < bd) { bd = d; best = t; } } return best; };
    const xs = [0, 100, ...others.flatMap((w) => [w.x, w.x + w.w])], ys = [0, 100, ...others.flatMap((w) => [w.y, w.y + w.h])];
    let moved = false;
    const mv = (ev) => {
      const dx = (ev.clientX - sx) / r.width * 100, dy = (ev.clientY - sy) / r.height * 100;
      if (!moved) { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return; snap(); moved = true; }
      if (!h) {
        let x = Math.min(100 - o0.w, Math.max(0, o0.x + dx)), y = Math.min(100 - o0.h, Math.max(0, o0.y + dy));
        const xa = sn(x, xs), xb = sn(x + o0.w, xs) - o0.w; x = Math.abs(xa - x) <= Math.abs(xb - x) ? xa : xb;
        const ya = sn(y, ys), yb = sn(y + o0.h, ys) - o0.h; y = Math.abs(ya - y) <= Math.abs(yb - y) ? ya : yb;
        v.x = Math.min(100 - o0.w, Math.max(0, x)); v.y = Math.min(100 - o0.h, Math.max(0, y));
      } else {
        let { x, y, w, h: hh } = o0;
        if (h.includes("e")) w = sn(Math.min(100, x + w + dx), xs) - x;
        if (h.includes("s")) hh = sn(Math.min(100, y + hh + dy), ys) - y;
        if (h.includes("w")) { const nx = sn(Math.max(0, x + dx), xs); w = w + (x - nx); x = nx; }
        if (h.includes("n")) { const ny = sn(Math.max(0, y + dy), ys); hh = hh + (y - ny); y = ny; }
        if (w >= 8 && hh >= 8) Object.assign(v, { x, y, w, h: hh });
      }
      apply();
    };
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); if (moved) { save(); dock(); } };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };

  const dock = () => {
    let D = $("ldock");
    if (!D) { D = document.createElement("div"); D.id = "ldock"; D.className = "dock"; document.body.appendChild(D); }
    const s = sc(), ord = s ? Object.entries(s.items).sort((a, b) => b[1].z - a[1].z) : [];
    D.innerHTML = `<div><h5>Scenes</h5><div class="dl">
        <div class="di ${!s ? "on" : ""}" data-sc="classic"><span>Classic</span></div>
        ${L.scenes.map((x) => `<div class="di ${x.id === L.cur ? "on" : ""}" data-sc="${x.id}">${x.id === L.cur ? `<input type="text" id="lN" value="${esc(x.n)}" maxlength="40" aria-label="Scene name">` : `<span>${esc(x.n)}</span>`}</div>`).join("")}</div>
        <div class="db"><button type="button" id="lAdd" title="New scene">${ic("plus")}</button><button type="button" id="lDup" title="Duplicate scene" ${s ? "" : "disabled"}>${ic("copy")}</button><button type="button" id="lDel" title="Delete scene" ${s ? "" : "disabled"}>${ic("minus")}</button></div></div>
      <div><h5 class="dh">Sources${s ? `<span class="ad"><button type="button" id="lSrc" title="Add a window">${ic("plus")} Add window</button></span>` : ""}</h5><div class="dl">${s ? ord.map(([k, v]) => `<div class="di ${k === sel ? "on" : ""}" data-src="${k}"><span>${SRC[k]}</span><button type="button" data-a="v" class="${v.v ? "" : "off"}" title="${v.v ? "Hide" : "Show"}">${ic(v.v ? "eye" : "off")}</button><button type="button" data-a="lk" class="${v.lk ? "" : "off"}" title="${v.lk ? "Unlock" : "Lock"}">${ic(v.lk ? "lock" : "open")}</button><button type="button" data-a="up" title="Bring forward">${ic("up")}</button><button type="button" data-a="dn" title="Send backward">${ic("dn")}</button></div>`).join("") : `<div class="di"><span style="color:var(--t3)">Fixed layout.</span></div>`}</div></div>
      <div><h5>Controls</h5><div class="dc"><button type="button" id="lUndo" ${hist.length ? "" : "disabled"}>Undo</button><button type="button" id="lRst" ${s ? "" : "disabled"}>Reset scene</button><button type="button" class="go" id="lDone">Done</button></div></div>`;
    for (const r of D.querySelectorAll("[data-sc]")) r.onclick = (e) => { if (e.target.id === "lN") return; if (r.dataset.sc === L.cur) return; L.cur = r.dataset.sc; sel = null; save(); apply(); dock(); };
    const n = $("lN"); if (n) n.onchange = () => { snap(); s.n = n.value.trim() || "Scene"; save(); dock(); };
    $("lAdd").onclick = () => { snap(); const id = uid("s"); L.scenes.push(fresh(id, "Scene " + (L.scenes.length + 1))); L.cur = id; save(); apply(); dock(); };
    $("lDup").onclick = () => { snap(); const id = uid("s"); L.scenes.push({ ...JSON.parse(JSON.stringify(s)), id, n: s.n + " copy" }); L.cur = id; save(); apply(); dock(); };
    $("lDel").onclick = () => { if (!confirm(`Delete ${s.n}?`)) return; snap(); L.scenes = L.scenes.filter((x) => x !== s); L.cur = L.scenes[0]?.id || "classic"; save(); apply(); dock(); };
    for (const r of D.querySelectorAll("[data-src]")) {
      const k = r.dataset.src, v = s.items[k];
      r.onclick = (e) => {
        const a = e.target.closest("[data-a]")?.dataset.a;
        if (!a) { sel = k; overlays(); dock(); return; }
        snap();
        if (a === "v") v.v = !v.v;
        if (a === "lk") v.lk = !v.lk;
        if (a === "up" || a === "dn") { const zs = Object.values(s.items).sort((p, q) => p.z - q.z); const i = zs.indexOf(v), j = a === "up" ? i + 1 : i - 1; if (zs[j]) [zs[i].z, zs[j].z] = [zs[j].z, zs[i].z]; }
        save(); apply(); dock();
      };
    }
    const sb = $("lSrc");
    if (sb) sb.onclick = (e) => {
      e.stopPropagation();
      let m = $("lMenu"); if (m) { m.remove(); return; }
      const hid = Object.keys(SRC).filter((k) => !s.items[k].v);
      m = document.createElement("div"); m.id = "lMenu"; m.className = "lmenu";
      m.innerHTML = hid.length ? hid.map((k) => `<button type="button" data-add="${k}">${esc(SRC[k])}</button>`).join("") : `<span>Every window is already shown.</span>`;
      sb.parentElement.appendChild(m);
      for (const b of m.querySelectorAll("[data-add]")) b.onclick = () => { snap(); const v = s.items[b.dataset.add]; Object.assign(v, place(s, b.dataset.add, v)); v.v = true; v.z = Math.max(...Object.values(s.items).map((x) => x.z)) + 1; sel = b.dataset.add; save(); apply(); dock(); };
      setTimeout(() => document.addEventListener("click", () => $("lMenu")?.remove(), { once: true }));
    };
    $("lUndo").onclick = undo;
    $("lRst").onclick = () => { snap(); s.items = fresh(s.id, s.n).items; save(); apply(); dock(); };
    $("lDone").onclick = close;
  };
  const undo = () => { if (!hist.length) return; L = JSON.parse(hist.pop()); save(); apply(); dock(); };
  const key = (e) => {
    if (!edit || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    else if (e.key === "Escape") { e.stopPropagation(); close(); }
    else if (sel && sc() && e.key.startsWith("Arrow")) {
      const v = sc().items[sel]; if (v.lk) return; e.preventDefault(); snap();
      const st = e.shiftKey ? 5 : 1, d = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
      v.x = Math.min(100 - v.w, Math.max(0, v.x + d[0])); v.y = Math.min(100 - v.h, Math.max(0, v.y + d[1])); save(); apply();
    }
  };
  const close = () => {
    edit = false; sel = null; clearTimeout(tmo); post({ layout: L }, "/api/set").catch(() => {});
    document.body.classList.remove("led"); $("ldock")?.remove(); lay.querySelectorAll(".lo,.lgr").forEach((x) => x.remove());
    document.removeEventListener("keydown", key, true); apply();
  };
  const open = async () => {
    if (edit) return close();
    if (A.route && A.route() !== "office") { A.go("office"); await new Promise((r) => setTimeout(r, 60)); }
    if (document.body.classList.contains("ed")) $("bCz").click();
    edit = true; hist = [];
    if (!L.scenes.length) { L.scenes.push(fresh("s1", "My layout")); L.cur = "s1"; save(); }
    else if (!sc()) L.cur = L.scenes[0].id;
    document.body.classList.add("led");
    apply(); dock();
    document.addEventListener("keydown", key, true);
  };
  get("/api/cfg").then((c) => { L = norm(c?.set?.layout); apply(); }).catch(() => { L = norm(null); });
  $("bLay").onclick = open;
})();
