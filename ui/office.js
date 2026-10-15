(() => {
  const K = window.K;
  const $ = (s) => document.getElementById(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const NAME = location.pathname.split("/")[2];
  const API = "/api/o/" + NAME;
  const get = async () => (await fetch(API + "/state", { cache: "no-store" })).json();
  const post = async (b) => (await fetch(API + "/act", { method: "POST", headers: { "content-type": "application/json", "x-office": "1" }, body: JSON.stringify(b) })).json();

  const DK = matchMedia("(prefers-color-scheme: dark)");
  const PD = { fl: "#0d0e10", fl2: "#111215", top: "#121317", ln: "#1d1f24", rm: "#0f1013", lb: "#3d4045", lb2: "#5c5f66", dk: "#2a2c32", dk2: "#1c1e22", dk3: "#25272c", leg: "#16171a", scr: "#0b0c0e", scw: "#0f1a1e", tx: "#8a8d94", dim: "#4a4d54", z: "#75746f" };
  const PL = { fl: "#e9e7e1", fl2: "#e3e1da", top: "#dedcd5", ln: "#cfccc4", rm: "#efede8", lb: "#a19d93", lb2: "#7c786f", dk: "#b9b5ab", dk2: "#cdc9bf", dk3: "#c4c0b6", leg: "#a9a59b", scr: "#2a2c32", scw: "#1d3640", tx: "#55524b", dim: "#8b877d", z: "#8b877d" };
  let C = DK.matches ? PD : PL;
  DK.addEventListener("change", () => { C = DK.matches ? PD : PL; });

  const PAL = ["#3fb6a8", "#d97757", "#5c7fd6", "#9c7ae0", "#d0649f", "#5cbf6a", "#4fb3e0", "#e0675a", "#b39a7c", "#8d9199", "#6aa84f", "#c27ba0"];
  const mix = (h, t, k) => {
    const a = parseInt(h.slice(1), 16), b = parseInt(t.slice(1), 16);
    const c = [16, 8, 0].map((s) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k));
    return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  };
  const skin = (col) => ({ body: col, dark: mix(col, "#000000", 0.28), light: mix(col, "#ffffff", 0.35) });
  const gray = (sk) => { const g = (h) => { const n = parseInt(h.slice(1), 16), y = Math.round(((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) * 0.6); return "#" + [y, y, y].map((v) => v.toString(16).padStart(2, "0")).join(""); }; return { body: g(sk.body), dark: g(sk.dark), light: g(sk.light) }; };

  const cv = $("cv"), cx = cv.getContext("2d");
  const off = document.createElement("canvas"), c = off.getContext("2d");
  const fig = document.createElement("canvas"); fig.width = K.W; fig.height = K.H;
  const fc = fig.getContext("2d");
  let VW = 400, VH = 258;
  let S = null, last = performance.now(), err = 0, LY = null, lk = "";
  const t0 = performance.now();
  const px = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };

  const ACC = {
    tie: (r) => { K.px(fc, r.left + 1, r.top + 5, "#1b1a18", r.bw - 2, 4); K.px(fc, r.cx - 1, r.top + 5, "#e8e6df", 2, 4); K.px(fc, r.cx, r.top + 6, "#cf6f7e", 1, 3); },
    ceo: (r) => { ACC.tie(r); K.px(fc, r.cx - 3, r.top - 5, "#1b1a18", 7, 4); K.px(fc, r.cx - 5, r.top - 1, "#1b1a18", 11, 1); },
    cap: (r, sk) => { K.px(fc, r.left - 1, r.top - 1, sk.dark, r.bw + 2, 1); K.px(fc, r.left + 2, r.top - 3, sk.dark, r.bw - 4, 2); K.px(fc, r.cx - 1, r.top - 4, "#5cbf6a", 2, 1); },
    antenna: (r, sk, t) => { K.px(fc, r.cx, r.top - 4, sk.dark, 1, 4); K.px(fc, r.cx - 1, r.top - 6, Math.floor(t * 3) % 2 ? "#e8e6df" : sk.light, 3, 2); },
    shield: (r, sk) => { K.draw(fc, ["sss", "sws", "sss", ".s."], r.left + 2, r.top + 4, { body: sk.body }); },
    glasses: (r) => { const y = r.eyeY - 1; for (const x of [r.cx - 5, r.cx + 2]) { K.px(fc, x, y, "#e8e6df", 4, 1); K.px(fc, x, y + 3, "#e8e6df", 4, 1); K.px(fc, x, y, "#e8e6df", 1, 4); K.px(fc, x + 3, y, "#e8e6df", 1, 4); } K.px(fc, r.cx - 1, y + 1, "#e8e6df", 3, 1); },
    magnifier: (r, sk, t, w) => { const y = r.handR.y - 5 + (w ? Math.round(Math.sin(t * 4)) : 0); K.draw(fc, [".ww.", "w..w", "w..w", ".ww.", "...g", "....g"], r.handR.x, y, {}); },
    pen: (r) => { K.px(fc, r.handR.x, r.handR.y - 4, "#e0675a", 1, 4); K.px(fc, r.handR.x, r.handR.y, "#e8e6df", 1, 1); },
    headset: (r) => { K.px(fc, r.left - 1, r.top - 2, "#55524b", r.bw + 2, 1); K.px(fc, r.left - 2, r.top - 1, "#55524b", 1, 4); K.px(fc, r.right + 1, r.top - 1, "#55524b", 1, 4); K.px(fc, r.left - 3, r.top + 1, "#e8e6df", 2, 3); K.px(fc, r.right + 1, r.top + 1, "#e8e6df", 2, 3); },
    hat: (r, sk) => { K.px(fc, r.left + 2, r.top - 2, sk.dark, r.bw - 4, 2); K.px(fc, r.right - 3, r.top - 1, sk.dark, 5, 1); },
    beanie: (r, sk) => { K.px(fc, r.left + 2, r.top - 3, sk.dark, r.bw - 4, 3); K.px(fc, r.cx - 1, r.top - 5, "#e8e6df", 2, 2); },
    scarf: (r) => { K.px(fc, r.left, r.top + 1, "#e0675a", r.bw, 1); K.px(fc, r.left - 2, r.top + 2, "#e0675a", 2, 1); },
    badge: (r) => { K.draw(fc, ["1.1", "111", "1.1"], r.cx - 1, r.top + 6, { c1: "#4fb3e0" }); },
    apron: (r) => { K.px(fc, r.left + 1, r.top + 6, "#e8e6df", r.bw - 2, 2); K.px(fc, r.right - 4, r.top + 8, "#e8e6df", 2, 3); },
    shades: (r) => { K.px(fc, r.cx - 5, r.eyeY - 1, "#101112", 4, 2); K.px(fc, r.cx + 2, r.eyeY - 1, "#101112", 4, 2); K.px(fc, r.cx - 1, r.eyeY - 1, "#101112", 3, 1); },
    headband: (r) => { K.px(fc, r.left, r.top - 2, "#9c7ae0", r.bw, 1); K.px(fc, r.left - 2, r.top, "#9c7ae0", 2, 3); K.px(fc, r.right, r.top, "#9c7ae0", 2, 3); },
    tophat: (r) => { K.px(fc, r.cx - 3, r.top - 6, "#1b1a18", 7, 5); K.px(fc, r.cx - 5, r.top - 1, "#1b1a18", 11, 1); },
  };

  const crab = (id, sk, acc, x, y, t, st, mood, seed) => {
    const p = K.pose();
    p.legs = "sit";
    const bl = Math.floor((t + seed) * 10) % 47 === 0;
    if (st === "work") {
      const k = Math.floor(t * 9 + seed);
      p.armL = "front"; p.armR = "front";
      p.aL = [0, k % 2 ? -1 : 0]; p.aR = [0, k % 2 ? 0 : -1];
      p.ex = -1; p.ey = 1;
      p.dy = Math.floor(t * 4 + seed) % 4 === 0 ? -1 : 0;
      if (Math.floor(t * 0.7 + seed) % 5 === 0) { p.ex = 0; p.ey = -1; p.eyes = "half"; }
      if (bl) p.eyes = "shut";
    } else if (st === "sleep") { p.eyes = "shut"; p.bh = -1; p.dy = 1; p.armL = "low"; p.armR = "low"; }
    else if (st === "off") { p.eyes = "half"; p.mouth = "flat"; p.bh = -1; }
    else {
      p.bh = Math.floor((t + seed) * 0.8) % 2 ? 0 : -1;
      p.ex = [0, 1, 0, -1][Math.floor((t + seed) * 0.4) % 4];
      if (bl) p.eyes = "shut";
    }
    if (mood === "ok") { p.eyes = "glad"; p.mouth = "smile"; p.armL = "top"; p.armR = "top"; p.dy = Math.floor(t * 6) % 2 ? -2 : 0; }
    else if (mood === "sad" || mood === "err") { p.eyes = "sad"; p.mouth = "sad"; p.armL = "low"; p.armR = "low"; }
    const s2 = st === "off" ? gray(sk) : sk;
    fc.clearRect(0, 0, K.W, K.H);
    const { r } = K.figure(fc, p, t, s2);
    if (ACC[acc]) ACC[acc](r, s2, t, st === "work");
    c.drawImage(fig, Math.round(x - 24), Math.round(y - 41));
    if (st === "sleep") {
      const k = ((t + seed) * 0.6) % 1;
      c.globalAlpha = 1 - k;
      K.text(c, "Z", x + 8 + k * 4, y - 26 - k * 8, C.z);
      c.globalAlpha = 1;
    }
  };

  const desk = (x, y, col) => {
    px(x - 14, y, 28, 3, C.dk);
    px(x - 14, y + 3, 28, 8, C.dk2);
    px(x - 14, y + 3, 28, 1, C.dk3);
    px(x - 12, y + 11, 2, 3, C.leg);
    px(x + 10, y + 11, 2, 3, C.leg);
    px(x - 8, y + 6, 16, 1, col);
  };
  const screen = (x, y, w, st, sk, t) => {
    px(x, y, w, 9, C.dk);
    px(x + 1, y + 1, w - 2, 7, st === "work" ? C.scw : C.scr);
    px(x + (w >> 1) - 1, y + 9, 2, 2, C.dk);
    if (st === "work") {
      const sc = Math.floor(t * 6);
      for (let i = 0; i < 3; i++) px(x + 2, y + 2 + i * 2, 2 + ((sc + i) * 7) % (w - 5), 1, i === 2 ? sk.light : sk.dark);
    } else if (st !== "sleep" && st !== "off") {
      px(x + 2, y + 2, 3, 1, sk.dark);
      if (Math.floor(t * 1.2) % 2) px(x + 6, y + 2, 1, 1, sk.light);
    }
  };
  const rack = (x, y, t, busy, lb) => {
    px(x - 7, y - 34, 14, 46, C.dk2);
    px(x - 7, y - 34, 14, 1, C.dk);
    for (let i = 0; i < 6; i++) {
      const yy = y - 30 + i * 7;
      px(x - 5, yy, 10, 5, C.scr);
      for (let j = 0; j < 2; j++) {
        const on = busy ? Math.floor(t * (5 + i) + j * 3 + i + x) % 3 !== 0 : (i + j) % 5 === 0;
        px(x + 1 + j * 2, yy + 2, 1, 1, on ? (busy ? "#5cbf6a" : C.lb) : C.dk);
      }
    }
    px(x - 2, y - 39, 4, 4, busy ? (Math.floor(t * 2) % 2 ? "#4fb3e0" : "#2f86b0") : C.lb);
    K.text(c, lb, x - (K.textWidth(lb) >> 1), y + 15, busy ? C.tx : C.dim);
  };
  const tray = (x, y, n, lb, col) => {
    px(x - 12, y, 24, 8, C.dk);
    px(x - 11, y + 1, 22, 6, C.dk2);
    for (let i = 0; i < Math.min(n, 6); i++) px(x - 9, y - 1 - i, 18, 1, i % 2 ? "#e8e6df" : "#cfccc4");
    K.text(c, lb, x - (K.textWidth(lb) >> 1), y + 11, C.dim);
    if (n) K.text(c, String(n), x - (K.textWidth(String(n)) >> 1), y - 10 - Math.min(n, 6), col);
  };
  const plant = (x, y) => { px(x - 3, y, 7, 6, C.dk); K.draw(c, ["..e.e..", ".eEe.e.", "e.eEee.", ".eeEe.e", "..eEe.."], x - 3, y - 5, {}); };

  const build = () => {
    const sg = $("stage"), aw = Math.max(200, sg.clientWidth - 2), ah = Math.max(150, sg.clientHeight - 2);
    let best = null;
    for (const w of [360, 420, 480, 560, 640, 720]) { const l = lay(w); const sc = Math.min(aw / w, ah / l.vh); if (!best || sc > best.sc + 0.01) best = { ...l, sc, w }; }
    VW = best.w; VH = best.vh;
    off.width = VW; off.height = VH;
    return best;
  };

  const lay = (VW) => {
    const P = S.plan;
    const wk = {};
    (P?.workers || []).forEach((w, i) => { wk[w.id] = { id: w.id, nm: w.name, n: w.n, sk: skin(w.color || PAL[i % PAL.length]), acc: w.acc }; });
    wk.ceo = { id: "ceo", nm: "CEO", n: 1, sk: skin("#a23b4a"), acc: "ceo" };
    if (P?.guard && P.stages.some((g) => g.untrusted)) wk.guard = { id: "guard", nm: "Guard", n: 1, sk: skin("#5c7fd6"), acc: "shield" };
    const used = new Set();
    const rooms = [];
    for (const r of P?.layout?.rooms || []) { const ws = r.ws.filter((w) => wk[w] && !used.has(w)); ws.forEach((w) => used.add(w)); if (ws.length) rooms.push({ nm: r.name, ws }); }
    const rest = Object.keys(wk).filter((w) => !used.has(w) && w !== "ceo" && w !== "guard");
    if (rest.length) rooms.push({ nm: rooms.length ? "Floor" : "Office", ws: rest });
    if (wk.guard) rooms.unshift({ nm: "Gate", ws: ["guard"] });
    const code = (P?.stages || []).filter((g) => g.kind === "code");
    const boxes = [];
    for (const r of rooms) {
      const n = r.ws.reduce((a, w) => a + Math.min(wk[w].n, 4), 0);
      boxes.push({ ...r, cols: Math.min(n, 5), rows: Math.ceil(n / 5), kind: "room" });
    }
    if (code.length) boxes.push({ nm: "Server", ws: code.map((g) => g.id), cols: Math.min(code.length, 5), rows: Math.ceil(code.length / 5), kind: "rack" });
    boxes.push({ nm: "CEO", ws: ["ceo"], cols: 1, rows: 1, kind: "room" });
    boxes.push({ nm: "Out", ws: [], cols: 2, rows: 1, kind: "out" });
    let x = 6, y = 30, rh = 0;
    const seats = {}, AN = {};
    for (const b of boxes) {
      const sw = b.kind === "rack" ? 22 : 34;
      b.w = Math.max(64, b.cols * sw + 16);
      b.h = b.rows * 64 + 22;
      if (x + b.w > VW - 6) { x = 6; y += rh + 8; rh = 0; }
      b.x = x; b.y = y;
      x += b.w + 8; rh = Math.max(rh, b.h);
      let k = 0;
      const cx0 = b.x + (b.w - b.cols * sw) / 2 + sw / 2;
      if (b.kind === "out") { AN.done = [b.x + b.w * 0.3, b.y + 50]; AN.drop = [b.x + b.w * 0.75, b.y + 50]; continue; }
      for (const w of b.ws) {
        const n = b.kind === "rack" ? 1 : Math.min(wk[w].n, 4);
        for (let i = 0; i < n; i++, k++) {
          const sx = cx0 + (k % b.cols) * sw, sy = b.y + 52 + Math.floor(k / b.cols) * 64;
          (seats[w] ||= []).push([sx, sy]);
        }
        AN[w] = seats[w][0];
      }
    }
    return { wk, boxes, seats, AN, vh: Math.max(120, y + rh + 8) };
  };

  const floor = () => {
    px(0, 0, VW, VH, C.fl);
    px(0, 0, VW, 24, C.top);
    px(0, 24, VW, 1, C.ln);
    for (let k = 0, y = 25; y < VH; y += 8, k++) for (let x = k % 2 ? 0 : 8; x < VW; x += 16) px(x, y, 8, 8, C.fl2);
  };
  const sign = (t) => {
    K.text(c, (S.n || "").slice(0, 28), 6, 9, C.tx);
    const op = S.op || 0, dn = S.cnt.done || 0;
    K.text(c, `Q ${op} DONE ${dn}`, 6, 16, C.dim);
    const d = new Date();
    const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    K.text(c, hm, VW - 6 - K.textWidth(hm), 9, C.dim);
    const live = S.st === "run" && !S.why;
    px(VW - 30, 10, 3, 3, live ? (Math.floor(t * 1.5) % 2 ? "#5cbf6a" : "#3d9149") : S.st === "review" || S.why ? "#e0675a" : C.lb);
  };

  const PLANE = ["w....", "www..", "wwwww", ".gww.", "..g.."];
  const paths = () => {
    const now = S.t + (performance.now() - last);
    for (const f of S.fl) {
      const A = LY.AN[f.a], B = LY.AN[f.b];
      if (!A || !B) continue;
      const k = Math.min(1, (now - f.t) / 1800);
      if (k >= 1) continue;
      const ax = A[0], ay = A[1] - 22, bx = B[0], by = B[1] - 22;
      const hg = 18 + Math.min(40, Math.hypot(bx - ax, by - ay) * 0.25);
      const pos = (u) => [ax + (bx - ax) * u, ay + (by - ay) * u - Math.sin(u * Math.PI) * hg];
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const col = LY.wk[f.a]?.sk.light || "#e8e6df";
      for (let j = 2; j <= 14; j += 2) { const u = e - j * 0.018; if (u <= 0) break; const [tx, ty] = pos(u); c.globalAlpha = (1 - j / 15) * 0.8; px(tx, ty, 1, 1, col); }
      c.globalAlpha = 1;
      const [x, y] = pos(e), [nx] = pos(Math.min(1, e + 0.02));
      K.draw(c, PLANE, x - 2, y - 2, {}, nx < x);
    }
  };

  const frame = () => {
    requestAnimationFrame(frame);
    if (!S || !LY) return;
    const t = (performance.now() - t0) / 1000;
    c.imageSmoothingEnabled = false; fc.imageSmoothingEnabled = false;
    floor();
    sign(t);
    const now = S.t + (performance.now() - last);
    const paused = S.st !== "run" || !!S.why;
    for (const b of LY.boxes) {
      px(b.x, b.y, b.w, b.h, C.rm);
      px(b.x, b.y, b.w, 1, C.ln); px(b.x, b.y + b.h - 1, b.w, 1, C.ln); px(b.x, b.y, 1, b.h, C.ln); px(b.x + b.w - 1, b.y, 1, b.h, C.ln);
      K.text(c, b.nm.slice(0, Math.floor((b.w - 8) / 4)), b.x + 4, b.y + 4, C.lb);
      if (b.kind === "out") { tray(LY.AN.done[0], LY.AN.done[1], S.cnt.done || 0, "DONE", "#5cbf6a"); tray(LY.AN.drop[0], LY.AN.drop[1], S.cnt.drop || 0, "DROP", "#e0675a"); continue; }
      for (const id of b.ws) {
        const ss = LY.seats[id] || [];
        if (b.kind === "rack") {
          const busy = (S.w[id]?.busy || 0) > 0;
          ss.forEach(([x, y]) => rack(x, y, t, busy, id.toUpperCase().slice(0, 6)));
          continue;
        }
        const w = S.w[id] || { st: "idle", busy: 0 };
        const wd = LY.wk[id];
        const its = S.q.filter((q) => q.lk === id);
        ss.forEach(([x, y], i) => {
          const work = id === "ceo" ? S.cb : i < (w.busy || 0);
          const st = w.hold || (paused && !work) ? "sleep" : work ? "work" : "idle";
          const mood = now - (w.t || 0) < 5000 && i === 0 ? w.mood : "";
          crab(id, wd.sk, wd.acc, x + 4, y + 2, t, st, mood, i * 3.1 + id.length);
          desk(x, y, wd.sk.dark);
          screen(x - 13, y - 11, 11, st, wd.sk, t + i);
          const lb = i === 0 ? wd.nm.toUpperCase().slice(0, 8) : its[i] ? String(its[i].id) : "";
          const l2 = i === 0 && its[0] ? String(its[0].id) : "";
          K.text(c, lb, x - (K.textWidth(lb) >> 1), y + 16, work ? wd.sk.light : C.dim);
          if (l2) K.text(c, l2, x - (K.textWidth(l2) >> 1), y + 23, C.dim);
        });
        if (id === "ceo" && S.cb) K.text(c, "!", ss[0][0] + 14, ss[0][1] - 42 + (Math.floor(t * 4) % 2), "#cf6f7e");
      }
    }
    plant(VW - 10, VH - 10);
    paths();
    const dp = window.devicePixelRatio || 1, sg = $("stage");
    const sc = Math.max(1, Math.floor(Math.min((sg.clientWidth - 2) * dp / VW, (sg.clientHeight - 2) * dp / VH) * 2) / 2);
    if (cv.width !== VW * sc || cv.height !== VH * sc) { cv.width = VW * sc; cv.height = VH * sc; cv.style.width = VW * sc / dp + "px"; cv.style.height = VH * sc / dp + "px"; }
    cx.imageSmoothingEnabled = false;
    cx.drawImage(off, 0, 0, VW * sc, VH * sc);
  };

  const ago = (t) => { const s = Math.max(0, (Date.now() - t) / 1000); return s < 60 ? Math.round(s) + "s" : s < 3600 ? Math.round(s / 60) + "m" : s < 86400 ? Math.round(s / 3600) + "h" : Math.round(s / 86400) + "d"; };
  const hm = (t) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const kt = (n) => (n > 999999 ? (n / 1e6).toFixed(1) + "M" : n > 999 ? Math.round(n / 1000) + "k" : String(n));
  const mdn = (m) => (!m ? "no model" : /haiku/.test(m) ? "Haiku" : /sonnet/.test(m) ? "Sonnet" : /opus/.test(m) ? "Opus" : m);

  const tiles = () => {
    const el = $("tiles");
    const ids = ["ceo", ...(LY.wk.guard ? ["guard"] : []), ...(S.plan?.workers || []).map((w) => w.id), ...(S.plan?.stages || []).filter((g) => g.kind === "code").map((g) => g.id)];
    const key = ids.join(",");
    if (el.dataset.k !== key) {
      el.dataset.k = key;
      el.innerHTML = ids.map((n) => { const wd = LY.wk[n]; const col = wd ? wd.sk.body : "#8d9199"; const nm = wd ? wd.nm : n; return `<div class="tile" data-w="${esc(n)}"><div class="hd"><span class="dot" style="background:${col}"></span><span class="nmx">${esc(nm)}</span><span class="md"></span></div><div class="sy"></div><div class="stt"></div><div class="ft"></div></div>`; }).join("");
    }
    for (const t of el.children) {
      const n = t.dataset.w, w = S.w[n] || { st: "idle", say: "", busy: 0, tk: 0 };
      const pw = S.plan?.workers.find((x) => x.id === n);
      const md = n === "ceo" ? "claude-opus" : n === "guard" ? "claude-haiku" : pw ? pw.model : "";
      const wk = n === "ceo" ? S.cb : w.busy > 0;
      t.querySelector(".md").textContent = mdn(md) + (pw && pw.n > 1 ? " ×" + pw.n : "");
      t.querySelector(".sy").textContent = w.say || "…";
      t.className = "tile" + (wk ? " work" : "") + (w.hold ? " hold" : "");
      t.querySelector(".stt").textContent = w.hold ? "paused" : wk ? "work" + (w.busy > 1 ? " ×" + w.busy : "") : "idle";
      t.querySelector(".ft").textContent = w.tk ? kt(w.tk) + " tok" : "";
      t.title = n === "ceo" ? "open the CEO chat" : w.hold ? "click to resume this worker" : "click to pause this worker";
    }
  };

  const STC = { done: "ok", drop: "bad" };
  const irow = (j, x) => `<div class="row"><span class="pill ${j.lk ? "work" : STC[j.st] || ""}" title="${esc(j.st)}">${esc(j.st.replace(/^guard:.*/, "guard"))}</span><div class="ti"><span class="a" title="${esc(j.ti)}">${esc(j.ti)}</span><div class="w" title="${esc(j.why || "")}">${esc(j.why || "")}</div></div><span class="rp">#${j.id}${x ? ` <button class="x" data-d="${j.id}" title="drop this item">✕</button>` : " " + ago(j.t1)}</span></div>`;

  const lists = () => {
    $("qn").textContent = S.q.length ? S.q.length + (S.op > S.q.length ? " of " + S.op : "") : "";
    $("queue").innerHTML = S.q.length ? S.q.map((j) => irow(j, !j.lk)).join("") : `<div class="empty">${S.st === "run" ? "nothing waiting" : "no items yet"}</div>`;
    $("dnn").textContent = `${S.cnt.done || 0} done · ${S.cnt.drop || 0} dropped`;
    $("done").innerHTML = S.dn.length ? S.dn.map((j) => irow(j, false)).join("") : `<div class="empty">nothing finished yet</div>`;
    $("log").innerHTML = S.ev.slice(0, 40).map((e) => `<div><span class="tm">${hm(e.t)}</span><span style="color:${LY.wk[e.w]?.sk.body || "inherit"}">${esc(LY.wk[e.w]?.nm || e.w)}</span><span title="${esc(e.m)}">${esc(e.m)}</span></div>`).join("");
    const kp = S.tiles || [];
    $("kpi").hidden = !kp.length;
    $("kp").innerHTML = kp.map((t) => {
      if (t.kind === "count" || t.kind === "sum") return `<div class="kv"><div class="k">${esc(t.label)}</div><div class="v">${esc(Math.round(Number(t.v) * 100) / 100)}</div></div>`;
      if (t.kind === "text") return `<div class="kv wide"><div class="k">${esc(t.label)}</div><div class="tx">${esc(t.v)}</div></div>`;
      if (t.kind === "list") return `<div class="kv wide"><div class="k">${esc(t.label)}</div><ul>${(t.v || []).map((x) => `<li title="${esc(x)}">${esc(x)}</li>`).join("") || "<li>–</li>"}</ul></div>`;
      if (t.kind === "chart") {
        const m = Object.fromEntries((t.v || []).map((x) => [x.d, x.n]));
        const days = [...Array(14)].map((_, i) => new Date(Date.now() - (13 - i) * 86400000).toISOString().slice(0, 10));
        const mx = Math.max(1, ...days.map((d) => m[d] || 0));
        return `<div class="kv wide"><div class="k">${esc(t.label)}</div><div class="bars">${days.map((d) => `<i class="${m[d] ? "" : "z"}" style="height:${m[d] ? Math.max(8, (m[d] / mx) * 100) : 4}%" title="${d}: ${m[d] || 0}"></i>`).join("")}</div></div>`;
      }
      return "";
    }).join("");
  };

  const ST = { new: ["CEO is designing", "info"], draft: ["waiting for your approval", "info"], review: ["needs approval", "bad"], run: ["running", "ok"], pause: ["paused", ""] };
  const chips = () => {
    $("nm").textContent = S.n;
    document.title = S.n + " · ApolloOffice";
    const [l, k] = ST[S.st] || [S.st, ""];
    const e = $("cSt");
    e.className = "chip " + (S.why ? "bad" : k);
    e.textContent = S.why ? S.why : S.fin ? "finished" : l;
    $("cCeo").hidden = !S.cb;
    const tk = $("cTok"), p = S.tok.max ? Math.round((S.tok.day / S.tok.max) * 100) : 0;
    tk.className = "chip mt" + (p >= 80 ? " hi" : "");
    tk.innerHTML = `today <span class="bar"><i style="width:${Math.min(100, p)}%"></i></span><b>${kt(S.tok.day)}</b>${S.tok.max ? " / " + kt(S.tok.max) : ""} tok`;
    tk.title = "weighted tokens used today (cache reads count 10%) against the daily budget";
    const b = $("bPause");
    b.hidden = !["run", "pause"].includes(S.st);
    b.textContent = S.st === "pause" ? "Resume" : "Pause";
  };

  const permRows = (P, ok) => {
    const r = [];
    const has = (k, v) => ok && (k === "fs" ? ok.fs.includes(v) : k === "sh" ? (ok.sh === true || (Array.isArray(ok.sh) && ok.sh.includes(v))) : k === "net" ? ok.net.includes(v) : ok[k]);
    for (const f of P.perm.fs) r.push(["fs", f, "read and write files in " + f, false]);
    if (P.perm.sh === true) r.push(["sh", true, "run ANY shell command in the work folder", true]);
    else if (Array.isArray(P.perm.sh)) for (const s of P.perm.sh) r.push(["sh", s, "run shell commands matching: " + s, false]);
    for (const d of P.perm.net) r.push(["net", d, "network access to " + d, d.startsWith("*")]);
    if (P.perm.push) r.push(["push", true, "git push", true]);
    if (P.perm.gh) r.push(["gh", true, "use the GitHub CLI (gh) with your login", true]);
    return r.map(([k, v, lb, hot]) => ({ k, v, lb, hot, on: ok ? !!has(k, v) : true }));
  };

  let pk = "";
  const plan = () => {
    const el = $("plan");
    const show = ["new", "draft", "review"].includes(S.st);
    el.hidden = !show;
    if (!show) { pk = ""; return; }
    const P = S.plan;
    const key = S.st + "|" + JSON.stringify(P) + "|" + JSON.stringify(S.ok);
    if (key === pk) return;
    pk = key;
    if (!P) {
      el.innerHTML = `<div class="wait"><div class="lead">The CEO is looking at your task and designing the office.</div><div>Questions and the plan will show up in the CEO chat.</div></div>`;
      return;
    }
    const rows = permRows(P, S.st === "review" ? S.ok : null);
    const mk = (g) => g.kind === "code" ? `<b>${esc(g.id)}</b> runs <code>${esc(g.run?.sh || g.run?.js)}</code>` : `<b>${esc(g.id)}</b> (${esc(P.workers.find((w) => w.id === g.worker)?.name || g.worker)})`;
    const flow = P.stages.map((g) => `${mk(g)} → ${g.kind === "source" ? esc(g.spawn) + " every " + (g.every < 120 ? g.every + " s" : Math.round(g.every / 60) + " min") : g.to.map(esc).join(" / ")}${g.kind === "code" && g.fail !== "drop" ? ", on failure back to " + esc(g.fail) : ""}${g.check ? ", checked by " + esc(g.check) : ""}${g.untrusted ? ", screened by Guard" : ""}`).join("<br>");
    el.innerHTML = `
      <h3>${S.st === "review" ? "The CEO changed the office" : "Office plan"}</h3>
      <p class="lead">${esc(P.task)}</p>
      ${P.est ? `<p>${esc(P.est)}</p>` : ""}
      <h3>Workers</h3>
      <table>${P.workers.map((w) => `<tr><td>${esc(w.name)}</td><td>${mdn(w.model)}${w.n > 1 ? " ×" + w.n : ""}</td><td>${esc(w.tools.join(", ") || "no tools")}</td></tr>`).join("")}</table>
      <h3>Flow</h3><div class="flow">${flow}</div>
      <h3>Permissions</h3>
      <p>Untick anything you do not want to allow. The office then works without it.</p>
      ${rows.map((r, i) => `<label class="perm${r.hot ? " hot" : ""}"><input type="checkbox" data-p="${i}" ${r.on ? "checked" : ""}> ${esc(r.lb)}</label>`).join("")}
      <label class="perm"><input type="checkbox" checked disabled> write results into <small>${esc(S.od)}/out</small></label>
      <h3>Budget</h3>
      <p>at most ${kt(P.budget.tok)} tokens per day, ${P.budget.par} workers at once, models up to ${mdn("claude-" + P.budget.max)}</p>
      <div class="acts"><button class="go" id="bStart">${S.st === "review" ? "Approve and continue" : "Start office"}</button><button id="bAsk">Ask the CEO for changes</button><span class="note">Work folder: ${esc(P.dir)}</span></div>`;
    el.querySelector("#bAsk").onclick = () => openChat(true);
    el.querySelector("#bStart").onclick = async () => {
      const on = [...el.querySelectorAll("input[data-p]")].filter((i) => i.checked).map((i) => rows[Number(i.dataset.p)]);
      const g = { fs: on.filter((r) => r.k === "fs").map((r) => r.v), sh: on.some((r) => r.k === "sh" && r.v === true) ? true : on.filter((r) => r.k === "sh").map((r) => r.v), net: on.filter((r) => r.k === "net").map((r) => r.v), push: on.some((r) => r.k === "push"), gh: on.some((r) => r.k === "gh") };
      if (Array.isArray(g.sh) && !g.sh.length) g.sh = false;
      el.querySelector("#bStart").disabled = true;
      apply(await post({ a: "start", perm: g }));
    };
  };

  let cn = -1, seenCeo = 0;
  const chat = () => {
    $("chs").textContent = S.cb ? "thinking…" : "";
    if (S.ch.length !== cn) {
      cn = S.ch.length;
      const m = $("msgs");
      m.innerHTML = S.ch.map((x) => `<div class="msg ${x.who === "ceo" ? "ceo" : "user"}"><span class="tm">${x.who === "ceo" ? "CEO" : "You"} · ${hm(x.t)}</span>${esc(x.m)}</div>`).join("") || `<div class="empty">no messages yet</div>`;
      m.scrollTop = m.scrollHeight;
      const lc = S.ch.filter((x) => x.who === "ceo").pop();
      if (lc && lc.t > seenCeo && seenCeo) openChat(false);
      if (lc) seenCeo = Math.max(seenCeo, lc.t);
    }
  };
  const openChat = (f) => { $("chat").hidden = false; if (f) $("ci").focus(); };
  $("bChat").onclick = () => { $("chat").hidden = !$("chat").hidden; if (!$("chat").hidden) $("ci").focus(); };
  $("bClose").onclick = () => { $("chat").hidden = true; };
  $("cf").onsubmit = async (e) => {
    e.preventDefault();
    const v = $("ci").value.trim();
    if (!v) return;
    $("ci").value = "";
    apply(await post({ a: "chat", m: v }));
  };
  $("ci").onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("cf").requestSubmit(); } };
  $("bPause").onclick = async () => apply(await post({ a: S.st === "pause" ? "resume" : "pause" }));
  $("tiles").onclick = async (e) => {
    const t = e.target.closest(".tile");
    if (!t) return;
    if (t.dataset.w === "ceo") return openChat(true);
    apply(await post({ a: "hold", w: t.dataset.w, on: !S.w[t.dataset.w]?.hold }));
  };
  document.addEventListener("click", async (e) => {
    const d = e.target.closest("[data-d]");
    if (d) apply(await post({ a: "drop", id: Number(d.dataset.d) }));
  });
  let rz = 0;
  addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (S) LY = build(); }, 150); });
  addEventListener("keydown", (e) => { if (e.key === "Escape") $("chat").hidden = true; });

  const apply = (s) => {
    if (!s || s.error) return;
    const first = !S;
    S = s; last = performance.now(); err = 0;
    const k = JSON.stringify([s.plan?.workers, s.plan?.stages, s.plan?.layout?.rooms, s.plan?.guard]);
    if (k !== lk) { lk = k; LY = build(); }
    tiles(); lists(); chips(); plan(); chat();
    if (first) { seenCeo = Math.max(0, ...s.ch.filter((x) => x.who === "ceo").map((x) => x.t)); if (s.st === "new" || (s.ch.length && s.ch[s.ch.length - 1].who === "ceo" && s.st !== "run")) openChat(false); }
  };

  const poll = async () => {
    try { apply(await get()); } catch {
      if (++err > 2) { const e = $("cSt"); e.className = "chip bad"; e.textContent = "daemon not reachable"; }
    }
    setTimeout(poll, 1000);
  };
  poll();
  requestAnimationFrame(frame);
  const sh = new URLSearchParams(location.search).get("shot");
  if (sh) { const i = new Image(); i.src = "/api/wait?ms=" + sh; i.hidden = true; document.body.appendChild(i); if (new URLSearchParams(location.search).has("chat")) $("chat").hidden = false; }
})();
