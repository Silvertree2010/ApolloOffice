use crate::app::{Ax, WS};
use crate::db::now;
use crate::pa;
use axum::body::{to_bytes, Body};
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{FromRequestParts, State};
use axum::response::IntoResponse;
use axum::http::{HeaderMap, Method, Request, Response, StatusCode};
use rust_embed::RustEmbed;
use serde_json::{json, Value};

#[derive(RustEmbed)]
#[folder = "ui/"]
struct Ui;

fn rs(c: StatusCode, ct: &str, b: impl Into<Body>) -> Response<Body> {
    Response::builder()
        .status(c)
        .header("content-type", ct)
        .header("cache-control", "no-store")
        .header("x-content-type-options", "nosniff")
        .header("x-frame-options", "DENY")
        .header("referrer-policy", "same-origin")
        .header("content-security-policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; frame-ancestors 'none'; form-action 'self'; base-uri 'none'")
        .body(b.into())
        .unwrap()
}

fn js(v: Value) -> Response<Body> {
    rs(StatusCode::OK, "application/json", v.to_string())
}

fn er(c: StatusCode, m: &str) -> Response<Body> {
    rs(c, "application/json", json!({"error": m}).to_string())
}

fn ck(h: &HeaderMap, n: &str) -> Option<String> {
    h.get_all("cookie").iter().filter_map(|v| v.to_str().ok()).flat_map(|s| s.split(';')).map(|s| s.trim()).find_map(|s| s.strip_prefix(&format!("{n}=")).map(String::from))
}

fn host_ok(a: &Ax, h: &HeaderMap) -> bool {
    let hs = h.get("host").and_then(|v| v.to_str().ok()).unwrap_or("");
    hs == format!("127.0.0.1:{}", a.port) || hs == format!("localhost:{}", a.port) || hs == format!("[::1]:{}", a.port)
}

fn origin_ok(a: &Ax, h: &HeaderMap) -> bool {
    match h.get("origin").and_then(|v| v.to_str().ok()) {
        None => h.get("sec-fetch-site").and_then(|v| v.to_str().ok()).map(|s| s == "same-origin" || s == "none").unwrap_or(true),
        Some(o) => o == format!("http://127.0.0.1:{}", a.port) || o == format!("http://localhost:{}", a.port) || o == format!("http://[::1]:{}", a.port),
    }
}

fn authed(a: &Ax, h: &HeaderMap) -> bool {
    ck(h, "ao").map(|s| a.db.n("select count(*) from ses where id=? and exp>?", pa![s, now()]) > 0).unwrap_or(false)
}

pub fn link_new(a: &crate::db::Db) -> String {
    let c = hex::encode(rand::random::<[u8; 16]>());
    a.run("delete from lnk where exp<?", pa![now()]);
    a.run("insert into lnk(c,exp) values(?,?)", pa![c.clone(), now() + 600_000]);
    c
}

const LP: &str = "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>ApolloOffice</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0c0e;color:#ecebe6;font:14px/1.5 ui-monospace,Menlo,Consolas,monospace}div{max-width:420px;padding:24px}button{font:inherit;color:#0b0c0e;background:#ecebe6;border:0;border-radius:6px;padding:8px 16px;cursor:pointer}code{color:#4fb3e0}</style><div>";

fn esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&#39;")
}

fn page(b: &str) -> Response<Body> {
    rs(StatusCode::OK, "text/html; charset=utf-8", format!("{LP}{b}</div>"))
}

fn state(a: &Ax) -> Value {
    let d = crate::db::day();
    let mut tk = json!({});
    for t in a.db.all("select w, tin+tout n from tok where day=?", pa![d.clone()]) {
        tk[t["w"].as_str().unwrap_or("")] = t["n"].clone();
    }
    let (w, o, fl, ln, cil, hst) = {
        let l = a.lv.lock().unwrap();
        (json!(l.w), json!(l.o), json!(l.fl.iter().filter(|f| now() - f.t < 8000).collect::<Vec<_>>()), json!(l.ln.iter().map(|(k, v)| (k.to_string(), v.clone())).collect::<std::collections::HashMap<_, _>>()), json!(l.cil.iter().map(|(k, v)| (k.to_string(), v.clone())).collect::<std::collections::HashMap<_, _>>()), json!(l.hst))
    };
    let mut cs = json!({});
    for t in a.db.all("select w, sum(case when sub=0 then usd end) a, sum(case when sub=1 then usd end) v from cost where day=? group by w", pa![d.clone()]) {
        cs[t["w"].as_str().unwrap_or("")] = json!([t["a"], t["v"]]);
    }
    let mut wv = w;
    for x in WS {
        wv[*x]["tk"] = tk[*x].clone();
        wv[*x]["cs"] = cs[*x].clone();
        if wv[*x]["md"].as_str().map(|s| s.is_empty()).unwrap_or(true) && *x != "ci" && *x != "submit" {
            wv[*x]["md"] = json!(a.md(x));
        }
    }
    let lm = a.db.kg("lm");
    json!({
        "t": now(), "v": crate::app::V,
        "o": o, "w": wv, "fl": fl, "ln": ln, "cil": cil, "hst": hst,
        "hs": a.db.all("select id, ln, dk, on_ from hs order by id='local' desc, id", pa![]),
        "q": a.db.all("select id,repo,num,kind,title,url,st,why,pr,t0,t1,json_extract(d,'$.h') h from jobs where st not in ('done','drop') order by st='approve' desc, st='vet', id limit 60", pa![]),
        "dn": a.db.all("select id,repo,num,kind,title,url,st,why,pr,t1 from jobs where st in ('done','drop') order by t1 desc limit 25", pa![]),
        "pr": a.db.all("select repo,num,st,title,url,upd,merged from prs order by t0 desc limit 40", pa![]),
        "mg": a.db.all("select substr(merged,1,10) d, count(*) n from prs where merged is not null and merged >= date('now','-30 day') group by 1 order by 1", pa![]),
        "ev": a.db.all("select t,w,m,j from ev order by id desc limit 60", pa![]),
        "n": Value::Object(a.db.all("select st, count(*) n from jobs group by st", pa![]).into_iter().map(|x| (x["st"].as_str().unwrap_or("").to_string(), x["n"].clone())).collect()),
        "lm": if now() - lm["t"].as_i64().unwrap_or(0) < 180_000 { lm } else { Value::Null },
        "nr": a.db.n("select count(*) from rp", pa![]),
        "star": crate::star::show(a),
    })
}

async fn checks(a: &Ax) -> Value {
    use crate::sh::{run, tool, Rq};
    let v = |p: &str, x: &[&str]| {
        let p = p.to_string();
        let x: Vec<String> = x.iter().map(|s| s.to_string()).collect();
        async move { run(&p, &x, Rq { t: 30, ..Default::default() }).await }
    };
    let (g, h, c, d, b) = tokio::join!(v(&tool("git"), &["--version"]), v(&tool("gh"), &["api", "user", "--jq", ".login"]), v(&tool("claude"), &["--version"]), v(&tool("docker"), &["info", "--format", "{{.ServerVersion}}"]), v(&crate::sh::bash(), &["-c", "echo ok"]));
    let _ = a;
    json!({
        "git": {"ok": g.c == 0, "m": if g.c == 0 { g.o.trim().to_string() } else { "Install git: https://git-scm.com".into() }},
        "gh": {"ok": h.c == 0, "m": if h.c == 0 { format!("logged in as {}", h.o.trim()) } else { "Install the GitHub CLI and run: gh auth login".into() }},
        "claude": {"ok": c.c == 0, "m": if c.c == 0 { c.o.trim().to_string() } else { "Install Claude Code and log in: https://claude.com/claude-code".into() }},
        "docker": {"ok": d.c == 0, "m": if d.c == 0 { format!("Docker {}", d.o.trim()) } else { "Docker is not running (optional, recommended)".into() }},
        "bash": {"ok": b.c == 0, "m": if b.c == 0 { "bash ok".to_string() } else { "bash not found (on Windows it comes with Git for Windows)".to_string() }},
    })
}

fn cfg(a: &Ax) -> Value {
    json!({"repos": a.db.all("select * from rp order by full", pa![]), "hosts": a.db.all("select * from hs order by id='local' desc, id", pa![]), "set": a.set(), "data": a.dd.display().to_string(), "auto": crate::sys::autostart_on(&a.dd), "prov": crate::prov::status(a), "google": crate::goog::linked(a)["email"], "upd": a.db.kg("upd"), "asset": crate::upd::asset(), "api": {"on": a.db.kg("api")["h"].is_string(), "t0": a.db.kg("api")["t0"], "last": a.db.kg("api")["last"], "port": a.port}, "hook": {"on": a.db.kg("hook")["h"].is_string(), "t0": a.db.kg("hook")["t0"]}})
}

fn costs(a: &Ax) -> Value {
    let t30 = now() - 30 * 86_400_000;
    let rows = a.db.all("select c.repo, c.w, c.md, count(distinct c.job) jobs, count(distinct case when j.pr is not null then c.job end) prs, count(distinct case when p.st='merged' then c.job end) mg, count(distinct case when p.st='closed' then c.job end) cl, sum(c.usd) usd, max(c.sub) sub from cost c join jobs j on j.id=c.job left join prs p on p.repo=j.repo and p.num=j.pr where c.job is not null and c.t>=? group by 1,2,3 order by 1,2,4 desc", pa![now() - 90 * 86_400_000]);
    let mut st = vec![];
    for r in &rows {
        let mut x = r.clone();
        x["nm"] = json!(crate::prov::name(r["md"].as_str().unwrap_or("")));
        st.push(x);
    }
    json!({
        "today": a.db.one("select sum(case when sub=0 then usd end) usd, sum(case when sub=1 then usd end) val, sum(case when usd is null then 1 else 0 end) unk from cost where day=?", pa![crate::db::day()]),
        "days": a.db.all("select day, sum(case when sub=0 then usd end) usd, sum(case when sub=1 then usd end) val from cost where day>=date('now','localtime','-13 day') group by day order by day desc", pa![]),
        "repos": a.db.all("select repo, sum(case when sub=0 then usd end) usd, sum(case when sub=1 then usd end) val, count(distinct job) jobs from cost where t>=? and repo<>'' group by repo order by 2 desc", pa![t30]),
        "stats": st,
        "hints": hints(&rows),
        "budday": a.set()["budday"],
        "px": a.set()["px"],
    })
}

pub fn hints(rows: &[Value]) -> Vec<String> {
    let f = |v: &Value, k: &str| v[k].as_f64().unwrap_or(0.0);
    let mut o = vec![];
    for x in rows {
        for y in rows {
            if x["repo"] != y["repo"] || x["w"] != y["w"] || x["md"] == y["md"] || f(x, "jobs") < 5.0 || f(y, "jobs") < 5.0 {
                continue;
            }
            let (cx, cy) = (f(x, "usd") / f(x, "jobs"), f(y, "usd") / f(y, "jobs"));
            let (rx, ry) = (f(x, "mg") / f(x, "jobs"), f(y, "mg") / f(y, "jobs"));
            if cy > 0.0 && cx >= cy * 2.0 && ry + 0.05 >= rx {
                o.push(format!("{} on {}: {} gets as many merges per job as {} at {:.0}× lower cost", x["w"].as_str().unwrap_or(""), x["repo"].as_str().unwrap_or(""), crate::prov::name(y["md"].as_str().unwrap_or("")), crate::prov::name(x["md"].as_str().unwrap_or("")), cx / cy));
            }
        }
    }
    o
}

fn sets(a: &Ax, b: &Value) {
    let mut s = a.db.kg("set");
    if !s.is_object() {
        s = json!({});
    }
    if let Some(m) = b["md"].as_object() {
        for (k, v) in m {
            if let Some(x) = v.as_str() {
                if regex::Regex::new(r"^[A-Za-z0-9._:/\[\]-]{0,120}$").unwrap().is_match(x.trim()) {
                    s["md"][k] = json!(x.trim());
                }
            }
        }
    }
    if let Some(x) = b["big"].as_bool() {
        s["big"] = json!(x);
    }
    if let Some(x) = b["hunters"].as_i64() {
        s["hunters"] = json!(x.clamp(0, 12));
    }
    if let Some(x) = b["updates"].as_bool() {
        s["updates"] = json!(x);
    }
    if let Some(x) = b["cckc"].as_str() {
        if regex::Regex::new(r"^[A-Za-z0-9._ -]{0,100}$").unwrap().is_match(x.trim()) {
            s["prov"]["cc"]["kc"] = json!(x.trim());
        }
    }
    if let Some(x) = b["octx"].as_i64() {
        s["prov"]["ollama"]["ctx"] = json!(x.clamp(2048, 1_048_576));
    }
    if let Some(x) = b["ollama"].as_str() {
        let x = x.trim();
        if x.is_empty() || x.starts_with("http://") || x.starts_with("https://") {
            s["prov"]["ollama"]["base"] = json!(x);
        }
    }
    if let Some(x) = b["tokday"].as_i64() {
        s["tokday"] = json!(x.max(0));
    }
    if let Some(x) = b["budday"].as_f64() {
        s["budday"] = json!(x.clamp(0.0, 100_000.0));
    }
    if let Some(o) = b["px"].as_object() {
        let mut px = json!({});
        for (k, v) in o.iter().take(100) {
            let k = k.trim().to_lowercase();
            let x: Vec<f64> = v.as_array().map(|v| v.iter().filter_map(|x| x.as_f64()).filter(|x| x.is_finite() && *x >= 0.0 && *x < 10_000.0).collect()).unwrap_or_default();
            if regex::Regex::new(r"^[a-z0-9._:/-]{1,100}$").unwrap().is_match(&k) && (x.len() == 2 || x.len() == 4) {
                px[k] = json!(x);
            }
        }
        s["px"] = px;
    }
    for k in ["ntfy", "discord"] {
        if let Some(x) = b[k].as_str() {
            let x = x.trim();
            if x.is_empty() || x.starts_with("https://") || k == "ntfy" && x.starts_with("http://") {
                s[k] = json!(x);
            }
        }
    }
    a.db.ks("set", &s);
    a.tick();
    if let Some(w) = b["wh"].as_object() {
        let re = regex::Regex::new(r"^([01]\d|2[0-3]):[0-5]\d$").unwrap();
        let (f, t) = (w.get("from").and_then(|x| x.as_str()).unwrap_or(""), w.get("to").and_then(|x| x.as_str()).unwrap_or(""));
        if re.is_match(f) && re.is_match(t) {
            let mut s = a.db.kg("set");
            s["wh"] = json!({"on": w.get("on").and_then(|x| x.as_bool()).unwrap_or(false), "from": f, "to": t});
            a.db.ks("set", &s);
            a.tick();
        }
    }
}

const RPF: &[&str] = &["iss", "hunt", "nm", "on_", "maxo", "maxd", "bud", "ci", "setup", "rules", "mode"];
const HSF: &[&str] = &["id", "ssh", "dk", "ln", "ci", "gb", "raw", "no", "cpu"];

fn export(a: &Ax) -> Value {
    let mut s = a.db.kg("set");
    if let Some(o) = s.as_object_mut() {
        o.remove("ntfy");
        o.remove("discord");
    }
    let pick = |r: &Value, ks: &[&str]| Value::Object(ks.iter().map(|k| (k.to_string(), r[*k].clone())).collect());
    json!({
        "apollo_office": crate::app::V,
        "t": now(),
        "set": s,
        "repos": a.db.all("select * from rp order by full", pa![]).iter().map(|r| { let mut x = pick(r, RPF); x["full"] = r["full"].clone(); x }).collect::<Vec<_>>(),
        "hosts": a.db.all("select * from hs order by id", pa![]).iter().map(|r| pick(r, HSF)).collect::<Vec<_>>(),
    })
}

fn import(a: &Ax, b: &Value) -> Result<String, String> {
    if !b["apollo_office"].is_string() {
        return Err("this is not an ApolloOffice export".into());
    }
    let s = &b["set"];
    let mut x = json!({});
    for k in ["md", "hunters", "tokday", "budday", "updates", "px", "wh"] {
        if !s[k].is_null() {
            x[k] = s[k].clone();
        }
    }
    if let Some(v) = s["prov"]["ollama"]["base"].as_str() {
        x["ollama"] = json!(v);
    }
    if let Some(v) = s["prov"]["ollama"]["ctx"].as_i64() {
        x["octx"] = json!(v);
    }
    if let Some(v) = s["prov"]["cc"]["kc"].as_str() {
        x["cckc"] = json!(v);
    }
    sets(a, &x);
    let mut nr = 0;
    for r in b["repos"].as_array().cloned().unwrap_or_default().iter().take(500) {
        let Some(f) = rid(r["full"].as_str().unwrap_or("")) else { continue };
        if a.db.n("select count(*) from rp where full=?", pa![f.clone()]) > 0 {
            continue;
        }
        a.db.run("insert into rp(full,t0) values(?,?)", pa![f.clone(), now()]);
        for k in RPF {
            let v = &r[*k];
            match v {
                Value::Number(n) if n.is_i64() && *k != "bud" => {
                    a.db.run(&format!("update rp set {k}=? where full=?"), pa![n.as_i64().unwrap().clamp(0, 10000), f.clone()]);
                }
                Value::Number(n) => {
                    a.db.run(&format!("update rp set {k}=? where full=?"), pa![n.as_f64().unwrap_or(0.0).clamp(0.0, 100_000.0), f.clone()]);
                }
                Value::String(t) if ["ci", "setup", "rules", "mode"].contains(k) => {
                    let t = if *k == "mode" && t != "auto" { "ask".to_string() } else { crate::sh::head(t.trim(), 4000) };
                    a.db.run(&format!("update rp set {k}=? where full=?"), pa![t, f.clone()]);
                }
                _ => {}
            }
        }
        nr += 1;
    }
    let mut nh = 0;
    let idr = regex::Regex::new(r"^[A-Za-z0-9._-]{1,40}$").unwrap();
    let shr = regex::Regex::new(r"^[A-Za-z0-9._@-]{0,100}$").unwrap();
    for h in b["hosts"].as_array().cloned().unwrap_or_default().iter().take(50) {
        let id = h["id"].as_str().unwrap_or("");
        let ssh = if id == "local" { "" } else { h["ssh"].as_str().unwrap_or("") };
        if !idr.is_match(id) || !shr.is_match(ssh) || a.db.n("select count(*) from hs where id=?", pa![id.to_string()]) > 0 {
            continue;
        }
        let i = |k: &str, d: i64, lo: i64, hi: i64| h[k].as_i64().unwrap_or(d).clamp(lo, hi);
        a.db.run("insert into hs(id,ssh,dk,ln,ci,gb,raw,on_,t0,no,cpu) values(?,?,?,?,?,?,?,0,?,?,?)", pa![id.to_string(), ssh.to_string(), i("dk", 0, 0, 1), i("ln", 1, 1, 8), i("ci", 1, 1, 8), i("gb", 50, 5, 10000), i("raw", 0, 0, 1), now(), crate::sh::head(h["no"].as_str().unwrap_or(""), 2000), i("cpu", 0, 0, 256)]);
        nh += 1;
    }
    a.sw.notify_one();
    Ok(format!("Imported settings, {nr} new repositories and {nh} new machines. Machines come in switched off: check them under Machines, then switch them on."))
}

async fn health(a: &Ax, f: bool) -> Value {
    if let Some(v) = crate::gh::cg(a, "health", 300_000).filter(|_| !f) {
        return v;
    }
    let ck = checks(a).await;
    let s = a.set();
    let mut us: Vec<&str> = vec![];
    if let Some(m) = s["md"].as_object() {
        for v in m.values() {
            let p = crate::prov::parse(v.as_str().unwrap_or("")).0;
            if !us.contains(&p) {
                us.push(p);
            }
        }
    }
    let ps = crate::prov::status(a);
    let mut ai = vec![];
    for p in &us {
        let st = ps.as_array().and_then(|x| x.iter().find(|y| y["id"] == *p)).cloned().unwrap_or(json!({}));
        let nm = st["nm"].as_str().unwrap_or(p).to_string();
        let (ok, m) = match *p {
            "cc" => (ck["claude"]["ok"].as_bool().unwrap_or(false), if ck["claude"]["ok"] == true { "Claude Code found".to_string() } else { "Claude Code is not installed or not on PATH. Install it and log in with claude.".to_string() }),
            "codex" => {
                let r = crate::sh::run(&crate::sh::tool("codex"), &["--version".to_string()], crate::sh::Rq { t: 20, ..Default::default() }).await;
                (r.c == 0, if r.c == 0 { "Codex CLI found".to_string() } else { "Codex CLI is not installed. Install it and log in with codex login.".to_string() })
            }
            "ollama" => (true, "local, checked when used".to_string()),
            _ => (st["has"] == true, if st["has"] == true { "API key saved".to_string() } else { format!("No API key for {nm}. Add it under Settings → Providers.") }),
        };
        ai.push(json!({"k": nm, "ok": ok, "m": m}));
    }
    let net = a.lv.lock().unwrap().o.net.clone();
    let hs = a.db.all("select id, dk from hs where on_=1", pa![]);
    let ms: Vec<Value> = hs.iter().map(|h| { let id = h["id"].as_str().unwrap_or(""); let ok = *net.get(id).unwrap_or(&true); json!({"k": id, "ok": ok, "m": if ok { "reachable".to_string() } else if id == "local" { "this computer reports a problem, see the log".to_string() } else { format!("{id} is not reachable over ssh. Check that it is on and that ssh {id} works.") }}) }).collect();
    let dk = hs.iter().any(|h| h["dk"] == 1 && h["id"] == "local");
    let v = json!({
        "gh": {"ok": ck["gh"]["ok"], "m": ck["gh"]["m"]},
        "ai": {"ok": ai.iter().all(|x| x["ok"] == true), "m": ai},
        "docker": {"ok": !dk || ck["docker"]["ok"] == true, "m": if dk { ck["docker"]["m"].clone() } else { json!("not used on this computer") }},
        "hosts": {"ok": !ms.is_empty() && ms.iter().all(|x| x["ok"] == true), "m": if ms.is_empty() { json!([{"k": "none", "ok": false, "m": "No machine is switched on. Add one under Machines."}]) } else { json!(ms) }},
        "t": now(),
    });
    crate::gh::cs(a, "health", &v);
    v
}

fn th(t: &str) -> String {
    use sha2::{Digest, Sha256};
    hex::encode(Sha256::digest(t.as_bytes()))
}

fn tok_ok(a: &Ax, h: &HeaderMap) -> bool {
    let t = h.get("authorization").and_then(|v| v.to_str().ok()).and_then(|s| s.strip_prefix("Bearer ")).unwrap_or("").trim().to_string();
    let k = a.db.kg("api");
    if t.len() < 20 || k["h"].as_str() != Some(&th(&t)) {
        return false;
    }
    let mut k = k;
    k["last"] = json!(now());
    a.db.ks("api", &k);
    true
}

fn cut(s: &str, n: usize) -> String {
    if s.len() <= n {
        return s.to_string();
    }
    let h = crate::sh::head(s, n / 5);
    let mut i = s.len() - (n - n / 5);
    while !s.is_char_boundary(i) {
        i += 1;
    }
    format!("{h}\n[...]\n{}", &s[i..])
}

fn rep(a: &Ax, b: &Value) -> Result<Value, (StatusCode, String)> {
    let bad = |m: &str| Err((StatusCode::BAD_REQUEST, m.to_string()));
    let Some(r) = rid(b["repo"].as_str().unwrap_or("")) else { return bad("repo must be owner/name") };
    if a.db.n("select count(*) from rp where full=? and on_=1", pa![r.clone()]) == 0 {
        return bad("this repository is not added to the office or is switched off");
    }
    if a.db.n("select count(*) from jobs where json_extract(d,'$.api')=1 and st not in ('done','drop')", pa![]) >= 20 {
        return Err((StatusCode::TOO_MANY_REQUESTS, "20 reports are already open, try again later".into()));
    }
    let src: String = b["src"].as_str().unwrap_or("").chars().filter(|c| c.is_ascii_alphanumeric() || " ._-".contains(*c)).take(40).collect::<String>().trim().to_string();
    if let Some(n) = b["issue"].as_i64() {
        if n <= 0 {
            return bad("issue must be a positive number");
        }
        if let Some(x) = a.db.one("select id from jobs where repo=? and num=? and kind='fix' and st<>'drop'", pa![r.clone(), n]) {
            return Ok(json!({"id": x["id"], "new": false}));
        }
        let id = a.db.jnew(&r, n, "fix", &format!("Issue #{n}"), &format!("https://github.com/{r}/issues/{n}"), "vet", &format!("sent through the API{}", if src.is_empty() { String::new() } else { format!(" by {src}") }), json!({"api": 1, "gi": true}), None, -0.7);
        a.flow("scout", "vet", &format!("{r}#{n}"));
        a.say("scout", &format!("{r}#{n} sent through the API → Vet"), Some(id));
        return Ok(json!({"id": id, "new": true}));
    }
    let ti: String = b["title"].as_str().unwrap_or("").split_whitespace().collect::<Vec<_>>().join(" ").chars().take(200).collect();
    let bd = b["body"].as_str().unwrap_or("").trim().to_string();
    if ti.is_empty() || bd.is_empty() {
        return bad("title and body are required (or issue)");
    }
    let fp: String = b["fp"].as_str().unwrap_or("").chars().filter(|c| !c.is_control()).take(300).collect();
    if !fp.is_empty() {
        if let Some(x) = a.db.one("select id, d from jobs where repo=? and json_extract(d,'$.ext.fp')=? and st not in ('done','drop')", pa![r.clone(), fp.clone()]) {
            let id = x["id"].as_i64().unwrap_or(0);
            if let Some(mut j) = a.db.jg(id) {
                j.d["ext"]["n"] = json!(j.d["ext"]["n"].as_i64().unwrap_or(1) + 1);
                a.db.jd(&j);
            }
            return Ok(json!({"id": id, "new": false}));
        }
    }
    let wh: String = b["where"].as_str().unwrap_or("").trim().chars().take(300).collect();
    let lg = b["logs"].as_str().unwrap_or("").trim();
    let mut body = cut(&bd, 20000);
    if !wh.is_empty() {
        body.push_str(&format!("\n\nWhere: {wh}"));
    }
    if !lg.is_empty() {
        body.push_str(&format!("\n\nLogs:\n```\n{}\n```", cut(lg, 20000)));
    }
    let id = a.db.jnew(&r, 0, "fix", &ti, &format!("https://github.com/{r}"), "vet", &format!("reported{}", if src.is_empty() { String::new() } else { format!(" by {src}") }), json!({"api": 1, "ext": {"src": if src.is_empty() { "an external tool".to_string() } else { src.clone() }, "where": wh, "fp": fp}, "title": ti, "body": body}), None, -0.7);
    a.flow("scout", "vet", &r);
    a.say("scout", &format!("{r} report {id} received{}: {ti}", if src.is_empty() { String::new() } else { format!(" from {src}") }), Some(id));
    Ok(json!({"id": id, "new": true}))
}

// Report tokens may submit reports but do not grant private source/review access.
fn repst(a: &Ax,id:i64)->Option<Value> {
    let mut j=a.db.one("select id,repo,num,st,why,pr,t0,t1,json_extract(d,'$.acceptance_proof.ok') acceptance_ok from jobs where id=? and json_extract(d,'$.api')=1",pa![id])?;
    j["routing_models"]=json!(a.db.all("select distinct json_extract(v,'$.model') model from kv where k like ? limit 32",pa![format!("routing:{id}:%")]).iter().filter_map(|r|r["model"].as_str().map(str::to_string)).collect::<Vec<_>>());
    Some(j)
}

fn repdetail(a: &Ax, id: i64) -> Option<Value> {
    let j = a.db.one("select id,repo,num,st,why,pr,t0,t1 from jobs where id=? and json_extract(d,'$.api')=1", pa![id])?;
    let pu = j["pr"].as_i64().map(|n| format!("https://github.com/{}/pull/{n}", j["repo"].as_str().unwrap_or("")));
    let detail = a.db.jg(id).map(|j| j.d).unwrap_or(Value::Null);
    let lessons = a.db.all("select v from kv where k like ?",pa![format!("lesson:{id}:%")]).iter().filter_map(|r|serde_json::from_str::<Value>(r["v"].as_str()?).ok()).collect::<Vec<_>>();
    let routing = a.db.all("select v from kv where k like ?",pa![format!("routing:{id}:%")]).iter().filter_map(|r|serde_json::from_str::<Value>(r["v"].as_str()?).ok()).collect::<Vec<_>>();
    let evidence=crate::routing::evidence_summary(&routing,&detail,j["st"].as_str().unwrap_or(""));
    Some(json!({"evidence_summary":evidence,"requirements":{"base":detail["preflight"]["base"],"tools":detail["preflight"]["tools"],"min_sdk":detail["preflight"]["min_sdk"],"unresolved_dependencies":detail["preflight"]["unresolved_dependencies"]},"acceptance":detail["acceptance_proof"],"diff":detail["df"],"proof":detail["proof"],"result":detail["f"],"review":detail["last_review"],"lessons":lessons,"routing":routing,"id": j["id"], "repo": j["repo"], "issue": if j["num"].as_i64().unwrap_or(0) > 0 { j["num"].clone() } else { Value::Null }, "st": j["st"], "why": j["why"], "pr": pu, "t0": j["t0"], "t1": j["t1"]}))
}

pub fn trk(v: &Value) -> Option<Value> {
    let s = |x: &Value| x.as_str().unwrap_or("").trim().to_string();
    if let Some(at) = v["attachments"].as_array().and_then(|x| x.first()) {
        let ti = s(&at["title"]);
        if ti.is_empty() {
            return None;
        }
        let mut b = format!("Error tracker alert from GlitchTip: {ti}");
        if !s(&at["text"]).is_empty() {
            b.push_str(&format!("\n\nCulprit: {}", s(&at["text"])));
        }
        for f in at["fields"].as_array().cloned().unwrap_or_default() {
            b.push_str(&format!("\n{}: {}", s(&f["title"]), s(&f["value"])));
        }
        let ln = s(&at["title_link"]);
        if !ln.is_empty() {
            b.push_str(&format!("\nLink: {ln}"));
        }
        return Some(json!({"title": ti, "body": b, "where": s(&at["text"]), "src": "GlitchTip", "fp": format!("gt:{ln}")}));
    }
    let d = &v["data"];
    let e = if d["event"].is_object() { &d["event"] } else { &d["error"] };
    let i = &d["issue"];
    let ti = [s(&e["title"]), s(&i["title"])].into_iter().find(|x| !x.is_empty())?;
    let wh = [s(&e["culprit"]), s(&i["culprit"]), s(&e["location"])].into_iter().find(|x| !x.is_empty()).unwrap_or_default();
    let mut b = format!("Error tracker alert from Sentry: {ti}");
    if !wh.is_empty() {
        b.push_str(&format!("\n\nCulprit: {wh}"));
    }
    let msg = [s(&e["message"]), s(&e["logentry"]["formatted"])].into_iter().find(|x| !x.is_empty()).unwrap_or_default();
    if !msg.is_empty() && msg != ti {
        b.push_str(&format!("\nMessage: {msg}"));
    }
    for (k, n) in [("release", "Release"), ("environment", "Environment"), ("platform", "Platform")] {
        if !s(&e[k]).is_empty() {
            b.push_str(&format!("\n{n}: {}", s(&e[k])));
        }
    }
    let mut st = String::new();
    for x in e["exception"]["values"].as_array().cloned().unwrap_or_default() {
        st.push_str(&format!("\n{}: {}", s(&x["type"]), s(&x["value"])));
        let fr = x["stacktrace"]["frames"].as_array().cloned().unwrap_or_default();
        let ap: Vec<&Value> = fr.iter().filter(|f| f["in_app"].as_bool().unwrap_or(false)).collect();
        let fs: Vec<&Value> = if ap.is_empty() { fr.iter().collect() } else { ap };
        for f in fs.iter().rev().take(15) {
            st.push_str(&format!("\n  at {} ({}:{})", s(&f["function"]), [s(&f["filename"]), s(&f["abs_path"]), s(&f["module"])].into_iter().find(|x| !x.is_empty()).unwrap_or_default(), f["lineno"].as_i64().map(|n| n.to_string()).unwrap_or_default()));
        }
    }
    if st.is_empty() && i["metadata"].is_object() {
        let m = &i["metadata"];
        st = format!("\n{}: {} in {} ({})", s(&m["type"]), s(&m["value"]), s(&m["function"]), s(&m["filename"]));
    }
    let ln = [s(&e["web_url"]), s(&i["web_url"]), s(&i["permalink"])].into_iter().find(|x| !x.is_empty()).unwrap_or_default();
    if !ln.is_empty() {
        b.push_str(&format!("\nLink: {ln}"));
    }
    let id = [s(&i["id"]), s(&e["issue_id"]), s(&e["groupID"]), e["issue_id"].as_i64().map(|n| n.to_string()).unwrap_or_default(), i["id"].as_i64().map(|n| n.to_string()).unwrap_or_default()].into_iter().find(|x| !x.is_empty()).unwrap_or_else(|| ti.clone());
    Some(json!({"title": ti, "body": b, "where": wh, "logs": st.trim(), "src": "Sentry", "fp": format!("sentry:{id}")}))
}

async fn hook(a: &Ax, q: &str, hd: &HeaderMap, b: Body) -> Response<Body> {
    let qv = |k: &str| q.split('&').find_map(|x| x.strip_prefix(&format!("{k}="))).unwrap_or("").to_string();
    let k = a.db.kg("hook");
    let hk = hd.get("x-hook-key").or(hd.get("authorization")).and_then(|v| v.to_str().ok()).map(|s| s.trim_start_matches("Bearer ").trim().to_string()).unwrap_or_default();
    let t = if hk.is_empty() { qv("key") } else { hk };
    if t.len() < 20 || k["h"].as_str() != Some(&th(&t)) {
        return er(StatusCode::UNAUTHORIZED, "missing or wrong key (Settings → Error trackers)");
    }
    let Ok(by) = to_bytes(b, 1 << 20).await else { return er(StatusCode::PAYLOAD_TOO_LARGE, "body larger than 1 MB") };
    let Ok(v) = serde_json::from_slice::<Value>(&by) else { return er(StatusCode::BAD_REQUEST, "body must be JSON") };
    if v["action"].as_str().is_some_and(|x| !matches!(x, "created" | "triggered")) {
        return js(json!({"ok": true, "skip": "action"}));
    }
    let Some(mut r) = trk(&v) else { return js(json!({"ok": true, "skip": "no error in payload"})) };
    r["repo"] = json!(qv("repo").replace("%2F", "/").replace("%2f", "/"));
    match rep(a, &r) {
        Ok(x) => js(x),
        Err((c, e)) => er(c, &e),
    }
}

async fn v1(a: &Ax, m: &Method, p: &str, q: &str, hd: &HeaderMap, b: Body) -> Response<Body> {
    if m == Method::POST && p == "/v1/hook" {
        return hook(a, q, hd, b).await;
    }
    if !tok_ok(a, hd) {
        return er(StatusCode::UNAUTHORIZED, "missing or wrong API token (Settings → API)");
    }
    let qv = |k: &str| q.split('&').find_map(|x| x.strip_prefix(&format!("{k}="))).unwrap_or("").to_string();
    match (m.as_str(), p) {
        ("POST", "/v1/report") => {
            let Ok(by) = to_bytes(b, 1 << 20).await else { return er(StatusCode::PAYLOAD_TOO_LARGE, "body larger than 1 MB") };
            let Ok(v) = serde_json::from_slice::<Value>(&by) else { return er(StatusCode::BAD_REQUEST, "body must be JSON") };
            match rep(a, &v) {
                Ok(r) => js(r),
                Err((c, e)) => er(c, &e),
            }
        }
        ("GET", "/v1/report") => match repst(a, qv("id").parse().unwrap_or(0)) {
            Some(v) => js(v),
            None => er(StatusCode::NOT_FOUND, "no report with this id"),
        },
        ("GET", "/v1/reports") => js(json!(a.db.all("select id from jobs where json_extract(d,'$.api')=1 order by id desc limit 50", pa![]).iter().filter_map(|x| repst(a, x["id"].as_i64().unwrap_or(0))).collect::<Vec<_>>())),
        ("GET", "/v1/repos") => js(json!(a.db.all("select full from rp where on_=1 order by full", pa![]).iter().filter_map(|x| x["full"].as_str().map(String::from)).collect::<Vec<_>>())),
        _ => er(StatusCode::NOT_FOUND, "unknown endpoint"),
    }
}

async fn ws(a: Ax, mut s: WebSocket) {
    let mut last = String::new();
    loop {
        let n = crate::app::CHG.notified();
        tokio::pin!(n);
        n.as_mut().enable();
        let mut v = state(&a);
        v["t"] = json!(0);
        let k = v.to_string();
        if k != last {
            v["t"] = json!(now());
            if s.send(Message::Text(v.to_string().into())).await.is_err() {
                return;
            }
            last = k;
        }
        tokio::select! {
            _ = &mut n => tokio::time::sleep(std::time::Duration::from_millis(200)).await,
            _ = tokio::time::sleep(std::time::Duration::from_secs(2)) => {}
            m = s.recv() => if !matches!(m, Some(Ok(Message::Ping(_) | Message::Pong(_) | Message::Text(_) | Message::Binary(_)))) { return },
            _ = a.quit.notified() => return,
        }
    }
}

fn rid(s: &str) -> Option<String> {
    let s = s.trim().trim_start_matches("https://github.com/").trim_end_matches('/').trim_end_matches(".git");
    let re = regex::Regex::new(r"^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$").unwrap();
    if re.is_match(s) {
        Some(s.to_string())
    } else {
        None
    }
}

async fn api(a: &Ax, m: &Method, p: &str, q: &str, b: Value) -> Response<Body> {
    let qv = |k: &str| q.split('&').find_map(|x| x.strip_prefix(&format!("{k}="))).unwrap_or("").to_string();
    match (m.as_str(), p) {
        ("GET", "/api/state") => js(state(a)),
        ("GET", "/api/cfg") => js(cfg(a)),
        ("GET", "/api/check") => js(checks(a).await),
        ("GET", "/api/report") => match repdetail(a,qv("id").parse().unwrap_or(0)) {
            Some(value)=>js(value),None=>er(StatusCode::NOT_FOUND,"no report with this id"),
        },
        ("GET", "/api/job") => {
            let id: i64 = qv("id").parse().unwrap_or(0);
            match a.db.one("select * from jobs where id=?", pa![id]) {
                Some(j) => js(json!({"id": j["id"], "repo": j["repo"], "num": j["num"], "kind": j["kind"], "title": j["title"], "url": j["url"], "st": j["st"], "why": j["why"], "pt": j["d"]["pt"], "pb": j["d"]["pb"], "df": j["d"]["df"], "proof": j["d"]["proof"], "known": j["d"]["known"], "h": j["d"]["h"], "ext": j["d"]["ext"]["src"], "cost": a.db.one("select sum(case when sub=0 then usd end) usd, sum(case when sub=1 then usd end) val, sum(tin+tcw+tcr) ti, sum(tout) tou, count(*) n from cost where job=?", pa![id]), "ev": a.db.all("select t,w,m from ev where j=? order by id desc limit 80", pa![id])})),
                None => er(StatusCode::NOT_FOUND, "no such job"),
            }
        }
        ("POST", "/api/act") => {
            let id = b["id"].as_i64().unwrap_or(0);
            match b["a"].as_str().unwrap_or("") {
                "pause" => {
                    let on = b["on"].as_bool().unwrap_or(false);
                    a.lv.lock().unwrap().o.man = on;
                    a.db.ks("man", &json!(on));
                    a.say("scout", if on { "office paused" } else { "office resumed" }, None);
                }
                "hold" => {
                    let w = b["w"].as_str().unwrap_or("").to_string();
                    let on = b["on"].as_bool().unwrap_or(false);
                    if let Some(x) = a.lv.lock().unwrap().w.get_mut(&w) {
                        x.hold = on;
                    }
                    let mut h = a.db.kg("hold");
                    if !h.is_object() {
                        h = json!({});
                    }
                    h[&w] = json!(on);
                    a.db.ks("hold", &h);
                }
                "drop" => {
                    if let Some(j) = a.db.jg(id) {
                        if ["ready", "vet", "approve"].contains(&j.st.as_str()) {
                            a.db.jset(id, &[("st", json!("drop")), ("why", json!("dropped by the owner"))]);
                        } else if !["done", "drop"].contains(&j.st.as_str()) {
                            a.db.ks(&format!("kill:{id}"), &json!(true));
                        }
                    }
                }
                "approve" => {
                    if let Some(mut j) = a.db.jg(id) {
                        if j.st != "approve" {
                            return er(StatusCode::CONFLICT, "job is not waiting for approval");
                        }
                        if let Some(t) = b["pt"].as_str().filter(|s| !s.trim().is_empty()) {
                            j.d["pt"] = json!(t.trim());
                        }
                        if let Some(t) = b["pb"].as_str().filter(|s| !s.trim().is_empty()) {
                            j.d["pb"] = json!(t.trim());
                        }
                        j.d["ap"] = json!(true);
                        a.db.jset(id, &[("st", json!("submit")), ("why", json!("approved, submitting")), ("d", j.d)]);
                    }
                }
                "requeue" => {
                    if let Some(j) = a.db.jg(id) {
                        if j.st == "drop" && j.kind == "fix" {
                            let mut d = j.d.clone();
                            for k in ["h", "rs", "rp", "br", "f", "f0", "sq", "known", "vt"] {
                                d.as_object_mut().map(|o| o.remove(k));
                            }
                            a.db.kd(&format!("kill:{id}"));
                            a.db.kd(&format!("cired:{}", j.repo));
                            a.db.jset(id, &[("st", json!(if j.why.starts_with("Guard") || j.why.starts_with("Vet") { "vet" } else { "ready" })), ("why", json!("requeued by the owner")), ("d", d)]);
                        }
                    }
                }
                _ => return er(StatusCode::BAD_REQUEST, "unknown action"),
            }
            js(state(a))
        }
        ("POST", "/api/repo") => {
            let op = b["op"].as_str().unwrap_or("");
            let Some(r) = rid(b["full"].as_str().unwrap_or("")) else { return er(StatusCode::BAD_REQUEST, "use owner/name") };
            match op {
                "add" => {
                    let mt = match crate::gh::meta(a, &r).await {
                        Ok(v) => v,
                        Err(e) => return er(StatusCode::BAD_REQUEST, &format!("cannot read {r}: {e}")),
                    };
                    if mt["arch"].as_bool().unwrap_or(false) {
                        return er(StatusCode::BAD_REQUEST, "repository is archived");
                    }
                    let r = mt["full"].as_str().unwrap_or(&r).to_string();
                    let (c, s) = crate::gh::detect(&r).await;
                    a.db.run("insert or ignore into rp(full,ci,setup,mode,t0) values(?,?,?,?,?)", pa![r.clone(), c.clone(), s.clone(), "ask".to_string(), now()]);
                    a.sw.notify_one();
                    js(json!({"full": r, "ci": c, "setup": s, "cfg": cfg(a)}))
                }
                "set" => {
                    for (k, kind) in [("iss", 0), ("hunt", 0), ("nm", 0), ("on_", 0), ("maxo", 1), ("maxd", 1), ("bud", 3), ("ci", 2), ("setup", 2), ("rules", 2), ("mode", 2)] {
                        let v = &b[k];
                        if v.is_null() {
                            continue;
                        }
                        match kind {
                            3 => {
                                let x = v.as_f64().unwrap_or(0.0).clamp(0.0, 100_000.0);
                                a.db.run(&format!("update rp set {k}=? where full=?"), pa![x, r.clone()]);
                            }
                            0 => {
                                let x = v.as_bool().map(|x| x as i64).or(v.as_i64()).unwrap_or(0).clamp(0, 1);
                                a.db.run(&format!("update rp set {k}=? where full=?"), pa![x, r.clone()]);
                            }
                            1 => {
                                let x = v.as_i64().unwrap_or(3).clamp(0, 10000);
                                a.db.run(&format!("update rp set {k}=? where full=?"), pa![x, r.clone()]);
                            }
                            _ => {
                                let mut s = v.as_str().unwrap_or("").trim().to_string();
                                if k == "mode" && s != "auto" {
                                    s = "ask".into();
                                }
                                s = crate::sh::head(&s, 4000);
                                a.db.run(&format!("update rp set {k}=? where full=?"), pa![s, r.clone()]);
                            }
                        }
                    }
                    a.db.kd(&format!("cired:{r}"));
                    a.sw.notify_one();
                    js(cfg(a))
                }
                "detect" => {
                    let (c, s) = crate::gh::detect(&r).await;
                    js(json!({"ci": c, "setup": s}))
                }
                "del" => {
                    a.db.run("delete from rp where full=?", pa![r.clone()]);
                    a.db.run("update jobs set st='drop', why='repository removed' where repo=? and st in ('vet','ready','approve')", pa![r.clone()]);
                    js(cfg(a))
                }
                _ => er(StatusCode::BAD_REQUEST, "unknown op"),
            }
        }
        ("POST", "/api/host") => {
            let op = b["op"].as_str().unwrap_or("");
            let id = b["id"].as_str().unwrap_or("").trim().to_string();
            if !regex::Regex::new(r"^[A-Za-z0-9._-]{1,40}$").unwrap().is_match(&id) {
                return er(StatusCode::BAD_REQUEST, "name: letters, digits, . _ - only");
            }
            match op {
                "add" | "set" => {
                    let ssh = if id == "local" { String::new() } else { b["ssh"].as_str().unwrap_or(&id).trim().to_string() };
                    if !ssh.is_empty() && !regex::Regex::new(r"^[A-Za-z0-9._@-]{1,100}$").unwrap().is_match(&ssh) {
                        return er(StatusCode::BAD_REQUEST, "ssh: use a host alias from ~/.ssh/config or user@host");
                    }
                    let dk = b["dk"].as_bool().unwrap_or(false);
                    if !dk && !b["raw"].as_bool().unwrap_or(false) {
                        return er(StatusCode::BAD_REQUEST, "without Docker the workers run repository code directly on this machine; confirm that first");
                    }
                    let no = crate::sh::head(b["no"].as_str().unwrap_or("").trim(), 2000);
                    a.db.run("insert into hs(id,ssh,dk,ln,ci,gb,raw,on_,t0,no,cpu) values(?,?,?,?,?,?,?,?,?,?,?) on conflict(id) do update set ssh=excluded.ssh, dk=excluded.dk, ln=excluded.ln, ci=excluded.ci, gb=excluded.gb, raw=excluded.raw, on_=excluded.on_, no=excluded.no, cpu=excluded.cpu", pa![id.clone(), ssh, dk as i64, b["ln"].as_i64().unwrap_or(1).clamp(1, 8), b["ci"].as_i64().unwrap_or(1).clamp(1, 8), b["gb"].as_i64().unwrap_or(50).clamp(5, 10000), (!dk) as i64, b["on"].as_bool().unwrap_or(true) as i64, now(), no, b["cpu"].as_i64().unwrap_or(0).clamp(0, 256)]);
                    a.db.kd(&format!("up:{id}"));
                    match crate::sh::ensure(a, &id).await {
                        Ok(()) => {
                            if dk {
                                a.db.ks(&format!("up:{id}"), &json!(true));
                            }
                            a.lv.lock().unwrap().o.net.insert(id.clone(), true);
                            js(json!({"ok": true, "cfg": cfg(a)}))
                        }
                        Err(m) => js(json!({"ok": false, "m": m, "cfg": cfg(a)})),
                    }
                }
                "del" => {
                    a.db.run("delete from hs where id=?", pa![id.clone()]);
                    js(cfg(a))
                }
                _ => er(StatusCode::BAD_REQUEST, "unknown op"),
            }
        }
        ("POST", "/api/set") => {
            sets(a, &b);
            if b["test"].as_bool().unwrap_or(false) {
                crate::ntf::send(a, "ApolloOffice", "Test notification", 3).await;
            }
            if let Some(x) = b["auto"].as_bool() {
                let _ = crate::sys::autostart(x, &a.me, &a.dd, a.port);
            }
            js(cfg(a))
        }
        ("POST", "/api/prov") => {
            let id = b["id"].as_str().unwrap_or("");
            let Some(p) = crate::prov::pv(id) else { return er(StatusCode::BAD_REQUEST, "unknown provider") };
            if let Some(k) = b["key"].as_str() {
                if !p.key && id != "cc" {
                    return er(StatusCode::BAD_REQUEST, "this provider has no API key");
                }
                if let Err(e) = crate::vault::put(a, id, k.trim()) {
                    return er(StatusCode::INTERNAL_SERVER_ERROR, &e);
                }
            }
            js(cfg(a))
        }
        ("GET", "/api/models") => match crate::prov::models(a, &qv("p")).await {
            Ok(v) => js(json!({"ms": v})),
            Err(e) => js(json!({"ms": [], "error": e})),
        },
        ("POST", "/api/test") => {
            let md = b["md"].as_str().unwrap_or("").to_string();
            match crate::prov::test(a, &md).await {
                Ok(t) => js(json!({"ok": true, "m": t})),
                Err(e) => js(json!({"ok": false, "m": crate::wk::errm(&e)})),
            }
        }
        ("GET", "/api/cost") => js(costs(a)),
        ("GET", "/api/health") => js(health(a, qv("f") == "1").await),
        ("GET", "/api/export") => js(export(a)),
        ("POST", "/api/import") => match import(a, &b) {
            Ok(m) => js(json!({"ok": true, "m": m, "cfg": cfg(a)})),
            Err(e) => er(StatusCode::BAD_REQUEST, &e),
        },
        ("POST", "/api/danger") => {
            let op = b["op"].as_str().unwrap_or("");
            match op {
                "logout" => {
                    a.db.run("delete from ses", pa![]);
                    a.say("scout", "signed out everywhere", None);
                }
                "history" => {
                    a.db.run("delete from jobs where st in ('done','drop')", pa![]);
                    a.db.run("delete from ev where j is null or j not in (select id from jobs)", pa![]);
                    a.say("scout", "job history cleared", None);
                }
                "reset" => {
                    for k in ["set", "hold", "man"] {
                        a.db.kd(k);
                    }
                    {
                        let mut l = a.lv.lock().unwrap();
                        l.o.man = false;
                        for w in l.w.values_mut() {
                            w.hold = false;
                        }
                    }
                    a.tick();
                    a.say("scout", "settings reset to defaults", None);
                }
                "wipe" => {
                    if b["sure"].as_str() != Some("delete") {
                        return er(StatusCode::BAD_REQUEST, "type delete to confirm");
                    }
                    a.lv.lock().unwrap().o.man = true;
                    for t in ["jobs", "ev", "prs", "cost", "tok", "seen", "cm", "rp", "hs", "lnk"] {
                        a.db.run(&format!("delete from {t}"), pa![]);
                    }
                    a.db.run("delete from kv", pa![]);
                    a.db.ks("man", &json!(true));
                    *a.vk.lock().unwrap() = None;
                    a.say("scout", "all data deleted, the office is paused", None);
                }
                _ => return er(StatusCode::BAD_REQUEST, "unknown op"),
            }
            js(json!({"ok": true}))
        }
        ("POST", "/api/hooktok") => match b["op"].as_str().unwrap_or("") {
            "new" => {
                let t = hex::encode(rand::random::<[u8; 24]>());
                a.db.ks("hook", &json!({"h": th(&t), "t0": now()}));
                a.say("scout", "new error tracker link created", None);
                js(json!({"ok": true, "tok": t}))
            }
            "off" => {
                a.db.kd("hook");
                a.say("scout", "error tracker link revoked", None);
                js(json!({"ok": true}))
            }
            _ => er(StatusCode::BAD_REQUEST, "op"),
        },
        ("POST", "/api/apitok") => match b["op"].as_str().unwrap_or("") {
            "new" => {
                let t = format!("ao_{}", hex::encode(rand::random::<[u8; 24]>()));
                a.db.ks("api", &json!({"h": th(&t), "t0": now()}));
                a.say("scout", "new API token created", None);
                js(json!({"ok": true, "tok": t}))
            }
            "off" => {
                a.db.kd("api");
                a.say("scout", "API token revoked", None);
                js(json!({"ok": true}))
            }
            _ => er(StatusCode::BAD_REQUEST, "op"),
        },
        ("POST", "/api/google") => match b["op"].as_str().unwrap_or("") {
            "link" => js(json!({"url": crate::goog::start(a, "link")})),
            "unlink" => {
                a.db.kd("google");
                js(cfg(a))
            }
            _ => er(StatusCode::BAD_REQUEST, "unknown op"),
        },
        ("POST", "/api/star") => match b["op"].as_str().unwrap_or("") {
            "star" => match crate::star::star(a).await {
                Ok(()) => js(state(a)),
                Err(e) => er(StatusCode::BAD_GATEWAY, &e),
            },
            "later" => {
                crate::star::later(a);
                js(state(a))
            }
            _ => er(StatusCode::BAD_REQUEST, "unknown op"),
        },
        ("POST", "/api/update") => match b["op"].as_str().unwrap_or("") {
            "check" => match crate::upd::check(a).await {
                Ok(v) => js(json!({"ok": true, "r": v, "cfg": cfg(a)})),
                Err(e) => js(json!({"ok": false, "m": e, "cfg": cfg(a)})),
            },
            "apply" => {
                if !crate::upd::ready(a) {
                    return er(StatusCode::CONFLICT, "no update downloaded");
                }
                crate::upd::apply(a);
                js(json!({"ok": true}))
            }
            _ => er(StatusCode::BAD_REQUEST, "unknown op"),
        },
        _ => er(StatusCode::NOT_FOUND, "not found"),
    }
}

pub async fn h(State(a): State<Ax>, req: Request<Body>) -> Response<Body> {
    let (mut pt, b) = req.into_parts();
    if pt.uri.path() == "/api/ws" {
        if !host_ok(&a, &pt.headers) || !authed(&a, &pt.headers) {
            return er(StatusCode::UNAUTHORIZED, "login");
        }
        if !origin_ok(&a, &pt.headers) {
            return er(StatusCode::FORBIDDEN, "forbidden");
        }
        return match WebSocketUpgrade::from_request_parts(&mut pt, &a).await {
            Ok(u) => {
                let a2 = a.clone();
                u.on_upgrade(move |s| ws(a2, s)).into_response()
            }
            Err(e) => e.into_response(),
        };
    }
    if pt.uri.path().starts_with("/v1/") {
        let (m, p, q) = (pt.method.clone(), pt.uri.path().to_string(), pt.uri.query().unwrap_or("").to_string());
        return v1(&a, &m, &p, &q, &pt.headers, b).await;
    }
    let m = pt.method.clone();
    let p = pt.uri.path().to_string();
    let q = pt.uri.query().unwrap_or("").to_string();
    let hd = pt.headers;
    if p == "/int/mcp" && m == Method::POST {
        let t = hd.get("x-run").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
        let Ok(by) = to_bytes(b, 16 << 20).await else { return er(StatusCode::BAD_REQUEST, "body") };
        let v: Value = serde_json::from_slice(&by).unwrap_or(Value::Null);
        return js(crate::mcp::handle(&a, &t, &v).await);
    }
    if !host_ok(&a, &hd) {
        return er(StatusCode::MISDIRECTED_REQUEST, "use http://127.0.0.1");
    }
    if p == "/auth/google" && m == Method::GET {
        if crate::goog::linked(&a)["sub"].is_null() {
            return page("No Google account is connected yet. Log in with <code>apollo-office login-link</code>, then connect Google in Settings.");
        }
        return Response::builder().status(StatusCode::SEE_OTHER).header("location", crate::goog::start(&a, "login")).header("cache-control", "no-store").body(Body::empty()).unwrap();
    }
    if p == "/auth/google/cb" && m == Method::GET {
        let qv = |k: &str| q.split('&').find_map(|x| x.strip_prefix(&format!("{k}="))).map(|v| v.replace("%2F", "/").replace("%2f", "/")).unwrap_or_default();
        if !qv("error").is_empty() {
            return page("Google sign-in was cancelled. <a href='/'>Back</a>");
        }
        return match crate::goog::back(&a, &qv("code"), &qv("state")).await {
            Ok((md, sub, em)) if md == "link" => {
                crate::goog::link(&a, &sub, &em);
                a.say("scout", &format!("Google account {em} connected for sign-in"), None);
                rs(StatusCode::OK, "text/html; charset=utf-8", format!("{LP}<meta http-equiv=refresh content='1;url=/'><p>Connected <b>{}</b>. You can now sign in with this Google account.</p></div>", esc(&em)))
            }
            Ok((_, sub, em)) => {
                if !crate::goog::ok(&a, &sub) {
                    return page(&format!("<b>{}</b> is not the Google account connected to this ApolloOffice. <a href='/'>Back</a>", esc(&em)));
                }
                let s = hex::encode(rand::random::<[u8; 32]>());
                a.db.run("delete from ses where exp<?", pa![now()]);
                a.db.run("insert into ses(id,exp) values(?,?)", pa![s.clone(), now() + 30 * 86_400_000]);
                Response::builder().status(StatusCode::OK).header("content-type", "text/html; charset=utf-8").header("cache-control", "no-store").header("set-cookie", format!("ao={s}; HttpOnly; SameSite=Strict; Path=/; Max-Age={}", 30 * 86400)).body(Body::from(format!("{LP}<meta http-equiv=refresh content='0;url=/'><p>Signed in as {}.</p></div>", esc(&em)))).unwrap()
            }
            Err(e) => page(&format!("{} <a href='/'>Back</a>", esc(&e))),
        };
    }
    if p == "/auth/link" {
        let c = q.split('&').find_map(|x| x.strip_prefix("c=")).unwrap_or("").to_string();
        if !c.chars().all(|x| x.is_ascii_hexdigit()) || c.len() != 32 {
            return page("This login link is not valid. Run <code>apollo-office login-link</code> for a new one.");
        }
        if m == Method::GET {
            return page(&format!("<p>Log in to ApolloOffice on this computer?</p><form method=post action='/auth/link?c={c}'><button>Log in</button></form>"));
        }
        if m == Method::POST && origin_ok(&a, &hd) {
            if a.db.ch("delete from lnk where c=? and exp>?", pa![c, now()]) == 1 {
                let s = hex::encode(rand::random::<[u8; 32]>());
                a.db.run("delete from ses where exp<?", pa![now()]);
                a.db.run("insert into ses(id,exp) values(?,?)", pa![s.clone(), now() + 30 * 86_400_000]);
                return Response::builder().status(StatusCode::SEE_OTHER).header("location", "/").header("set-cookie", format!("ao={s}; HttpOnly; SameSite=Strict; Path=/; Max-Age={}", 30 * 86400)).body(Body::empty()).unwrap();
            }
            return page("This login link was already used or has expired. Run <code>apollo-office login-link</code> for a new one.");
        }
        return er(StatusCode::FORBIDDEN, "forbidden");
    }
    if p.starts_with("/api/") {
        if !authed(&a, &hd) {
            return er(StatusCode::UNAUTHORIZED, "login");
        }
        if m != Method::GET && (!origin_ok(&a, &hd) || hd.get("x-ao").is_none()) {
            return er(StatusCode::FORBIDDEN, "forbidden");
        }
        let b: Value = if m == Method::POST {
            match to_bytes(b, 1 << 20).await {
                Ok(by) => serde_json::from_slice(&by).unwrap_or(json!({})),
                Err(_) => return er(StatusCode::BAD_REQUEST, "body"),
            }
        } else {
            Value::Null
        };
        return api(&a, &m, &p, &q, b).await;
    }
    if p == "/api/wait" {
        return er(StatusCode::NOT_FOUND, "");
    }
    let f = if p == "/" { "index.html".to_string() } else { p.trim_start_matches('/').to_string() };
    if f == "index.html" && !authed(&a, &hd) {
        let g = if crate::goog::linked(&a)["sub"].is_string() { "<p><a href='/auth/google'><button>Sign in with Google</button></a></p><p>or, in a terminal, run</p>" } else { "<p>Not logged in. In a terminal, run</p>" };
        return page(&format!("<p><b>ApolloOffice</b></p>{g}<p><code>apollo-office login-link</code></p><p>and open the link it prints.</p>"));
    }
    match Ui::get(&f) {
        Some(x) => rs(StatusCode::OK, mime_guess::from_path(&f).first_or_octet_stream().as_ref(), x.data.into_owned()),
        None => er(StatusCode::NOT_FOUND, "not found"),
    }
}

#[cfg(test)]
mod t {
    use super::*;

    #[test]
    fn report_token_summary_does_not_expose_private_patch_or_review() {
        let db=crate::db::Db::mem();
        let id=db.jnew("o/private",0,"fix","bug","","approve","",json!({"api":1,"df":"PRIVATE_PATCH","proof":{"secret":"PRIVATE_PROOF"},"acceptance_proof":{"ok":true},"last_review":{"verdict":{"ok":true}}}),None,0.0);
        let a=std::sync::Arc::new(crate::app::App::new(db,std::env::temp_dir(),1,"x".into()));
        let public=repst(&a,id).unwrap();assert_eq!(public["st"],"approve");
        assert!(!public.to_string().contains("PRIVATE_"));
        for field in ["diff","proof","result","review","lessons","routing","evidence_summary"] {assert!(public.get(field).is_none());}
        assert_eq!(repdetail(&a,id).unwrap()["diff"],"PRIVATE_PATCH");
    }

    #[test]
    fn trackers() {
        let s = json!({"action": "triggered", "data": {"event": {"title": "TypeError: x is undefined", "culprit": "app/main.js in run", "issue_id": "42", "release": "1.2.0", "exception": {"values": [{"type": "TypeError", "value": "x is undefined", "stacktrace": {"frames": [{"function": "lib", "filename": "node_modules/a.js", "lineno": 1, "in_app": false}, {"function": "run", "filename": "app/main.js", "lineno": 7, "in_app": true}]}}]}, "web_url": "https://sentry.io/i/42"}}});
        let r = trk(&s).unwrap();
        assert_eq!(r["fp"], "sentry:42");
        assert_eq!(r["where"], "app/main.js in run");
        assert!(r["logs"].as_str().unwrap().contains("at run (app/main.js:7)"));
        assert!(!r["logs"].as_str().unwrap().contains("node_modules"));
        assert!(r["body"].as_str().unwrap().contains("Release: 1.2.0"));
        let i = json!({"action": "created", "data": {"issue": {"id": "9", "title": "ZeroDivisionError", "culprit": "calc.py", "permalink": "https://x/9", "metadata": {"type": "ZeroDivisionError", "value": "division by zero", "function": "div", "filename": "calc.py"}}}});
        let r = trk(&i).unwrap();
        assert_eq!(r["fp"], "sentry:9");
        assert!(r["logs"].as_str().unwrap().contains("division by zero"));
        let g = json!({"text": "GlitchTip Alert", "attachments": [{"title": "KeyError: 'id'", "title_link": "https://gt/issues/5", "text": "views.get", "fields": [{"title": "Project", "value": "web"}]}]});
        let r = trk(&g).unwrap();
        assert_eq!(r["src"], "GlitchTip");
        assert_eq!(r["fp"], "gt:https://gt/issues/5");
        assert!(trk(&json!({"data": {}})).is_none());
    }

    #[test]
    fn hint() {
        let r = |md: &str, jobs: i64, mg: i64, usd: f64| json!({"repo": "o/r", "w": "fixer", "md": md, "jobs": jobs, "mg": mg, "usd": usd});
        let h = hints(&[r("anthropic:claude-opus-5-5", 6, 3, 6.0), r("anthropic:claude-sonnet-5-5", 6, 3, 1.5)]);
        assert_eq!(h.len(), 1);
        assert!(h[0].contains("Claude Sonnet 5.5") && h[0].contains("4×"), "{}", h[0]);
        assert!(hints(&[r("anthropic:claude-opus-5-5", 6, 5, 6.0), r("anthropic:claude-sonnet-5-5", 6, 2, 1.5)]).is_empty());
        assert!(hints(&[r("anthropic:claude-opus-5-5", 6, 3, 6.0), r("anthropic:claude-sonnet-5-5", 4, 3, 1.0)]).is_empty());
    }

    #[test]
    fn dedup() {
        let db = crate::db::Db::mem();
        db.run("insert into rp(full,on_) values('o/r',1)", pa![]);
        let a = std::sync::Arc::new(crate::app::App::new(db, std::env::temp_dir(), 1, "x".into()));
        let b = json!({"repo": "o/r", "title": "t", "body": "b", "fp": "sentry:1"});
        let x = rep(&a, &b).unwrap();
        let y = rep(&a, &b).unwrap();
        assert_eq!(x["id"], y["id"]);
        assert_eq!(y["new"], false);
        assert_eq!(a.db.jg(x["id"].as_i64().unwrap()).unwrap().d["ext"]["n"], 2);
        let z = rep(&a, &json!({"repo": "o/r", "title": "t", "body": "b", "fp": "sentry:2"})).unwrap();
        assert_ne!(x["id"], z["id"]);
    }
}
