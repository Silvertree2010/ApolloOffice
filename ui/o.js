(() => {
  const K = window.K;
  const $ = (s) => document.getElementById(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  const get = async (p) => {
    const r = await fetch(p, { cache: "no-store" });
    if (r.status === 401) { location.reload(); throw new Error("login"); }
    return r.json();
  };
  const post = async (b, p = "/api/act") => {
    const r = await fetch(p, { method: "POST", headers: { "content-type": "application/json", "x-ao": "1" }, body: JSON.stringify(b) });
    return r.json();
  };
  window.AO = { get, post, esc, $ };
  const open = (u) => { if (/^https:\/\//.test(u || "")) window.open(u, "_blank", "noopener"); };
  window.AO.open = open;

  const SK = {
    scout: { body: "#3fb6a8", dark: "#2b847a", light: "#7ad1c6" },
    hunter: { body: "#b39a7c", dark: "#86704f", light: "#d4c2a8" },
    guard: { body: "#5c7fd6", dark: "#3f5fae", light: "#93abe8" },
    vet: { body: "#9c7ae0", dark: "#7556b8", light: "#c3aaf0" },
    repro: { body: "#e0675a", dark: "#b2463b", light: "#f0998f" },
    fixer: { body: "#d97757", dark: "#b0573a", light: "#eb9b80" },
    ci: { body: "#8d9199", dark: "#62666d", light: "#b9bcc2" },
    reviewer: { body: "#d0649f", dark: "#a3437a", light: "#e597c2" },
    submit: { body: "#5cbf6a", dark: "#3d9149", light: "#94dd9e" },
    watcher: { body: "#4fb3e0", dark: "#2f86b0", light: "#8fd2f0" },
    pipe: { body: "#9c7ae0", dark: "#7a58c0", light: "#c4b0f0" },
  };
  const TD = { scout: "Finds new issues worth fixing", guard: "Blocks hidden instructions in issues", vet: "Checks an issue is one clear bug", watcher: "Keeps open pull requests up to date", hunter: "Looks for bugs in the code itself", repro: "Writes a test that shows the bug", fixer: "Fixes the bug", ci: "Runs the repository's tests", reviewer: "Reviews the fix", submit: "Opens the pull request" };
  const NM = { pipe: "Pipelines", hunter: "Hunter", scout: "Scout", guard: "Guard", vet: "Vet", repro: "Repro", fixer: "Fixer", ci: "CI", reviewer: "Reviewer", submit: "Submit", watcher: "Watcher" };
  window.AO.NM = NM;
  const ORD = ["scout", "guard", "vet", "watcher", "hunter", "repro", "fixer", "ci", "reviewer", "submit"];

  let VW = 400, VH = 259;

  const cv = $("cv");
  const cx = cv.getContext("2d");
  const off = document.createElement("canvas");
  off.width = VW; off.height = VH;
  let c = off.getContext("2d");
  const fig = document.createElement("canvas");
  fig.width = K.W; fig.height = K.H;
  const fc = fig.getContext("2d");

  let S = null, err = 0;
  const t0 = performance.now();

  const LT = { "#3d4045": "#8a94a2", "#4a4d54": "#5a6472", "#75746f": "#8a94a2", "#1d1f24": "#c9d1db" };
  const lt = () => document.documentElement.dataset.th === "light";
  const C = (k) => (lt() && LT[k]) || k;
  const hl = (n) => (lt() ? SK[n].tx || txc(SK[n].dark, 0.8) : SK[n].light);
  const txc = (c, f = 0.55) => !/^#[0-9a-f]{6}$/i.test(c) ? c : "#" + [1, 3, 5].map((i) => Math.round(parseInt(c.slice(i, i + 2), 16) * f).toString(16).padStart(2, "0")).join("");
  window.AO.hl = hl;
  const px = (x, y, w, h, col) => { c.fillStyle = C(col); c.fillRect(Math.round(x), Math.round(y), w, h); };
  const tx = (s, x, y, col) => K.text(c, s, x, y, C(col));
  const party = () => S?.lm && S.t - S.lm.t < 180000;
  const gray = (h, k) => { if (!HX.test(h || "")) return h; const n = parseInt(h.slice(1), 16), y = Math.round(((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) * k); return "#" + [y, y, y].map((v) => v.toString(16).padStart(2, "0")).join(""); };
  const dim = (sk) => ({ ...sk, body: gray(sk.body, 0.6), dark: gray(sk.dark, 0.6), light: gray(sk.light, 0.6) });
  const core = (id) => !!(S?.crew || []).find((w) => w.id === id)?.core;
  const skOf = (id) => (core(id) && SK[id]) || SK["c:" + id] || { body: "#8d9199", dark: "#62666d", light: "#b9bcc2" };
  const hlOf = (id) => (core(id) ? hl(id) : SK["c:" + id] ? hl("c:" + id) : "#b9bcc2");
  const nowS = () => (S ? S.t + (performance.now() - last) : Date.now());
  const acc = {
    hunter: (r, sk, t) => { K.px(fc, r.left - 1, r.top - 1, sk.dark, r.bw + 2, 1); K.px(fc, r.left + 2, r.top - 3, sk.dark, r.bw - 4, 2); K.px(fc, r.cx - 1, r.top - 4, "#5cbf6a", 2, 1); },
    scout: (r, sk, t) => { K.px(fc, r.cx, r.top - 4, sk.dark, 1, 4); K.px(fc, r.cx - 1, r.top - 6, Math.floor(t * 3) % 2 ? "#e8e6df" : sk.light, 3, 2); },
    guard: (r, sk) => { K.draw(fc, ["sss", "sws", "sss", ".s."], r.left + 2, r.top + 4, { body: sk.body }); },
    vet: (r) => { const y = r.eyeY - 1; for (const x of [r.cx - 5, r.cx + 2]) { K.px(fc, x, y, "#e8e6df", 4, 1); K.px(fc, x, y + 3, "#e8e6df", 4, 1); K.px(fc, x, y, "#e8e6df", 1, 4); K.px(fc, x + 3, y, "#e8e6df", 1, 4); } K.px(fc, r.cx - 1, y + 1, "#e8e6df", 3, 1); },
    repro: (r, sk, t, p) => { const x = r.handR.x, y = r.handR.y - 5 + (p.mood === "work" ? Math.round(Math.sin(t * 4)) : 0); K.draw(fc, [".ww.", "w..w", "w..w", ".ww.", "...g", "....g"], x, y, {}); },
    reviewer: (r) => { K.px(fc, r.handR.x, r.handR.y - 4, "#e0675a", 1, 4); K.px(fc, r.handR.x, r.handR.y, "#e8e6df", 1, 1); },
    watcher: (r) => { K.px(fc, r.left - 1, r.top - 2, "#55524b", r.bw + 2, 1); K.px(fc, r.left - 2, r.top - 1, "#55524b", 1, 4); K.px(fc, r.right + 1, r.top - 1, "#55524b", 1, 4); K.px(fc, r.left - 3, r.top + 1, "#e8e6df", 2, 3); K.px(fc, r.right + 1, r.top + 1, "#e8e6df", 2, 3); },
  };
  const HAT = (r, t) => { K.draw(fc, ["..1..", ".121.", "11211"], r.cx - 2, r.top - 4, { c1: ["#4fb3e0", "#d0649f", "#5cbf6a"][Math.floor(t * 4) % 3], c2: "#e8e6df" }); };
  const RL = (id) => { if (id === "local") return "ME"; const m = id.match(/^([a-z])[a-z]*[-_ ]?(\d+)$/i); return (m ? m[1] + m[2] : id.replace(/[^a-z0-9]/gi, "")).slice(0, 3).toUpperCase(); };
  const RK = () => (S?.hs || []).filter((h) => h.on_).map((h) => [h.id, RL(h.id)]);
  const RH = new Map();
  const LF = [], RW = {};

  const SD = { floor: { d: ["#0d0e10", "#111215"], l: ["#e9eef3", "#e2e8ee"] }, wall: { d: ["#121317", "#1d1f24"], l: ["#f8f9fb", "#dde3ea"] } };
  const SV = { floor: { d: ["#24272d", "#3a3e46"], l: ["#d5dce4", "#aeb8c4"] }, wall: { d: ["#24272d", "#3a3e46"], l: ["#d5dce4", "#aeb8c4"] } };
  const PS = { floor: ["check", "plain", "planks", "tiles", "parquet", "carpet"], wall: ["plain", "stripes", "panels", "brick", "dots", "boards"] };
  const HX = /^#[0-9a-f]{6}$/i;
  let SU = { floor: { p: "check", a: "", b: "" }, wall: { p: "plain", a: "", b: "" } };
  const scol = (k, pv) => { const f = SU[k], d = (pv ? SV : SD)[k][lt() ? "l" : "d"]; return pv && !f.a && !f.b ? d : [f.a || SD[k][lt() ? "l" : "d"][0], f.b || SD[k][lt() ? "l" : "d"][1]]; };
  const pat = (g, p, ca, cb, x0, y0, w, h) => {
    const r = (x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); };
    g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
    r(x0, y0, w, h, ca);
    if (p === "check") for (let k = 0, y = y0; y < y0 + h; y += 8, k++) for (let x = x0 + (k % 2 ? 0 : 8); x < x0 + w; x += 16) r(x, y, 8, 8, cb);
    else if (p === "planks") for (let k = 0, y = y0; y < y0 + h; y += 8, k++) { r(x0, y + 7, w, 1, cb); for (let x = x0 - (k * 23) % 64; x < x0 + w; x += 64) r(x, y, 1, 7, cb); }
    else if (p === "tiles") for (let y = y0; y < y0 + h; y += 16) { r(x0, y, w, 1, cb); for (let x = x0; x < x0 + w; x += 16) r(x, y, 1, 16, cb); }
    else if (p === "parquet") for (let j = 0, y = y0; y < y0 + h; y += 16, j++) for (let i = 0, x = x0; x < x0 + w; x += 16, i++) for (let s = 0; s < 4; s++) (i + j) % 2 ? r(x, y + s * 4, 16, 1, cb) : r(x + s * 4, y, 1, 16, cb);
    else if (p === "carpet") for (let k = 0, y = y0 + 1; y < y0 + h; y += 4, k++) for (let x = x0 + (k % 2 ? 1 : 3); x < x0 + w; x += 4) r(x, y, 1, 1, cb);
    else if (p === "stripes") for (let x = x0; x < x0 + w; x += 8) r(x, y0, 3, h, cb);
    else if (p === "panels") for (let x = x0 + 2; x < x0 + w; x += 24) { r(x, y0 + 4, 20, 1, cb); r(x, y0 + h - 5, 20, 1, cb); r(x, y0 + 4, 1, h - 8, cb); r(x + 19, y0 + 4, 1, h - 8, cb); }
    else if (p === "brick") for (let k = 0, y = y0; y < y0 + h; y += 6, k++) { r(x0, y + 5, w, 1, cb); for (let x = x0 - (k % 2 ? 6 : 0); x < x0 + w; x += 12) r(x, y, 1, 5, cb); }
    else if (p === "dots") for (let k = 0, y = y0 + 2; y < y0 + h; y += 6, k++) for (let x = x0 + (k % 2 ? 2 : 5); x < x0 + w; x += 6) r(x, y, 1, 1, cb);
    else if (p === "boards") for (let k = 0, y = y0; y < y0 + h; y += 5, k++) { r(x0, y + 4, w, 1, cb); for (let x = x0 - (k * 17) % 48; x < x0 + w; x += 48) r(x, y, 1, 4, cb); }
    g.restore();
  };
  const floor = () => {
    const [fa, fb] = scol("floor"), [wa, wb] = scol("wall");
    pat(c, SU.floor.p, fa, fb, 0, 35, VW, VH - 35);
    pat(c, SU.wall.p, wa, wb, 0, 0, VW, 30);
    c.fillStyle = wb; c.fillRect(0, 30, VW, 5);
    c.globalAlpha = 0.35; c.fillStyle = "#000"; c.fillRect(0, 34, VW, 1); c.globalAlpha = 1;
  };
  const one = (k, f) => ({ p: PS[k].includes(f?.p) ? f.p : PS[k][0], a: HX.test(f?.a || "") ? f.a : "", b: HX.test(f?.b || "") ? f.b : "" });
  let GX = 50, GY = 28;
  const GO = 35;
  const room = (w, h) => { GX = w; GY = h; VW = w * 8; VH = GO + h * 8; off.width = VW; off.height = VH; c.imageSmoothingEnabled = false; };
  const FC = {
    desk: { n: "Desk", w: 4, h: 2, d: (X, Y) => { px(X + 10, Y - 5, 12, 8, "#2a2c32"); px(X + 11, Y - 4, 10, 6, "#141518"); px(X + 12, Y - 3, 5, 1, "#4fb3e0"); px(X + 15, Y + 3, 2, 2, "#2a2c32"); px(X, Y + 5, 32, 3, "#2a2c32"); px(X, Y + 8, 32, 5, "#1c1e22"); px(X + 2, Y + 13, 2, 3, "#2a2c32"); px(X + 28, Y + 13, 2, 3, "#2a2c32"); } },
    chair: { n: "Chair", w: 2, h: 2, d: (X, Y) => { px(X + 3, Y, 10, 7, "#30333a"); px(X + 2, Y + 7, 12, 4, "#3a3e46"); px(X + 7, Y + 11, 2, 3, "#2a2c32"); px(X + 3, Y + 14, 10, 1, "#2a2c32"); } },
    plant: { n: "Plant", w: 1, h: 1, d: (X, Y) => { px(X + 1, Y + 3, 6, 5, "#2a2c32"); K.draw(c, ["..e.e..", ".eEe.e.", "e.eEee.", ".eeEe.e", "..eEe.."], X, Y - 3, {}); } },
    rack: { n: "Server", w: 2, h: 2, d: (X, Y, t, u) => {
      const hh = u && RH.get(u), h = hh?.[0], jbs = h ? (S?.q || []).filter((q) => q.h === h && ["repro", "fix", "ci", "review", "gate", "submit"].includes(q.st)) : [];
      const ci = jbs.some((q) => q.st === "ci"), busy = jbs.length > 0, down = h && S?.o?.net?.[h] === false;
      px(X + 1, Y - 16, 14, 31, "#1c1e22"); px(X + 1, Y - 16, 14, 1, "#2a2c32");
      for (let i = 0; i < 5; i++) {
        px(X + 3, Y - 13 + i * 5, 10, 4, "#141518"); px(X + 4, Y - 12 + i * 5, 3, 1, "#26282d");
        for (let j = 0; j < 2; j++) { const on = ci ? Math.floor(t * (5 + i) + j * 3 + i + X) % 3 !== 0 : busy ? Math.floor(t * 1.5 + i + j + X) % 4 === 0 : h ? (i + j) % 5 === 0 : Math.floor(t * 2 + i + j + X) % 3 === 0; px(X + 9 + j * 2, Y - 12 + i * 5, 1, 1, down ? "#2a1715" : on ? (ci ? "#5cbf6a" : busy ? "#d97757" : h ? "#3d4045" : "#5cbf6a") : "#232529"); }
      }
      if (!h) return;
      px(X + 6, Y - 20, 4, 3, down ? (Math.floor(t * 2) % 2 ? "#e0675a" : "#4a1f1b") : ci ? (Math.floor(t * 2) % 2 ? "#4fb3e0" : "#2f86b0") : busy ? "#d97757" : "#3d4045");
      if (jbs.length > 1) tx(String(jbs.length), X + 12, Y - 22, "#b9bcc2");
      tx(hh[1], X + 8 - (K.textWidth(hh[1]) >> 1), Y + 17, down ? "#e0675a" : busy ? "#b9bcc2" : "#4a4d54");
    } },
    board: { n: "Board", w: 8, h: 2, d: (X, Y, t) => {
      px(X, Y - 8, 64, 22, "#0a0b0d"); px(X, Y - 8, 64, 1, "#24272d");
      tx("APOLLO OFFICE", X + 4, Y - 5, "#8a8d94");
      if (!S) return;
      const n = S.n || {}, q = ["ready", "repro", "fix", "ci", "review", "gate", "submit"].reduce((a, k) => a + (n[k] || 0), 0) + (S.rn || []).length, op = (S.pr || []).filter((p) => p.st === "open").length, ap = (n.approve || 0) + (S.rw || 0);
      if (S.o?.off) { if (Math.floor(t * 2) % 2) tx("OFFLINE", X + 4, Y + 4, "#e0675a"); }
      else if (party()) { if (Math.floor(t * 3) % 2) tx("MERGED!", X + 4, Y + 4, "#5cbf6a"); }
      else if (ap) tx(`APPROVE ${ap}`, X + 4, Y + 4, Math.floor(t * 1.5) % 2 ? "#94dd9e" : "#5cbf6a");
      else tx(`Q ${q} PR ${op}`, X + 4, Y + 4, "#5c5f66");
      const live = !S.o?.off && !S.o?.pause && !S.o?.man;
      px(X + 58, Y - 5, 3, 3, live ? (Math.floor(t * 1.5) % 2 ? "#5cbf6a" : "#3d9149") : S.o?.off ? "#e0675a" : "#8d9199");
      const d = new Date(), hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      tx(hm, X + 60 - K.textWidth(hm), Y + 4, "#4a4d54");
    } },
    radio: { n: "Radio", w: 3, h: 2, d: (X, Y, t) => {
      const on = !!(S?.q || []).some((q) => q.st === "ci"), x = X + 1, y = Y + 2;
      px(x, y, 22, 12, "#2a2c32"); px(x + 1, y + 1, 20, 10, "#1c1e22");
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) px(x + 3 + i * 2, y + 3 + j * 2, 1, 1, "#3d4045");
      px(x + 13, y + 3, 6, 2, on ? "#5cbf6a" : "#3d4045");
      const bar = (i) => (on ? 1 + Math.floor((Math.sin(t * (6 + i * 1.7) + i) + 1) * 1.5) : 1);
      for (let i = 0; i < 3; i++) px(x + 13 + i * 2, y + 10 - bar(i), 1, bar(i), on ? "#5cbf6a" : "#3d4045");
      px(x + 4, y - 3, 1, 3, "#3d4045");
      if (on) for (let k = 0; k < 2; k++) { const p = (t * 0.5 + k / 2) % 1; c.globalAlpha = 1 - p; K.draw(c, ["..ww", "..w.", "ww..", "ww.."], x + 18 + k * 4 + Math.sin(t * 2 + k) * 2, y - p * 14, {}); c.globalAlpha = 1; }
    } },
    sofa: { n: "Sofa", w: 5, h: 2, d: (X, Y) => { px(X + 1, Y - 2, 38, 8, "#3f5fae"); px(X + 1, Y + 6, 38, 6, "#5c7fd6"); px(X, Y + 2, 4, 11, "#3f5fae"); px(X + 36, Y + 2, 4, 11, "#3f5fae"); px(X + 19, Y + 6, 1, 6, "#3f5fae"); px(X + 2, Y + 13, 2, 2, "#1c1e22"); px(X + 36, Y + 13, 2, 2, "#1c1e22"); } },
    table: { n: "Table", w: 3, h: 2, d: (X, Y) => { px(X + 1, Y + 2, 22, 7, "#4a3a2c"); px(X + 1, Y + 2, 22, 1, "#6b5440"); px(X + 1, Y + 9, 22, 2, "#3a2d22"); px(X + 3, Y + 11, 2, 4, "#3a2d22"); px(X + 19, Y + 11, 2, 4, "#3a2d22"); } },
    shelf: { n: "Shelf", w: 4, h: 1, d: (X, Y) => { px(X, Y - 16, 32, 24, "#2a2c32"); for (let i = 0; i < 3; i++) { px(X + 2, Y - 14 + i * 7, 28, 5, "#141518"); for (let k = 0; k < 7; k++) px(X + 3 + k * 4, Y - 13 + i * 7 + ((k + i) % 3 ? 0 : 1), 3, 4 - ((k + i) % 3 ? 0 : 1), ["#e0675a", "#5c7fd6", "#5cbf6a", "#9c7ae0", "#d0649f", "#4fb3e0"][(k * 3 + i) % 6]); } } },
    coffee: { n: "Coffee", w: 2, h: 1, d: (X, Y, t) => { px(X, Y - 2, 16, 10, "#2a2c32"); px(X + 3, Y - 12, 10, 10, "#62666d"); px(X + 4, Y - 11, 8, 3, "#1c1e22"); px(X + 6, Y - 6, 4, 4, "#e9eef3"); if (Math.floor(t * 1.5) % 3 === 0) px(X + 7, Y - 15, 1, 2, "#8d9199"); } },
    cooler: { n: "Water", w: 1, h: 1, d: (X, Y) => { px(X + 1, Y - 2, 6, 10, "#b9bcc2"); px(X + 2, Y - 10, 4, 8, "#4fb3e0"); px(X + 2, Y - 10, 4, 1, "#8fd2f0"); } },
    lamp: { n: "Lamp", w: 1, h: 1, d: (X, Y) => { px(X + 3, Y - 10, 2, 17, "#3d4045"); px(X + 1, Y - 14, 6, 4, "#e4e9ef"); px(X + 1, Y + 6, 6, 2, "#2a2c32"); } },
    workplace: { n: "Workplace", w: 4, h: 4, d: (X, Y, tt) => { FC.desk.d(X, Y, tt); FC.chair.d(X + 8, Y + 16, tt); } },
    rug: { n: "Rug", w: 6, h: 4, l: 0, d: (X, Y) => { px(X, Y, 48, 32, "#5a2f3a"); px(X + 2, Y + 2, 44, 28, "#7a3f4f"); px(X + 6, Y + 6, 36, 20, "#5a2f3a"); px(X + 8, Y + 8, 32, 16, "#8a4a5c"); } },
  };
  let FU = [], ftool = null, fsel = -1, fedit = false, fhov = null, fdrag = null, fsave = 0, fhis = [], ffut = [], fbad = false;
  const fl = (i) => FC[i].l ?? 1;
  const free = (it, x, y, skip) => {
    const f = FC[it];
    if (x < 0 || y < 0 || x + f.w > GX || y + f.h > GY) return false;
    return !FU.some((u, k) => k !== skip && fl(u.i) === fl(it) && x < u.x + FC[u.i].w && u.x < x + f.w && y < u.y + FC[u.i].h && u.y < y + f.h);
  };
  const fput = () => { fsave = 0; return fetch("/api/set", { method: "POST", keepalive: true, headers: { "content-type": "application/json", "x-ao": "1" }, body: JSON.stringify({ office: { items: FU } }) }).catch(() => {}); };
  const fstore = () => { clearTimeout(fsave); fsave = setTimeout(fput, 400); };
  const fflush = () => { if (fsave) { clearTimeout(fsave); fput(); } };
  window.addEventListener("pagehide", fflush);
  let rsave = 0;
  const ext = () => FU.reduce((m, u) => [Math.max(m[0], u.x + FC[u.i].w), Math.max(m[1], u.y + FC[u.i].h)], [0, 0]);
  let fcb = () => {};
  const fch = () => { fcb(); };
  const snap = () => { fhis.push(JSON.stringify(FU)); if (fhis.length > 100) fhis.shift(); ffut = []; };
  const commit = () => { fstore(); fch(); };
  const near = (it, x0, y0) => {
    for (let d = 0; d < Math.max(GX, GY); d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
      if (free(it, x0 + dx, y0 + dy, -1)) return [x0 + dx, y0 + dy];
    }
    return null;
  };
  const ghost = () => {
    if (!fhov) return null;
    if (fdrag?.n) return { i: fdrag.n, x: fhov.x - fdrag.dx, y: fhov.y - fdrag.dy, sk: -1 };
    if (fdrag) return { i: FU[fdrag.k].i, x: fhov.x - fdrag.dx, y: fhov.y - fdrag.dy, sk: fdrag.k };
    if (ftool) { const f = FC[ftool]; return { i: ftool, x: fhov.x - (f.w >> 1), y: fhov.y - (f.h >> 1), sk: -1 }; }
    return null;
  };
  const box = (u, cl, a) => { const f = FC[u.i], X = u.x * 8, Y = GO + u.y * 8; c.globalAlpha = a; px(X, Y, f.w * 8, 1, cl); px(X, Y + f.h * 8 - 1, f.w * 8, 1, cl); px(X, Y, 1, f.h * 8, cl); px(X + f.w * 8 - 1, Y, 1, f.h * 8, cl); c.globalAlpha = 1; };
  const pick = (p) => { if (!p) return -1; for (let k = FU.length - 1; k >= 0; k--) { const u = FU[k], f = FC[u.i]; if (fl(u.i) && p.x >= u.x && p.x < u.x + f.w && p.y >= u.y && p.y < u.y + f.h) return k; } return FU.findIndex((u) => p.x >= u.x && p.x < u.x + FC[u.i].w && p.y >= u.y && p.y < u.y + FC[u.i].h); };
  const places = () => {
    const ds = FU.map((u, k) => [u, k]).filter(([u]) => u.i === "desk").sort((a, b) => a[0].y - b[0].y || a[0].x - b[0].x);
    const ch = FU.map((u, k) => [u, k]).filter(([u]) => u.i === "chair"), used = new Set(), ps = [];
    for (const [d, dkk] of ds) {
      let best = null, bd = 99;
      for (const [c, k] of ch) {
        if (used.has(k) || c.x + 3 <= d.x || c.x >= d.x + 5) continue;
        const dy = c.y >= d.y + 1 && c.y <= d.y + 4 ? c.y - d.y - 1 : c.y <= d.y - 1 && c.y >= d.y - 4 ? d.y - 1 - c.y : 99;
        const dd = dy * 4 + Math.abs(c.x + 1 - (d.x + 2));
        if (dy < 99 && dd < bd) { bd = dd; best = [c, k]; }
      }
      if (best) { used.add(best[1]); ps.push({ k: best[1], dk: dkk, back: best[0].y > d.y, w: best[0].w || null }); }
    }
    return ps;
  };
  window.AO.places = places;
  window.AO.unseated = (ids) => {
    const cr = (S?.crew || []).map((w) => w.id), st = cr.filter((id) => (S?.staff || []).includes(id) || ids.includes(id)), ps = places();
    const taken = new Set(ps.filter((p) => p.w && st.includes(p.w)).map((p) => p.w)), free = ps.filter((p) => !p.w || !st.includes(p.w)).length;
    const auto = st.filter((id) => !taken.has(id)).slice(0, free);
    return ids.filter((id) => !taken.has(id) && !auto.includes(id));
  };
  const seats = () => {
    if (S?.seat && !fedit && !fsave) {
      const ps = places(), m = new Map(), ids = new Set();
      for (const s of S.seat.seats || []) if (s.w && FU[s.c]?.i === "chair") { m.set(s.c, { id: s.w, back: !!ps.find((p) => p.k === s.c)?.back }); ids.add(s.w); }
      return { m, wait: (S.seat.wait || []).filter((id) => (S?.crew || []).some((w) => w.id === id)), ids };
    }
    const st = (S?.staff || []).filter((id) => (S?.crew || []).some((w) => w.id === id)), ps = places();
    const m = new Map(), ids = new Set();
    for (const p of ps) if (p.w && st.includes(p.w) && !ids.has(p.w)) { m.set(p.k, { id: p.w, back: p.back }); ids.add(p.w); }
    const rest = st.filter((id) => !ids.has(id));
    for (const p of ps) { if (m.has(p.k) || (p.w && st.includes(p.w))) continue; const id = rest.shift(); if (!id) break; m.set(p.k, { id, back: p.back }); ids.add(id); }
    return { m, wait: st.filter((id) => !ids.has(id)), ids };
  };
  const pst = (id) => {
    if (core(id)) { const w = S?.w?.[id] || {}; if (w.hold || (S?.o?.pause && w.st !== "work") || S?.o?.man) return "sleep"; if (S?.o?.off && w.st !== "work") return "off"; return w.st === "work" ? "work" : "idle"; }
    const rs = (S?.rn || []).filter((r) => r.w === id);
    if (rs.some((r) => r.st === "run" && !r.blk)) return "work";
    if (S?.o?.man) return "sleep";
    return "idle";
  };
  const person = (id, x, y, t, sit, back) => {
    const s0 = skOf(id), st = sit ? pst(id) : "wait", sd = id.length * 1.7 + id.charCodeAt(0) * 0.13;
    const w = core(id) ? S?.w?.[id] || {} : null, mood = w && nowS() - (w.t || 0) < 6000 ? w.mood : "", pt = sit && party();
    const p = K.pose();
    p.legs = sit ? "sit" : "stand";
    const bl = Math.floor((t + sd) * 10) % 47 === 0;
    if (pt) {
      p.armL = "top"; p.armR = "top"; p.eyes = "glad"; p.mouth = "wide";
      p.dy = Math.floor(t * 5 + sd) % 2 ? -3 : 0;
      p.aL = [0, Math.floor(t * 5 + sd) % 2 ? -1 : 0]; p.aR = [0, Math.floor(t * 5 + sd) % 2 ? 0 : -1];
    } else if (st === "work") {
      const q = Math.floor(t * 9 + sd);
      p.armL = "front"; p.armR = "front"; p.aL = [0, q % 2 ? -1 : 0]; p.aR = [0, q % 2 ? 0 : -1];
      p.ex = -1; p.ey = 1; p.dy = Math.floor(t * 4 + sd) % 4 === 0 ? -1 : 0;
      if (Math.floor(t * 0.7 + sd) % 5 === 0) { p.ex = 0; p.ey = -1; p.eyes = "half"; }
      if (bl) p.eyes = "shut";
    } else if (st === "sleep") {
      p.eyes = "shut"; p.bh = -1; p.dy = 1; p.armL = "low"; p.armR = "low";
    } else if (st === "off") {
      p.eyes = "half"; p.mouth = "flat"; p.bh = -1;
    } else if (st === "wait") {
      p.ex = [0, 1, 0, -1][Math.floor((t + sd) * 0.7) % 4]; p.armL = "low"; p.armR = "low";
      if (bl) p.eyes = "shut";
    } else {
      p.bh = Math.floor((t + sd) * 0.8) % 2 ? 0 : -1; p.ex = [0, 1, 0, -1][Math.floor((t + sd) * 0.4) % 4];
      if (bl) p.eyes = "shut";
    }
    if (!pt && mood === "ok") { p.eyes = "glad"; p.mouth = "smile"; p.armL = "top"; p.armR = "top"; p.dy = Math.floor(t * 6) % 2 ? -2 : 0; }
    else if (!pt && (mood === "sad" || mood === "err")) { p.eyes = "sad"; p.mouth = "sad"; p.armL = "low"; p.armR = "low"; }
    p.mood = st;
    const s1 = st === "off" ? dim(s0) : s0, sk = back ? { ...s1, eye: s1.body } : s1;
    fc.clearRect(0, 0, K.W, K.H);
    const { r } = K.figure(fc, p, t, sk);
    if (!back && w && acc[id]) acc[id](r, sk, t, p);
    if (pt) HAT(r, t + sd);
    c.drawImage(fig, Math.round(x - 24), Math.round(y - 41));
    hits.push({ k: "p:" + id, b: [x - 9, y - 30, x + 9, y - 4], p: id });
    if (st === "sleep" && !pt) { const z = ((t + sd) * 0.6) % 1; c.globalAlpha = 1 - z; tx("Z", x + 8 + z * 4, y - 26 - z * 8, "#75746f"); c.globalAlpha = 1; }
    if (st === "wait") tx("?", x + 9, y - 18 + (Math.floor(t * 2 + sd) % 2), "#e0675a");
  };
  const pname = (id) => ((S?.crew || []).find((w) => w.id === id)?.n || id).slice(0, 10).toUpperCase();
  const fdraw = (t) => {
    const ord = FU.map((u, k) => [u, k]).sort((a, b) => fl(a[0].i) - fl(b[0].i) || a[0].y + FC[a[0].i].h - (b[0].y + FC[b[0].i].h));
    const hk = fedit && !fdrag && !ftool ? pick(fhov) : -1;
    const sm = fedit ? { m: new Map(), wait: [] } : seats();
    RH.clear(); { const rk = RK(); FU.filter((u) => u.i === "rack").sort((a, b) => a.y - b.y || a.x - b.x).forEach((u, i) => { if (rk[i]) RH.set(u, rk[i]); }); }
    for (const [u, k] of ord) {
      if (fdrag && fdrag.k === k) continue;
      FU[k] && FC[u.i].d(u.x * 8, GO + u.y * 8, t, u);
      if (sm.m.has(k)) person(sm.m.get(k).id, u.x * 8 + 8, GO + u.y * 8 + 14, t, true, sm.m.get(k).back);

      if (fedit && k === fsel) box(u, "#4fb3e0", 0.95);
      else if (k === hk) box(u, lt() ? "#000" : "#fff", 0.35);
    }
    for (const [k, { id, back }] of sm.m) { const u = FU[k]; if (!u || (fdrag && fdrag.k === k)) continue; const nm = pname(id), on = pst(id) === "work"; tx(nm, u.x * 8 + 8 - (K.textWidth(nm) >> 1), GO + u.y * 8 + (back ? 18 : -6), on ? hlOf(id) : "#6b6f76"); }
    if (!fedit) {
      const dk = new Map(places().map((q) => [q.k, q.dk])), SP = {};
      for (const [k, { id, back }] of sm.m) {
        const u = FU[k]; if (!u) continue;
        SP[id] = [u.x * 8 + 8, GO + u.y * 8 - 8];
        const d = FU[dk.get(k)]; if (!d || back) continue;
        const X = d.x * 8, Y = GO + d.y * 8, st = pst(id), sk = skOf(id);
        if (st === "off") { px(X + 11, Y - 4, 10, 6, "#0b0c0e"); if (Math.floor(t * 2) % 2) px(X + 15, Y - 2, 2, 2, "#e0675a"); }
        else if (st === "work") { px(X + 11, Y - 4, 10, 6, "#0f1a1e"); const q = Math.floor(t * 6 + id.length); for (let i = 0; i < 3; i++) px(X + 12, Y - 3 + i * 2, 1 + ((q + i) * 7) % 8, 1, i === 2 ? sk.light : sk.dark); }
        else if (st === "sleep") px(X + 11, Y - 4, 10, 6, "#0b0c0e");
        else { px(X + 11, Y - 4, 10, 6, "#141518"); px(X + 12, Y - 3, 3, 1, sk.dark); if (Math.floor(t * 1.2 + id.length) % 2) px(X + 16, Y - 3, 1, 1, sk.light); }
      }
      { const rs = [...RH.entries()].sort((a, b) => ((S?.q || []).some((q) => q.st === "ci" && q.h === b[1][0]) ? 1 : 0) - ((S?.q || []).some((q) => q.st === "ci" && q.h === a[1][0]) ? 1 : 0)); const ru = rs[0]?.[0] || FU.find((u) => u.i === "rack"); if (ru) SP.ci = [ru.x * 8 + 8, GO + ru.y * 8 - 20]; }
      const nw = nowS(), PL = ["w....", "www..", "wwwww", ".gww.", "..g.."];
      for (let i = LF.length - 1; i >= 0; i--) if (nw - LF[i].t > 4000) LF.splice(i, 1);
      for (const f of [...(S?.fl || []), ...LF]) {
        const A = SP[f.a], B = SP[f.b]; if (!A || !B) continue;
        const k0 = Math.min(1, (nw - f.t) / 2200); if (k0 >= 1 || k0 < 0) continue;
        const hgt = 18 + Math.min(40, Math.hypot(B[0] - A[0], B[1] - A[1]) * 0.25);
        const pos = (q) => [A[0] + (B[0] - A[0]) * q, A[1] + (B[1] - A[1]) * q - Math.sin(q * Math.PI) * hgt];
        const e = k0 < 0.5 ? 2 * k0 * k0 : 1 - Math.pow(-2 * k0 + 2, 2) / 2;
        for (let j = 1; j <= 16; j++) { const q = e - j * 0.018; if (q <= 0) break; if (j % 2) continue; const [qx, qy] = pos(q); c.globalAlpha = (1 - j / 17) * 0.85; px(qx, qy, 2, 2, hlOf(f.a)); }
        c.globalAlpha = 1;
        const [x, y] = pos(e), [nx] = pos(Math.min(1, e + 0.02)), fl2 = nx < x;
        PL.forEach((row, ry) => [...row].forEach((ch, rx) => { if (ch !== ".") px(x - 5 + (fl2 ? 4 - rx : rx) * 2, y - 5 + ry * 2, 2, 2, ch === "w" ? "#f2efe6" : "#9a988f"); }));
      }
      if (party()) { const cs = ["#4fb3e0", "#d0649f", "#5cbf6a", "#9c7ae0", "#e0675a", "#e8e6df"]; for (let i = 0; i < 90; i++) { const sx = (i * 97.13) % VW, sp = 18 + (i % 7) * 6, y = ((t * sp + i * 37) % (VH + 20)) - 10; px(sx + Math.sin(t * 2 + i) * 4, y, 2, 1 + (i % 2), cs[i % cs.length]); } }
    }
    if (fedit) {
      const ps = places(), pd = new Set(ps.map((p) => p.dk)), pc = new Set(ps.map((p) => p.k));
      FU.forEach((u, k) => {
        if (u.i !== "desk" && u.i !== "chair") return;
        const ok = u.i === "desk" ? pd.has(k) : pc.has(k), w = FC[u.i].w * 8;
        px(u.x * 8 + w - 5, GO + u.y * 8 - 2, 4, 4, ok ? "#5cbf6a" : "#e0675a");
        if (u.i === "chair") { const sid = u.w || (S?.seat?.seats || []).find((s) => s.c === k)?.w; if (sid) { const nm = pname(sid), wx = K.textWidth(nm); px(u.x * 8 + 7 - (wx >> 1), GO + u.y * 8 + 16, wx + 2, 7, "#0b0c0e"); tx(nm, u.x * 8 + 8 - (wx >> 1), GO + u.y * 8 + 17, u.w ? "#ecebe6" : "#b9bcc2"); } }
      });
    }
    sm.wait.forEach((id, i) => { const x = 20 + i * 24, y = VH - 8; person(id, x, y, t, false); const nm = pname(id); tx(nm, x - (K.textWidth(nm) >> 1), y - 26, "#e0675a"); });
    const g = ghost();
    fbad = false;
    if (g) {
      const f = FC[g.i], ok = free(g.i, g.x, g.y, g.sk);
      fbad = !ok;
      c.globalAlpha = 0.22; px(g.x * 8, GO + g.y * 8, f.w * 8, f.h * 8, ok ? "#5cbf6a" : "#e0675a");
      c.globalAlpha = ok ? 0.85 : 0.5; f.d(g.x * 8, GO + g.y * 8, t); c.globalAlpha = 1;
    } else if (fdrag && !fhov) fbad = true;
  };
  const cell = (e) => {
    const r = cv.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null;
    const x = (e.clientX - r.left) * VW / r.width, y = (e.clientY - r.top) * VH / r.height;
    return { x: Math.floor(x / 8), y: Math.max(0, Math.floor((y - GO) / 8)) };
  };
  const fab = document.createElement("div");
  fab.className = "fab"; fab.hidden = true;
  fab.innerHTML = `<button type="button" data-a="dup" title="Duplicate (Ctrl+D)">Duplicate</button><button type="button" data-a="del" class="dng" title="Remove (Delete)">Remove</button>`;
  $("stage").appendChild(fab);
  const BTN = fab.innerHTML;
  const fabpos = () => {
    const u = FU[fsel];
    if (!fedit || !u || fdrag) { fab.hidden = true; return; }
    const fk = fsel + ":" + u.i + ":" + (u.w || "") + ":" + (S?.crew || []).map((w) => w.id).join(",");
    if (fab.dataset.k !== fk) {
      fab.dataset.k = fk;
      const st = S?.crew || [];
      fab.innerHTML = (u.i === "chair" && st.length ? `<select data-a="seat" aria-label="Who sits here"><option value="">Seat: anyone free</option>${st.map((w) => `<option value="${esc(w.id)}" ${u.w === w.id ? "selected" : ""}>Seat: ${esc(w.n)}</option>`).join("")}</select>` : "") + BTN;
      const se = fab.querySelector("[data-a=seat]");
      if (se) se.onchange = () => { const v = se.value; snap(); for (const x of FU) if (x.i === "chair" && v && x.w === v) delete x.w; if (v) FU[fsel].w = v; else delete FU[fsel].w; commit(); };
    }
    const r = cv.getBoundingClientRect(), sr = $("stage").getBoundingClientRect(), k = r.width / VW, f = FC[u.i];
    fab.hidden = false;
    const x = r.left - sr.left + (u.x * 8 + f.w * 4) * k, yt = r.top - sr.top + (GO + u.y * 8 - 6) * k - 6;
    if (u.i === "desk") {
      const xr = r.left - sr.left + (u.x * 8 + f.w * 8) * k + 10 + fab.offsetWidth / 2;
      fab.style.left = Math.round(Math.min(sr.width - fab.offsetWidth / 2 - 6, xr)) + "px";
      fab.style.top = Math.round(r.top - sr.top + (GO + u.y * 8 + f.h * 4) * k - fab.offsetHeight / 2) + "px";
      return;
    }
    fab.style.left = Math.round(Math.min(sr.width - fab.offsetWidth / 2 - 6, Math.max(fab.offsetWidth / 2 + 6, x))) + "px";
    const yb = r.top - sr.top + (GO + (u.y + f.h) * 8) * k + 8;
    fab.style.top = Math.round(yb + fab.offsetHeight > sr.height - 8 ? yt - fab.offsetHeight : yb) + "px";
  };
  const del = (k) => { if (k < 0 || !FU[k]) return; snap(); FU.splice(k, 1); fsel = -1; commit(); };
  const dup = () => { const u = FU[fsel]; if (!u) return; const p = near(u.i, u.x + FC[u.i].w, u.y); if (!p) return; snap(); FU.push({ i: u.i, x: p[0], y: p[1] }); fsel = FU.length - 1; commit(); };
  fab.addEventListener("pointerdown", (e) => e.stopPropagation());
  fab.addEventListener("click", (e) => { const a = e.target.closest("[data-a]")?.dataset.a; if (a === "del") del(fsel); if (a === "dup") dup(); });
  cv.addEventListener("pointerdown", (e) => {
    if (!fedit || e.button) return;
    const p = cell(e);
    if (!p) return;
    if (ftool) {
      const g = ghost();
      if (g && free(g.i, g.x, g.y, -1)) { snap(); if (g.i === "workplace") { FU.push({ i: "desk", x: g.x, y: g.y }, { i: "chair", x: g.x + 1, y: g.y + 2 }); } else FU.push({ i: g.i, x: g.x, y: g.y }); ftool = null; fsel = FU.length - 1; commit(); return; }
      const hit = pick(p);
      if (hit < 0) return;
      ftool = null;
    }
    const k = pick(p);
    fsel = k; fch();
    if (k >= 0) { fdrag = { k, dx: p.x - FU[k].x, dy: p.y - FU[k].y }; cv.setPointerCapture?.(e.pointerId); }
  });
  window.addEventListener("pointermove", (e) => {
    if (!fedit) return;
    fhov = cell(e);
    cv.style.cursor = fdrag ? (fbad ? "no-drop" : "grabbing") : ftool ? (fbad ? "not-allowed" : "copy") : pick(fhov) >= 0 ? "grab" : "";
  });
  window.addEventListener("pointerup", (e) => {
    if (!fdrag) return;
    const d = fdrag; fdrag = null;
    fhov = cell(e);
    if (d.n) {
      const g = fhov && { x: fhov.x - d.dx, y: fhov.y - d.dy };
      if (g && free(d.n, g.x, g.y, -1)) { snap(); if (d.n === "workplace") FU.push({ i: "desk", x: g.x, y: g.y }, { i: "chair", x: g.x + 1, y: g.y + 2 }); else FU.push({ i: d.n, x: g.x, y: g.y }); fsel = FU.length - 1; commit(); }
      document.body.classList.remove("fdg");
      return;
    }
    const u = FU[d.k];
    if (!u) return;
    if (!fhov) { del(d.k); return; }
    const x = fhov.x - d.dx, y = fhov.y - d.dy;
    if ((x !== u.x || y !== u.y) && free(u.i, x, y, d.k)) { snap(); u.x = x; u.y = y; commit(); }
  });
  cv.addEventListener("contextmenu", (e) => { if (!fedit) return; e.preventDefault(); del(pick(cell(e))); });
  document.addEventListener("keydown", (e) => {
    if (!fedit || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) return;
    const m = e.metaKey || e.ctrlKey;
    if (m && e.key.toLowerCase() === "z") { e.preventDefault(); const [a, b] = e.shiftKey ? [ffut, fhis] : [fhis, ffut]; if (a.length) { b.push(JSON.stringify(FU)); FU = JSON.parse(a.pop()); fsel = -1; commit(); } return; }
    if (m && e.key.toLowerCase() === "d") { e.preventDefault(); dup(); return; }
    if ((e.key === "Delete" || e.key === "Backspace") && fsel >= 0) { e.preventDefault(); del(fsel); return; }
    const ar = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (ar && fsel >= 0) { e.preventDefault(); const u = FU[fsel]; if (free(u.i, u.x + ar[0], u.y + ar[1], fsel)) { snap(); u.x += ar[0]; u.y += ar[1]; commit(); } return; }
    if (e.key === "Escape" && (ftool || fsel >= 0)) { ftool = null; fsel = -1; fch(); e.stopPropagation(); }
  }, true);
  window.AO.furn = {
    cat: FC,
    prev: (g, i, w, h) => { const f = FC[i], s0 = c, sc = Math.min(w / (f.w * 8 + 4), h / (f.h * 8 + 20)); c = g; g.save(); g.clearRect(0, 0, w, h); g.translate(Math.round((w - f.w * 8 * sc) / 2), Math.round(h - 2 - f.h * 8 * sc)); g.scale(sc, sc); f.d(0, 0, 0); g.restore(); c = s0; },
    edit: (on) => { fedit = on; if (!on) { fflush(); ftool = null; fsel = -1; fdrag = null; fab.hidden = true; cv.style.cursor = ""; } },
    tool: (i) => { ftool = ftool === i ? null : i; fsel = -1; fch(); },
    grab: (i) => { const f = FC[i]; ftool = null; fsel = -1; fdrag = { n: i, dx: f.w >> 1, dy: f.h >> 1 }; document.body.classList.add("fdg"); fch(); },
    cur: () => ({ tool: ftool, sel: fsel >= 0 ? FU[fsel]?.i : null, n: FU.length, undo: fhis.length, redo: ffut.length }),
    undo: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true })),
    redo: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, shiftKey: true })),
    del: () => del(fsel),
    clear: () => { snap(); FU = []; fsel = -1; commit(); },
    room: () => ({ w: GX, h: GY, min: ext() }),
    size: (w, h) => { const [mw, mh] = ext(); w = Math.max(30, mw, Math.min(80, w | 0)); h = Math.max(16, mh, Math.min(40, h | 0)); room(w, h); clearTimeout(rsave); rsave = setTimeout(() => post({ office: { size: { w, h } } }, "/api/set").catch(() => {}), 400); return { w, h }; },
    loadRoom: (z) => { const w = z?.w | 0, h = z?.h | 0; room(w >= 30 && w <= 80 ? w : 50, h >= 16 && h <= 40 ? h : 28); },
    load: (a) => { FU = Array.isArray(a) ? a.filter((u) => FC[u?.i] && u.i !== "workplace" && Number.isInteger(u.x) && Number.isInteger(u.y)).map((u) => (u.i === "chair" && typeof u.w === "string" && u.w ? { i: u.i, x: u.x, y: u.y, w: u.w } : { i: u.i, x: u.x, y: u.y })) : []; },
    on: (f) => { fcb = f; },
    tick: fabpos,
  };
  window.AO.surf = {
    get: (k) => ({ ...SU[k] }), pats: PS, eff: scol, pat,
    set: (k, f) => { SU = { ...SU, [k]: one(k, f) }; },
    load: (o) => { SU = { floor: one("floor", o?.floor), wall: one("wall", o?.wall) }; },
  };



  const desk = (x, y, col) => {
    if (lt()) {
      px(x - 14, y, 28, 3, "#ffffff");
      px(x - 14, y + 3, 28, 8, "#dfe5ec");
      px(x - 14, y + 3, 28, 1, "#cdd5df");
      px(x - 12, y + 11, 2, 3, "#7d8794");
      px(x + 10, y + 11, 2, 3, "#7d8794");
      px(x - 8, y + 6, 16, 1, col);
      return;
    }
    px(x - 14, y, 28, 3, "#2a2c32");
    px(x - 14, y + 3, 28, 8, "#1c1e22");
    px(x - 14, y + 3, 28, 1, "#25272c");
    px(x - 12, y + 11, 2, 3, "#16171a");
    px(x + 10, y + 11, 2, 3, "#16171a");
    px(x - 8, y + 6, 16, 1, col);
  };





  let hits = [], hov = null, mx = 0, my = 0;

  const rack = (x, y, t, h, lb) => {
    hits.push({ k: "h:" + h, b: [x - 9, y - 41, x + 9, y + 21], h });
    const jbs = (S?.q || []).filter((q) => q.h === h && ["repro", "fix", "ci", "review", "gate", "submit"].includes(q.st));
    const ci = jbs.some((q) => q.st === "ci"), busy = jbs.length > 0;
    const down = S?.o?.net?.[h] === false;
    px(x - 7, y - 34, 14, 46, "#1c1e22");
    px(x - 7, y - 34, 14, 1, "#2a2c32");
    for (let i = 0; i < 6; i++) {
      const yy = y - 30 + i * 7;
      px(x - 5, yy, 10, 5, "#141518");
      for (let j = 0; j < 2; j++) {
        const on = ci ? Math.floor(t * (5 + i) + j * 3 + i + x) % 3 !== 0 : busy ? Math.floor(t * 1.5 + i + j + x) % 4 === 0 : (i + j) % 5 === 0;
        px(x + 1 + j * 2, yy + 2, 1, 1, down ? "#2a1715" : on ? (ci ? "#5cbf6a" : busy ? "#d97757" : "#3d4045") : "#232529");
      }
      px(x - 3, yy + 2, 3, 1, "#26282d");
    }
    const lamp = down ? (Math.floor(t * 2) % 2 ? "#e0675a" : "#4a1f1b") : ci ? (Math.floor(t * 2) % 2 ? "#4fb3e0" : "#2f86b0") : busy ? "#d97757" : "#3d4045";
    px(x - 2, y - 39, 4, 4, lamp);
    if (jbs.length > 1) tx(String(jbs.length), x - 1, y - 46, "#b9bcc2");
    tx(lb, x - (K.textWidth(lb) >> 1), y + 15, down ? "#e0675a" : busy ? "#b9bcc2" : "#4a4d54");
  };






  const plant = (x, y) => {
    px(x - 3, y, 7, 6, "#2a2c32");
    K.draw(c, ["..e.e..", ".eEe.e.", "e.eEee.", ".eeEe.e", "..eEe.."], x - 3, y - 5, {});
  };

  let last = performance.now();
  let sgw = 0, sgh = 0, lf = 0;
  new ResizeObserver(([e]) => { sgw = e.contentRect.width; sgh = e.contentRect.height; }).observe($("stage"));
  const frame = (now) => {
    requestAnimationFrame(frame);
    if (document.hidden || document.body.classList.contains("fed") || !sgw || now - lf < (fedit ? 15 : 45)) return;
    lf = now;
    const t = (performance.now() - t0) / 1000;
    c.imageSmoothingEnabled = false;
    fc.imageSmoothingEnabled = false;
    hits = [];
    floor(t);
    fdraw(t);
    window.AO.furn.tick();
    const hh = hov && hits.find((h) => h.k === hov);
    if (hh) {
      const [x0, y0, x1, y1] = hh.b, cl = "#75746f";
      for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) { px(dx > 0 ? x : x - 3, y, 4, 1, cl); px(x - (dx > 0 ? 0 : 1), dy > 0 ? y : y - 3, 1, 4, cl); }
    }
    if (S?.o?.off) { c.globalAlpha = 0.25; px(0, 35, VW, VH - 35, "#000"); c.globalAlpha = 1; }
    const dp = window.devicePixelRatio || 1;
    const kf = Math.min((sgw - 2) * dp / VW, (sgh - 2) * dp / VH), ks = kf >= 1.25 ? kf : Math.max(1, Math.floor(kf)), sc = Math.max(1, Math.ceil(ks));
    cv.classList.toggle("soft", ks % 1 > 0.01 && ks < 1.75);
    if (cv.width !== VW * sc || cv.height !== VH * sc) { cv.width = VW * sc; cv.height = VH * sc; }
    const cw = Math.floor(VW * ks / dp) + "px", ch = Math.floor(VH * ks / dp) + "px";
    if (cv.style.width !== cw || cv.style.height !== ch) { cv.style.width = cw; cv.style.height = ch; }
    cx.imageSmoothingEnabled = false;
    cx.drawImage(off, 0, 0, VW * sc, VH * sc);
    if (fedit) { cx.globalAlpha = lt() ? 0.06 : 0.05; cx.fillStyle = lt() ? "#000" : "#fff"; for (let x = 0; x <= GX; x++) cx.fillRect(x * 8 * sc, GO * sc, 1, GY * 8 * sc); for (let y = 0; y <= GY; y++) cx.fillRect(0, (GO + y * 8) * sc, VW * sc, 1); cx.globalAlpha = 1; }
    const mg = $("mg");
    if (party()) {
      if (mg.hidden || mg.dataset.k !== S.lm.repo + S.lm.num) {
        mg.dataset.k = S.lm.repo + S.lm.num;
        mg.innerHTML = `<div class="mh">MERGED · ${esc(S.lm.repo)}#${S.lm.num}${S.lm.by ? " by " + esc(S.lm.by) : ""}</div><div class="mt2">${esc(S.lm.title)}</div>${S.lm.txt ? `<div class="mq">“${esc(S.lm.txt)}”</div>` : ""}`;
        mg.hidden = false;
      }
    } else if (!mg.hidden) mg.hidden = true;
  };

  const ago = (t) => {
    const s = Math.max(0, (Date.now() - t) / 1000);
    return s < 60 ? Math.round(s) + "s" : s < 3600 ? Math.round(s / 60) + "m" : s < 86400 ? Math.round(s / 3600) + "h" : Math.round(s / 86400) + "d";
  };
  const hm = (t) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const kt = (n) => (n > 999999 ? (n / 1e6).toFixed(1) + "M" : n > 999 ? Math.round(n / 1000) + "k" : String(n));
  const STC = { approve: "ok", ready: "", vet: "", repro: "work", fix: "work", ci: "work", review: "work", gate: "work", submit: "work", done: "ok", drop: "bad" };

  const GEAR = `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`;
  window.AO.GEAR = GEAR;
  const mdn = (md) => {
    if (!md) return "";
    const i = md.indexOf(":"), p = i > 0 ? md.slice(0, i) : "", m = ["codex", "anthropic", "openai", "gemini", "ollama"].includes(p) ? md.slice(i + 1) : md;
    const c = m.includes("haiku") ? "Haiku" : m.includes("sonnet") ? "Sonnet" : m.includes("opus") ? "Opus" : m.split("/").pop();
    return p === "ollama" ? c + " · local" : p === "codex" ? c + " · ChatGPT" : p === "anthropic" ? c + " · API" : c;
  };
  window.AO.mdn = mdn;
  const XP = ["#c77dba", "#6fa8dc", "#e39b6b", "#7fc8a9", "#b5a3e0", "#e0848f", "#8fb3c9", "#c9b37f"];
  let tkeys = "";
  const ohint = () => {
    let h = $("ohint"); let seen = "1"; try { seen = localStorage.getItem("ao.oh") || ""; } catch {}
    if (seen || document.body.classList.contains("ed") || !(S?.crew || []).length) { if (h) h.hidden = true; return; }
    if (!h) { h = document.createElement("div"); h.id = "ohint"; h.className = "ohint"; h.innerHTML = `<b>How the office works</b><span>Everyone on your team needs a workplace, a desk with a chair, while one of their pipelines is active. Add one with Edit office → Workplace. Tests run on your machines, shown as the server racks.</span><button type="button">Got it</button>`; $("stage").appendChild(h); h.querySelector("button").onclick = () => { try { localStorage.setItem("ao.oh", "1"); } catch {} h.hidden = true; }; }
    h.hidden = false;
  };
  const deskbar = () => {
    ohint();
    let bar = $("deskbar");
    const wt = (S?.seat?.wait || []).map((id) => (S?.crew || []).find((w) => w.id === id)?.n).filter(Boolean);
    if (!wt.length || document.body.classList.contains("ed")) { if (bar) bar.hidden = true; return; }
    if (!bar) { bar = document.createElement("div"); bar.id = "deskbar"; bar.className = "deskbar"; $("stage").appendChild(bar); bar.onclick = (e) => { if (e.target.closest("button")) $("bCz").click(); }; }
    bar.hidden = false;
    const txt = `${wt.join(", ")} ${wt.length === 1 ? "needs" : "need"} a workplace (desk with a chair) to work.`;
    if (bar.dataset.t !== txt) { bar.dataset.t = txt; bar.innerHTML = `<span>${esc(txt)}</span><button type="button">Edit office</button>`; }
  };
  const tiles = () => {
    deskbar();
    const el = $("tiles");
    const po = window.AO.pord || [], xk = Object.keys(S.w).filter((k) => k.startsWith("x:")).sort((a, b) => (po.indexOf(a.slice(2)) + 99) % 99 - (po.indexOf(b.slice(2)) + 99) % 99);
    xk.forEach((k, i) => { const c = XP[i % XP.length]; SK[k] = { body: c, dark: c, light: c, tx: txc(c) }; NM[k] = S.w[k].nm || k.slice(2); });
    const CP = ["#e39b6b", "#7fc8a9", "#b5a3e0", "#6fa8dc", "#e0848f", "#8fb3c9", "#c77dba", "#c9b37f"];
    const ck = (S.crew || []).filter((w) => (S.staff || []).includes(w.id) && !w.core).map((w, i) => { const k = "c:" + w.id; SK[k] = { body: CP[i % CP.length], dark: CP[i % CP.length], light: CP[i % CP.length], tx: txc(CP[i % CP.length]) }; NM[k] = w.n || w.id; return k; });
    const all = [...ck, ...ORD, ...xk];
    if (all.join() !== tkeys) { tkeys = all.join(); el.innerHTML = ""; el.style.gridTemplateColumns = all.length > 10 ? "repeat(auto-fill, minmax(124px, 1fr))" : `repeat(${all.length}, minmax(0, 1fr))`; }
    if (!el.children.length) {
      el.innerHTML = all.map((n) => `<div class="tile" data-w="${n}"><div class="hd"><span class="dot" style="background:${SK[n].body}"></span><button type="button" class="tn" ${n.startsWith("c:") ? `aria-label="Open ${esc(NM[n])} in Team"` : `aria-label="Pause ${esc(NM[n])}" aria-pressed="false"`}>${esc(NM[n])}</button><span class="md"></span>${n === "ci" || n === "submit" || n.startsWith("x:") || n.startsWith("c:") ? "" : `<button class="gear" title="Model and provider" aria-label="${esc(NM[n])} settings">${GEAR}</button>`}</div><div class="sy"></div><div class="stt"></div><div class="ft"></div></div>`).join("");
      el.onclick = (e) => {
        const g = e.target.closest(".gear");
        if (g) { e.stopPropagation(); window.AO.role && window.AO.role(g.closest(".tile").dataset.w); return; }
        const t = e.target.closest(".tile"); if (t && t.dataset.w.startsWith("c:")) { window.AO.go && window.AO.go("team"); return; } if (t) post({ a: "hold", w: t.dataset.w, on: !S.w[t.dataset.w].hold }).then(apply);
      };
    }
    const STG = { hunter: ["hunt"], repro: ["repro"], fixer: ["fix"], ci: ["ci"], reviewer: ["review"], submit: ["gate", "submit"] };
    for (const t of el.children) {
      const n = t.dataset.w;
      if (n.startsWith("c:")) {
        const id = n.slice(2), cw = (S.crew || []).find((x) => x.id === id) || {}, rs = (S.rn || []).filter((r) => r.st === "run" && r.w === id);
        const ev = (S.ev || []).find((e) => e.w === n);
        const nd = seats().wait.includes(id);
        if (nd) { t.className = "tile nodesk"; t.style.order = 0; t.querySelector(".md").textContent = ""; t.querySelector(".sy").textContent = ""; t.querySelector(".stt").textContent = "No desk"; t.querySelector(".ft").textContent = ""; t.title = "Needs a desk to work"; continue; }
        t.className = "tile " + (rs.length ? "work" : "");
        t.style.order = rs.length ? 0 : 1;
        t.querySelector(".md").textContent = mdn(cw.md || "");
        t.querySelector(".sy").textContent = rs.length ? rs[0].n : ev ? `${ago(ev.t)} · ${ev.m}` : "…";
        t.querySelector(".stt").textContent = rs.length ? "working" + (rs.length > 1 ? " ×" + rs.length : "") : "idle";
        t.querySelector(".ft").textContent = "";
        t.title = (cw.r ? cw.r + " · " : "") + "open Team";
        continue;
      }
      const w = S.w[n] || { st: "idle", say: "", md: "", tk: 0 };
      const cn = STG[n] ? S.q.filter((q) => STG[n].includes(q.st)).length : n === "vet" ? S.o.vn || 0 : 0;
      const wk = cn > 0 || w.st === "work";
      t.querySelector(".md").textContent = n === "ci" || n === "submit" ? "no model" : mdn(w.md);
      t.querySelector(".md").title = w.md || "";
      const ev = !w.say && (S.ev || []).find((e) => e.w === n);
      t.querySelector(".sy").textContent = w.say || (ev ? `${ago(ev.t)} · ${ev.m}` : "…");
      t.className = "tile " + (wk ? "work" : "") + (w.hold ? " hold" : "");
      t.style.order = w.hold ? 2 : wk ? 0 : 1;
      t.querySelector(".stt").textContent = w.hold ? "paused" : wk ? "working" + (cn > 1 ? " ×" + cn : "") : w.st === "sleep" ? "asleep" : "idle";
      t.querySelector(".ft").textContent = w.tk ? kt(w.tk) + " tok" : "";
      t.title = (TD[n] ? TD[n] + " · Bug-fix team · " : "") + (w.hold ? "click to resume" : "click to pause");
    }
  };

  const rn = (j) => (j.repo.split("/")[1] || j.repo) + (j.num ? "#" + j.num : "");
  const sel = new Set();
  const QN = { vet: "Checking", ready: "Ready", hunt: "Hunting", repro: "Reproducing", fix: "Fixing", ci: "Testing", review: "Reviewing", gate: "Final check", approve: "Waiting for you", submit: "Submitting", done: "Done", drop: "Dropped", park: "Parked" };
  const KN = { hunt: "Hunt", rebase: "Rebase", review: "Review changes", feat: "Feature" };
  const jrow = (j, x) => `<div class="row jr${j.st === "approve" ? " apr" : ""}">${j.st === "approve" && x ? `<input type="checkbox" class="bk" data-k="${j.id}" ${sel.has(j.id) ? "checked" : ""} aria-label="select">` : ""}<div class="ti"><a class="a" href="#" data-j="${j.id}">${esc(j.title)}</a><div class="w"><span class="stt st-${esc(j.st)}">${esc((j.kind !== "fix" ? (KN[j.kind] || j.kind) + " · " : "") + (QN[j.st] || j.st))}</span><span>${esc(rn(j))}</span>${(j.st === "ci" && S.cil[j.id]) || j.why ? `<span class="wy">${esc(j.st === "ci" && S.cil[j.id] ? S.cil[j.id] : j.why)}</span>` : ""}</div></div><span class="rp">${j.st === "approve" ? `<button class="go" data-j="${j.id}">Review</button>` : ""}${x && j.st !== "approve" ? `<button class="x" data-d="${j.id}" title="Drop" aria-label="Drop"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : ""}${!x && j.st === "drop" && j.kind === "fix" ? `<button class="x" data-rq="${j.id}" title="Try again" aria-label="Try again"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6M4 4v4.6h4.6"/></svg></button>` : ""}</span></div>`;

  let lW = "", lQ = "", lWrap = false, lastLog = "";
  try { lWrap = localStorage.getItem("ao.lw") === "1"; } catch {}
  const initLog = () => {
    const sw = $("logW"), sq = $("logQ"), wb = $("logWrap"), lg = $("log");
    const lk = (S?.crew || []).map((w) => w.id + w.n).join();
    if (!sw || !sq || !wb || !lg || sw.dataset.inited === lk + "|") return;
    const first = !sw.dataset.inited;
    sw.dataset.inited = lk + "|";
    (S?.crew || []).forEach((w) => { NM["c:" + w.id] = w.n || w.id; });
    sw.innerHTML = `<option value="">All workers</option>` + [...(S?.crew || []).filter((w) => !w.core).map((w) => "c:" + w.id), "pipe", ...ORD, ...Object.keys(S?.w || {}).filter((k) => k.startsWith("x:"))].map((w) => `<option value="${w}">${esc(NM[w] || w)}</option>`).join("");
    sw.value = lW;
    if (!first) return;
    wb.classList.toggle("on", lWrap);
    lg.classList.toggle("wrap", lWrap);
    sw.onchange = () => { lW = sw.value; rlog(); };
    sq.oninput = () => { lQ = sq.value.trim().toLowerCase(); rlog(); };
    wb.onclick = () => {
      lWrap = !lWrap;
      try { localStorage.setItem("ao.lw", lWrap ? "1" : "0"); } catch {}
      wb.classList.toggle("on", lWrap);
      lg.classList.toggle("wrap", lWrap);
    };
  };
  const rlog = () => {
    initLog();
    if (!S) return;
    const evs = (S.ev || []).filter((e) => (!lW || e.w === lW) && (!lQ || (e.m || "").toLowerCase().includes(lQ) || (NM[e.w] || e.w || "").toLowerCase().includes(lQ))).slice(0, 80);
    const html = evs.length ? evs.map((e) => `<div><span class="tm">${hm(e.t)}</span><span style="color:${SK[e.w] ? hl(e.w) : "inherit"}">${esc(NM[e.w] || e.w)}</span><span>${esc(e.m)}</span></div>`).join("") : `<div class="empty">no matching log entries</div>`;
    if (html !== lastLog) { lastLog = html; $("log").innerHTML = html; }
  };

  const RQN = { queued: "Queued", run: "Running", wait: "Waiting for you" };
  const rrow = (r) => { const w = (S.crew || []).find((x) => x.id === r.w); return `<div class="row jr${r.st === "wait" ? " apr" : ""}"><div class="ti"><a class="a" href="#" data-run="${r.id}">${esc(r.st === "wait" && r.ask ? r.ask : r.n || r.flow)}</a><div class="w"><span class="stt rs-${esc(r.blk ? "fail" : r.st)}">${esc(r.blk ? "Needs a desk" : RQN[r.st] || r.st)}</span><span>${esc(r.blk ? r.blk : r.st === "wait" && r.ask ? r.n || r.flow : w ? (r.nt === "check" ? w.n + " checks" : w.n + " works") : "Pipeline")}</span><span>${r.more ? `run ${r.id} and ${r.more} more` : `run ${r.id}`}${r.skip ? ` · ${r.skip} ${r.skip === 1 ? "start" : "starts"} skipped` : ""}${r.t0 ? ` · ${ago(r.t0)}` : ""}</span></div></div><span class="rp">${r.st === "wait" ? `<button data-run="${r.id}" title="See what the run did before you answer">Review</button><button class="go" data-ry="${r.id}">Yes</button><button data-rn="${r.id}">No</button>` : r.blk ? `<button data-desk="1">Edit office</button>` : ""}</span></div>`; };
  const lists = () => {
    const q = S.q, rx = S.rn || [];
    $("qn").textContent = [q.length ? q.length + (q.length === 1 ? " open job" : " open jobs") : "", rx.length ? rx.length + (rx.length === 1 ? " run" : " runs") : ""].filter(Boolean).join(" · ");
    const aps = q.filter((j) => j.st === "approve").map((j) => j.id);
    for (const k of [...sel]) if (!aps.includes(k)) sel.delete(k);
    const bk = aps.length > 1 ? `<div class="bkb"><label class="ck"><input type="checkbox" id="bkA" ${sel.size === aps.length ? "checked" : ""}> all ${aps.length}</label><span class="sp"></span>${sel.size ? `<button class="go" id="bkS">submit ${sel.size}</button><button class="dng" id="bkD">drop ${sel.size}</button>` : `<span class="k">select pull requests to submit together</span>`}</div>` : "";
    const bw = new Set();
    const rs = [...rx].filter((r) => { if (!r.blk || !r.w) return true; if (bw.has(r.w)) return false; bw.add(r.w); return true; }).map((r) => r.blk && r.w ? { ...r, more: rx.filter((x) => x.blk && x.w === r.w).length - 1 } : r).sort((a, b) => (a.st === "wait" ? 0 : a.st === "run" ? 1 : 2) - (b.st === "wait" ? 0 : b.st === "run" ? 1 : 2));
    const nw = rs.filter((r) => r.st === "wait"), rest = rs.filter((r) => r.st !== "wait"), apj = q.filter((j) => j.st === "approve").length;
    $("queue").innerHTML = (nw.length || apj ? `<div class="sub">Needs you</div>` : "") + bk + nw.map(rrow).join("") + q.filter((j) => j.st === "approve").map((j) => jrow(j, true)).join("") + (nw.length || apj ? `<div class="sub">Working and waiting</div>` : "") + rest.map(rrow).join("") + (q.length ? q.filter((j) => j.st !== "approve").slice(0, 16).map((j) => jrow(j, true)).join("") : rs.length ? "" : `<div class="empty">Nothing waiting.</div>`) + (S.dn.length ? `<div class="sub">Recent</div>` + S.dn.slice(0, 12).map((j) => jrow(j, false)).join("") : "");
    const op = S.pr.filter((p) => p.st === "open").length, mg = S.pr.filter((p) => p.st === "merged").length;
    $("prn").textContent = `${op} open · ${mg} merged`;
    $("prs").innerHTML = S.pr.length ? S.pr.slice(0, 16).map((p) => `<div class="row jr"><div class="ti"><a class="a" href="#" data-u="${esc(p.url)}">${esc(p.title)}</a><div class="w"><span class="stt pr-${esc(p.st)}">${esc(p.st[0].toUpperCase() + p.st.slice(1))}</span><span>${esc(rn({ repo: p.repo, num: p.num }))}</span></div></div></div>`).join("") : `<div class="empty">No pull requests yet.</div>`;
    const m = Object.fromEntries(S.mg.map((x) => [x.day, x.n]));
    const days = [...Array(30)].map((_, i) => new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10));
    const mx = Math.max(1, ...days.map((d) => m[d] || 0));
    $("bars").innerHTML = days.map((d) => `<i class="${m[d] ? "" : "z"}" style="height:${m[d] ? Math.max(8, (m[d] / mx) * 100) : 2}%" title="${d}: ${m[d] || 0}"></i>`).join("");
    rlog();
  };

  const chips = () => {
    const o = S.o;
    const n = $("cNet");
    if (o.off) { n.className = "chip bad"; n.innerHTML = "offline · " + Object.entries(o.net).filter(([k, v]) => !v && (k === "gh" || k === "an")).map(([k]) => ({ gh: "GitHub", an: "Anthropic" })[k]).join(", "); }
    else if (o.man) { n.className = "chip"; n.textContent = "paused"; }
    else if (o.pause) { n.className = "chip bad"; n.textContent = o.pause; }
    else if (o.warn) { n.className = "chip bad"; n.textContent = "Claude usage near its limit"; }
    else { n.className = "chip ok"; n.textContent = "online"; }
    $("cHo").title = "Machines: white is online, red is offline";
    $("cHo").innerHTML = (S.hs || []).filter((h) => h.on_).map((h) => `<b style="color:${o.net[h.id] === false ? "var(--bad)" : "var(--t1)"}">${esc(h.id)}</b>`).join(" ") || "no machine";
    const a = S.n, rx = S.rn || [], cn = (st) => rx.filter((r) => r.st === st).length;
    const wk = ["hunt", "repro", "fix", "ci", "review", "gate", "submit"].reduce((s, k) => s + (a[k] || 0), 0);
    $("cQ").innerHTML = `running <b>${wk + cn("run")}</b> · <a href="#/jobs" class="wfy" title="Open what waits for your answer">waiting for you <b>${(a.approve || 0) + cn("wait")}</b></a> · waiting to start <b>${(a.vet || 0) + (a.ready || 0) + cn("queued")}</b> · done <b>${a.done || 0}</b>`;
    $("bPause").textContent = o.man ? "Resume office" : "Pause office";
    $("ban").hidden = !S.star;
    document.body.classList.toggle("sb", !!S.star);
  };

  let seen = null;
  const nt = (s) => {
    const ap = s.q.filter((j) => j.st === "approve");
    const ids = new Set(ap.map((j) => j.id));
    if (seen) {
      let on = false;
      try { on = localStorage.getItem("ao.nt") === "1"; } catch {}
      if (on && "Notification" in window && Notification.permission === "granted" && !document.hasFocus()) {
        for (const j of ap) if (!seen.has(j.id)) {
          const n = new Notification("Pull request ready for review", { body: rn(j) + " · " + j.title, tag: "ao-" + j.id });
          n.onclick = () => { window.focus(); window.AO.job && window.AO.job(j.id); n.close(); };
        }
      }
    }
    seen = ids;
  };
  const apply = (s) => { if (!s || s.error) return; nt(s); for (const r of s.rn || []) { const pv = RW[r.id]; if (r.w && pv && pv !== r.w) LF.push({ a: pv, b: r.w, t: s.t }); if (r.w) RW[r.id] = r.w; } S = s; last = performance.now(); err = 0; const fe = document.body.classList.contains("fed"); if (!fe) { tiles(); lists(); } chips(); tip(); window.AO.S = s; window.AO.onState && window.AO.onState(s); };
  window.AO.apply = apply;

  document.addEventListener("change", (e) => {
    if (e.target.id === "bkA") { const aps = S.q.filter((j) => j.st === "approve").map((j) => j.id); sel.clear(); if (e.target.checked) aps.forEach((k) => sel.add(k)); lists(); return; }
    if (e.target.classList.contains("bk")) { const k = Number(e.target.dataset.k); e.target.checked ? sel.add(k) : sel.delete(k); lists(); }
  });
  document.addEventListener("click", async (e) => {
    if (e.target.id === "bkS" || e.target.id === "bkD") {
      const b = e.target, dr = b.id === "bkD";
      if (dr && b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "click again to drop " + sel.size; return; }
      b.disabled = true;
      const ids = [...sel];
      let r = null;
      for (const id of ids) r = await post({ a: dr ? "drop" : "approve", id });
      sel.clear();
      apply(r);
      return;
    }
    const a = e.target.closest("[data-u]");
    if (a) { e.preventDefault(); open(a.dataset.u); return; }
    const d = e.target.closest("[data-d]");
    if (d) { post({ a: "drop", id: Number(d.dataset.d) }).then(apply); return; }
    const rq = e.target.closest("[data-rq]");
    if (rq) { post({ a: "requeue", id: Number(rq.dataset.rq) }).then(apply); return; }
    const wf = e.target.closest(".wfy");
    if (wf) { e.preventDefault(); const rw = (S.rn || []).some((r) => r.st === "wait"); try { localStorage.setItem("ao.wt", rw ? "runs" : "jobs"); } catch {} window.AO.runFilter = rw ? "wait" : ""; window.AO.go("jobs"); return; }
    const ry = e.target.closest("[data-ry],[data-rn]");
    if (ry && ry.closest("#queue")) { const id = ry.dataset.ry || ry.dataset.rn; fetch(`/api/v2/runs/${id}/answer`, { method: "POST", headers: { "content-type": "application/json", "x-ao": "1" }, body: JSON.stringify({ yes: !!ry.dataset.ry }) }).then(() => get("/api/state")).then(apply); return; }
    const dk = e.target.closest("[data-desk]");
    if (dk && dk.closest("#queue")) { $("bCz").click(); return; }
    const ru = e.target.closest("[data-run]");
    if (ru && ru.closest("#queue")) { e.preventDefault(); window.AO.runView && window.AO.runView(Number(ru.dataset.run)); return; }
    const jb = e.target.closest("[data-j]");
    if (jb) { e.preventDefault(); window.AO.job && window.AO.job(Number(jb.dataset.j)); }
  });
  const SUN = `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
  const MOON = `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>`;
  const thb = () => { if (S) lists(); $("bTh").innerHTML = lt() ? MOON : SUN; $("bTh").title = lt() ? "Switch to dark" : "Switch to light"; };
  thb();
  new MutationObserver(thb).observe(document.documentElement, { attributes: true, attributeFilter: ["data-th"] });
  $("bTh").onclick = () => window.TH.set(lt() ? "dark" : "light");
  let H = null;
  const HK = [["gh", "GitHub"], ["ai", "AI"], ["docker", "Docker"], ["hosts", "Machines"]];
  const hlt = async (f) => {
    try { H = await get("/api/health" + (f ? "?f=1" : "")); } catch { return; }
    const el = $("cH"), bad = HK.filter(([k]) => H[k] && !H[k].ok);
    el.hidden = false;
    el.className = "chip hc" + (bad.length ? " bad" : "");
    el.innerHTML = HK.map(([k, l]) => `<i class="${H[k]?.ok ? "" : "no"}" title="${l}"></i>`).join("") + (bad.length ? " " + bad.map(([, l]) => l).join(", ") : "");
    el.title = bad.length ? "problems: " + bad.map(([, l]) => l).join(", ") : "everything ok";
    window.AO.H = H;
    return H;
  };
  window.AO.hlt = hlt;
  $("cH").onclick = () => window.AO.go && window.AO.go("health");
  hlt();
  setInterval(() => hlt(), 300000);
  $("bPause").onclick = () => post({ a: "pause", on: !S.o.man }).then(apply);
  $("bStar").onclick = (e) => { e.target.disabled = true; post({ op: "star" }, "/api/star").then((r) => { e.target.disabled = false; if (r.error) { e.target.textContent = "Could not star, try again"; return; } apply(r); }); };
  $("bLater").onclick = () => post({ op: "later" }, "/api/star").then(apply);

  const bar = (v, mx) => { const p = Math.max(0, Math.min(100, (v / mx) * 100)); return `<span class="bar"><i class="${p > 85 ? "hi" : ""}" style="width:${p.toFixed(0)}%"></i></span>`; };
  const gb = (m) => (m / 1024).toFixed(m < 10240 ? 1 : 0);
  const tr = (k, v) => `<div class="tr"><span class="k">${k}</span><span>${v}</span></div>`;
  const wtip = (h) => {
    const w = S.w[h.n] || {}, q = h.q || (w.job && S.q.find((x) => x.id === w.job));
    const st = w.hold ? "held" : S.o.man || S.o.pause ? "paused" : h.q ? "work" : w.st || "idle";
    const cs = (w.cmds || []).length ? w.cmds.slice(-4).reverse() : S.ev.filter((e) => e.w === h.n).slice(0, 3).map((e) => [e.t, e.m]);
    return `<div class="th"><b>${esc(NM[h.n])}</b><span>${esc(mdn(w.md))}</span></div>`
      + tr("status", esc(st) + (w.tk ? ` · ${kt(w.tk)} tok today` : ""))
      + (w.cs && (w.cs[0] || w.cs[1]) ? tr("cost", [w.cs[0] ? AO.usd(w.cs[0]) + " API" : "", w.cs[1] ? AO.usd(w.cs[1]) + " login value" : ""].filter(Boolean).join(" · ") + " today") : "")
      + (q ? tr("job", `${esc(rn(q))} · ${esc(q.title)} <span class="k">${esc(q.st)}</span>`) : "")
      + (w.say && !h.q ? tr("says", esc(w.say) + ` <span class="k">${ago(w.t)}</span>`) : "")
      + (cs.length ? `<div class="tc">${cs.map(([t, c]) => `<div><span class="k">${ago(t)}</span><span>${esc(c)}</span></div>`).join("")}</div>` : "")
      + (q ? `<div class="tf">click to open the job</div>` : "");
  };
  const ptip = (h) => {
    if (core(h.p)) return wtip({ n: h.p });
    const w = (S.crew || []).find((x) => x.id === h.p) || {}, rs = (S.rn || []).filter((r) => r.w === h.p), k = "c:" + h.p;
    const sit = seats().ids.has(h.p);
    const cs = S.ev.filter((e) => e.w === k).slice(0, 3);
    return `<div class="th"><b>${esc(w.n || h.p)}</b><span>${esc(w.r || "")}</span></div>`
      + tr("model", esc(mdn(w.md || "") || "default model"))
      + tr("status", !sit ? `<span class="bad2">needs a desk with a chair</span>` : rs.some((r) => r.st === "run" && !r.blk) ? "working" : S.o.man ? "paused" : "idle")
      + rs.map((r) => tr("run", `${esc(r.n || r.flow)} <span class="k">run ${r.id}</span>`)).join("")
      + (cs.length ? `<div class="tc">${cs.map((e) => `<div><span class="k">${ago(e.t)}</span><span>${esc(e.m)}</span></div>`).join("")}</div>` : "")
      + `<div class="tf">${!sit ? "place a desk and a chair in Edit office" : rs.length ? "click to open the run" : "click to open Team"}</div>`;
  };
  const htip = (h) => {
    const x = (S.hs || []).find((y) => y.id === h.h) || {}, m = S.hst?.[h.h], down = S.o.net?.[h.h] === false;
    const js = S.q.filter((q) => q.h === h.h && ["repro", "fix", "ci", "review", "gate", "submit"].includes(q.st));
    let r = `<div class="th"><b>${esc(h.h === "local" ? "this computer" : h.h)}</b><span>${x.dk ? "Docker" : "no Docker"}</span></div>`
      + tr("status", down ? `<span class="bad2">offline</span>` : `<span class="ok2">online</span> · ${js.length}/${x.ln || 0} lanes busy`);
    if (m) {
      if (m.cpu) r += tr("cpu", `${m.cpu} cores · load ${m.load ?? "?"}${m.load != null ? bar(m.load, m.cpu) : ""}`);
      if (m.mem) r += tr("ram", `${gb(m.mem[0] - m.mem[1])} / ${gb(m.mem[0])} GB${bar(m.mem[0] - m.mem[1], m.mem[0])}`);
      if (m.disk) r += tr("disk", `${m.disk[1]} GB free of ${m.disk[0]}${bar(m.disk[0] - m.disk[1], m.disk[0])}`);
      if (m.temp != null) r += tr("temp", `<span class="${m.temp >= 85 ? "bad2" : ""}">${m.temp} °C</span>`);
      if (m.up) r += tr("up", esc(m.up) + ` <span class="k">· seen ${ago(m.t)} ago</span>`);
    } else r += tr("", `<span class="k">no hardware data yet</span>`);
    if (js.length) r += `<div class="tc">${js.map((q) => `<div><span class="k">${esc(q.st)}</span><span>${esc(rn(q))} · ${esc(q.title)}</span></div>`).join("")}</div>`;
    return r + `<div class="tf">click to edit machines</div>`;
  };
  const tip = () => {
    const el = $("tip"), h = hov && hits.find((x) => x.k === hov);
    if (!h || !S) { el.hidden = true; return; }
    el.innerHTML = h.h ? htip(h) : h.p ? ptip(h) : wtip(h);
    el.hidden = false;
    const r = el.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
    el.style.left = Math.min(mx + 16, W - r.width - 8) + "px";
    el.style.top = (my + 16 + r.height > H - 8 ? Math.max(8, my - r.height - 12) : my + 16) + "px";
  };
  const at = (e) => { const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * VW / r.width, y = (e.clientY - r.top) * VH / r.height; return hits.slice().reverse().find((h) => x >= h.b[0] && x <= h.b[2] && y >= h.b[1] && y <= h.b[3]); };
  cv.addEventListener("mousemove", (e) => {
    mx = e.clientX; my = e.clientY;
    const h = at(e);
    hov = h ? h.k : null;
    cv.style.cursor = h && (h.h || h.p || h.q || (S?.w?.[h.n]?.job)) ? "pointer" : "";
    tip();
  });
  cv.addEventListener("mouseleave", () => { hov = null; cv.style.cursor = ""; tip(); });
  cv.addEventListener("click", (e) => {
    const h = at(e);
    if (!h) return;
    if (h.h) return window.AO.go && window.AO.go("machines");
    if (h.p) { const r = (S.rn || []).find((x) => x.w === h.p); if (!seats().wait.includes(h.p) && r) return window.AO.runView && window.AO.runView(r.id); if (seats().wait.includes(h.p)) return $("bCz").click(); return window.AO.go && window.AO.go("team"); }
    const id = h.q?.id || S?.w?.[h.n]?.job;
    if (id && S.q.some((q) => q.id === id)) window.AO.job && window.AO.job(id);
  });
  let wok = false;
  const live = () => {
    let w;
    try { w = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/api/ws"); } catch { return setTimeout(live, 5000); }
    w.onmessage = (e) => { wok = true; try { apply(JSON.parse(e.data)); } catch {} };
    w.onclose = () => { wok = false; setTimeout(live, 3000); };
  };
  const poll = async () => {
    if (!wok) {
      try { apply(await get("/api/state")); } catch {
        if (++err > 2) { $("cNet").className = "chip bad"; $("cNet").textContent = "ApolloOffice not reachable"; }
      }
    }
    setTimeout(poll, 1000);
  };
  get("/api/cfg").then((c) => (window.AO.pord = (c?.set?.pipe?.steps || []).map((x) => x.id), window.AO.surf.load(c?.set?.office), window.AO.furn.loadRoom(c?.set?.office?.size), window.AO.furn.load(c?.set?.office?.items))).catch(() => {});
  poll();
  live();
  requestAnimationFrame(frame);
})();
