(() => {
const A = (window.A = {});
const L = (s) => ({ small: "small", medium: "medium", large: "large", low: "low", high: "high", max: "max", wait: "waiting", run: "running", done: "done", fail: "failed", rej: "rejected" })[s] ?? s;
const T = 16, MW = 20, MH = 12;
const $ = (i) => document.getElementById(i);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const mix = (h, t, k) => { const a = parseInt(h.slice(1), 16), b = parseInt(t.slice(1), 16); return "#" + [16, 8, 0].map((s) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k).toString(16).padStart(2, "0")).join(""); };
const sk = (c) => ({ body: c, dark: mix(c, "#000000", .28), light: mix(c, "#ffffff", .35) });
const rnd = (a, b) => a + Math.random() * (b - a);
Object.assign(A, { T, MW, MH, $, esc, mix, sk, rnd, L });

const SHOT = /[?&]shot\b/.test(location.search);
const api = async (p, b, m) => {
  if (SHOT) {
    const x = new XMLHttpRequest();
    x.open(m || (b === undefined ? "GET" : "POST"), p, false);
    x.setRequestHeader("x-ao", "1");
    if (b !== undefined) x.setRequestHeader("content-type", "application/json");
    x.send(b === undefined ? null : typeof b === "string" ? b : JSON.stringify(b));
    let j = null;
    try { j = JSON.parse(x.responseText); } catch { j = x.responseText; }
    if (x.status >= 400) throw new Error((j && j.error) || String(x.status));
    return j;
  }
  const o = { method: m || (b === undefined ? "GET" : "POST"), headers: { "x-ao": "1" } };
  if (b !== undefined) { o.headers["content-type"] = "application/json"; o.body = typeof b === "string" ? b : JSON.stringify(b); }
  const r = await fetch(p, o);
  if (r.status === 401) { location.reload(); throw new Error("not logged in"); }
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch { j = t; }
  if (!r.ok) throw new Error((j && j.error) || r.statusText);
  return j;
};
A.api = api;

const FT = {
  basement: { fl: ["#1a1c1f", "#1d1f23"], wl: ["#2b2e33", "#16181b"] },
  lobby: { fl: ["#1c1e22", "#202227"], wl: ["#2c3036", "#17191c"] },
  office: { fl: ["#1b1d21", "#1f2125"], wl: ["#2a2d33", "#16181b"] },
  lounge: { fl: ["#1b1f1e", "#1f2322"], wl: ["#2a302e", "#161a19"] },
  server: { fl: ["#181b20", "#1b1e24"], wl: ["#262b33", "#13161a"] },
  accounting: { fl: ["#1c1c22", "#202027"], wl: ["#2c2c35", "#17171c"] },
  shell: { fl: ["#202020", "#242424"], wl: ["#303030", "#1a1a1a"] },
};
const KN = { basement: "Basement", lobby: "Lobby", office: "Office", lounge: "Lounge", server: "Server room", accounting: "Accounting", shell: "Shell floor" };
const FS = { desk: [2, 1], couch: [2, 1], plant: [1, 1], rack: [1, 2], gen: [2, 2], lift: [2, 2], tray: [1, 1], counter: [3, 1], board: [2, 1], coffee: [1, 1], plan: [2, 1], chart: [2, 1], table: [2, 2], stairs: [2, 2], screen: [2, 1] };
const FN = { desk: "Desk", couch: "Couch", plant: "Plant", rack: "Server rack", gen: "Generator", lift: "Lift", tray: "Tray", counter: "Reception", board: "HR office", coffee: "Coffee", plan: "Blueprint", chart: "Chart wall", table: "Table", stairs: "Stairs", screen: "Screen" };
const WALL = new Set(["lift", "stairs", "board", "chart", "screen"]);
const WALKOK = new Set(["tray"]);
const COLS = ["#d97757", "#3fb6a8", "#9c7ae0", "#5c7fd6", "#d0649f", "#62b86f", "#c4614d", "#4f9fc4", "#8a6fd1", "#a8574f"];
Object.assign(A, { FT, KN, FS, FN, WALL, COLS });

const cv = $("cv"), cx = cv.getContext("2d");
const wd = document.createElement("canvas"); wd.width = MW * T; wd.height = MH * T;
let w = wd.getContext("2d");
const fig = document.createElement("canvas"); fig.width = K.W; fig.height = K.H;
const fc = fig.getContext("2d");
const px = (x, y, c, ww = 1, hh = 1) => { w.fillStyle = c; w.fillRect(x, y, ww, hh); };

const ACC = {
  tophat: (r, c) => { K.px(fc, r.cx - 3, r.top - 6, c, 7, 5); K.px(fc, r.cx - 5, r.top - 1, c, 11, 1); K.px(fc, r.left + 1, r.top + 5, c, r.bw - 2, 4); K.px(fc, r.cx - 1, r.top + 5, "#e8e6df", 2, 4); K.px(fc, r.cx, r.top + 6, "#cf6f7e", 1, 3); },
  antenna: (r, c, t) => { K.px(fc, r.cx, r.top - 4, mix(c, "#000000", .3), 1, 4); K.px(fc, r.cx - 1, r.top - 6, Math.floor(t * 3) % 2 ? "#e8e6df" : c, 3, 2); },
  glasses: (r, c) => { const y = r.eyeY - 1; for (const x of [r.cx - 5, r.cx + 2]) { K.px(fc, x, y, c, 4, 1); K.px(fc, x, y + 3, c, 4, 1); K.px(fc, x, y, c, 1, 4); K.px(fc, x + 3, y, c, 1, 4); } K.px(fc, r.cx - 1, y + 1, c, 3, 1); },
  apron: (r, c) => { K.px(fc, r.left + 1, r.top + 6, c, r.bw - 2, 3); K.px(fc, r.right - 4, r.top + 8, c, 2, 2); },
  cap: (r, c) => { K.px(fc, r.left - 1, r.top - 1, c, r.bw + 2, 1); K.px(fc, r.left + 2, r.top - 3, c, r.bw - 4, 2); },
  scarf: (r, c) => { K.px(fc, r.left, r.top + 1, c, r.bw, 2); K.px(fc, r.left - 2, r.top + 2, c, 2, 3); },
  bun: (r, c) => { K.px(fc, r.cx - 2, r.top - 4, c, 5, 4); K.px(fc, r.left + 1, r.top + 5, "#e8e6df", r.bw - 2, 1); },
  badge: (r, c) => { K.px(fc, r.right - 5, r.top + 4, c, 3, 3); K.px(fc, r.right - 4, r.top + 5, "#e8e6df", 1, 1); },
  headset: (r, c) => { K.px(fc, r.left - 1, r.top - 2, c, r.bw + 2, 1); K.px(fc, r.left - 1, r.top - 2, c, 1, 5); K.px(fc, r.right, r.top - 2, c, 1, 5); K.px(fc, r.right - 3, r.top + 3, c, 3, 1); },
  magnifier: (r, c) => { K.px(fc, r.right + 1, r.top - 1, c, 4, 1); K.px(fc, r.right + 1, r.top + 2, c, 4, 1); K.px(fc, r.right + 1, r.top - 1, c, 1, 4); K.px(fc, r.right + 4, r.top - 1, c, 1, 4); K.px(fc, r.right + 1, r.top + 3, "#8a5b3b", 1, 3); },
  shades: (r, c) => { K.px(fc, r.cx - 6, r.eyeY - 1, c, 13, 1); K.px(fc, r.cx - 5, r.eyeY, c, 4, 2); K.px(fc, r.cx + 2, r.eyeY, c, 4, 2); },
  hat: (r, c) => { K.px(fc, r.left - 2, r.top - 1, c, r.bw + 4, 1); K.px(fc, r.left + 2, r.top - 4, c, r.bw - 4, 3); K.px(fc, r.left + 2, r.top - 2, mix(c, "#000000", .35), r.bw - 4, 1); },
  pen: (r, c) => { K.px(fc, r.right - 1, r.top - 4, c, 1, 5); K.px(fc, r.right - 1, r.top - 5, "#e8e6df", 1, 1); },
  tie: (r, c) => { K.px(fc, r.cx - 1, r.top + 5, c, 2, 4); K.px(fc, r.cx - 2, r.top + 5, c, 4, 1); },
  beanie: (r, c) => { K.px(fc, r.left, r.top - 2, c, r.bw, 3); K.px(fc, r.cx - 1, r.top - 4, c, 2, 2); },
  shield: (r, c) => { K.px(fc, r.left - 4, r.top + 3, c, 4, 5); K.px(fc, r.left - 3, r.top + 8, c, 2, 1); },
  headband: (r, c) => { K.px(fc, r.left, r.top, c, r.bw, 1); K.px(fc, r.right, r.top + 1, c, 2, 2); },
};
A.ACC = ACC;

A.S = null;
A.F = {};
A.E = {};
A.cur = 0;
A.sel = null;
A.fol = null;
A.bld = null;
A.tm = 0;
A.view = { sc: 3, ox: 0, oy: 0 };
A.pan = { x: 0, y: 0 };
A.usage = null;

const lvlName = (l) => (l === 0 ? "B" : l === 1 ? "G" : l - 1 + ". " + "F");
A.lvlName = lvlName;
const flo = (id) => A.F[id];
A.flo = flo;
const fls = () => (A.S ? A.S.fl : []);

const occ = (f, x, y) => (f.lay.fu || []).find((u) => x >= u.x && x < u.x + FS[u.k][0] && y >= u.y && y < u.y + FS[u.k][1]);
const tile = (f, x, y) => (f.lay.t[y] ? f.lay.t[y][x] : 0);
const walk = (f, x, y) => x >= 0 && y >= 0 && x < MW && y < MH && (tile(f, x, y) === 1 || tile(f, x, y) === 3) && (!occ(f, x, y) || WALKOK.has(occ(f, x, y).k));
const liftExit = (f) => { const l = (f.lay.fu || []).find((u) => u.k === "lift") || { x: 2, y: 0 }; return [l.x, l.y + 2]; };
const seat = (u) => [u.x + 1, u.y - 1];
A.occ = occ; A.walk = walk; A.liftExit = liftExit;

const path = (f, a, b) => {
  const key = (x, y) => y * MW + x, Q = [[a[0], a[1]]], pv = new Map([[key(a[0], a[1]), null]]);
  let qi = 0;
  while (qi < Q.length) {
    const [x, y] = Q[qi++];
    if (x === b[0] && y === b[1]) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (pv.has(k) || !(walk(f, nx, ny) || (nx === b[0] && ny === b[1]))) continue;
      pv.set(k, key(x, y)); Q.push([nx, ny]);
    }
  }
  if (!pv.has(key(b[0], b[1]))) return null;
  const out = []; let k = key(b[0], b[1]);
  while (k !== null && k !== key(a[0], a[1])) { out.unshift([k % MW, Math.floor(k / MW)]); k = pv.get(k); }
  return out;
};

const wInfo = (id) => (A.S ? A.S.w.find((x) => x.id === id) : null);
A.wInfo = wInfo;

const lounges = () => fls().filter((f) => f.k === "lounge" && flo(f.id));
const target = (e, i) => {
  const s = i.live || {};
  const set = A.S.set || {};
  if (s.st === "off" && set.lounge !== false) {
    for (const lf of lounges()) {
      const f = flo(lf.id);
      const seats = (f.lay.fu || []).filter((u) => u.k === "couch").flatMap((u) => [[u.x, u.y], [u.x + 1, u.y]]);
      const taken = Object.values(A.E).filter((o) => o !== e && o.gl && o.gl.fl === lf.id).map((o) => o.gl.to.join());
      const s2 = seats.find((p) => !taken.includes(p.join()));
      if (s2) return { fl: lf.id, to: s2, then: "lz" };
    }
  }
  const f = flo(i.fl);
  if (!f) return null;
  const d = (f.lay.fu || []).find((u) => u.k === "desk" && u.id === i.desk);
  if (!d) return { fl: i.fl, to: liftExit(f), then: "idle" };
  return { fl: i.fl, to: seat(d), then: "sit" };
};

const go = (e, g) => {
  e.goal = g;
  e.gl = g;
  if (e.fl !== g.fl) { const f = flo(e.fl); e.p = f ? path(f, [e.x, e.y], liftExit(f)) || [] : []; e.st = "walk"; e.lift = 1; return; }
  const f = flo(e.fl);
  e.p = f ? path(f, [e.x, e.y], g.to) || [] : [];
  e.st = "walk"; e.lift = 0;
  if (!e.p.length && (e.x !== g.to[0] || e.y !== g.to[1])) { e.x = g.to[0]; e.y = g.to[1]; e.fx = e.x * T; e.fy = e.y * T; }
};
A.go = go;

const bubble = (e, s, d = 4) => { e.say = String(s || ""); e.sy = d; };
A.bubble = bubble;

let lastFlow = Date.now();
A.sync = (fresh) => {
  const S = A.S;
  const seen = new Set();
  for (const i of S.w) {
    seen.add(i.id);
    let e = A.E[i.id];
    const f = flo(i.fl);
    if (!f) continue;
    if (!e) {
      const t = target({}, i) || { fl: i.fl, to: liftExit(f) };
      const st = fresh ? t : { fl: i.fl, to: liftExit(f) };
      const sf = flo(st.fl) || f;
      e = A.E[i.id] = { id: i.id, fl: sf.id, x: st.to[0], y: st.to[1], fx: st.to[0] * T, fy: st.to[1] * T, p: [], st: fresh ? (t.then === "lz" ? "lz" : "sit") : "idle", face: 1, say: "", sy: 0, mood: "", mt: 0, lt: 0, mtT: 0, gl: fresh ? t : null };
      if (!fresh) { bubble(e, "Hello!"); }
    }
    e.i = i;
    const lv = i.live || {};
    if (lv.t && lv.t !== e.lt) {
      e.lt = lv.t;
      if (lv.say && Date.now() - lv.t < 12000 && !(lv.say.startsWith("→") && Math.random() < .5)) bubble(e, lv.say.replace(/^→\s*/, ""), 4);
      if (lv.mood && lv.mood !== "" && Date.now() - lv.t < 8000) { e.mood = lv.mood; e.mt = lv.mood === "ok" ? 2.2 : 3; }
    }
    if (e.st !== "walk" && e.st !== "lift" && !e.hand) {
      const t = target(e, i);
      if (t && (e.fl !== t.fl || e.x !== t.to[0] || e.y !== t.to[1])) go(e, t);
      else if (t) { e.gl = t; e.st = t.then === "lz" ? "lz" : "sit"; }
    }
  }
  for (const k of Object.keys(A.E)) if (!seen.has(+k)) delete A.E[k];
  for (const f of S.flow || []) {
    if (f.t <= lastFlow) continue;
    const e = A.E[f.a];
    if (!e || e.st === "walk" || e.st === "lift") continue;
    if (f.k === "tray") {
      const fl = flo(e.fl), tr = fl && (fl.lay.fu || []).find((u) => u.k === "tray");
      if (tr) { e.hand = 1; go(e, { fl: e.fl, to: [tr.x, tr.y + 1], then: "drop" }); }
    } else {
      const b = A.E[f.b];
      if (!b || b.fl !== e.fl) continue;
      const fl = flo(e.fl);
      const nb = [[b.x - 1, b.y], [b.x + 1, b.y], [b.x, b.y + 1], [b.x - 1, b.y + 1], [b.x + 1, b.y + 1]].find(([x, y]) => walk(fl, x, y));
      if (nb) { e.hand = 1; e.hk = f.k; go(e, { fl: e.fl, to: nb, then: "hand" }); }
    }
  }
  lastFlow = Math.max(lastFlow, ...(S.flow || []).map((f) => f.t), lastFlow);
};

const arrive = (e) => {
  const g = e.goal || {};
  if (e.lift) { e.st = "lift"; e.tw = 1.1; return; }
  if (g.then === "drop") { e.mood = "ok"; e.mt = 1.6; e.st = "idle"; setTimeout(() => { e.hand = 0; const t = target(e, e.i); if (t) go(e, t); }, 1200); return; }
  if (g.then === "hand") { bubble(e, e.hk === "ask" ? "Quick question…" : e.hk === "answer" ? "Here is the answer" : "Task for you", 2.4); e.st = "idle"; setTimeout(() => { e.hand = 0; const t = target(e, e.i); if (t) go(e, t); }, 1600); return; }
  e.st = g.then === "lz" ? "lz" : g.then === "sit" ? "sit" : "idle";
};

A.step = (dt) => {
  A.tm += dt;
  for (const e of Object.values(A.E)) {
    if (e.sy > 0) e.sy -= dt;
    if (e.mt > 0) { e.mt -= dt; if (e.mt <= 0) e.mood = ""; }
    if (e.st === "lift") {
      e.tw -= dt;
      if (e.tw <= 0) {
        const f = flo(e.goal.fl);
        if (!f) { e.st = "idle"; continue; }
        e.fl = f.id; const x = liftExit(f); e.x = x[0]; e.y = x[1]; e.fx = e.x * T; e.fy = e.y * T; e.lift = 0;
        e.p = path(f, [e.x, e.y], e.goal.to) || []; e.st = "walk";
      }
      continue;
    }
    if (e.st === "walk") {
      if (!e.p.length) { arrive(e); continue; }
      const [nx, ny] = e.p[0], tx = nx * T, ty = ny * T, sp = 44 * dt;
      const dx = tx - e.fx, dy = ty - e.fy, d = Math.hypot(dx, dy);
      if (dx) e.face = dx < 0 ? -1 : 1;
      if (d <= sp) { e.fx = tx; e.fy = ty; e.x = nx; e.y = ny; e.p.shift(); }
      else { e.fx += dx / d * sp; e.fy += dy / d * sp; }
    }
  }
};

const accOf = (id) => (A.S ? A.S.acc.find((a) => a.id === id) : null);
const srvOf = (id) => (A.S ? A.S.srv.find((a) => a.id === id) : null);
A.accOf = accOf; A.srvOf = srvOf;

const drawTile = (f, x, y) => {
  const ft = FT[f.k] || FT.office, v = tile(f, x, y), X = x * T, Y = y * T;
  if (v === 0) { px(X, Y, "#0f1013", T, T); return; }
  if (v === 3) { px(X, Y, (x + y) % 2 ? "#232323" : "#262626", T, T); if ((x * 7 + y * 3) % 11 === 0) px(X + 5, Y + 7, "#5f5a54", 3, 2); if ((x * 5 + y) % 13 === 0) px(X + 9, Y + 3, "#3a3836", 4, 1); return; }
  if (v === 1) { px(X, Y, (x + y) % 2 ? ft.fl[0] : ft.fl[1], T, T); return; }
  const below = y + 1 < MH && (tile(f, x, y + 1) === 1 || tile(f, x, y + 1) === 3);
  px(X, Y, ft.wl[1], T, T);
  if (below) {
    px(X, Y, ft.wl[0], T, T); px(X, Y + T - 3, mix(ft.wl[1], "#000000", .25), T, 3);
    if (y === 1 && x % 4 === 2 && !["basement", "server", "shell"].includes(f.k) && !occ(f, x, y)) { px(X + 2, Y + 2, "#121417", 12, 10); px(X + 3, Y + 3, "#23384a", 10, 8); px(X + 8, Y + 3, "#121417", 1, 8); px(X + 3, Y + 7, "#121417", 10, 1); px(X + 4, Y + 4, "#35546d", 2, 2); }
    else if (y === 1 && x % 7 === 5 && (f.k === "lobby" || f.k === "lounge") && !occ(f, x, y)) { px(X + 3, Y + 3, "#55524b", 10, 8); px(X + 4, Y + 4, ["#d97757", "#3fb6a8", "#9c7ae0"][x % 3], 8, 6); }
    else if (y === 1 && f.k === "server" && x % 3 === 0 && !occ(f, x, y)) { px(X + 6, Y + 2, "#2a2e33", 4, 4); px(X + 7, Y + 3, Math.floor(A.tm * 2 + x) % 2 ? "#62b86f" : "#2b3a2e", 2, 2); }
  } else px(X, Y, mix(ft.wl[1], "#000000", .15), T, T);
};

const genState = (a) => {
  if (!a) return { on: 0, u: 0, s: "off" };
  const s = a.st || {};
  return { on: 1, u: Math.min(1, (s.pct || 0) / 100), s: s.s || "run" };
};

const doneOn = (fid) => (A.S && (A.S.done || []).find((d) => d.fl === fid) || {}).n || 0;
const cntOn = (fid, st) => (A.S && (A.S.cnt || []).filter((d) => d.fl === fid && d.st === st).reduce((a, b) => a + b.n, 0)) || 0;

const drawFu = (f, u) => {
  const X = u.x * T, Y = u.y * T, t = A.tm;
  switch (u.k) {
    case "desk": {
      const own = A.S && A.S.w.find((x) => x.fl === f.id && x.desk === u.id);
      const e = own && A.E[own.id];
      const on = e && e.fl === f.id && e.st === "sit" && own.live && own.live.st === "work" && e.x === u.x + 1 && e.y === u.y - 1;
      px(X - 2, Y - 2, "#33373e", 36, 4); px(X - 2, Y + 2, "#2a2d33", 36, 10); px(X - 2, Y + 11, "#202328", 36, 1);
      px(X + 4, Y + 7, own ? own.col : "#3a3e45", 24, 1);
      px(X, Y - 9, "#2a2d33", 11, 8); px(X + 1, Y - 8, on ? "#20323d" : "#101215", 9, 6); px(X + 4, Y - 1, "#2a2d33", 3, 1);
      if (on) for (let i = 0; i < 3; i++) px(X + 2, Y - 7 + i * 2, "#5aa9e6", 1 + ((Math.floor(t * 6) + i * 3) % 6), 1);
      if (own) { const n = own.nm.toUpperCase(); const here = e && e.fl === f.id && e.st !== "lz"; K.text(w, n, X + 16 - K.textWidth(n) / 2, Y + 16, here ? mix(own.col, "#ffffff", .2) : "#4a4e55"); }
      else if (A.bld == null) K.text(w, "FREE", X + 16 - K.textWidth("FREE") / 2, Y + 16, "#3a3e45");
      break;
    }
    case "couch": px(X, Y + 2, "#6d4f7a", 32, 12); px(X, Y + 2, "#82629a", 32, 4); px(X + 2, Y + 7, "#93739f", 13, 5); px(X + 17, Y + 7, "#93739f", 13, 5); break;
    case "plant": px(X + 4, Y + 9, "#8a5b3b", 8, 6); px(X + 3, Y + 1, "#4e8a4f", 10, 9); px(X + 5, Y - 2, "#5fa35d", 6, 6); px(X + 7, Y + 3, "#3c6f3d", 2, 5); break;
    case "rack": {
      const s = srvOf(u.srv), st = (s && s.st) || {}, on = !!st.on, ld = Math.min(1, (st.cpu || 0) / 100), jobs = st.jobs || 0, ln = st.lanes || (s && s.cfg && s.cfg.lanes) || 2;
      px(X + 1, Y - 6, "#1d2128", 14, 36); px(X + 2, Y - 5, "#262b33", 12, 34);
      for (let i = 0; i < 6; i++) { const lit = on && (Math.floor(t * 5 + i * 1.7 + u.x) % 3 !== 0 || i / 6 < ld); px(X + 3, Y - 3 + i * 5, "#30363f", 10, 3); px(X + 10, Y - 2 + i * 5, !s || st.t === undefined ? "#3a3d41" : !on ? "#d9594c" : lit ? "#62b86f" : "#2b3a2e", 2, 1); }
      for (let i = 0; i < Math.min(ln, 6); i++) px(X + 4 + i * 2, Y + 27, i < jobs ? "#5aa9e6" : "#30363f", 1, 2);
      break;
    }
    case "gen": {
      const g = genState(accOf(u.acc));
      px(X + 2, Y + 2, "#4a4f57", 28, 26); px(X + 2, Y + 2, "#5b616a", 28, 4); px(X + 6, Y + 9, "#2a2e33", 14, 14);
      const ang = g.on && g.s !== "off" && g.s !== "err" ? t * (g.s === "warn" ? 4 : 14) + (g.s === "warn" ? Math.sin(t * 9) * .6 : 0) : 0;
      for (let i = 0; i < 4; i++) { const a = ang + i * Math.PI / 2; px(X + 12 + Math.round(Math.cos(a) * 4), Y + 15 + Math.round(Math.sin(a) * 4), "#9aa1aa", 3, 3); }
      px(X + 12, Y + 15, "#c9ced4", 3, 3);
      const lc = !g.on ? "#3a3d41" : g.s === "off" || g.s === "err" ? "#d9594c" : g.s === "warn" && Math.floor(t * 4) % 2 ? "#e0675a" : "#62b86f";
      px(X + 23, Y + 10, lc, 4, 4); px(X + 23, Y + 18, "#2a2e33", 4, 8);
      const fh = Math.round(8 * g.u); px(X + 23, Y + 26 - fh, "#8fd0ee", 4, fh);
      if (g.on && g.s === "run" && Math.floor(t * 8) % 2) px(X + 30, Y + 24, "#62b86f", 2, 2);
      if (g.on && (g.s === "off" || g.s === "err") && Math.floor(t * 2) % 2) { px(X + 8, Y - 2, "#55524b", 3, 3); px(X + 11, Y - 5, "#46433e", 2, 2); }
      break;
    }
    case "lift": { px(X, Y, "#6c7279", 32, 30); px(X + 3, Y + 4, "#9aa3ad", 26, 26); px(X + 15, Y + 4, "#4d5359", 2, 26); px(X + 3, Y + 4, "#b6bec7", 12, 2); px(X + 17, Y + 4, "#b6bec7", 12, 2); px(X + 13, Y + 1, "#62b86f", 6, 2); break; }
    case "stairs": { px(X, Y, "#3a3e45", 32, 30); for (let i = 0; i < 6; i++) { px(X + 2, Y + 3 + i * 4, mix("#55606d", "#000000", i * .08), 28, 3); } px(X + 2, Y + 1, "#2a2d33", 28, 2); break; }
    case "tray": { px(X + 1, Y + 5, "#3a3e45", 14, 10); px(X + 2, Y + 6, "#2a2d33", 12, 8); K.text(w, "OUT", X + 2, Y + 17, "#4a4e55"); const n = Math.min(5, doneOn(f.id)); for (let i = 0; i < n; i++) px(X + 3, Y + 5 - i * 2, "#f4f1e8", 10, 2); if (n) px(X + 11, Y + 2, "#62b86f", 3, 3); break; }
    case "counter": px(X, Y + 2, "#55606d", 48, 12); px(X, Y + 2, "#6a7787", 48, 3); px(X + 34, Y - 4, "#26292e", 9, 7); px(X + 35, Y - 3, "#2f6b8f", 7, 5); break;
    case "board": px(X + 1, Y + 4, "#e8e6df", 30, 10); px(X + 1, Y + 4, "#55524b", 30, 1); for (let i = 0; i < 4; i++) px(X + 4 + i * 7, Y + 7, ["#d97757", "#3fb6a8", "#9c7ae0", "#5c7fd6"][i], 4, 5); break;
    case "coffee": px(X + 3, Y + 1, "#3a3d42", 10, 13); px(X + 5, Y + 4, "#d9594c", 2, 2); px(X + 5, Y + 9, "#e8e6df", 5, 4); break;
    case "plan": px(X, Y + 3, "#5a3f26", 32, 10); px(X + 1, Y + 2, "#3f6f9e", 30, 8); for (let i = 0; i < 4; i++) px(X + 4 + i * 6, Y + 4, "#a9cdee", 1, 4); px(X + 3, Y + 6, "#a9cdee", 24, 1); break;
    case "chart": {
      px(X + 1, Y + 4, "#f4f1e8", 30, 11);
      const d = (A.usage && A.usage.day) || [];
      const vals = d.slice(-6).map((r) => r.tok || 0), mx = Math.max(1, ...vals);
      const h = vals.length ? vals.map((v) => Math.max(1, Math.round(v / mx * 9))) : [1, 1, 1, 1, 1, 1];
      h.forEach((v, i) => px(X + 4 + i * 4, Y + 14 - v, i === h.length - 1 ? "#62b86f" : "#5c7fd6", 3, v));
      break;
    }
    case "screen": {
      px(X + 1, Y + 2, "#26292e", 30, 12); px(X + 2, Y + 3, "#101820", 28, 10);
      let s = "";
      if (f.k === "server") { const ss = A.S.srv.filter((x) => x.fl === f.id); s = ss.length ? ss.filter((x) => x.st && x.st.on).length + "/" + ss.length + " ON" : "+ SERVER"; }
      else if (f.k === "accounting") s = (A.S.usd || 0).toFixed(2) + "$";
      else s = A.lvlName(f.lvl);
      K.text(w, s, X + 16 - K.textWidth(s) / 2, Y + 6, "#5aa9e6");
      break;
    }
    case "table": px(X + 2, Y + 4, "#2a2d33", 28, 18); px(X + 2, Y + 4, "#33373e", 28, 3); px(X + 12, Y + 9, "#e8e6df", 6, 4); break;
  }
};
A.drawFuTo = (g, k) => { const keep = w; w = g; g.translate(4, 8); drawFu({ id: -1, k: "office", lay: { fu: [], t: [] } }, { k, x: 0, y: 0, id: -1 }); w = keep; };

const drawW = (e, t) => {
  const i = e.i || {}, lv = i.live || {};
  const p = K.pose();
  const s = sk(i.col || "#888888");
  if (e.st === "walk") { const k = Math.floor(t * 8) % 2; p.lift = k ? [1, 0, 1, 0] : [0, 1, 0, 1]; p.dy = k ? -1 : 0; p.armL = "half"; p.armR = "half"; }
  else if (e.st === "sit" && lv.st === "work") { const k = Math.floor(t * 9 + e.x); p.legs = "sit"; p.armL = "front"; p.armR = "front"; p.aL = [0, k % 2 ? -1 : 0]; p.aR = [0, k % 2 ? 0 : -1]; p.ey = 1; }
  else if (e.st === "sit" && lv.st === "wait") { p.legs = "sit"; p.eyes = "sideways"; }
  else if (e.st === "sit" && lv.st === "hold") { p.legs = "sit"; p.eyes = "half"; p.mouth = "flat"; }
  else if (e.st === "sit") { p.legs = "sit"; p.bh = Math.floor(t * .8 + e.x) % 2 ? 0 : -1; }
  else if (e.st === "lz") { p.legs = "sit"; p.eyes = Math.floor(t * .5 + e.x) % 4 === 0 ? "shut" : "half"; p.mouth = "small"; }
  if (e.mood === "ok") { p.eyes = "glad"; p.mouth = "smile"; p.armL = "top"; p.armR = "top"; p.dy = Math.floor(t * 8) % 2 ? -2 : 0; }
  if (e.mood === "err") { p.eyes = "sad"; p.armR = "head"; p.aR = [0, Math.floor(t * 6) % 2 ? -1 : 0]; }
  fc.clearRect(0, 0, K.W, K.H);
  const { r } = K.figure(fc, p, t, s);
  const af = ACC[i.acc];
  if (af) af(r, i.tcol || "#e8e6df", t);
  const seated = e.st === "sit" && e.gl && e.gl.then === "sit";
  const X = Math.round(e.fx) + 8 - 24 - (seated ? 4 : 0), Y = Math.round(e.fy) + (e.st === "lz" ? 11 : seated ? 13 : 15) - K.GROUND;
  if (A.sel === e || A.fol === e) px(Math.round(e.fx) + 1, Math.round(e.fy) + 13, "rgba(90,169,230,.55)", 14, 3);
  w.save();
  if (e.face < 0) { w.translate(X + K.W, Y); w.scale(-1, 1); w.drawImage(fig, 0, 0); } else w.drawImage(fig, X, Y);
  w.restore();
  let say = e.sy > 0 ? e.say : "";
  if (!say && e.mood === "err") say = "?";
  if (!say && lv.st === "wait" && e.st === "sit") say = "…";
  if (say) BUB.push({ e, say, p: e.sy + (A.sel === e ? 10 : 0) });
  if (e.st === "lz") { const k = (t * .6 + e.x) % 1; w.globalAlpha = 1 - k; K.text(w, "z", Math.round(e.fx) + 12 + k * 4, Math.round(e.fy) - 10 - k * 6, "#e8e6df"); w.globalAlpha = 1; }
  if (lv.st === "hold" && e.st === "sit") { px(Math.round(e.fx) + 13, Math.round(e.fy) - 12, "#d9594c", 2, 5); px(Math.round(e.fx) + 16, Math.round(e.fy) - 12, "#d9594c", 2, 5); }
};

let BUB = [];
const bubbles = () => {
  const done = [];
  BUB.sort((a, b) => b.p - a.p);
  for (const { e, say } of BUB) {
    const s2 = say.length > 24 ? say.slice(0, 23) + "…" : say, tw = K.textWidth(s2) + 6, bx = Math.max(1, Math.min(MW * T - tw - 1, Math.round(e.fx) + 8 - tw / 2)), by = Math.max(1, Math.round(e.fy) - 22);
    if (done.some((r) => bx < r[0] + r[2] + 2 && r[0] < bx + tw + 2 && by < r[1] + 11 && r[1] < by + 11)) continue;
    done.push([bx, by, tw]);
    px(bx, by, "#f4f1e8", tw, 9); px(Math.round(e.fx) + 7, by + 9, "#f4f1e8", 3, 2);
    K.text(w, s2, bx + 3, by + 2, "#2a2723");
  }
  BUB = [];
};

const pia = (f) => {
  const c = (f.lay.fu || []).find((u) => u.k === "counter");
  if (!c) return;
  const q = A.questOn && A.questOn();
  const p = K.pose(); p.legs = "sit"; p.bh = Math.floor(A.tm * .8) % 2 ? 0 : -1; if (q) { p.armR = "top"; p.dy = Math.floor(A.tm * 3) % 2 ? -1 : 0; }
  fc.clearRect(0, 0, K.W, K.H); const { r } = K.figure(fc, p, A.tm, sk("#4f9fc4")); ACC.bun(r, "#2a5f7d");
  const X = (c.x + 1) * T, Y = (c.y - 1) * T;
  w.drawImage(fig, X + 8 - 24, Y + 17 - K.GROUND);
  if (q) { const by = Y - 14 + (Math.floor(A.tm * 3) % 2); px(X + 6, by, "#f4f1e8", 7, 9); K.text(w, "!", X + 8, by + 2, "#d9594c"); }
};

A.draw = () => {
  const f = flo(A.cur);
  const vw = innerWidth, vh = innerHeight - 44;
  if (cv.width !== vw || cv.height !== vh) { cv.width = vw; cv.height = vh; }
  cx.imageSmoothingEnabled = false; cx.fillStyle = "#14161a"; cx.fillRect(0, 0, vw, vh);
  if (!f) return;
  const lay = A.bld ? A.bld.lay : f.lay;
  const fv = { ...f, lay };
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) drawTile(fv, x, y);
  if (A.bld) { w.fillStyle = "rgba(255,255,255,.08)"; for (let x = 0; x <= MW; x++) w.fillRect(x * T, 0, 1, MH * T); for (let y = 0; y <= MH; y++) w.fillRect(0, y * T, MW * T, 1); }
  const items = (lay.fu || []).map((u) => ({ y: u.y + FS[u.k][1] - 1 + (WALL.has(u.k) ? -1 : 0), d: () => drawFu(fv, u) }));
  if (!A.bld) Object.values(A.E).filter((e) => e.fl === f.id && e.st !== "lift").forEach((e) => items.push({ y: e.fy / T + .5, d: () => drawW(e, A.tm) }));
  if (f.k === "lobby" && !A.bld) { const c = (lay.fu || []).find((u) => u.k === "counter"); if (c) items.push({ y: c.y - .6, d: () => pia(fv) }); }
  items.sort((a, b) => a.y - b.y).forEach((i) => i.d());
  bubbles();
  if (f.k === "basement") (lay.fu || []).filter((u) => u.k === "gen").forEach((u) => { const a = accOf(u.acc); const ls = a ? [a.nm.toUpperCase(), (a.k === "api" ? "API" : "SUB") + " " + Math.round((a.st && a.st.pct) || 0) + "%"] : ["FREE"]; ls.forEach((s2, i) => K.text(w, s2.slice(0, 14), u.x * T + 16 - K.textWidth(s2.slice(0, 14)) / 2, u.y * T + 34 + i * 7, i ? "#6f747b" : "#c9ced4")); });
  if (f.k === "server") (lay.fu || []).filter((u) => u.k === "rack").forEach((u) => { const s = srvOf(u.srv); if (!s) return; const s2 = s.nm.toUpperCase().slice(0, 8); K.text(w, s2, u.x * T + 8 - K.textWidth(s2) / 2, u.y * T + 34, s.st && s.st.on ? "#c9ced4" : "#d9594c"); });
  if (f.k === "shell" && !A.bld) { const s = "SHELL FLOOR - CLICK TO BUILD OUT"; K.text(w, s, MW * T / 2 - K.textWidth(s) / 2, MH * T / 2, "#5a5e65"); }
  if (f.k === "basement" && !(lay.fu || []).some((u) => u.k === "gen") && !A.bld) { const s = "NO POWER - CLICK HERE"; K.text(w, s, MW * T / 2 - K.textWidth(s) / 2, MH * T / 2, Math.floor(A.tm * 2) % 2 ? "#d9594c" : "#8a4a44"); }
  if (A.bld && A.hov) { const [hx, hy] = A.hov, tl = A.bld.tool, s = ["wall", "floor", "erase"].includes(tl) ? [1, 1] : FS[tl]; const ok = A.canPlace(lay, tl, hx, hy); w.fillStyle = ok ? "rgba(98,184,111,.45)" : "rgba(217,89,76,.5)"; w.fillRect(hx * T, hy * T, s[0] * T, s[1] * T); }
  if (!A.bld) {
    const n = (f.nm || KN[f.k]).toUpperCase().slice(0, 28), ws = A.S.w.filter((x) => x.fl === f.id), act = ws.filter((x) => x.live && x.live.st === "work").length;
    const l2 = f.k === "office" ? `W ${ws.length}  ${"ACTIVE"} ${act}  ${"DONE"} ${doneOn(f.id)}` : f.k === "basement" ? `${"GENERATORS"} ${A.S.acc.length}` : f.k === "server" ? `${"ONLINE"} ${A.S.srv.filter((s) => s.fl === f.id && s.st && s.st.on).length}/${A.S.srv.filter((s) => s.fl === f.id).length}` : f.k === "lounge" ? `${"PAUSE"} ${Object.values(A.E).filter((e) => e.fl === f.id && e.st === "lz").length}` : f.k === "accounting" ? `${"TODAY"} ${(A.S.usd || 0).toFixed(2)} $` : f.k === "lobby" ? `${"FLOORS"} ${fls().length}` : "";
    const d = new Date(), hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    const bw = Math.max(K.textWidth(n) + 32, K.textWidth(l2)) + 16, bx = Math.round(MW * T / 2 - bw / 2);
    px(bx, 6, "#111316", bw, l2 ? 20 : 13); px(bx, 6, "#2f333a", bw, 1);
    K.text(w, n, bx + 8, 9, "#c9ccd1"); if (l2) K.text(w, l2, bx + 8, 17, "#6f747b");
    px(bx + bw - 6, 9, A.S.stop ? "#d9594c" : "#62b86f", 2, 2);
    K.text(w, hm, bx + bw - 10 - K.textWidth(hm), 9, "#6f747b");
    A.sign = [bx, 6, bw, l2 ? 20 : 13];
  } else K.text(w, "BUILD MODE - WORKERS HIDDEN", 6, 4, "#e8e6df");
  let sc, ox, oy;
  const fe = A.fol && A.fol.fl === f.id ? A.fol : null;
  if (fe) { sc = Math.max(3, Math.floor(Math.min(vw / (MW * T), vh / (MH * T))) + 1); ox = vw / 2 - (fe.fx + 8) * sc; oy = vh / 2 - (fe.fy + 8) * sc; ox = Math.min(0, Math.max(vw - MW * T * sc, ox)); oy = Math.min(0, Math.max(vh - MH * T * sc, oy)); if (MW * T * sc < vw) ox = (vw - MW * T * sc) / 2; if (MH * T * sc < vh) oy = (vh - MH * T * sc) / 2; }
  else if (vw < 720) {
    sc = Math.max(2, Math.floor(Math.min(vw / (MW * T), vh / (MH * T)) * 2) / 2);
    const mx = Math.max(0, MW * T * sc - vw), my = Math.max(0, MH * T * sc - vh);
    A.pan.x = Math.max(-mx / 2, Math.min(mx / 2, A.pan.x)); A.pan.y = Math.max(-my / 2, Math.min(my / 2, A.pan.y));
    ox = Math.round((vw - MW * T * sc) / 2 + A.pan.x); oy = Math.round((vh - MH * T * sc) / 2 + A.pan.y);
  }
  else { sc = Math.max(1, Math.floor(Math.min(vw / (MW * T), vh / (MH * T)) * 2) / 2); ox = Math.round((vw - MW * T * sc) / 2); oy = Math.round((vh - MH * T * sc) / 2); }
  cx.drawImage(wd, Math.round(ox), Math.round(oy), MW * T * sc, MH * T * sc);
  A.view = { sc, ox, oy };
};

A.toW = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left - A.view.ox) / A.view.sc, (e.clientY - r.top - A.view.oy) / A.view.sc]; };
A.toS = (wx, wy) => [wx * A.view.sc + A.view.ox, wy * A.view.sc + A.view.oy + 44];

A.canPlace = (lay, k, x, y) => {
  const t = (xx, yy) => (lay.t[yy] ? lay.t[yy][xx] : undefined);
  const o = (xx, yy) => (lay.fu || []).find((u) => xx >= u.x && xx < u.x + FS[u.k][0] && yy >= u.y && yy < u.y + FS[u.k][1]);
  const inner = x > 0 && x < MW - 1 && y > 1 && y < MH - 1;
  if (k === "erase") { const u = o(x, y); return u ? !["lift", "gen", "rack"].includes(u.k) : t(x, y) === 2 && inner; }
  if (k === "wall") return t(x, y) === 1 && !o(x, y) && inner;
  if (k === "floor") return t(x, y) === 2 && inner;
  const [sw, sh] = FS[k];
  for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
    const tx = x + i, ty = y + j, v = t(tx, ty);
    if (v === undefined || o(tx, ty)) return false;
    if (!(v === 1 || (WALL.has(k) && v === 2 && ty < 2))) return false;
  }
  if (k === "desk" && !(t(x + 1, y - 1) === 1 && !o(x + 1, y - 1))) return false;
  return true;
};
})();
