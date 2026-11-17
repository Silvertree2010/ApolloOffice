(() => {
  const D = document.documentElement;
  const rd = () => { try { return localStorage.getItem("ao.th") || "dark"; } catch { return "dark"; } };
  const mq = matchMedia("(prefers-color-scheme: light)");
  const rs = (c) => (c === "system" ? (mq.matches ? "light" : "dark") : c === "light" ? "light" : "dark");
  D.dataset.th = rs(rd());
  const AC = { raspberry: [".72 .16 355", ".58 .19 355"], ocean: [".72 .13 240", ".55 .15 245"], emerald: [".74 .14 160", ".55 .13 160"], violet: [".7 .15 295", ".55 .18 295"], slate: [".78 .03 250", ".45 .03 250"] };
  const lsg = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
  const lss = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const ui = () => {
    const a = AC[lsg("ao.ac", "raspberry")] || AC.raspberry, lt = D.dataset.th === "light";
    const [l, c, h] = (lt ? a[1] : a[0]).split(" ");
    D.style.setProperty("--ac", `oklch(${l} ${c} ${h})`);
    D.style.setProperty("--ac2", `oklch(${lt ? +l - .06 : +l + .06} ${c} ${h})`);
    D.dataset.dn = lsg("ao.dn", "cozy");
    D.dataset.ty = lsg("ao.ty", "calm");
    D.dataset.rm = lsg("ao.rm", "0");
  };
  ui();
  const G = `<svg viewBox="0 0 14 26" width="56" height="104" shape-rendering="crispEdges" aria-hidden="true">
<rect x="5" y="0" width="4" height="1" fill="#d6d8dc"/><rect x="4" y="1" width="1" height="3" fill="#d6d8dc"/><rect x="9" y="1" width="1" height="3" fill="#d6d8dc"/><rect x="5" y="4" width="4" height="1" fill="#d6d8dc"/>
<rect x="4" y="5" width="6" height="3" fill="#3a3d42"/><rect x="5" y="5" width="4" height="1" fill="#55595f"/>
<rect x="10" y="5" width="2" height="1" fill="#8d9199"/><rect x="11" y="6" width="2" height="9" fill="#8d9199"/><rect x="12" y="6" width="1" height="9" fill="#6b6f76"/>
<rect x="2" y="8" width="10" height="17" fill="#c9ccd1"/><rect x="2" y="8" width="2" height="17" fill="#e8eaed"/><rect x="10" y="8" width="2" height="17" fill="#9fa3a9"/>
<rect x="2" y="11" width="10" height="1" fill="#4fb3e0"/><rect x="2" y="21" width="10" height="1" fill="#4fb3e0"/>
<rect x="5" y="14" width="4" height="4" fill="#3a3d42"/><rect x="6" y="15" width="2" height="2" fill="#e8eaed"/>
<rect x="3" y="25" width="8" height="1" fill="#6b6f76"/></svg>`;
  const flash = (go) => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { go(); return; }
    const o = document.createElement("div");
    o.className = "fb";
    o.innerHTML = `<div class="fbg">${G}</div><div class="fbw"></div>`;
    document.body.appendChild(o);
    const g = o.firstChild, w = o.lastChild;
    const W = innerWidth, H = innerHeight;
    g.animate([
      { transform: `translate(${W + 80}px, ${H * 0.62}px) rotate(0deg)` },
      { transform: `translate(${W * 0.72}px, ${H * 0.5}px) rotate(-280deg)`, offset: 0.3 },
      { transform: `translate(${W * 0.6}px, ${H * 0.62}px) rotate(-430deg)`, offset: 0.5 },
      { transform: `translate(${W * 0.53}px, ${H * 0.56}px) rotate(-560deg)`, offset: 0.68 },
      { transform: `translate(${W * 0.48}px, ${H * 0.62}px) rotate(-650deg)`, offset: 0.84 },
      { transform: `translate(${W * 0.46}px, ${H * 0.62}px) rotate(-680deg)` },
    ], { duration: 1150, easing: "cubic-bezier(.3,.6,.4,1)", fill: "forwards" }).finished.then(() => {
      g.animate([{ transform: `translate(${W * 0.46}px, ${H * 0.62}px) rotate(-680deg)` }, { transform: `translate(${W * 0.46 + 2}px, ${H * 0.62 - 1}px) rotate(-676deg)` }, { transform: `translate(${W * 0.46 - 2}px, ${H * 0.62}px) rotate(-684deg)` }], { duration: 120, iterations: 3 }).finished.then(() => {
        g.remove();
        w.style.opacity = "1";
        go();
        document.body.style.filter = "blur(4px) brightness(1.6)";
        requestAnimationFrame(() => requestAnimationFrame(() => {
          document.body.style.transition = "filter 2.6s cubic-bezier(.2,.7,.3,1)";
          document.body.style.filter = "";
          w.animate([{ opacity: 1 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { duration: 3200, easing: "cubic-bezier(.4,0,.6,1)", fill: "forwards" }).finished.then(() => { o.remove(); document.body.style.transition = ""; });
        }));
      });
    });
  };
  const set = (c) => {
    try { localStorage.setItem("ao.th", c); } catch {}
    const n = rs(c);
    if (n === D.dataset.th) return;
    if (n === "light" && D.dataset.rm !== "1") flash(() => { D.dataset.th = "light"; ui(); });
    else { D.dataset.th = n; ui(); }
  };
  mq.addEventListener("change", () => { if (rd() === "system") set("system"); });
  window.TH = { get: rd, set, flash, AC: Object.keys(AC), TY: { calm: "raspberry", dense: "emerald", pixel: "ocean" }, pref: (k, d) => lsg("ao." + k, d), setPref: (k, v) => { lss("ao." + k, v); ui(); } };
})();
