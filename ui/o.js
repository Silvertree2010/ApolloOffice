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
  };
  const NM = { hunter: "Hunter", scout: "Scout", guard: "Guard", vet: "Vet", repro: "Repro", fixer: "Fixer", ci: "CI", reviewer: "Reviewer", submit: "Submit", watcher: "Watcher" };
  window.AO.NM = NM;
  const ORD = ["scout", "guard", "vet", "watcher", "hunter", "repro", "fixer", "ci", "reviewer", "submit"];

  const VW = 400, VH = 258;
  const AN = { scout: [34, 74], guard: [74, 74], vet: [150, 74], watcher: [226, 74], repro: [53, 164], fixer: [147, 164], ci: [327, 100], reviewer: [241, 164], submit: [343, 164] };
  const TEAM = [["hunter", "hunt", 0], ["repro", "repro", 8], ["fixer", "fix", 102], ["reviewer", "review", 196], ["submit", "submit", 290]];
  const FITC = ["#e8e6df", "#1b1a18", "#4fb3e0", "#e0675a", "#5cbf6a", "#9c7ae0", "#d0649f", "#8d9199"];

  const cv = $("cv");
  const cx = cv.getContext("2d");
  const off = document.createElement("canvas");
  off.width = VW; off.height = VH;
  const c = off.getContext("2d");
  const fig = document.createElement("canvas");
  fig.width = K.W; fig.height = K.H;
  const fc = fig.getContext("2d");

  let S = null, err = 0;
  const t0 = performance.now();

  const gray = (h, k) => {
    const n = parseInt(h.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const y = Math.round((r * 0.3 + g * 0.59 + b * 0.11) * k);
    return "#" + [y, y, y].map((v) => v.toString(16).padStart(2, "0")).join("");
  };
  const dim = (sk) => ({ body: gray(sk.body, 0.6), dark: gray(sk.dark, 0.6), light: gray(sk.light, 0.6) });
  const LT = { "#3d4045": "#8a94a2", "#4a4d54": "#5a6472", "#75746f": "#8a94a2", "#1d1f24": "#c9d1db" };
  const lt = () => document.documentElement.dataset.th === "light";
  const C = (k) => (lt() && LT[k]) || k;
  const hl = (n) => (lt() ? SK[n].dark : SK[n].light);
  window.AO.hl = hl;
  const px = (x, y, w, h, col) => { c.fillStyle = C(col); c.fillRect(Math.round(x), Math.round(y), w, h); };
  const tx = (s, x, y, col) => K.text(c, s, x, y, C(col));
  const party = () => S?.lm && S.t - S.lm.t < 180000;

  const win = (x, y, w, h, t, sd) => {
    px(x - 1, y - 1, w + 2, h + 2, "#c3ccd7");
    px(x, y, w, h, "#dcedf8");
    px(x, y, w, h * 0.6, "#c6e3f6");
    px(x, y, w, h * 0.3, "#b0d7f1");
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    for (let k = 0; k < 2; k++) {
      const cx = x - 14 + ((t * (1.5 + k) + sd * 37 + k * 41) % (w + 28)), cy = y + 4 + k * 8;
      px(cx, cy, 10, 2, "#ffffff"); px(cx + 2, cy - 2, 5, 2, "#ffffff");
    }
    c.restore();
    if (w > 40) px(x + (w >> 1), y, 1, h, "#c3ccd7");
    px(x - 3, y + h + 1, w + 6, 2, "#e4e9ef");
  };
  const day = (t) => {
    px(0, 0, VW, VH, "#e9eef3");
    for (let k = 0, y = 35; y < VH; y += 8, k++) for (let x = k % 2 ? 0 : 8; x < VW; x += 16) px(x, y, 8, 8, "#e2e8ee");
    c.globalAlpha = 0.55;
    for (const [x0, w] of [[36, 110], [326, 66]]) for (let y = 35; y < 92; y++) px(x0 + (y - 35) * 0.7, y, w, 1, "#f7fafc");
    c.globalAlpha = 1;
    px(0, 0, VW, 34, "#f8f9fb");
    px(0, 30, VW, 4, "#e6ebf0");
    px(0, 34, VW, 1, "#c9d1db");
    win(36, 5, 110, 22, t, 1);
    win(326, 5, 66, 22, t, 2);
    px(256, 38, 140, 84, "#f3f5f8");
    px(256, 38, 140, 1, "#c9d1db");
    px(256, 38, 1, 84, "#c9d1db");
    tx("MACHINES", 262, 42, "#8a94a2");
    px(158, 6, 84, 22, "#0a0b0d");
    px(158, 6, 84, 1, "#24272d");
  };
  const floor = (t) => {
    if (lt()) return day(t);
    px(0, 0, VW, VH, "#0d0e10");
    px(0, 0, VW, 34, "#121317");
    px(0, 34, VW, 1, "#1d1f24");
    for (let k = 0, y = 35; y < VH; y += 8, k++) for (let x = k % 2 ? 0 : 8; x < VW; x += 16) px(x, y, 8, 8, "#111215");
    px(256, 38, 140, 84, "#0f1013");
    px(256, 38, 140, 1, "#1d1f24");
    px(256, 38, 1, 84, "#1d1f24");
    tx("MACHINES", 262, 42, "#3d4045");
    px(158, 6, 84, 22, "#0a0b0d");
    px(158, 6, 84, 1, "#24272d");
  };

  const board = (t) => {
    const s = S;
    tx("APOLLO OFFICE", 162, 9, "#8a8d94");
    if (!s) return;
    const q = (s.n.ready || 0) + (s.n.repro || 0) + (s.n.fix || 0) + (s.n.ci || 0) + (s.n.review || 0) + (s.n.gate || 0) + (s.n.submit || 0);
    const op = s.pr.filter((p) => p.st === "open").length;
    if (s.o.off) { if (Math.floor(t * 2) % 2) tx("OFFLINE", 164, 18, "#e0675a"); }
    else if (party()) { if (Math.floor(t * 3) % 2) tx("MERGED!", 164, 18, "#5cbf6a"); }
    else tx(`Q ${q} PR ${op}`, 164, 18, "#5c5f66");
    const live = !s.o.off && !s.o.pause && !s.o.man;
    const ap = (s.n.approve || 0);
    if (ap) { px(300, 136, 70, 16, "#131a14"); px(300, 136, 70, 1, "#3d9149"); tx(`APPROVE ${ap}`, 304, 141, Math.floor(t * 1.5) % 2 ? "#94dd9e" : "#5cbf6a"); }
    px(234, 10, 3, 3, live ? (Math.floor(t * 1.5) % 2 ? "#5cbf6a" : "#3d9149") : s.o.off ? "#e0675a" : "#8d9199");
    const d = new Date();
    tx(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`, 6, 9, "#4a4d54");
  };

  const PLANE = [["w....", "www..", "wwwww", ".gww.", "..g.."], ["..g..", ".gww.", "wwwww", "www..", "w...."]];
  const paths = (t) => {
    if (!S) return;
    const now = S.t + (performance.now() - last);
    for (const f of S.fl) {
      if (!AN[f.a] || !AN[f.b]) continue;
      const D = 1800, k = Math.min(1, (now - f.t) / D);
      if (k >= 1) continue;
      const [x0, y0] = AN[f.a], [x1, y1] = AN[f.b];
      const ax = x0, ay = y0 - 22, bx = x1, by = y1 - 22;
      const hgt = 18 + Math.min(40, Math.hypot(bx - ax, by - ay) * 0.25);
      const pos = (u) => [ax + (bx - ax) * u, ay + (by - ay) * u - Math.sin(u * Math.PI) * hgt];
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      for (let j = 1; j <= 14; j++) {
        const u = e - j * 0.018;
        if (u <= 0) break;
        if (j % 2) continue;
        const [tx, ty] = pos(u);
        c.globalAlpha = (1 - j / 15) * 0.8;
        px(tx, ty, 1, 1, hl(f.a));
      }
      c.globalAlpha = 1;
      const [x, y] = pos(e), [nx] = pos(Math.min(1, e + 0.02));
      K.draw(c, PLANE[0], x - 2, y - 2, {}, nx < x);
    }
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

  const screen = (x, y, w, st, sk, t, so) => {
    px(x, y, w, 9, "#2a2c32");
    px(x + 1, y + 1, w - 2, 7, so ? "#0b0c0e" : st === "work" ? "#0f1a1e" : "#0b0c0e");
    px(x + (w >> 1) - 1, y + 9, 2, 2, "#2a2c32");
    if (so) { if (Math.floor(t * 2) % 2) px(x + (w >> 1) - 1, y + 3, 2, 2, "#e0675a"); return; }
    if (st === "work") {
      const sc = Math.floor(t * 6);
      for (let i = 0; i < 3; i++) px(x + 2, y + 2 + i * 2, 2 + ((sc + i) * 7) % (w - 5), 1, i === 2 ? sk.light : sk.dark);
    } else if (st !== "sleep") {
      px(x + 2, y + 2, 3, 1, sk.dark);
      if (Math.floor(t * 1.2) % 2) px(x + 6, y + 2, 1, 1, sk.light);
    }
  };

  const acc = {
    hunter: (r, sk, t) => { K.px(fc, r.left - 1, r.top - 1, sk.dark, r.bw + 2, 1); K.px(fc, r.left + 2, r.top - 3, sk.dark, r.bw - 4, 2); K.px(fc, r.cx - 1, r.top - 4, "#5cbf6a", 2, 1); },
    scout: (r, sk, t) => { K.px(fc, r.cx, r.top - 4, sk.dark, 1, 4); K.px(fc, r.cx - 1, r.top - 6, Math.floor(t * 3) % 2 ? "#e8e6df" : sk.light, 3, 2); },
    guard: (r, sk) => { K.draw(fc, ["sss", "sws", "sss", ".s."], r.left + 2, r.top + 4, { body: sk.body }); },
    vet: (r) => { const y = r.eyeY - 1; for (const x of [r.cx - 5, r.cx + 2]) { K.px(fc, x, y, "#e8e6df", 4, 1); K.px(fc, x, y + 3, "#e8e6df", 4, 1); K.px(fc, x, y, "#e8e6df", 1, 4); K.px(fc, x + 3, y, "#e8e6df", 1, 4); } K.px(fc, r.cx - 1, y + 1, "#e8e6df", 3, 1); },
    repro: (r, sk, t, p) => { const x = r.handR.x, y = r.handR.y - 5 + (p.mood === "work" ? Math.round(Math.sin(t * 4)) : 0); K.draw(fc, [".ww.", "w..w", "w..w", ".ww.", "...g", "....g"], x, y, {}); },
    reviewer: (r) => { K.px(fc, r.handR.x, r.handR.y - 4, "#e0675a", 1, 4); K.px(fc, r.handR.x, r.handR.y, "#e8e6df", 1, 1); },
    watcher: (r) => { K.px(fc, r.left - 1, r.top - 2, "#55524b", r.bw + 2, 1); K.px(fc, r.left - 2, r.top - 1, "#55524b", 1, 4); K.px(fc, r.right + 1, r.top - 1, "#55524b", 1, 4); K.px(fc, r.left - 3, r.top + 1, "#e8e6df", 2, 3); K.px(fc, r.right + 1, r.top + 1, "#e8e6df", 2, 3); },
  };

  const FIT = [
    () => {},
    (r, a) => { K.px(fc, r.left + 2, r.top - 2, a, r.bw - 4, 2); K.px(fc, r.right - 3, r.top - 1, a, 5, 1); },
    (r, a) => { K.px(fc, r.left + 2, r.top - 3, a, r.bw - 4, 3); K.px(fc, r.cx - 1, r.top - 5, "#e8e6df", 2, 2); },
    (r, a) => { K.px(fc, r.left, r.top + 1, a, r.bw, 1); K.px(fc, r.left - 2, r.top + 2, a, 2, 1); },
    (r, a) => { K.draw(fc, ["x.x", "xxx", "x.x"].map((l) => l.replace(/x/g, "1")), r.cx - 1, r.top + 6, { c1: a }); },
    (r, a) => { K.px(fc, r.left + 1, r.top + 6, a, r.bw - 2, 2); K.px(fc, r.right - 4, r.top + 8, a, 2, 3); },
    (r) => { K.px(fc, r.cx - 5, r.eyeY - 1, "#101112", 4, 2); K.px(fc, r.cx + 2, r.eyeY - 1, "#101112", 4, 2); K.px(fc, r.cx - 1, r.eyeY - 1, "#101112", 3, 1); },
    (r, a) => { K.px(fc, r.left, r.top - 2, a, r.bw, 1); K.px(fc, r.left - 2, r.top, a, 2, 3); K.px(fc, r.right, r.top, a, 2, 3); },
    (r, a) => { K.px(fc, r.cx, r.top + 6, a, 1, 3); K.px(fc, r.cx - 1, r.top + 9, a, 3, 1); },
    (r, a) => { K.px(fc, r.cx - 3, r.top - 6, a, 7, 5); K.px(fc, r.cx - 5, r.top - 1, a, 11, 1); },
  ];
  const HAT = (r, t) => { K.draw(fc, ["..1..", ".121.", "11211"], r.cx - 2, r.top - 4, { c1: ["#4fb3e0", "#d0649f", "#5cbf6a"][Math.floor(t * 4) % 3], c2: "#e8e6df" }); };

  const crab = (n, x, y, t, o = {}) => {
    const bw = S?.w?.[n] || { st: "idle" };
    const w = o.st ? { st: o.st, t: 0, hold: o.st !== "work" && bw.hold } : bw;
    const now = S ? S.t + (performance.now() - last) : Date.now();
    const off = S?.o?.off;
    const mood = now - (w.t || 0) < 6000 ? w.mood : "";
    const st = w.hold || (S?.o?.pause && w.st !== "work") || S?.o?.man ? "sleep" : off && w.st !== "work" ? "off" : w.st;
    const sd = (o.seed ?? n.length) * 1.7;
    const p = K.pose();
    p.legs = "sit";
    p.mouth = null;
    const bl = Math.floor((t + sd) * 10) % 47 === 0;
    const pt = party();
    if (pt) {
      p.armL = "top"; p.armR = "top"; p.eyes = "glad"; p.mouth = "wide";
      p.dy = Math.floor(t * 5 + sd) % 2 ? -3 : 0;
      p.aL = [0, Math.floor(t * 5 + sd) % 2 ? -1 : 0]; p.aR = [0, Math.floor(t * 5 + sd) % 2 ? 0 : -1];
    } else if (st === "work") {
      const k = Math.floor(t * 9 + sd);
      p.armL = "front"; p.armR = "front";
      p.aL = [0, k % 2 ? -1 : 0]; p.aR = [0, k % 2 ? 0 : -1];
      p.ex = -1; p.ey = 1;
      p.dy = Math.floor(t * 4 + sd) % 4 === 0 ? -1 : 0;
      if (Math.floor(t * 0.7 + sd) % 5 === 0) { p.ex = 0; p.ey = -1; p.eyes = "half"; }
      if (bl) p.eyes = "shut";
    } else if (st === "sleep") {
      p.eyes = "shut"; p.bh = -1; p.dy = 1; p.armL = "low"; p.armR = "low";
    } else if (st === "off") {
      p.eyes = "half"; p.mouth = "flat"; p.bh = -1;
    } else {
      p.bh = Math.floor((t + sd) * 0.8) % 2 ? 0 : -1;
      p.ex = [0, 1, 0, -1][Math.floor((t + sd) * 0.4) % 4];
      if (bl) p.eyes = "shut";
    }
    if (!pt && mood === "ok") { p.eyes = "glad"; p.mouth = "smile"; p.armL = "top"; p.armR = "top"; p.dy = Math.floor(t * 6) % 2 ? -2 : 0; }
    else if (!pt && (mood === "sad" || mood === "err")) { p.eyes = "sad"; p.mouth = "sad"; p.armL = "low"; p.armR = "low"; }
    p.mood = st;
    const sk = st === "off" ? dim(SK[n]) : SK[n];
    fc.clearRect(0, 0, K.W, K.H);
    const { r } = K.figure(fc, p, t, sk);
    if (o.fit) FIT[o.fit % FIT.length](r, FITC[(o.fc ?? o.fit) % FITC.length]);
    if (acc[n]) acc[n](r, sk, t, p);
    if (pt) HAT(r, t + sd);
    c.drawImage(fig, Math.round(x - 24), Math.round(y - 41));
    if (st === "sleep" && !pt) {
      const k = ((t + sd) * 0.6) % 1;
      c.globalAlpha = 1 - k;
      tx("Z", x + 8 + k * 4, y - 26 - k * 8, "#75746f");
      c.globalAlpha = 1;
    }
    return st;
  };

  let hits = [], hov = null, mx = 0, my = 0;
  const seat = (n, x, y, t, o, lb, hot) => {
    hits.push({ k: "w:" + n + ":" + (o.q?.id ?? o.vk ?? ""), b: [x - 16, y - 30, x + 18, y + 20], n, q: o.q });
    const st = crab(n, x + 4, y + 2, t, o);
    desk(x, y, SK[n].dark);
    screen(x - 13, y - 11, 11, st, SK[n], t + (o.seed || 0), st === "off");
    if (lb) tx(lb, x - (K.textWidth(lb) >> 1), y + 16, hot ? hl(n) : "#4a4d54");
  };

  const RL = (id) => { if (id === "local") return "ME"; const m = id.match(/^([a-z])[a-z]*[-_ ]?(\d+)$/i); return (m ? m[1] + m[2] : id.replace(/[^a-z0-9]/gi, "")).slice(0, 3).toUpperCase(); };
  const RK = () => (S?.hs || []).filter((h) => h.on_).slice(0, 7).map((h) => [h.id, RL(h.id)]);
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

  const short = (q) => {
    const n = String(q.pr || q.num || "H" + q.id), r = (q.repo.split("/")[1] || q.repo).toUpperCase();
    for (let k = 3; k > 0; k--) if (K.textWidth(r.slice(0, k) + n) <= 30) return r.slice(0, k) + n;
    return n;
  };

  const intake = (t) => {
    seat("scout", 34, 74, t, {}, "SCOUT", S?.w?.scout?.st === "work");
    seat("guard", 74, 74, t, { seed: 3 }, "GUARD", S?.w?.guard?.st === "work");
    const vn = S?.o?.vn ?? (S?.w?.vet?.st === "work" ? 1 : 0);
    for (let k = 0; k < 3; k++) seat("vet", 114 + k * 36, 74, t, { st: k < vn ? "work" : "idle", seed: 11 + k, fit: k ? k + 2 : 0, fc: k + 4, vk: k }, k === 1 ? "VET" : "", k < vn);
    seat("watcher", 226, 74, t, { seed: 7 }, "WATCHER", S?.w?.watcher?.st === "work");
    px(270, 128, 120, 1, "#1d1f24");

  };

  const teams = (t) => {
    const ap = (S?.n?.approve || 0) > 0;
    const tj = TEAM.map(([n, stg]) => [n, (S?.q || []).filter((q) => q.st === stg || (n === "submit" && q.st === "gate"))]);
    const lay = (m) => {
      const it = [];
      for (const [n, js] of tj) {
        if (!js.length) it.push({ n, q: null, f: true, c: 0 });
        else js.slice(0, m).forEach((q, k) => it.push({ n, q, f: k === 0, c: js.length }));
      }
      let x = 22, row = 0, pv = null;
      const lim = (r) => (r ? 360 : ap ? 278 : 370);
      for (const i of it) {
        if (pv && i.n !== pv) x += 10;
        const tw = (it.filter((y) => y.n === i.n).length - 1) * 32;
        if (i.f && row === 0 && x > 22 && x + tw > lim(0) && 22 + tw <= lim(1)) { row++; x = 22; }
        if (x > lim(row)) { row++; x = 22; }
        i.x = x; i.y = 164 + row * 68; i.r = row; x += 32; pv = i.n;
      }
      return it;
    };
    let m = Math.max(1, ...tj.map(([, js]) => js.length)), it = lay(m);
    while (m > 1 && it.some((i) => i.r > 1)) it = lay(--m);
    for (const i of it) {
      if (i.f) {
        AN[i.n] = [i.x, i.y];
        tx(NM[i.n].toUpperCase() + (i.c > 1 ? " X" + i.c : ""), i.x - 12, i.y - 36, i.c ? hl(i.n) : "#4a4d54");
      }
      if (!i.q) seat(i.n, i.x, i.y, t, { seed: i.x }, "", false);
      else seat(i.n, i.x, i.y, t, { st: "work", seed: i.q.id, fit: (i.q.id * 7) % 9 + 1, fc: i.q.id * 3, q: i.q }, short(i.q), true);
    }
  };

  const confetti = (t) => {
    if (!party()) return;
    const cs = ["#4fb3e0", "#d0649f", "#5cbf6a", "#9c7ae0", "#e0675a", "#e8e6df"];
    for (let i = 0; i < 70; i++) {
      const sx = (i * 97.13) % VW, sp = 18 + (i % 7) * 6;
      const y = ((t * sp + i * 37) % (VH + 20)) - 10;
      px(sx + Math.sin(t * 2 + i) * 4, y, 2, 1 + (i % 2), cs[i % cs.length]);
    }
  };

  const radio = (x, y, t) => {
    const on = !!(S && S.q.some((q) => q.st === "ci"));
    px(x, y, 22, 12, "#2a2c32");
    px(x + 1, y + 1, 20, 10, "#1c1e22");
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) px(x + 3 + i * 2, y + 3 + j * 2, 1, 1, "#3d4045");
    px(x + 13, y + 3, 6, 2, on ? "#5cbf6a" : "#3d4045");
    const bar = (i) => (on ? 1 + Math.floor((Math.sin(t * (6 + i * 1.7) + i) + 1) * 1.5) : 1);
    for (let i = 0; i < 3; i++) px(x + 13 + i * 2, y + 10 - bar(i), 1, bar(i), on ? "#5cbf6a" : "#3d4045");
    px(x + 4, y - 3, 1, 3, "#3d4045");
    if (on) for (let k = 0; k < 2; k++) {
      const p = ((t * 0.5 + k / 2) % 1);
      c.globalAlpha = 1 - p;
      K.draw(c, ["..ww", "..w.", "ww..", "ww.."], x + 22 + k * 4 + Math.sin(t * 2 + k) * 2, y - p * 14, {});
      c.globalAlpha = 1;
    }
  };

  const plant = (x, y) => {
    px(x - 3, y, 7, 6, "#2a2c32");
    K.draw(c, ["..e.e..", ".eEe.e.", "e.eEee.", ".eeEe.e", "..eEe.."], x - 3, y - 5, {});
  };

  let last = performance.now();
  const frame = () => {
    const t = (performance.now() - t0) / 1000;
    c.imageSmoothingEnabled = false;
    fc.imageSmoothingEnabled = false;
    hits = [];
    floor(t);
    board(t);
    radio(292, 9, t);
    plant(248, 112);
    plant(392, 210);
    paths(t);
    intake(t);
    RK().forEach(([h, lb], i) => rack(272 + i * 19, 100, t, h, lb));
    teams(t);
    confetti(t);
    const hh = hov && hits.find((h) => h.k === hov);
    if (hh) {
      const [x0, y0, x1, y1] = hh.b, cl = "#75746f";
      for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) { px(dx > 0 ? x : x - 3, y, 4, 1, cl); px(x - (dx > 0 ? 0 : 1), dy > 0 ? y : y - 3, 1, 4, cl); }
    }
    if (S?.o?.off) { c.globalAlpha = 0.25; px(0, 35, VW, VH - 35, "#000"); c.globalAlpha = 1; }
    const dp = window.devicePixelRatio || 1, sg = $("stage");
    const sc = Math.max(1, Math.floor(Math.min((sg.clientWidth - 2) * dp / VW, (sg.clientHeight - 2) * dp / VH)));
    if (cv.width !== VW * sc) { cv.width = VW * sc; cv.height = VH * sc; cv.style.width = VW * sc / dp + "px"; cv.style.height = VH * sc / dp + "px"; }
    cx.imageSmoothingEnabled = false;
    cx.drawImage(off, 0, 0, VW * sc, VH * sc);
    const mg = $("mg");
    if (party()) {
      if (mg.hidden || mg.dataset.k !== S.lm.repo + S.lm.num) {
        mg.dataset.k = S.lm.repo + S.lm.num;
        mg.innerHTML = `<div class="mh">MERGED · ${esc(S.lm.repo)}#${S.lm.num}${S.lm.by ? " by " + esc(S.lm.by) : ""}</div><div class="mt2">${esc(S.lm.title)}</div>${S.lm.txt ? `<div class="mq">“${esc(S.lm.txt)}”</div>` : ""}`;
        mg.hidden = false;
      }
    } else if (!mg.hidden) mg.hidden = true;
    requestAnimationFrame(frame);
  };

  const ago = (t) => {
    const s = Math.max(0, (Date.now() - t) / 1000);
    return s < 60 ? Math.round(s) + "s" : s < 3600 ? Math.round(s / 60) + "m" : s < 86400 ? Math.round(s / 3600) + "h" : Math.round(s / 86400) + "d";
  };
  const hm = (t) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const kt = (n) => (n > 999999 ? (n / 1e6).toFixed(1) + "M" : n > 999 ? Math.round(n / 1000) + "k" : String(n));
  const STC = { approve: "ok", ready: "", vet: "", repro: "work", fix: "work", ci: "work", review: "work", gate: "work", submit: "work", done: "ok", drop: "bad" };

  const GEAR = `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M9.4 1l.3 1.8c.4.1.8.3 1.1.5l1.5-1 1.4 1.4-1 1.5c.2.3.4.7.5 1.1L15 6.6v2l-1.8.3c-.1.4-.3.8-.5 1.1l1 1.5-1.4 1.4-1.5-1c-.3.2-.7.4-1.1.5L9.4 15h-2l-.3-1.8c-.4-.1-.8-.3-1.1-.5l-1.5 1-1.4-1.4 1-1.5c-.2-.3-.4-.7-.5-1.1L1.8 8.6v-2l1.8-.3c.1-.4.3-.8.5-1.1l-1-1.5 1.4-1.4 1.5 1c.3-.2.7-.4 1.1-.5L7.4 1h2zM8.4 5.6a2 2 0 100 4 2 2 0 000-4z"/></svg>`;
  window.AO.GEAR = GEAR;
  const mdn = (md) => {
    if (!md) return "";
    const i = md.indexOf(":"), p = i > 0 ? md.slice(0, i) : "", m = ["codex", "anthropic", "openai", "gemini", "ollama"].includes(p) ? md.slice(i + 1) : md;
    const c = m.includes("haiku") ? "Haiku" : m.includes("sonnet") ? "Sonnet" : m.includes("opus") ? "Opus" : m.split("/").pop();
    return p === "ollama" ? c + " · local" : p === "codex" ? c + " · ChatGPT" : p === "anthropic" ? c + " · API" : c;
  };
  window.AO.mdn = mdn;
  const tiles = () => {
    const el = $("tiles");
    if (!el.children.length) {
      el.innerHTML = ORD.map((n) => `<div class="tile" data-w="${n}"><div class="hd"><span class="dot" style="background:${SK[n].body}"></span>${NM[n]}<span class="md"></span>${n === "ci" || n === "submit" ? "" : `<button class="gear" title="Model and provider" aria-label="${NM[n]} settings">${GEAR}</button>`}</div><div class="sy"></div><div class="stt"></div><div class="ft"></div></div>`).join("");
      el.onclick = (e) => {
        const g = e.target.closest(".gear");
        if (g) { e.stopPropagation(); window.AO.role && window.AO.role(g.closest(".tile").dataset.w); return; }
        const t = e.target.closest(".tile"); if (t) post({ a: "hold", w: t.dataset.w, on: !S.w[t.dataset.w].hold }).then(apply);
      };
    }
    const STG = { hunter: ["hunt"], repro: ["repro"], fixer: ["fix"], ci: ["ci"], reviewer: ["review"], submit: ["gate", "submit"] };
    for (const t of el.children) {
      const n = t.dataset.w, w = S.w[n] || { st: "idle", say: "", md: "", tk: 0 };
      const cn = STG[n] ? S.q.filter((q) => STG[n].includes(q.st)).length : n === "vet" ? S.o.vn || 0 : 0;
      const wk = cn > 0 || w.st === "work";
      t.querySelector(".md").textContent = n === "ci" || n === "submit" ? "no model" : mdn(w.md);
      t.querySelector(".md").title = w.md || "";
      t.querySelector(".sy").textContent = w.say || "…";
      t.className = "tile " + (wk ? "work" : "") + (w.hold ? " hold" : "");
      t.querySelector(".stt").textContent = w.hold ? "paused" : wk ? "work" + (cn > 1 ? " ×" + cn : "") : w.st === "sleep" ? "sleep" : "idle";
      t.querySelector(".ft").textContent = w.tk ? kt(w.tk) + " tok" : "";
      t.title = w.hold ? "click to resume" : "click to pause";
    }
  };

  const rn = (j) => (j.repo.split("/")[1] || j.repo) + (j.num ? "#" + j.num : "");
  const sel = new Set();
  const PIPE = [["scout", "Scout"], ["guard", "Guard"], ["vet", "Vet"], ["repro", "Repro"], ["fix", "Fixer"], ["ci", "CI"], ["review", "Reviewer"], ["submit", "Submit"]];
  const dropAt = (why) => { const w = (why || "").toLowerCase(); if (w.startsWith("guard")) return 1; if (w.startsWith("vet")) return 2; if (w.startsWith("repro")) return 3; if (w.startsWith("ci")) return 5; if (w.startsWith("review")) return 6; if (w.startsWith("submit")) return 7; return 4; };
  const pIdx = (j) => ({ vet: 2, ready: 3, hunt: 3, repro: 3, fix: 4, ci: 5, review: 6, approve: 7, gate: 7, submit: 7, done: 8 }[j.st] ?? (j.st === "drop" ? dropAt(j.why) : 0));
  const pbar = (j) => {
    const at = pIdx(j), done = j.st === "done", drop = j.st === "drop";
    return `<div class="pbar" title="Pipeline: ${PIPE.map((s) => s[1]).join(" → ")}">${PIPE.map((s, i) => `<i class="${done || i < at ? "ok" : i === at ? (drop ? "bad" : "run") : ""}" title="${esc(s[1])}"></i>`).join("")}</div>`;
  };
  window.AO.pbar = pbar;
  const jrow = (j, x) => `<div class="row${j.st === "approve" ? " apr" : ""}">${j.st === "approve" && x ? `<input type="checkbox" class="bk" data-k="${j.id}" ${sel.has(j.id) ? "checked" : ""} aria-label="select">` : ""}<span class="pill ${STC[j.st] || ""}">${esc(j.kind !== "fix" ? j.kind + "·" + j.st : j.st)}</span><div class="ti"><a class="a" href="#" data-j="${j.id}">${esc(j.title)}</a><div class="w">${esc(j.st === "ci" && S.cil[j.id] ? S.cil[j.id] : j.why || "")}</div>${pbar(j)}</div><span class="rp">${esc(rn(j))}${j.st === "approve" ? ` <button class="go" data-j="${j.id}">review</button>` : ""}${x && j.st !== "approve" ? ` <button class="x" data-d="${j.id}" title="drop">✕</button>` : ""}${!x && j.st === "drop" && j.kind === "fix" ? ` <button class="x" data-rq="${j.id}" title="try again">↻</button>` : ""}</span></div>`;

  const lists = () => {
    const q = S.q;
    $("qn").textContent = q.length ? q.length + " jobs" : "";
    const aps = q.filter((j) => j.st === "approve").map((j) => j.id);
    for (const k of [...sel]) if (!aps.includes(k)) sel.delete(k);
    const bk = aps.length > 1 ? `<div class="bkb"><label class="ck"><input type="checkbox" id="bkA" ${sel.size === aps.length ? "checked" : ""}> all ${aps.length}</label><span class="sp"></span>${sel.size ? `<button class="go" id="bkS">submit ${sel.size}</button><button class="dng" id="bkD">drop ${sel.size}</button>` : `<span class="k">select pull requests to submit together</span>`}</div>` : "";
    $("queue").innerHTML = bk + (q.length ? q.slice(0, 16).map((j) => jrow(j, true)).join("") : `<div class="empty">nothing waiting</div>`) + (S.dn.length ? `<div class="sub">recent</div>` + S.dn.slice(0, 12).map((j) => jrow(j, false)).join("") : "");
    const op = S.pr.filter((p) => p.st === "open").length, mg = S.pr.filter((p) => p.st === "merged").length;
    $("prn").textContent = `${op} open · ${mg} merged`;
    $("prs").innerHTML = S.pr.length ? S.pr.slice(0, 16).map((p) => `<div class="row"><span class="pill ${p.st === "merged" ? "ok" : p.st === "closed" ? "bad" : "info"}">${esc(p.st)}</span><div class="ti"><a class="a" href="#" data-u="${esc(p.url)}">${esc(p.title)}</a></div><span class="rp">${esc(rn({ repo: p.repo, num: p.num }))}</span></div>`).join("") : `<div class="empty">no pull requests yet</div>`;
    const m = Object.fromEntries(S.mg.map((x) => [x.d, x.n]));
    const days = [...Array(30)].map((_, i) => new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10));
    const mx = Math.max(1, ...days.map((d) => m[d] || 0));
    $("bars").innerHTML = days.map((d) => `<i class="${m[d] ? "" : "z"}" style="height:${m[d] ? Math.max(8, (m[d] / mx) * 100) : 2}%" title="${d}: ${m[d] || 0}"></i>`).join("");
    $("log").innerHTML = S.ev.slice(0, 30).map((e) => `<div><span class="tm">${hm(e.t)}</span><span style="color:${SK[e.w] ? hl(e.w) : "inherit"}">${esc(NM[e.w] || e.w)}</span><span>${esc(e.m)}</span></div>`).join("");
  };

  const chips = () => {
    const o = S.o;
    const n = $("cNet");
    if (o.off) { n.className = "chip bad"; n.innerHTML = "offline · " + Object.entries(o.net).filter(([k, v]) => !v && (k === "gh" || k === "an")).map(([k]) => ({ gh: "GitHub", an: "Anthropic" })[k]).join(", "); }
    else if (o.man) { n.className = "chip"; n.textContent = "paused"; }
    else if (o.pause) { n.className = "chip bad"; n.textContent = o.pause; }
    else if (o.warn) { n.className = "chip bad"; n.textContent = "Claude usage near its limit"; }
    else { n.className = "chip ok"; n.textContent = "online"; }
    $("cHo").innerHTML = (S.hs || []).filter((h) => h.on_).map((h) => `<b style="color:${o.net[h.id] === false ? "var(--bad)" : "var(--t1)"}">${esc(h.id)}</b>`).join(" ") || "no machine";
    const a = S.n;
    $("cQ").innerHTML = `vet <b>${a.vet || 0}</b> · ready <b>${a.ready || 0}</b> · approve <b>${a.approve || 0}</b> · done <b>${a.done || 0}</b>`;
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
  const apply = (s) => { if (!s || s.error) return; nt(s); S = s; last = performance.now(); err = 0; tiles(); lists(); chips(); tip(); window.AO.S = s; window.AO.onState && window.AO.onState(s); };
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
    const jb = e.target.closest("[data-j]");
    if (jb) { e.preventDefault(); window.AO.job && window.AO.job(Number(jb.dataset.j)); }
  });
  const SUN = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="currentColor"/><g stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M3 13l1-1M12 4l1-1"/></g></svg>`;
  const MOON = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M10.5 1.5a6.5 6.5 0 1 0 4 11.6A7 7 0 0 1 10.5 1.5z"/></svg>`;
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
  $("cH").onclick = () => window.AO.health && window.AO.health();
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
    return `<div class="th"><b>${NM[h.n]}</b><span>${esc(mdn(w.md))}</span></div>`
      + tr("status", esc(st) + (w.tk ? ` · ${kt(w.tk)} tok today` : ""))
      + (w.cs && (w.cs[0] || w.cs[1]) ? tr("cost", [w.cs[0] ? AO.usd(w.cs[0]) + " API" : "", w.cs[1] ? AO.usd(w.cs[1]) + " login value" : ""].filter(Boolean).join(" · ") + " today") : "")
      + (q ? tr("job", `${esc(rn(q))} · ${esc(q.title)} <span class="k">${esc(q.st)}</span>`) : "")
      + (w.say && !h.q ? tr("says", esc(w.say) + ` <span class="k">${ago(w.t)}</span>`) : "")
      + (cs.length ? `<div class="tc">${cs.map(([t, c]) => `<div><span class="k">${ago(t)}</span><span>${esc(c)}</span></div>`).join("")}</div>` : "")
      + (q ? `<div class="tf">click to open the job</div>` : "");
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
    el.innerHTML = h.h ? htip(h) : wtip(h);
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
    cv.style.cursor = h && (h.h || h.q || (S?.w?.[h.n]?.job)) ? "pointer" : "";
    tip();
  });
  cv.addEventListener("mouseleave", () => { hov = null; cv.style.cursor = ""; tip(); });
  cv.addEventListener("click", (e) => {
    const h = at(e);
    if (!h) return;
    if (h.h) return window.AO.hosts && window.AO.hosts();
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
  poll();
  live();
  requestAnimationFrame(frame);
})();
