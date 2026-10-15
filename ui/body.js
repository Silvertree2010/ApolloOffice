(() => {
  const K = (window.K = {});
  K.W = 48;
  K.H = 40;
  K.GROUND = 36;
  K.COLORS = {
    k: "#1b1a18", K: "#000000", w: "#f4f1e8", W: "#ffffff", L: "#c8c4b8", G: "#8b877d", g: "#55524b",
    r: "#d9443a", R: "#8e241f", o: "#f28c28", O: "#b85f10", y: "#f5d03b", Y: "#b8921c",
    l: "#86c95c", e: "#3e8f3b", E: "#245a24", c: "#62c9e8", b: "#3a6fd6", B: "#1d3b8c",
    p: "#9b61d3", P: "#5b3290", m: "#f282b4", M: "#b54a7f", n: "#9b6b3d", N: "#5c3c1f",
    t: "#dcb57e", z: "#f3c24c", Z: "#a8781a", s: "#dfe4ea", S: "#98a2ad", f: "#ffd9b3",
    h: "#ff5c38", v: "#34e8a8", x: "#e23c90", q: "#7a4dff", u: "#2bd4ff", i: "#c9ff3d", d: "#2e2b27"
  };

  K.color = (ch, f) => {
    switch (ch) {
      case ".": case " ": return null;
      case "@": return f.body;
      case "#": return f.dark;
      case "+": return f.light;
      case "a": return f.eye;
      case "1": return f.c1;
      case "2": return f.c2;
      case "3": return f.c3;
      case "*": return f.ink;
      default: return K.COLORS[ch] || null;
    }
  };

  K.width = (rows) => {
    let w = 0;
    for (const r of rows) if (r.length > w) w = r.length;
    return w;
  };

  K.draw = (ctx, rows, x, y, f, mirror) => {
    const w = K.width(rows);
    x = Math.round(x);
    y = Math.round(y);
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; i++) {
        const c = K.color(row[i], f);
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(x + (mirror ? w - 1 - i : i), y + j, 1, 1);
      }
    }
  };

  K.px = (ctx, x, y, c, w = 1, h = 1) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };

  K.line = (ctx, x0, y0, x1, y1, c) => {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    ctx.fillStyle = c;
    for (let n = 0; n < 200; n++) {
      ctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };

  K.ellipse = (ctx, cx, cy, rx, ry, c, by = 0, until = 1) => {
    const n = Math.max(12, Math.round((rx + ry) * 4));
    ctx.fillStyle = c;
    for (let i = 0; i <= n; i++) {
      const a = (by + (until - by) * (i / n)) * Math.PI * 2;
      ctx.fillRect(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), 1, 1);
    }
  };

  const FONT = {
    A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111",
    F: "111100110100100", G: "011100101101011", H: "101101111101101", I: "111010010010111", J: "001001001101010",
    K: "101101110101101", L: "100100100100111", M: "101111111101101", N: "110101101101101", O: "010101101101010",
    P: "110101110100100", Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
    U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101", Y: "101101010010010",
    Z: "111001010100111", Ä: "101010101111101", Ö: "101010101101010", Ü: "101000101101111",
    0: "111101101101111", 1: "010110010010111", 2: "110001010100111", 3: "110001010001110", 4: "101101111001001",
    5: "111100110001110", 6: "011100111101111", 7: "111001010010010", 8: "111101111101111", 9: "111101111001110",
    "?": "110001010000010", "!": "010010010000010", ".": "000000000000010", ":": "000010000010000", "+": "000010111010000",
    "-": "000000111000000", "/": "001001010100100", "<": "001010100010001", ">": "100010001010100", "{": "011010110010011",
    "}": "110010011010110", $: "011110010011110", "#": "101111101111101", "=": "000111000111000", "%": "101001010100101",
    "*": "000101010101000", "♥": "000101111111010", " ": "000000000000000", "'": "010010000000000", ",": "000000000010100"
  };

  K.text = (ctx, s, x, y, c) => {
    let px = Math.round(x);
    y = Math.round(y);
    ctx.fillStyle = c;
    for (const ch of String(s).toUpperCase()) {
      const g = FONT[ch];
      if (g) for (let i = 0; i < 15; i++) if (g[i] === "1") ctx.fillRect(px + (i % 3), y + Math.floor(i / 3), 1, 1);
      px += 4;
    }
  };
  K.textWidth = (s) => String(s).length * 4 - 1;
  K.FONT = FONT;

  K.pose = () => ({
    dx: 0, dy: 0, bw: 0, bh: 0, legs: "stand", lift: [0, 0, 0, 0],
    eyes: "open", ex: 0, ey: 0, mouth: null, mouthY: 0, blush: false,
    armL: "bottom", armR: "bottom", aL: [0, 0], aR: [0, 0],
    rotate: 0, pivot: "feet", mirror: false, alpha: 1, scale: 1,
    props: [], fx: [], clone: 0, glitch: 0, tint: null, away: false, withoutFigure: false
  });

  const ARM = {
    top: [-5, 2, 4], bottom: [1, 2, 3], up: [-3, 2, 3], out: [-1, 3, 2], half: [-2, 2, 2], low: [3, 2, 2],
    front: [0, 2, 2], head: [0, 2, 2], mouth: [0, 2, 2]
  };

  const armRect = (s, z, off, r) => {
    const a = ARM[z];
    if (!a) return null;
    const w = a[1], h = a[2];
    let x, y;
    if (z === "top") return { x: (s === "L" ? r.left - 3 : r.right + 1) + off[0], y: r.top - 3 + off[1], w: 2, h: 2 };
    if (z === "front") { x = s === "L" ? r.left + 2 : r.right - 4; y = r.top + 6; }
    else if (z === "head") { x = s === "L" ? r.left - 1 : r.right - 1; y = r.top - 2; }
    else if (z === "mouth") { x = s === "L" ? r.cx - 3 : r.cx + 1; y = r.top + 5; }
    else { x = s === "L" ? r.left - w : r.right; y = r.top + 3 + a[0]; }
    return { x: x + off[0], y: y + off[1], w, h };
  };

  K.rig = (p) => {
    const bw = 14 + p.bw, bh = Math.max(4, 9 + p.bh);
    const cx = 24 + p.dx;
    const ground = K.GROUND + p.dy;
    const legH = p.legs === "sit" ? 0 : 3;
    const bottom = ground - legH;
    const top = bottom - bh;
    const left = cx - (bw >> 1);
    const r = { bw, bh, cx, ground, bottom, top, left, right: left + bw, legH };
    r.eyeY = top + 2 + p.ey;
    r.middle = { x: cx, y: top + (bh >> 1) };
    r.armL = armRect("L", p.armL, p.aL, r);
    r.armR = armRect("R", p.armR, p.aR, r);
    const hr = r.armR && (r.armR.two || r.armR), hl = r.armL && (r.armL.two || r.armL);
    r.handR = hr ? { x: hr.x + hr.w, y: hr.y } : { x: r.right + 1, y: top + 4 };
    r.handL = hl ? { x: hl.x - 1, y: hl.y } : { x: r.left - 2, y: top + 4 };
    return r;
  };

  const EYE = {
    open: [["a", "a"], 0, 0], shut: [["aa"], 0, 1], glad: [[".a.", "a.a"], 1, 0], big: [["aa", "aa"], 0, 0],
    angry: [["a.", "aa"], 0, 0], sad: [[".a", "aa"], 0, 0], x: [["a.a", ".a.", "a.a"], 1, -1],
    heart: [["m.m", "mmm", ".m."], 1, -1], star: [[".y.", "yyy", ".y."], 1, -1], point: [["a"], 0, 0],
    half: [["a"], 0, 1], ring: [["aaa", "a.a", "aaa"], 1, -1], money: [["z", "Z"], 0, 0], glow: [["v", "v"], 0, 0],
    empty: [["w", "w"], 0, 0], blush: [["r", "R"], 0, 0], slit: [["a", "a", "a"], 0, -1], sideways: [["aa", ".a"], 0, 0],
    spiral: [["aaa", "..a", "a.a", "aaa"], 1, -1], cry: [["a", "a", "c", "c"], 0, 0]
  };

  const MOUTH = {
    smile: ["a..a", ".aa."], wide: ["a....a", ".aaaa."], open: [".aa.", "arra", ".aa."], o: [".aa.", "a..a", ".aa."],
    small: ["aa"], flat: ["aaaa"], sad: [".aa.", "a..a"], tongue: ["aaaa", ".mm."], teeth: ["awwa"],
    whistle: [".a.", "a.a", ".a."], big: ["aaaaaa", "arrrra", ".aaaa."], tilted: ["aaa.", "...a"]
  };

  K.EYES = Object.keys(EYE);
  K.MOUTHS = Object.keys(MOUTH);

  const drawEyes = (c, p, r, f) => {
    const lx = r.cx - 4 + p.ex, rx = r.cx + 3 + p.ex, y = r.eyeY;
    const eye = (type, x, right) => {
      const d = EYE[type] || EYE.open;
      const w = K.width(d[0]);
      K.draw(c, d[0], right ? x - (w - 1 - d[1]) : x - d[1], y + d[2], f, right);
    };
    const l = p.eyes === "wink" ? "open" : p.eyes;
    const rr = p.eyes === "wink" ? "shut" : p.eyes;
    eye(l, lx, false);
    eye(rr, rx, true);
  };

  const drawMouth = (c, p, r, f) => {
    if (p.blush) {
      K.px(c, r.left + 1, r.top + 4, "#f282b4", 2, 1);
      K.px(c, r.right - 3, r.top + 4, "#f282b4", 2, 1);
    }
    if (!p.mouth) return;
    const m = MOUTH[p.mouth];
    if (!m) return;
    K.draw(c, m, r.cx - (K.width(m) >> 1), r.top + 5 + p.mouthY, f);
  };

  const drawLegs = (c, p, r, f) => {
    if (!r.legH) return;
    const xs = [r.left + 1, r.left + 4, r.right - 6, r.right - 3];
    for (let i = 0; i < 4; i++) {
      const h = r.legH - (p.lift[i] || 0);
      if (h > 0) K.px(c, xs[i], r.bottom, f.body, 2, h);
    }
  };

  const drawBody = (c, p, t, r, f, skin) => {
    const pattern = skin && skin.pattern;
    for (let y = 0; y < r.bh; y++) {
      for (let x = 0; x < r.bw; x++) {
        let col = y === r.bh - 1 ? f.dark : f.body;
        if (skin && skin.outline && x > 0 && y > 0 && x < r.bw - 1 && y < r.bh - 1) continue;
        if (pattern) {
          const m = pattern(x, y, t, r, f);
          if (m === false) continue;
          if (m) col = m;
        }
        c.fillStyle = col;
        c.fillRect(r.left + x, r.top + y, 1, 1);
      }
    }
  };

  const foreArm = (s) => s === "front" || s === "head" || s === "mouth";
  const arm = (c, a, color) => {
    K.px(c, a.x, a.y, color, a.w, a.h);
    if (a.two) K.px(c, a.two.x, a.two.y, color, a.two.w, a.two.h);
  };

  K.figure = (c, p, t, skin) => {
    const f = { body: skin.body, dark: skin.dark, light: skin.light, eye: skin.eye || "#101112", ink: "#000", c1: skin.c1 || "#e8e6df", c2: skin.c2 || "#101112", c3: skin.c3 || "#5c5e63" };
    const r = K.rig(p);
    if (r.armL && !foreArm(p.armL)) arm(c, r.armL, f.body);
    if (r.armR && !foreArm(p.armR)) arm(c, r.armR, f.body);
    drawLegs(c, p, r, f);
    drawBody(c, p, t, r, f, skin);
    drawEyes(c, p, r, f);
    drawMouth(c, p, r, f);
    if (r.armL && foreArm(p.armL)) arm(c, r.armL, f.light || f.body);
    if (r.armR && foreArm(p.armR)) arm(c, r.armR, f.light || f.body);
    return { r, f };
  };
})();
