(() => {
  const D = document, H = D.documentElement;
  const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const RAMP = " .,:-=+*#%@";

  const cv = D.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const rgb = s => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = "#000"; cv.fillStyle = s; cv.fillRect(0, 0, 1, 1); const d = cv.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
  let P = {};
  const pal = () => {
    const cs = getComputedStyle(H);
    const g = k => rgb(cs.getPropertyValue(k).trim());
    P = { bg: g("--bg"), tx: g("--text"), mu: g("--muted"), fa: g("--faint"), ln: g("--line"), ac: g("--acc"), a2: g("--acc2"), w: [...Array(10)].map((_, i) => g("--w" + i)) };
  };
  const css = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const hs = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

  class Grid {
    constructor(el, C, R, fill, fix) {
      this.el = el; this.x = el.getContext("2d"); this.C = C; this.R = R; this.fill = fill; this.fix = fix;
      this.v = new Float32Array(C * R); this.c = new Array(C * R); this.g = new Array(C * R);
      this.mx = -99; this.my = -99; this.t0 = performance.now(); this.vis = false; this.raf = 0;
      el.addEventListener("pointermove", e => { const r = el.getBoundingClientRect(); this.mx = (e.clientX - r.left) / this.cw; this.my = (e.clientY - r.top) / this.ch; this.kick(); });
      el.addEventListener("pointerleave", () => { this.mx = this.my = -99; this.kick(); });
      new ResizeObserver(() => this.size()).observe(el);
      new IntersectionObserver(es => { this.vis = es[0].isIntersecting; this.kick(); }).observe(el);
      D.addEventListener("visibilitychange", () => this.kick());
      this.size();
    }
    size() {
      const r = this.el.getBoundingClientRect(), d = devicePixelRatio || 1;
      if (this.fix) { this.fix(this, r.width); return; }
      this.el.width = r.width * d; this.el.height = r.height * d;
      this.cw = r.width / this.C; this.ch = r.height / this.R; this.d = d; this.draw(performance.now());
    }
    kick() { if (!this.raf) this.raf = requestAnimationFrame(t => this.loop(t)); }
    loop(t) {
      this.raf = 0; this.draw(t);
      if (!RM && this.vis && !D.hidden) this.kick();
    }
    clr() { this.v.fill(0); this.c.fill(null); this.g.fill(null); }
    px(x, y, v, c) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= this.C || y >= this.R) return; const i = y * this.C + x; this.v[i] = v; this.c[i] = c; this.g[i] = null; }
    tx(x, y, s, c) { for (let k = 0; k < s.length; k++) { const X = (x + k) | 0; if (X < 0 || X >= this.C || y < 0 || y >= this.R) continue; const i = y * this.C + X; this.g[i] = s[k]; this.c[i] = c; this.v[i] = 1; } }
    draw(now) {
      const t = (now - this.t0) / 1000, x = this.x, { C, R, cw, ch, d } = this;
      this.clr(); this.fill(this, RM ? 6.3 : t);
      x.setTransform(d, 0, 0, d, 0, 0); x.clearRect(0, 0, C * cw, R * ch);
      const fs = Math.min(cw * 1.55, ch * 0.95);
      x.font = `${fs}px "Geist Mono", ui-monospace, monospace`;
      x.textAlign = "center"; x.textBaseline = "middle";
      const rv = RM ? 9 : t, mr = 5.5;
      for (let y = 0; y < R; y++) for (let k = 0; k < C; k++) {
        const i = y * C + k; let v = this.v[i], g = this.g[i], c = this.c[i];
        const h = hs(k, y), on = rv - (k / C) * 0.9 - h * 0.35;
        const dx = k - this.mx, dy = (y - this.my) * (ch / cw), dd = Math.sqrt(dx * dx + dy * dy) / mr;
        const near = dd < 1;
        if (on < 0) continue;
        const cx = k * cw + cw / 2, cy = y * ch + ch / 2;
        if (on < 0.14) { x.fillStyle = css(P.ac, 0.7); x.fillText(RAMP[1 + ((h * 97 + t * 30) | 0) % 10], cx, cy); continue; }
        if (near && !RM) {
          const f = 1 - dd;
          if (g) { if (hs(k + (t * 12 | 0), y) < f * 0.6) g = RAMP[3 + ((h * 50 + t * 20) | 0) % 8]; }
          else if (v < 0.05) { if (hs(k, y + (t * 6 | 0)) < f * 0.5) { v = 0.25 * f; c = P.ac; } }
          else v = Math.min(1, v + f * 0.35);
        }
        if (!c || (v < 0.03 && !g)) continue;
        if (g) { x.fillStyle = css(c, 1); x.fillText(g, cx, cy); continue; }
        const a = 0.3 + 0.7 * v;
        const j = Math.min(10, Math.max(1, Math.round(v * 10 + (h - 0.5) * 1.2))); x.fillStyle = css(c, a); x.fillText(RAMP[j], cx, cy);
      }
    }
  }

  const PL = [
    { n: "Release notes", N: [[1, 7, "On a schedule", "Fri 17:00", 1, 0], [21, 7, "Writer", "draft notes", 5, 5], [39, 7, "Critic", "check it", 6, 2], [54, 7, "Ask me first", "post it?", 9, 8], [36, 18, "Notifier", "post to Discord", 5, 9], [60, 18, "Done", "", -1, 6]],
      E: [[0, 1, "h"], [1, 2, "h"], [2, 1, "b"], [2, 3, "h"], [3, 4, "v"], [4, 5, "h"]], B: [2],
      S: [[0, 0, 0.9, "Friday 17:00, run started"], [1, 0], [0, 1, 1.3, "drafted notes from 9 merged PRs"], [1, 1], [0, 2, 1.1, "back: two PRs are missing"], [1, 2], [0, 1, 1.0, "added the two missing PRs"], [1, 1], [0, 2, 0.9, "good, reads well"], [1, 3], [0, 3, 1.7, "waiting for you ... you said yes"], [1, 4], [0, 4, 1.0, "posted to #releases"], [1, 5], [0, 5, 0.9, "finished in 3m 40s"]] },
    { n: "Issue triage", N: [[1, 12, "New issue", "any repo", 2, 0], [17, 12, "Triage", "sort it", 5, 2], [31, 12, "Choose a way", "by kind", 7, 3], [55, 5, "Bug-fix team", "fix + proof", 5, 4], [55, 12, "Planner", "plan feature", 5, 1], [55, 19, "Writer", "answer it", 5, 5]],
      E: [[0, 1, "h"], [1, 2, "h"], [2, 3, "h"], [2, 4, "h"], [2, 5, "h"]], L: [[51, 5, "bug"], [47, 12, "feature"], [46, 21, "question"]],
      S: [[0, 0, 0.9, "#{n} “export fails on empty CSV”"], [1, 0], [0, 1, 1.2, "kind: {k}"], [1, 1], [0, 2, 0.8, "going the {k} way"], [1, "k"], [0, "k", 1.6, "{m}"]] },
    { n: "Nightly upkeep", N: [[1, 12, "On a schedule", "03:00", 1, 0], [20, 12, "Same time", "3 steps", 8, 3], [36, 5, "Gardener", "update deps", 5, 8], [36, 12, "Auditor", "security scan", 5, 4], [36, 19, "Backup Keeper", "snapshot", 5, 9], [56, 12, "Wait for all", "", -1, 6], [56, 20, "Reporter", "send summary", 5, 2]],
      E: [[0, 1, "h"], [1, 2, "h"], [1, 3, "h"], [1, 4, "h"], [2, 5, "h"], [3, 5, "h"], [4, 5, "h"], [5, 6, "v"]],
      S: [[0, 0, 0.9, "03:00, run started"], [1, 0], [0, 1, 0.6, "starting 3 steps"], [1, [1, 2, 3]], [0, [2, 3, 4], 1.8, "3 steps working"], [1, [4, 5, 6]], [0, 5, 0.7, "all 3 done"], [1, 7], [0, 6, 1.1, "summary sent to ntfy"]] },
  ];
  const KD = [["bug", 3, 0, "reproduced, fix with test, PR waits for you"], ["question", 5, 4, "answered in the issue"], ["feature", 4, 3, "plan posted, waiting for you"]];
  const ET = 0.55;
  const plan = (p, r) => {
    const k = KD[r % 3], o = [];
    for (const s of p.S) {
      let [kind, id, d, m] = s;
      if (id === "k") id = kind ? k[2] : k[1];
      o.push({ kind, ids: [].concat(id), d: kind ? ET : d, m: m && m.replace("{k}", k[0]).replace("{m}", k[3]).replace("{n}", 212 + r) });
    }
    return o;
  };
  const box = p => p.N.map(([x, y, l, s]) => ({ x, y, w: Math.max(l.length, s.length) + 4, h: s ? 4 : 3, l, s }));
  const cells = pts => {
    const o = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, b] = pts[i], [c, d] = pts[i + 1], sx = Math.sign(c - a), sy = Math.sign(d - b), n = Math.max(Math.abs(c - a), Math.abs(d - b));
      for (let j = i ? 1 : 0; j <= n; j++) o.push([a + sx * j, b + sy * j, sx, sy]);
    }
    if (pts.length === 2 && pts[0][0] === pts[1][0] && pts[0][1] === pts[1][1]) o[0] = [pts[0][0], pts[0][1], 1, 0];
    return o;
  };
  const CR = { "1,0>0,1": "┐", "1,0>0,-1": "┘", "-1,0>0,1": "┌", "-1,0>0,-1": "└", "0,1>1,0": "└", "0,1>-1,0": "┘", "0,-1>1,0": "┌", "0,-1>-1,0": "┐" };
  const AR = { "1,0": "▸", "-1,0": "◂", "0,1": "▾", "0,-1": "▴" };
  const edge = (g, cs, c, dash, ar) => {
    cs.forEach(([x, y, sx, sy], i) => {
      if (dash && i % 2 && i < cs.length - 1) return;
      const nx = cs[i + 1];
      let ch = sx ? "─" : "│";
      if (nx && (nx[2] !== sx || nx[3] !== sy)) ch = CR[`${sx},${sy}>${nx[2]},${nx[3]}`] || ch;
      if (!nx && ar) ch = AR[`${sx},${sy}`];
      g.tx(x, y, ch, c);
    });
  };
  const route = (bs, [i, j, k]) => {
    const a = bs[i], b = bs[j], ax = a.x + (a.w >> 1), bx = b.x + (b.w >> 1);
    if (k === "v") { const sy = a.y + a.h, ty = b.y - 1, my = (sy + ty) >> 1; return [[ax, sy], [ax, my], [bx, my], [bx, ty]]; }
    if (k === "b") { const yy = a.y + a.h + 1; return [[ax, a.y + a.h], [ax, yy], [bx, yy], [bx, b.y + b.h]]; }
    const sx = a.x + a.w, sy = a.y + 1, tx = b.x - 1, ty = b.y + 1, mx = (sx + tx) >> 1;
    return sy === ty ? [[sx, sy], [tx, ty]] : [[sx, sy], [mx, sy], [mx, ty], [tx, ty]];
  };
  const PRE = PL.map(p => { const b = box(p); return { b, e: p.E.map(e => cells(route(b, e))) }; });
  const lis = [...D.querySelectorAll("[data-desks] li")];
  let lastD = "";
  const office = (g, t) => {
    const runs = PL.map((p, i) => plan(p, 0).reduce((a, s) => a + s.d, 0) + 1.2);
    const cyc = runs.reduce((a, b) => a + b, 0), n = Math.floor(t / cyc);
    let lt = t % cyc, pi = 0;
    while (lt > runs[pi]) { lt -= runs[pi]; pi++; }
    const p = PL[pi], pre = PRE[pi], ev = plan(p, n);
    let si = 0, acc = 0;
    while (si < ev.length - 1 && acc + ev[si].d < lt) { acc += ev[si].d; si++; }
    const fr = Math.min(1, (lt - acc) / ev[si].d), fin = lt > runs[pi] - 1.2;
    const doneN = new Set(), doneE = new Set(), logs = [];
    for (let i = 0; i < si; i++) { ev[i].ids.forEach(x => (ev[i].kind ? doneE : doneN).add(x)); if (ev[i].m) logs.push([ev[i].ids[0], ev[i].m]); }
    const cur = ev[si];
    if (!cur.kind) { logs.push([cur.ids[0], cur.m]); if (fin) cur.ids.forEach(x => doneN.add(x)); }
    const ak = cur.kind || fin ? [] : cur.ids, dk = ak.map(i => p.N[i][4]).filter(x => x >= 0).join();
    if (dk !== lastD) { lastD = dk; lis.forEach((l, i) => l.classList.toggle("on", ak.some(j => p.N[j][4] === i))); }
    for (let y = 5; y < 26; y += 2) for (let k = 1; k < g.C - 1; k += 4) g.px(k + (y % 4 ? 2 : 0), y, 0.07, P.fa);
    let hx = 2;
    PL.forEach((q, i) => { g.tx(hx, 1, (i === pi ? "■ " : "  ") + q.n, i === pi ? P.tx : P.fa); hx += q.n.length + 5; });
    const tm = new Date(), hh = String(tm.getHours()).padStart(2, "0") + ":" + String(tm.getMinutes()).padStart(2, "0"), st = `run #${41 + n}  ${hh}`;
    g.tx(g.C - 2 - st.length, 1, st, P.mu);
    for (let k = 1; k < g.C - 1; k++) { g.tx(k, 3, "─", P.ln); g.tx(k, 27, "─", P.ln); }
    pre.e.forEach((cs, i) => {
      const bk = (p.B || []).includes(i), on = cur.kind && cur.ids.includes(i);
      edge(g, cs, on ? P.tx : doneE.has(i) ? (bk ? P.a2 : P.mu) : bk ? P.a2 : P.ln, bk, true);
    });
    (p.L || []).forEach(([x, y, s]) => g.tx(x, y, s, P.fa));
    pre.b.forEach((b, i) => {
      const act = ak.includes(i), dn = doneN.has(i), c = P.w[p.N[i][5]];
      const bc = act ? c : dn ? P.mu : P.ln;
      if (act) for (let y = b.y + 1; y < b.y + b.h - 1; y++) for (let x = b.x + 1; x < b.x + b.w - 1; x++) g.px(x, y, 0.12 + 0.1 * Math.sin(t * 6 + x * 0.7 + y), c);
      for (let x = b.x + 1; x < b.x + b.w - 1; x++) { g.tx(x, b.y, "─", bc); g.tx(x, b.y + b.h - 1, "─", bc); }
      for (let y = b.y + 1; y < b.y + b.h - 1; y++) { g.tx(b.x, y, "│", bc); g.tx(b.x + b.w - 1, y, "│", bc); }
      g.tx(b.x, b.y, "┌", bc); g.tx(b.x + b.w - 1, b.y, "┐", bc); g.tx(b.x, b.y + b.h - 1, "└", bc); g.tx(b.x + b.w - 1, b.y + b.h - 1, "┘", bc);
      g.tx(b.x + 2, b.y + 1, b.l, act ? P.tx : dn ? P.mu : P.fa);
      if (b.s) g.tx(b.x + 2, b.y + 2, b.s, act ? P.mu : P.fa);
      if (dn && !act) g.tx(b.x + b.w - 2, b.y, "✓", c);
      if (act && Math.floor(t * 3) % 2) g.tx(b.x + b.w - 2, b.y, "●", c);
    });
    if (cur.kind && !fin) cur.ids.forEach(i => { const cs = pre.e[i], q = cs[Math.min(cs.length - 1, Math.floor(fr * cs.length))]; g.tx(q[0], q[1], "■", P.a2); });
    logs.slice(-4).reverse().forEach(([j, m], r) => {
      const y = 29 + r; if (y >= g.R) return;
      const nm = p.N[j][2], c = P.w[p.N[j][5]];
      g.tx(2, y, hh, P.fa); g.tx(9, y, (nm.length > 14 ? nm.slice(0, 13) + "." : nm).padEnd(15), r === 0 ? c : P.fa); g.tx(25, y, m.length > 45 ? m.slice(0, 44) + "." : m, r === 0 ? P.tx : r === 1 ? P.mu : P.fa);
    });
  };

  const oc = D.getElementById("office");
  let og = null, wg = null;
  const wc = D.getElementById("word");
  const mask = (C, R) => {
    const m = D.createElement("canvas"); m.width = C; m.height = R;
    const q = m.getContext("2d", { willReadFrequently: true });
    q.fillStyle = "#fff"; q.textBaseline = "middle"; q.textAlign = "center";
    let f = R * 1.25; q.font = `600 ${f}px "Geist", sans-serif`;
    const w = q.measureText("ApolloOffice").width; f *= (C * 0.94) / w; q.font = `600 ${f}px "Geist", sans-serif`;
    q.setTransform(1, 0, 0, 0.62, 0, R * 0.19); q.fillText("ApolloOffice", C / 2, R / 2 / 0.62 * 0.95);
    const dt = q.getImageData(0, 0, C, R).data, o = new Float32Array(C * R);
    for (let i = 0; i < C * R; i++) o[i] = dt[i * 4] / 255;
    return o;
  };
  let wm = null;
  const word = (g, t) => {
    if (!wm || wm.length !== g.C * g.R) wm = mask(g.C, g.R);
    for (let y = 0; y < g.R; y++) for (let k = 0; k < g.C; k++) {
      const m = wm[y * g.C + k]; if (m < 0.08) continue;
      const w = 0.5 + 0.5 * Math.sin(k * 0.12 - t * 1.6 + y * 0.3);
      g.px(k, y, Math.min(1, m * (0.55 + 0.45 * w)), m > 0.6 ? (w > 0.86 ? P.ac : P.tx) : P.mu);
    }
  };
  const wfix = (g, W) => {
    const C = Math.max(60, Math.round(W / 7.5)), cw = W / C, ch = cw * 1.5, R = Math.round(C * 0.2);
    if (g.C !== C) { g.C = C; g.R = R; g.v = new Float32Array(C * R); g.c = new Array(C * R); g.g = new Array(C * R); }
    const d = devicePixelRatio || 1;
    g.el.style.height = R * ch + "px"; g.el.width = W * d; g.el.height = R * ch * d;
    g.cw = cw; g.ch = ch; g.d = d; g.draw(performance.now());
  };


  const ua = navigator.userAgent, os = /Windows/.test(ua) ? "win" : /Mac/.test(ua) ? "mac" : /Linux|X11/.test(ua) && !/Android/.test(ua) ? "linux" : null;
  if (os) {
    const card = D.querySelector(`[data-os-card="${os}"]`);
    card.classList.add("me");
    const b = D.querySelector("[data-dl]"); b.href = card.href;
    D.querySelector("[data-os]").textContent = card.querySelector("b").textContent;
  }

  const term = D.querySelector("[data-lines]");
  if (term) {
    const ls = term.innerHTML.replace(/^\n/, "").split("\n");
    term.innerHTML = ls.map(l => `<span class="ln">${l || " "}</span>`).join("");
    const el = [...term.children];
    const go = () => el.forEach((e, i) => setTimeout(() => e.classList.add("in"), RM ? 0 : i * 120));
    new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { go(); o.disconnect(); } }, { threshold: 0.35 }).observe(term);
  }

  D.querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "copied"; setTimeout(() => b.textContent = "copy", 1400); } catch (e) {} }));

  const start = () => {
    pal();
    og = new Grid(oc, 72, 34, office);
    wg = new Grid(wc, 60, 12, word, wfix);
  };
  (D.fonts && D.fonts.ready ? D.fonts.ready : Promise.resolve()).then(start);
})();
