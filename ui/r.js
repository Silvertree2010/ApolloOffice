(() => {
  const A = window.AO, { $ } = A;
  const T = { office: "Office", pipelines: "Pipelines", team: "Team", jobs: "Jobs", prs: "Pull requests", repos: "Repositories", machines: "Machines", costs: "Costs", settings: "Settings", health: "Health" };
  const RUN = { repos: () => A.repos(), machines: () => A.hosts(), costs: () => A.costs(), settings: () => A.settings(), health: () => A.health(), team: () => A.team(), jobs: () => A.jobs(), prs: () => A.prs() };
  const B = document.body;
  let busy = false;
  const leave = async (r) => {
    if (r !== "office" && B.classList.contains("ed")) $("bCz").click();
    if (r !== "office" && B.classList.contains("led")) $("bLay").click();
    if (r !== "pipelines" && B.classList.contains("fed")) await A.flows();
  };
  const go = async () => {
    if (busy) return;
    busy = true;
    try {
      const n = (location.hash.match(/^#\/([a-z]+)/) || [])[1] || "office", r = T[n] ? n : "office";
      await leave(r);
      const pg = r !== "office" && r !== "pipelines";
      B.classList.toggle("vof", r === "office");
      B.classList.toggle("pgm", pg);
      $("pg").hidden = !pg;
      for (const a of document.querySelectorAll(".nv a")) a.classList.toggle("on", a.dataset.r === (r === "health" ? "settings" : r));
      $("vt").textContent = r === "office" ? "ApolloOffice" : T[r];
      document.title = r === "office" ? "ApolloOffice" : `${T[r]} · ApolloOffice`;
      if (pg) { $("pgB").innerHTML = ""; $("pg").scrollTop = 0; }
      if (r === "pipelines" && !B.classList.contains("fed")) await A.flows();
      if (RUN[r]) await RUN[r]();
      window.dispatchEvent(new Event("resize"));
    } finally { busy = false; }
  };
  A.go = (r) => { if (location.hash === "#/" + r) go(); else location.hash = "#/" + r; };
  A.route = () => ((location.hash.match(/^#\/([a-z]+)/) || [])[1] || "office");
  window.addEventListener("hashchange", go);
  try { B.classList.toggle("nvs", localStorage.getItem("ao.nv") === "1"); } catch {}
  $("nvC").onclick = () => { const on = B.classList.toggle("nvs"); try { localStorage.setItem("ao.nv", on ? "1" : "0"); } catch {} setTimeout(() => window.dispatchEvent(new Event("resize")), 200); };
  const prev = A.onState;
  A.onState = (s) => {
    prev && prev(s);
    const act = s.q.filter((q) => !["park", "vet"].includes(q.st)).length, ap = s.q.filter((q) => q.st === "approve").length + (s.rw || 0);
    const nj = $("nJobs"); nj.textContent = ap ? ap : act || ""; nj.classList.toggle("hot", ap > 0); nj.title = ap ? `${ap} waiting for your approval` : `${act} active jobs`;
    const op = s.pr.filter((p) => p.st === "open").length; $("nPr").textContent = op || "";
    A.wdg && A.wdg(s);
  };
  const esc = A.esc;
  let K = null, ki = 0, kl = [];
  const cmds = () => [
    ...Object.entries(T).filter(([k]) => k !== "health").map(([k, t]) => ({ t, d: "Go to page", run: () => A.go(k) })),
    { t: B.classList.contains("led") ? "Close layout editor" : "Edit layout", d: "Office", run: () => { A.go("office"); setTimeout(() => $("bLay").click(), 80); } },
    { t: B.classList.contains("ed") ? "Close office editor" : "Edit office", d: "Office", run: () => { A.go("office"); setTimeout(() => $("bCz").click(), 80); } },
    { t: A.S?.o?.man ? "Resume office" : "Pause office", d: "Action", run: () => $("bPause").click() },
    { t: "Switch light or dark", d: "Action", run: () => $("bTh").click() },
    { t: "Hire someone", d: "Team", run: () => A.go("team") },
    { t: "New pipeline", d: "Pipelines", run: () => A.go("pipelines") },
    { t: "Collapse or expand sidebar", d: "Action", run: () => $("nvC").click() },
    ...(A.S?.q || []).slice(0, 60).map((j) => ({ t: j.title || "Untitled", d: `${(j.repo || "").split("/")[1] || ""}${j.num ? "#" + j.num : ""} · ${j.st}`, run: () => A.job && A.job(j.id) })),
  ];
  const kdraw = () => {
    const q = K.querySelector("input").value.trim().toLowerCase();
    kl = cmds().filter((c) => !q || (c.t + " " + c.d).toLowerCase().includes(q)).slice(0, 12);
    ki = Math.min(ki, Math.max(0, kl.length - 1));
    K.querySelector(".kl").innerHTML = kl.length ? kl.map((c, i) => `<button type="button" class="ki ${i === ki ? "on" : ""}" data-i="${i}"><b>${esc(c.t)}</b><span>${esc(c.d)}</span></button>`).join("") : `<div class="ke">Nothing found.</div>`;
    for (const b of K.querySelectorAll("[data-i]")) b.onclick = () => krun(+b.dataset.i);
  };
  const kclose = () => { K?.remove(); K = null; };
  const krun = (i) => { const c = kl[i]; kclose(); c && c.run(); };
  const kopen = () => {
    if (K) return kclose();
    K = document.createElement("div"); K.className = "cmdk";
    K.innerHTML = `<div class="kb" role="dialog" aria-label="Command palette"><input type="text" placeholder="Search pages, actions and jobs" autocomplete="off"><div class="kl"></div><div class="kf"><span>↑↓ to move</span><span>↵ to open</span><span>esc to close</span></div></div>`;
    B.appendChild(K);
    const inp = K.querySelector("input");
    inp.oninput = () => { ki = 0; kdraw(); };
    inp.onkeydown = (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); ki = Math.min(kl.length - 1, ki + 1); kdraw(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); ki = Math.max(0, ki - 1); kdraw(); }
      else if (e.key === "Enter") { e.preventDefault(); krun(ki); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); kclose(); }
    };
    K.onclick = (e) => { if (e.target === K) kclose(); };
    ki = 0; kdraw(); inp.focus();
  };
  document.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); kopen(); } }, true);
  $("nvK").onclick = kopen;
  go();
})();
