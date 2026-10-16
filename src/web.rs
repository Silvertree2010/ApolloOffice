use crate::cfg::Ax;
use crate::db::now;
use crate::pa;
use axum::body::{Body, Bytes};
use axum::extract::{ConnectInfo, State};
use axum::http::{header, HeaderMap, HeaderValue, Method, StatusCode, Uri};
use axum::response::Response;
use rust_embed::RustEmbed;
use serde_json::{json, Value};
use std::net::SocketAddr;

#[derive(RustEmbed)]
#[folder = "ui/"]
struct Ui;

const CSP: &str = "default-src 'self'; img-src 'self' data: blob: https://avatars.githubusercontent.com https://lh3.googleusercontent.com https://gitlab.com https://secure.gravatar.com https://cdn.discordapp.com; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

fn sec(r: &mut Response) {
    let h = r.headers_mut();
    h.insert("content-security-policy", HeaderValue::from_static(CSP));
    h.insert("x-frame-options", HeaderValue::from_static("DENY"));
    h.insert("x-content-type-options", HeaderValue::from_static("nosniff"));
    h.insert("referrer-policy", HeaderValue::from_static("no-referrer"));
    h.insert("cache-control", HeaderValue::from_static("no-store"));
}

fn js(v: Value) -> Response {
    let mut r = Response::new(Body::from(v.to_string()));
    r.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_static("application/json"));
    r
}

fn er(c: StatusCode, m: &str) -> Response {
    let mut r = js(json!({"error": m}));
    *r.status_mut() = c;
    r
}

fn redir(to: &str) -> Response {
    let mut r = Response::new(Body::empty());
    *r.status_mut() = StatusCode::FOUND;
    r.headers_mut().insert(header::LOCATION, HeaderValue::from_str(to).unwrap_or(HeaderValue::from_static("/")));
    r
}

fn ck(h: &HeaderMap, n: &str) -> Option<String> {
    for v in h.get_all(header::COOKIE) {
        for p in v.to_str().unwrap_or("").split(';') {
            if let Some((k, x)) = p.trim().split_once('=') {
                if k == n {
                    return Some(x.to_string());
                }
            }
        }
    }
    None
}

fn setck(r: &mut Response, n: &str, v: &str, age: i64, https: bool) {
    let c = format!("{n}={v}; Path=/; HttpOnly; SameSite=Strict; Max-Age={age}{}", if https { "; Secure" } else { "" });
    r.headers_mut().append(header::SET_COOKIE, HeaderValue::from_str(&c).unwrap());
}

fn setck_lax(r: &mut Response, n: &str, v: &str, age: i64, https: bool) {
    let c = format!("{n}={v}; Path=/auth; HttpOnly; SameSite=Lax; Max-Age={age}{}", if https { "; Secure" } else { "" });
    r.headers_mut().append(header::SET_COOKIE, HeaderValue::from_str(&c).unwrap());
}

fn qs(u: &Uri) -> std::collections::HashMap<String, String> {
    url::form_urlencoded::parse(u.query().unwrap_or("").as_bytes()).into_owned().collect()
}

fn hosts(a: &Ax) -> Vec<String> {
    let p = a.port;
    let mut v = vec![format!("127.0.0.1:{p}"), format!("localhost:{p}"), format!("[::1]:{p}")];
    if a.bind != "127.0.0.1" && a.bind != "0.0.0.0" && a.bind != "::" {
        v.push(format!("{}:{p}", if a.bind.contains(':') { format!("[{}]", a.bind) } else { a.bind.clone() }));
    }
    for h in a.set()["hosts"].as_array().cloned().unwrap_or_default() {
        if let Some(s) = h.as_str() {
            v.push(s.to_lowercase());
        }
    }
    v
}

fn nh(h: &str, https: bool) -> String {
    let d = if https { ":443" } else { ":80" };
    h.strip_suffix(d).unwrap_or(h).to_string()
}

fn cip(ip: SocketAddr, hd: &HeaderMap) -> String {
    if ip.ip().is_loopback() {
        if let Some(x) = hd.get("x-forwarded-for").and_then(|v| v.to_str().ok()).and_then(|v| v.rsplit(',').next()).map(|v| v.trim()).filter(|v| v.parse::<std::net::IpAddr>().is_ok()) {
            return x.to_string();
        }
    }
    ip.ip().to_string()
}

fn limited(a: &Ax, k: &str, n: u32) -> bool {
    let mut m = a.rate.lock().unwrap();
    let t = now() / 60_000;
    let e = m.entry(k.to_string()).or_insert((t, 0));
    if e.0 != t {
        *e = (t, 0);
    }
    e.1 += 1;
    if m.len() > 5000 {
        m.retain(|_, v| v.0 == t);
    }
    m.get(k).map(|x| x.1 > n).unwrap_or(false)
}

pub async fn h(State(a): State<Ax>, ConnectInfo(ip): ConnectInfo<SocketAddr>, m: Method, u: Uri, hd: HeaderMap, bd: Body) -> Response {
    let big = u.path() == "/api/import" && ck(&hd, "ao_s").and_then(|t| crate::auth::ses_ok(&a.db, &t)).is_some();
    let b = match axum::body::to_bytes(bd, if big { 256 << 20 } else { 2 << 20 }).await {
        Ok(b) => b,
        Err(_) => {
            let mut r = er(StatusCode::PAYLOAD_TOO_LARGE, "request too large");
            sec(&mut r);
            return r;
        }
    };
    let mut r = route(&a, ip, m, u, hd, b).await;
    sec(&mut r);
    r
}

async fn route(a: &Ax, ip: SocketAddr, m: Method, u: Uri, hd: HeaderMap, b: Bytes) -> Response {
    let host = hd.get(header::HOST).and_then(|v| v.to_str().ok()).unwrap_or("").to_lowercase();
    let p = u.path().to_string();
    if p == "/int/mcp" && m == Method::POST {
        if !ip.ip().is_loopback() {
            return er(StatusCode::FORBIDDEN, "local only");
        }
        let t = hd.get("x-run").and_then(|v| v.to_str().ok()).unwrap_or("");
        let v: Value = serde_json::from_slice(&b).unwrap_or(json!({}));
        return js(crate::mcp::handle(a, t, &v).await);
    }
    if let Some(sec) = p.strip_prefix("/hook/") {
        if m != Method::POST {
            return er(StatusCode::METHOD_NOT_ALLOWED, "POST");
        }
        if limited(a, &format!("hook:{}", ip.ip()), 60) {
            return er(StatusCode::TOO_MANY_REQUESTS, "too many requests");
        }
        return hook(a, sec, &b);
    }
    let https = hd.get("x-forwarded-proto").and_then(|v| v.to_str().ok()) == Some("https");
    let host = nh(&host, https);
    if !hosts(a).iter().any(|h| nh(h, https) == host) {
        return er(StatusCode::FORBIDDEN, "unknown host. Add it under addresses in the settings.");
    }
    let origin = format!("{}://{host}", if https { "https" } else { "http" });
    if m != Method::GET && m != Method::HEAD && !(p == "/auth/link" && m == Method::POST) {
        let og = hd.get(header::ORIGIN).and_then(|v| v.to_str().ok()).map(|o| url::Url::parse(o).map(|u| u.origin().ascii_serialization()).unwrap_or_else(|_| o.to_string()));
        if hd.get("x-ao").and_then(|v| v.to_str().ok()) != Some("1") || og.map(|o| o != origin).unwrap_or(false) {
            return er(StatusCode::FORBIDDEN, "forbidden");
        }
    }
    let rk = cip(ip, &hd);
    let ua = hd.get(header::USER_AGENT).and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    if p.starts_with("/auth/") {
        if limited(a, &format!("auth:{rk}"), 30) {
            return er(StatusCode::TOO_MANY_REQUESTS, "too many attempts, wait a minute");
        }
        if p == "/auth/link" {
            return link(a, &m, &u, &b, &ua, ip, https);
        }
        return auth(a, &p, &u, &hd, &ua, ip, https, &origin);
    }
    let sid = ck(&hd, "ao_s").and_then(|t| crate::auth::ses_ok(&a.db, &t));
    if p == "/api/me" {
        let o = a.db.kg("owner");
        return js(json!({"in": sid.is_some(), "owner": if sid.is_some() { o.clone() } else { json!(o.is_object()) }, "v": crate::cfg::V}));
    }
    if p.starts_with("/api/") {
        let Some(sid) = sid else { return er(StatusCode::UNAUTHORIZED, "not logged in") };
        if limited(a, &format!("api:{rk}"), 1200) {
            return er(StatusCode::TOO_MANY_REQUESTS, "too many requests");
        }
        let body: Value = if b.is_empty() { json!({}) } else { serde_json::from_slice(&b).unwrap_or(json!({})) };
        return match api(a, &m, &p, &u, &body, &sid, &b).await {
            Ok(r) => r,
            Err(e) => er(StatusCode::BAD_REQUEST, &e),
        };
    }
    stat(&p)
}

fn stat(p: &str) -> Response {
    let f = match p {
        "/" | "/index.html" | "/stats" | "/lab" | "/house" | "/settings" => "index.html",
        x => x.trim_start_matches('/'),
    };
    match Ui::get(f) {
        Some(c) => {
            let mut r = Response::new(Body::from(c.data.into_owned()));
            let mt = mime_guess::from_path(f).first_or_octet_stream();
            r.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_str(mt.as_ref()).unwrap());
            r
        }
        None => er(StatusCode::NOT_FOUND, "not found"),
    }
}

fn link(a: &Ax, m: &Method, u: &Uri, b: &Bytes, ua: &str, ip: SocketAddr, https: bool) -> Response {
    if *m != Method::POST {
        let c: String = qs(u).get("c").cloned().unwrap_or_default().chars().filter(|x| x.is_ascii_alphanumeric() || *x == '-' || *x == '_').take(200).collect();
        if !crate::auth::link_ok(&a.db, &c) {
            return redir("/?e=Link%20invalid%20or%20expired");
        }
        let mut r = Response::new(Body::from(format!("<!doctype html><meta charset=utf-8><meta name=viewport content=\"width=device-width\"><title>ApolloOffice</title><body style=\"font:16px system-ui;background:#1b1d22;color:#e8e6df;display:grid;place-items:center;height:100vh;margin:0\"><form method=post action=/auth/link style=\"text-align:center\"><p>One-time login link for ApolloOffice</p><input type=hidden name=c value=\"{c}\"><button style=\"font:inherit;padding:10px 26px;border:0;border-radius:6px;background:#5c7fd6;color:#fff;cursor:pointer\">Log in</button></form>")));
        r.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_static("text/html; charset=utf-8"));
        return r;
    }
    let c = url::form_urlencoded::parse(b).find(|(k, _)| k == "c").map(|(_, v)| v.into_owned()).unwrap_or_default();
    if !crate::auth::link_use(&a.db, &c) {
        return redir("/?e=Link%20invalid%20or%20expired");
    }
    a.aud("Login via emergency link", &format!("from {}", ip.ip()));
    let s = crate::auth::ses_new(&a.db, ua, &ip.ip().to_string());
    let mut r = redir("/");
    *r.status_mut() = StatusCode::SEE_OTHER;
    setck(&mut r, "ao_s", &s, crate::auth::DAY7 / 1000, https);
    r
}

#[allow(clippy::too_many_arguments)]
fn auth(a: &Ax, p: &str, u: &Uri, hd: &HeaderMap, ua: &str, ip: SocketAddr, https: bool, origin: &str) -> Response {
    let q = qs(u);
    match p {
        "/auth/go" => {
            let pv = q.get("p").cloned().unwrap_or_default();
            if !["google", "github", "gitlab", "discord"].contains(&pv.as_str()) {
                return er(StatusCode::BAD_REQUEST, "unknown provider");
            }
            let pre = crate::auth::rnd();
            let n = crate::auth::nonce(&a.db, &pre);
            let back = format!("{origin}/auth/back");
            let to = format!("{}/start?p={pv}&i={}&n={n}&r={}", a.authu, a.inst, url::form_urlencoded::byte_serialize(back.as_bytes()).collect::<String>());
            let mut r = redir(&to);
            setck_lax(&mut r, "ao_pre", &pre, 900, https);
            r
        }
        "/auth/back" => {
            let pre = ck(hd, "ao_pre").unwrap_or_default();
            let t = q.get("t").cloned().unwrap_or_default();
            if let Some(e) = q.get("e") {
                return redir(&format!("/?e={}", url::form_urlencoded::byte_serialize(e.as_bytes()).collect::<String>()));
            }
            let pk = std::env::var("APOLLO_OFFICE_AUTH_PUB").ok().filter(|_| cfg!(debug_assertions)).unwrap_or(crate::auth::PUB.to_string());
            let res = crate::auth::verify(&pk, &a.db, &a.inst, &t, &pre, origin).and_then(|p| crate::auth::bind(&a.db, &p).map(|_| p));
            match res {
                Ok(p) => {
                    a.aud("Login", &format!("{} via {} from {}", p["nm"].as_str().unwrap_or(""), p["p"].as_str().unwrap_or(""), ip.ip()));
                    let s = crate::auth::ses_new(&a.db, ua, &ip.ip().to_string());
                    let mut r = redir("/");
                    setck(&mut r, "ao_s", &s, crate::auth::DAY7 / 1000, https);
                    setck_lax(&mut r, "ao_pre", "", 0, https);
                    r
                }
                Err(e) => {
                    a.aud("Login rejected", &format!("{e} from {}", ip.ip()));
                    redir(&format!("/?e={}", url::form_urlencoded::byte_serialize(e.as_bytes()).collect::<String>()))
                }
            }
        }
        "/auth/logout" => {
            if let Some(t) = ck(hd, "ao_s") {
                a.db.run("delete from ses where id=?", pa![crate::auth::h(&t)]);
            }
            let mut r = redir("/");
            setck(&mut r, "ao_s", "", 0, https);
            r
        }
        _ => er(StatusCode::NOT_FOUND, "not found"),
    }
}

fn hook(a: &Ax, s: &str, b: &Bytes) -> Response {
    let Some(f) = a.db.one("select id from fl where hook=? and hook is not null and length(hook)>=16", pa![s.to_string()]) else { return er(StatusCode::NOT_FOUND, "unknown") };
    let t = String::from_utf8_lossy(&b[..b.len().min(200_000)]).to_string();
    let v: Value = serde_json::from_str(&t).unwrap_or(json!({}));
    let ti = v["title"].as_str().or(v["ti"].as_str()).map(String::from).unwrap_or_else(|| t.lines().next().unwrap_or("Webhook").chars().take(120).collect());
    let tx = v["text"].as_str().map(String::from).unwrap_or(t.clone());
    let fl = f["id"].as_i64().unwrap_or(0);
    let wk = v["worker"].as_str().and_then(|n| crate::tools::wk_by_name(a, fl, n)).filter(|w| w["fl"].as_i64() == Some(fl)).and_then(|w| w["id"].as_i64());
    let id = a.db.run("insert into tk(ti,tx,src,wk,fl,st,mk,t0,t1) values(?,?,'hook',?,?,'wait',1,?,?)", pa![crate::tools::cut_s(&ti, 300), crate::tools::cut_s(&tx, 20000), wk, fl, now(), now()]);
    js(json!({"ok": true, "task": id}))
}

fn baseok(base: &str) -> Result<(), String> {
    let bu = url::Url::parse(base).map_err(|_| "invalid address")?;
    if bu.scheme() != "https" && !(bu.scheme() == "http" && matches!(bu.host_str(), Some("127.0.0.1") | Some("localhost") | Some("[::1]"))) {
        return Err("API addresses need https (except local ones)".into());
    }
    Ok(())
}

fn n(v: &Value, k: &str) -> i64 {
    v[k].as_i64().or_else(|| v[k].as_str().and_then(|s| s.parse().ok())).unwrap_or(0)
}

fn s<'a>(v: &'a Value, k: &str) -> &'a str {
    v[k].as_str().unwrap_or("")
}

const DANGER: &[&str] = &["fsr", "fsw", "sh", "net", "push", "ceo_hire", "ceo_conn", "srv", "from", "chk", "tools", "fb", "sub", "route", "pause"];

fn danger(old: &Value, new: &Value) -> Vec<String> {
    let mut o = vec![];
    for k in DANGER {
        if !new[*k].is_null() && new[*k] != old[*k] {
            o.push(k.to_string());
        }
    }
    o
}

pub fn state(a: &Ax) -> Value {
    let l = a.lv.lock().unwrap();
    let ws: Vec<Value> = a.db.all("select w.id,w.ty,w.nm,w.col,w.fl,w.desk,w.hold,json_extract(w.cfg,'$.from') fr,t.acc acc,t.col tcol,t.nm tn from wk w left join ty t on t.id=w.ty order by w.id", pa![]).into_iter().map(|mut w| {
        let id = w["id"].as_i64().unwrap_or(0);
        let x = l.w.get(&id).cloned().unwrap_or_default();
        w["fr"] = serde_json::from_str(w["fr"].as_str().unwrap_or("[]")).unwrap_or(json!([]));
        w["live"] = json!(x);
        w
    }).collect();
    let fl = l.fl.clone();
    drop(l);
    let fls = a.db.all("select id,lvl,k,nm,lv from fl order by lvl", pa![]);
    let accs = crate::prov::list(a);
    let srv = a.db.all("select id,fl,nm,host,dock,cfg,st from srv", pa![]);
    let cnt = a.db.all("select fl, st, count(*) n from tk where st in ('wait','run') group by fl, st", pa![]);
    let d0 = crate::eng::d0();
    let done = a.db.all("select fl, count(*) n from tk where st='done' and t1>=? group by fl", pa![d0]);
    let bell = a.db.all("select id,ti,st,res,wk,fl,t1 from tk where st in ('fail','rej') and t1>? order by t1 desc limit 20", pa![now() - 86_400_000]);
    let st = a.set();
    json!({
        "t": now(), "fl": fls, "w": ws, "flow": fl, "acc": accs, "srv": srv, "cnt": cnt, "done": done, "bell": bell,
        "usd": crate::prov::spent(a), "usd_day": st["usd_day"], "set": {"lounge": st["lounge"]}, "upd": {"ready": crate::upd::ready(a), "v": a.db.kg("upd")["ready"], "on": crate::upd::on(a)}, "updated": a.db.kg("updated"), "quest": a.db.kg("quest"), "owner": a.db.kg("owner"), "stop": a.lv.lock().unwrap().stop.get(&0).copied().unwrap_or(false),
        "tn": a.db.all("select id from tk where st='done' and t1>? order by t1 desc limit 1", pa![now() - 10_000]),
    })
}

fn sane_lay(old: &Value, l: &Value) -> Result<Value, String> {
    let t = l["t"].as_array().ok_or("grid missing")?;
    if t.len() as i64 != crate::world::MH || t.iter().any(|r| r.as_array().map(|x| x.len() as i64 != crate::world::MW).unwrap_or(true)) {
        return Err("grid has the wrong size".into());
    }
    for r in t {
        for v in r.as_array().unwrap() {
            if !matches!(v.as_i64(), Some(0..=3)) {
                return Err("invalid tile".into());
            }
        }
    }
    let fu = l["fu"].as_array().ok_or("furniture missing")?;
    if fu.len() > 200 {
        return Err("too much furniture".into());
    }
    let ok: Vec<&str> = crate::world::FS.iter().map(|x| x.0).collect();
    let mut nx = old["nx"].as_i64().unwrap_or(1).max(1);
    for u in old["fu"].as_array().into_iter().flatten().chain(fu.iter()) {
        nx = nx.max(u["id"].as_i64().unwrap_or(0) + 1);
    }
    let mut seen = std::collections::HashSet::new();
    let mut out = vec![];
    for u in fu {
        let k = u["k"].as_str().unwrap_or("");
        if !ok.contains(&k) {
            return Err(format!("unknown furniture {k}"));
        }
        let (px, py) = (u["x"].as_i64().unwrap_or(0), u["y"].as_i64().unwrap_or(0));
        if !(0..crate::world::MW).contains(&px) || !(0..crate::world::MH).contains(&py) {
            return Err(format!("{k} is outside the floor"));
        }
        let uid = u["id"].as_i64().filter(|i| *i > 0 && !seen.contains(i));
        let mut x = json!({"id": uid, "k": k, "x": px, "y": py});
        if let Some(o) = old["fu"].as_array().and_then(|a| a.iter().find(|o| uid.is_some() && o["id"] == x["id"] && o["k"] == k)) {
            for kk in ["acc", "srv"] {
                if !o[kk].is_null() {
                    x[kk] = o[kk].clone();
                }
            }
        }
        if x["id"].as_i64().is_none() {
            x["id"] = json!(nx);
            nx += 1;
        }
        seen.insert(x["id"].as_i64().unwrap_or(0));
        out.push(x);
    }
    for (k, key) in [("gen", "acc"), ("rack", "srv")] {
        let gone = old["fu"].as_array().into_iter().flatten().filter(|u| u["k"] == k && !u[key].is_null()).any(|o| !out.iter().any(|u| u["id"] == o["id"] && u[key] == o[key]));
        if gone {
            return Err(if k == "gen" { "Remove generators through their account, not in build mode".into() } else { "Remove racks through their server, not in build mode".into() });
        }
    }
    if !out.iter().any(|u| u["k"] == "lift") {
        return Err("The lift has to stay".into());
    }
    let mut chk = json!({"t": l["t"], "fu": []});
    for u in &out {
        if !crate::world::can(&chk, u["k"].as_str().unwrap_or(""), u["x"].as_i64().unwrap_or(0), u["y"].as_i64().unwrap_or(0), -1) {
            return Err(format!("{} is in the way or on a wall", u["k"].as_str().unwrap_or("")));
        }
        chk["fu"].as_array_mut().unwrap().push(u.clone());
    }
    Ok(json!({"t": l["t"], "fu": out, "nx": nx}))
}

async fn api(a: &Ax, m: &Method, p: &str, u: &Uri, b: &Value, sid: &str, raw: &Bytes) -> Result<Response, String> {
    let q = qs(u);
    let seg: Vec<&str> = p.trim_start_matches("/api/").split('/').collect();
    let post = *m == Method::POST;
    let id = seg.get(1).and_then(|x| x.parse::<i64>().ok()).unwrap_or(0);
    let ok = || Ok(js(json!({"ok": true})));
    match (seg[0], seg.get(2).copied().unwrap_or(""), post) {
        ("state", _, false) => Ok(js(state(a))),
        ("floor", "", false) => {
            let f = crate::world::floor(&a.db, id).ok_or("no such floor")?;
            let tray = a.db.all("select id,ti,st,res,files,wk,t1 from tk where fl=? and st in ('done','fail','rej') order by t1 desc limit 40", pa![id]);
            Ok(js(json!({"f": f, "tray": tray, "hook": f["hook"]})))
        }
        ("floor", "build", true) => {
            crate::world::build(&a.db, id, s(b, "k"), s(b, "nm"))?;
            ok()
        }
        ("floor", "demolish", true) => {
            crate::world::demolish(&a.db, id)?;
            a.aud("Floor torn down", &id.to_string());
            ok()
        }
        ("floor", "rename", true) => {
            let nm: String = s(b, "nm").trim().chars().take(32).collect();
            if nm.is_empty() {
                return Err("name missing".into());
            }
            a.db.run("update fl set nm=?, lv=lv+1 where id=? and k not in ('shell')", pa![nm, id]);
            ok()
        }
        ("floor", "lay", true) => {
            let f = crate::world::floor(&a.db, id).ok_or("no such floor")?;
            let l = sane_lay(&f["lay"], &b["lay"])?;
            let desks = crate::world::desks(&l);
            for w in a.db.all("select id, desk, nm from wk where fl=?", pa![id]) {
                if !desks.contains(&w["desk"].as_i64().unwrap_or(-1)) {
                    return Err(format!("{} sits at the desk you want to remove. Move or dismiss them first.", w["nm"].as_str().unwrap_or("")));
                }
            }
            crate::world::save(&a.db, id, &l);
            ok()
        }
        ("floor", "hook", true) => {
            a.db.run("update fl set hook=? where id=?", pa![hex::encode(rand::random::<[u8; 16]>()), id]);
            a.aud("Webhook renewed", &id.to_string());
            ok()
        }
        ("height", _, true) => {
            crate::world::height(&a.db, n(b, "n"))?;
            ok()
        }
        ("flows", _, false) => Ok(js(json!(a.db.all("select id,cfg from wk", pa![]).into_iter().map(|r| {
            let c = &r["cfg"];
            json!({"id": r["id"], "sc": c["sched"], "r": c["fsr"], "rw": c["fsw"], "sh": c["sh"], "pu": c["push"]})
        }).collect::<Vec<_>>()))),
        ("types", _, false) => Ok(js(json!({"ty": a.db.all("select * from ty order by own, rowid", pa![]), "teams": crate::world::teams(), "tools": a.db.all("select id,dsc,sch,src from tool", pa![]), "base": crate::tools::base().iter().map(|x| json!({"id": x.0, "d": x.1})).collect::<Vec<_>>(), "accs": crate::world::ACCS, "grp": crate::world::grps(), "props": a.db.kg("props")}))),
        ("type", "prop", true) => {
            let mut v = a.db.kg("props").as_array().cloned().unwrap_or_default();
            let i = v.iter().position(|p| p["id"].as_i64() == b["id"].as_i64()).ok_or("proposal not found")?;
            let p = v.remove(i);
            if s(b, "a") == "apply" {
                let tid = p["type"].as_str().unwrap_or("").to_string();
                let t = a.db.one("select * from ty where id=?", pa![tid.clone()]).ok_or("type no longer exists")?;
                let g = |k: &str| p[k].as_str().filter(|x| !x.trim().is_empty()).map(String::from).unwrap_or_else(|| t[k].as_str().unwrap_or("").to_string());
                a.db.run("update ty set role=?, dsc=?, outf=? where id=?", pa![g("role"), g("dsc"), g("outf"), tid.clone()]);
                if t["own"].as_i64() == Some(0) {
                    let mut e = a.db.kg("tyed").as_array().cloned().unwrap_or_default();
                    if !e.contains(&json!(tid)) {
                        e.push(json!(tid));
                        a.db.ks("tyed", &json!(e));
                    }
                }
                a.aud("Type proposal applied", &format!("{tid} from {}", p["by"].as_str().unwrap_or("")));
            }
            a.db.ks("props", &json!(v));
            ok()
        }
        ("type", "", true) => {
            let tid: String = s(b, "id").to_lowercase().chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(24).collect();
            if tid.is_empty() || s(b, "nm").trim().is_empty() || s(b, "role").trim().is_empty() {
                return Err("name and role are required".into());
            }
            let ex = a.db.one("select own from ty where id=?", pa![tid.clone()]);
            let acc = if crate::world::ACCS.contains(&s(b, "acc")) { s(b, "acc") } else { "none" };
            let col = if regex::Regex::new("^#[0-9a-fA-F]{6}$").unwrap().is_match(s(b, "col")) { s(b, "col") } else { "#8a8a8a" };
            let tools = json!(b["tools"].as_array().cloned().unwrap_or_default().into_iter().filter(|t| t.as_str().is_some()).collect::<Vec<_>>());
            if ex.as_ref().map(|e| e["own"].as_i64() == Some(0)).unwrap_or(false) {
                let mut v = a.db.kg("tyed").as_array().cloned().unwrap_or_default();
                if !v.contains(&json!(tid)) {
                    v.push(json!(tid));
                    a.db.ks("tyed", &json!(v));
                }
            }
            if ex.is_some() {
                a.db.run("update ty set nm=?,role=?,tools=?,md=?,ef=?,prov=?,acc=?,col=?,dsc=?,outf=?,chk=? where id=?", pa![s(b, "nm").chars().take(24).collect::<String>(), s(b, "role").chars().take(20000).collect::<String>(), tools.to_string(), s(b, "md").to_string(), s(b, "ef").to_string(), s(b, "prov").to_string(), acc.to_string(), col.to_string(), s(b, "dsc").chars().take(200).collect::<String>(), s(b, "outf").chars().take(500).collect::<String>(), s(b, "chk").to_string(), tid.clone()]);
            } else {
                a.db.run("insert into ty(id,nm,role,tools,md,ef,prov,acc,col,dsc,outf,chk,own) values(?,?,?,?,?,?,?,?,?,?,?,?,1)", pa![tid.clone(), s(b, "nm").chars().take(24).collect::<String>(), s(b, "role").chars().take(20000).collect::<String>(), tools.to_string(), s(b, "md").to_string(), s(b, "ef").to_string(), s(b, "prov").to_string(), acc.to_string(), col.to_string(), s(b, "dsc").chars().take(200).collect::<String>(), s(b, "outf").chars().take(500).collect::<String>(), s(b, "chk").to_string()]);
            }
            if !s(b, "chk").is_empty() {
                a.aud("Check on type", &format!("{tid}: {}", s(b, "chk")));
            }
            ok()
        }
        ("type", "del", true) => {
            let tid = seg.get(1).copied().unwrap_or("").to_string();
            if a.db.n("select count(*) from wk where ty=?", pa![tid.clone()]) > 0 {
                return Err("there are still workers of this type".into());
            }
            a.db.run("delete from ty where id=? and own=1", pa![tid]);
            ok()
        }
        ("tool", "", true) => {
            let tid: String = s(b, "id").to_lowercase().chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_').take(32).collect();
            if tid.is_empty() || s(b, "src").is_empty() {
                return Err("name and code are required".into());
            }
            let sch = if b["sch"].is_object() { b["sch"].clone() } else { json!({"type": "object", "properties": {}}) };
            a.db.run("insert into tool(id,dsc,sch,src) values(?,?,?,?) on conflict(id) do update set dsc=excluded.dsc, sch=excluded.sch, src=excluded.src", pa![tid.clone(), s(b, "dsc").to_string(), sch.to_string(), s(b, "src").to_string()]);
            a.aud("Custom tool saved", &tid);
            ok()
        }
        ("tool", "del", true) => {
            a.db.run("delete from tool where id=?", pa![seg.get(1).copied().unwrap_or("").to_string()]);
            ok()
        }
        ("hire", _, true) => {
            let wid = crate::eng::hire(a, s(b, "ty"), n(b, "fl"), b["desk"].as_i64(), s(b, "nm"), json!({}))?;
            Ok(js(json!({"ok": true, "id": wid})))
        }
        ("team", _, true) => {
            let tm = crate::world::teams().as_array().unwrap().iter().find(|t| t["id"] == b["id"]).cloned().ok_or("unknown team")?;
            let fl = n(b, "fl");
            let need = tm["ws"].as_array().unwrap().len();
            let f = crate::world::floor(&a.db, fl).ok_or("no such floor")?;
            if f["k"] != "office" && f["k"] != "accounting" && f["k"] != "server" {
                return Err("Workers work in an office (or in accounting and the server room)".into());
            }
            for t in tm["ws"].as_array().unwrap() {
                if a.db.one("select id from ty where id=?", pa![t.as_str().unwrap_or("").to_string()]).is_none() {
                    return Err("unknown worker type".into());
                }
            }
            let mut l = f["lay"].clone();
            let used: Vec<i64> = a.db.all("select desk from wk where fl=?", pa![fl]).iter().filter_map(|r| r["desk"].as_i64()).collect();
            let mut free = crate::world::desks(&l).into_iter().filter(|d| !used.contains(d)).count();
            while free < need {
                crate::world::add(&mut l, "desk", json!({})).ok_or("No room for more desks on this floor")?;
                free += 1;
            }
            crate::world::save(&a.db, fl, &l);
            let mut ids = vec![];
            for t in tm["ws"].as_array().unwrap() {
                ids.push(crate::eng::hire(a, t.as_str().unwrap_or(""), fl, None, "", json!({}))?);
            }
            for ln in tm["ln"].as_array().unwrap() {
                let (to, from) = (ids[ln[0].as_u64().unwrap_or(0) as usize], ids[ln[1].as_u64().unwrap_or(0) as usize]);
                let mut c = a.db.one("select cfg from wk where id=?", pa![to]).map(|r| r["cfg"].clone()).unwrap_or(json!({}));
                let mut fr = c["from"].as_array().cloned().unwrap_or_default();
                fr.push(json!({"w": from}));
                c["from"] = json!(fr);
                a.db.run("update wk set cfg=? where id=?", pa![c.to_string(), to]);
            }
            Ok(js(json!({"ok": true, "ids": ids})))
        }
        ("worker", "", false) => {
            let w = a.db.one("select w.*, t.nm tn, t.tools ttools, t.md tmd from wk w left join ty t on t.id=w.ty where w.id=?", pa![id]).ok_or("unknown worker")?;
            let tk = a.db.all("select id,ti,st,src,res,t0,t1 from tk where wk=? order by id desc limit 30", pa![id]);
            let ev = a.db.all("select t,m,tk from ev where w=? order by id desc limit 60", pa![id.to_string()]);
            let us = a.db.one("select coalesce(sum(tin+tout),0) tok, coalesce(sum(usd),0) usd from us where wk=? and day=?", pa![id, crate::db::day()]);
            Ok(js(json!({"w": w, "tk": tk, "ev": ev, "us": us, "live": a.lv.lock().unwrap().w.get(&id).cloned().unwrap_or_default()})))
        }
        ("worker", "", true) => {
            let w = a.db.one("select * from wk where id=?", pa![id]).ok_or("unknown worker")?;
            let mut c = w["cfg"].clone();
            if let Some(nc) = b["cfg"].as_object() {
                let d = danger(&c, &b["cfg"]);
                if !d.is_empty() && b["ok"].as_bool() != Some(true) {
                    return Err(format!("confirmation needed for: {}", d.join(", ")));
                }
                for (k, v) in nc {
                    if k == "fsr" || k == "fsw" {
                        for x in v.as_array().cloned().unwrap_or_default() {
                            let pth = std::path::PathBuf::from(x.as_str().unwrap_or(""));
                            if !pth.is_absolute() {
                                return Err(format!("{} is not a full path", pth.display()));
                            }
                            if crate::perm::broad(&pth) {
                                return Err(format!("{} is too broad (whole drive or home folder)", pth.display()));
                            }
                            if !pth.is_dir() {
                                return Err(format!("folder {} does not exist", pth.display()));
                            }
                        }
                    }
                    c[k] = v.clone();
                }
                if !d.is_empty() {
                    a.aud("Permissions changed", &format!("{} (#{id}): {}", w["nm"].as_str().unwrap_or(""), d.iter().map(|k| format!("{k}={}", c[k])).collect::<Vec<_>>().join("; ")));
                }
                a.db.run("update wk set cfg=? where id=?", pa![c.to_string(), id]);
            }
            if !s(b, "nm").trim().is_empty() {
                a.db.run("update wk set nm=? where id=?", pa![s(b, "nm").trim().chars().take(20).collect::<String>(), id]);
            }
            if regex::Regex::new("^#[0-9a-fA-F]{6}$").unwrap().is_match(s(b, "col")) {
                a.db.run("update wk set col=? where id=?", pa![s(b, "col").to_string(), id]);
            }
            if let Some(h) = b["hold"].as_bool() {
                a.db.run("update wk set hold=? where id=?", pa![h as i64, id]);
                let wp: Vec<i64> = a.db.kg("wpause").as_array().map(|v| v.iter().filter_map(|x| x.as_i64()).filter(|x| *x != id).collect()).unwrap_or_default();
                a.db.ks("wpause", &json!(wp));
                a.say(id, if h { "paused by you" } else { "back to work" }, None);
            }
            if b["fl"].as_i64().is_some() {
                let (fl, d) = (n(b, "fl"), b["desk"].as_i64());
                let f = crate::world::floor(&a.db, fl).ok_or("no such floor")?;
                let d = match d {
                    Some(d) if crate::world::desks(&f["lay"]).contains(&d) && a.db.n("select count(*) from wk where fl=? and desk=? and id!=?", pa![fl, d, id]) == 0 => d,
                    Some(_) => return Err("this desk is not free".into()),
                    None => crate::world::free_desk(&a.db, fl).ok_or("no free desk there")?,
                };
                a.db.run("update wk set fl=?, desk=? where id=?", pa![fl, d, id]);
            }
            ok()
        }
        ("worker", "fire", true) => {
            let w = a.db.one("select nm from wk where id=?", pa![id]).ok_or("unknown worker")?;
            if a.db.n("select count(*) from tk where wk=? and st='run'", pa![id]) > 0 {
                return Err("is working right now, cancel first".into());
            }
            a.db.run("update tk set st='fail', res='worker dismissed' where wk=? and st='wait'", pa![id]);
            a.db.run("delete from wk where id=?", pa![id]);
            for o in a.db.all("select id, cfg from wk", pa![]) {
                let mut c = o["cfg"].clone();
                if let Some(f) = c["from"].as_array() {
                    let nf: Vec<Value> = f.iter().filter(|x| x["w"].as_i64() != Some(id)).cloned().collect();
                    if nf.len() != f.len() {
                        c["from"] = json!(nf);
                        a.db.run("update wk set cfg=? where id=?", pa![c.to_string(), o["id"].as_i64().unwrap_or(0)]);
                    }
                }
            }
            a.lv.lock().unwrap().w.remove(&id);
            a.aud("Dismissed", w["nm"].as_str().unwrap_or(""));
            ok()
        }
        ("task", "", true) => {
            let ti = s(b, "ti").trim().to_string();
            if ti.is_empty() {
                return Err("title missing".into());
            }
            let wk = b["wk"].as_i64();
            let fl = match wk {
                Some(w) => a.db.n("select fl from wk where id=?", pa![w]),
                None => n(b, "fl"),
            };
            if fl == 0 {
                return Err("an wen?".into());
            }
            let tid = a.db.run("insert into tk(ti,tx,src,wk,fl,st,prio,t0,t1) values(?,?,'user',?,?,'wait',?,?,?)", pa![crate::tools::cut_s(&ti, 300), crate::tools::cut_s(s(b, "tx"), 50000), wk, fl, b["prio"].as_i64().unwrap_or(3).clamp(1, 5), now(), now()]);
            Ok(js(json!({"ok": true, "id": tid})))
        }
        ("task", "", false) => {
            let t = a.db.one("select * from tk where id=?", pa![id]).ok_or("unknown task")?;
            let ev = a.db.all("select t,w,m from ev where tk=? order by id desc limit 80", pa![id]);
            Ok(js(json!({"t": t, "ev": ev})))
        }
        ("task", "cancel", true) => {
            crate::eng::cancel(a, id)?;
            ok()
        }
        ("task", "retry", true) => {
            if a.lv.lock().unwrap().w.values().any(|x| x.tk.contains(&id)) {
                return Err("the last attempt is still stopping, try again in a moment".into());
            }
            a.db.run("update tk set st='wait', n=0, nx=0, fb='', res='', t1=? where id=? and st in ('fail','rej')", pa![now(), id]);
            ok()
        }
        ("task", "del", true) => {
            a.db.run("delete from tk where id=? and st in ('done','fail','rej')", pa![id]);
            ok()
        }
        ("tasks", _, false) => {
            let fl = q.get("fl").and_then(|x| x.parse::<i64>().ok());
            let wk = q.get("wk").and_then(|x| x.parse::<i64>().ok());
            let st = q.get("st").cloned().unwrap_or_default();
            let r = a.db.all("select id,ti,st,src,wk,fl,files,t0,t1,kind from tk where (?1 is null or fl=?1) and (?2 is null or wk=?2) and (?3='' or st=?3) order by id desc limit 200", pa![fl, wk, st]);
            Ok(js(json!(r)))
        }
        ("file", _, false) => {
            let fl = q.get("fl").and_then(|x| x.parse::<i64>().ok()).unwrap_or(0);
            let nm = q.get("n").cloned().unwrap_or_default();
            if nm.is_empty() || nm.contains('/') || nm.contains('\\') || nm.starts_with('.') {
                return Err("invalid name".into());
            }
            let f = a.fdir(fl).join(&nm);
            let d = std::fs::read(&f).map_err(|_| "file not found")?;
            let mut r = Response::new(Body::from(d));
            let mt = mime_guess::from_path(&nm).first_or_octet_stream();
            let inline = mt.type_() == "text" || mt.type_() == "image";
            r.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_str(if mt.type_() == "text" { "text/plain; charset=utf-8" } else if mt.type_() == "image" && mt.subtype() != "svg" { mt.as_ref() } else { "application/octet-stream" }).unwrap());
            if !inline || q.get("dl").is_some() {
                r.headers_mut().insert(header::CONTENT_DISPOSITION, HeaderValue::from_str(&format!("attachment; filename=\"{}\"", nm.replace('"', ""))).unwrap());
            }
            Ok(r)
        }
        ("detect", _, false) => Ok(js(crate::run::detect().await)),
        ("acc", "", true) => {
            if id > 0 {
                let r = a.db.one("select * from acc where id=?", pa![id]).ok_or("unknown account")?;
                let mut c = r["cfg"].clone();
                if !c.is_object() {
                    c = json!({});
                }
                if let Some(nc) = b["cfg"].as_object() {
                    for (k, v) in nc {
                        if ["pin", "pout", "tok_day", "usd_day"].contains(&k.as_str()) && v.as_f64().map(|x| x < 0.0).unwrap_or(!v.is_null()) {
                            return Err(format!("{k} must be a number of 0 or more"));
                        }
                        c[k] = v.clone();
                    }
                }
                if !s(b, "key").is_empty() && b["ok"].as_bool() != Some(true) {
                    return Err("confirmation needed".into());
                }
                if !s(b, "base").is_empty() {
                    baseok(s(b, "base").trim())?;
                }
                a.db.run("update acc set cfg=?, nm=coalesce(nullif(?,''),nm), md=coalesce(nullif(?,''),md), base=coalesce(nullif(?,''),base) where id=?", pa![c.to_string(), s(b, "nm").to_string(), s(b, "md").to_string(), s(b, "base").trim().to_string(), id]);
                if !s(b, "key").is_empty() {
                    a.db.run("update acc set sec=? where id=?", pa![crate::vault::enc(&a.key, s(b, "key").trim()), id]);
                    a.aud("Credentials replaced", r["nm"].as_str().unwrap_or(""));
                }
                return ok();
            }
            if b["ok"].as_bool() != Some(true) {
                return Err("confirmation needed".into());
            }
            let k = s(b, "k");
            if !["claude", "codex", "gemini", "api"].contains(&k) {
                return Err("unknown account kind".into());
            }
            let (mut fmt, mut base, mut md) = (String::new(), String::new(), String::new());
            if k == "api" {
                let pre = crate::prov::PRE.iter().find(|x| x.0 == s(b, "pre")).ok_or("choose a provider")?;
                fmt = if s(b, "fmt").is_empty() { pre.1.to_string() } else { s(b, "fmt").to_string() };
                base = if s(b, "base").is_empty() { pre.2.to_string() } else { s(b, "base").trim().to_string() };
                md = if s(b, "md").is_empty() { pre.3.to_string() } else { s(b, "md").trim().to_string() };
                baseok(&base)?;
                if s(b, "key").is_empty() && !matches!(s(b, "pre"), "ollama" | "lmstudio" | "custom") {
                    return Err("API key missing".into());
                }
                if !["anthropic", "openai"].contains(&fmt.as_str()) {
                    return Err("unknown format".into());
                }
            }
            let same = a.db.n("select count(*) from acc where k=?", pa![k.to_string()]);
            let nm = if s(b, "nm").trim().is_empty() { match k { "claude" => "Claude subscription".to_string(), "codex" => "ChatGPT subscription".into(), "gemini" => "Gemini".into(), _ => s(b, "pre").to_string() } } else { s(b, "nm").trim().chars().take(32).collect() };
            let mut cfg = json!({});
            if !s(b, "bin").is_empty() {
                cfg["bin"] = json!(s(b, "bin"));
            }
            let aid = a.db.run("insert into acc(k,fmt,nm,base,md,sec,dir,cfg,st,t0) values(?,?,?,?,?,?,'',?,'{}',?)", pa![k.to_string(), fmt, nm.clone(), base, md, if s(b, "key").is_empty() { None } else { Some(crate::vault::enc(&a.key, s(b, "key").trim())) }, cfg.to_string(), now()]);
            if crate::prov::cli_kind(k) && (b["own"].as_bool() == Some(true) || same > 0) {
                let d = a.adir(aid);
                a.db.run("update acc set dir=? where id=?", pa![d.display().to_string(), aid]);
            }
            a.aud("Account added", &format!("{nm} ({k})"));
            crate::world::sync_gens(a);
            Ok(js(json!({"ok": true, "id": aid, "tos": crate::prov::cli_kind(k) && same > 0})))
        }
        ("acc", "del", true) => {
            let r = a.db.one("select nm, dir from acc where id=?", pa![id]).ok_or("unknown account")?;
            a.db.run("delete from acc where id=?", pa![id]);
            let d = a.dd.join("accounts").join(id.to_string());
            if r["dir"].as_str().map(|x| !x.is_empty()).unwrap_or(false) && d.exists() {
                let _ = std::fs::remove_dir_all(d);
            }
            a.aud("Account deleted", r["nm"].as_str().unwrap_or(""));
            crate::world::sync_gens(a);
            ok()
        }
        ("acc", "test", true) => {
            let r = a.db.one("select * from acc where id=?", pa![id]).ok_or("unknown account")?;
            let r = crate::prov::view(a, &r);
            Ok(js(json!({"ok": true, "msg": crate::run::test(a, &r).await?})))
        }
        ("acc", "login", true) => {
            let r = a.db.one("select k, dir from acc where id=?", pa![id]).ok_or("unknown account")?;
            let c = crate::run::login_cmd(r["k"].as_str().unwrap_or(""), r["dir"].as_str().unwrap_or(""));
            let opened = crate::run::term(&c).is_ok();
            Ok(js(json!({"ok": true, "cmd": c, "opened": opened})))
        }
        ("srv", "probe", true) | ("srvprobe", _, true) => {
            let (fp, k) = crate::ssh::probe(s(b, "host").trim(), b["port"].as_u64().unwrap_or(22) as u16).await?;
            Ok(js(json!({"fp": fp, "key": k})))
        }
        ("srv", "", true) if id == 0 => {
            if b["ok"].as_bool() != Some(true) {
                return Err("confirmation needed".into());
            }
            let sid = crate::ssh::setup(a, b).await?;
            Ok(js(json!({"ok": true, "id": sid})))
        }
        ("srv", "", true) => {
            let r = a.db.one("select * from srv where id=?", pa![id]).ok_or("unknown server")?;
            let mut c = r["cfg"].clone();
            if let Some(nc) = b["cfg"].as_object() {
                if nc.contains_key("cmds") && nc["cmds"] != c["cmds"] {
                    if b["ok"].as_bool() != Some(true) {
                        return Err("confirmation needed".into());
                    }
                    a.aud("Server commands changed", &format!("{}: {}", r["nm"].as_str().unwrap_or(""), nc["cmds"]));
                }
                for (k, v) in nc {
                    c[k] = v.clone();
                }
            }
            a.db.run("update srv set cfg=?, nm=coalesce(nullif(?,''),nm) where id=?", pa![c.to_string(), s(b, "nm").to_string(), id]);
            ok()
        }
        ("srv", "del", true) => {
            let r = a.db.one("select nm from srv where id=?", pa![id]).ok_or("unknown server")?;
            crate::ssh::remove(a, id).await;
            a.aud("Server removed", r["nm"].as_str().unwrap_or(""));
            ok()
        }
        ("jobs", _, false) => Ok(js(json!(a.db.all("select id,srv,wk,tk,cmd,st,ex,t0,t1,substr(out,-4000) out from job where (?1 is null or srv=?1) order by id desc limit 50", pa![q.get("srv").and_then(|x| x.parse::<i64>().ok())])))),
        ("wid", _, false) => Ok(js(json!(a.db.all("select * from wid order by y, x", pa![])))),
        ("wid", "", true) => {
            let k = s(b, "k");
            if !["num", "list", "chart", "lamp", "text"].contains(&k) {
                return Err("unknown widget kind".into());
            }
            let src = if b["src"].is_object() { b["src"].clone() } else { json!({}) };
            if id > 0 {
                a.db.run("update wid set k=?, nm=?, src=?, x=?, y=?, w=?, h=?, t=0 where id=?", pa![k.to_string(), s(b, "nm").to_string(), src.to_string(), n(b, "x"), n(b, "y"), n(b, "w").max(1), n(b, "h").max(1), id]);
                return ok();
            }
            let wid = a.db.run("insert into wid(k,nm,src,x,y,w,h,t) values(?,?,?,?,?,?,?,0)", pa![k.to_string(), s(b, "nm").to_string(), src.to_string(), n(b, "x"), n(b, "y"), n(b, "w").max(1), n(b, "h").max(1)]);
            Ok(js(json!({"ok": true, "id": wid})))
        }
        ("wid", "del", true) => {
            a.db.run("delete from wid where id=?", pa![id]);
            ok()
        }
        ("wid", "now", true) => {
            a.db.run("update wid set t=0 where id=?", pa![id]);
            crate::stat::poll(a).await;
            ok()
        }
        ("ch", _, false) => Ok(js(json!({"ch": crate::ntf::view(a), "ev": crate::ntf::rules(a), "evs": crate::ntf::EVS.iter().map(|(k, n)| json!({"k": k, "nm": n})).collect::<Vec<_>>()}))),
        ("ch", "", true) => {
            let cid = crate::ntf::save(a, id, b)?;
            Ok(js(json!({"ok": true, "id": cid})))
        }
        ("ch", "del", true) => {
            crate::ntf::del(a, id)?;
            ok()
        }
        ("ch", "test", true) => {
            let c = crate::ntf::list(a).into_iter().find(|c| c["id"].as_i64() == Some(id)).ok_or("unknown channel")?;
            crate::ntf::deliver(a, &c, "ApolloOffice test", "If you read this, the channel works.").await?;
            ok()
        }
        ("ntf", _, true) => {
            crate::ntf::set_rules(a, b)?;
            ok()
        }
        ("lab", _, true) => Ok(js(crate::eng::lab(a, b).await?)),
        ("set", _, false) => {
            let mut st = a.set();
            st["autostart"] = json!(crate::sys::autostart_on(&a.me));
            st["port"] = json!(a.port);
            st["bind"] = json!(a.bind);
            st["data"] = json!(a.dd.display().to_string());
            st["v"] = json!(crate::cfg::V);
            st["height"] = json!(a.db.n("select count(*) from fl", pa![]));
            st["upd"] = a.db.kg("upd");
            st["upd_ready"] = json!(crate::upd::ready(a));
            Ok(js(st))
        }
        ("set", _, true) => {
            let mut st = a.db.kg("set");
            if !st.is_object() {
                st = json!({});
            }
            for k in ["usd_day", "hosts", "api_fallback", "lounge", "updates"] {
                if !b[k].is_null() {
                    if k == "hosts" {
                        let hs = crate::sys::hostsv(&b[k]);
                        a.aud("Addresses changed", &hs.join(", "));
                        st[k] = json!(hs);
                    } else if let Some(v) = crate::sys::setv(k, &b[k]) {
                        st[k] = v;
                    } else {
                        return Err(format!("invalid value for {k}"));
                    }
                }
            }
            a.db.ks("set", &st);
            ok()
        }
        ("stop", _, true) => {
            let on = b["on"].as_bool().unwrap_or(true);
            a.lv.lock().unwrap().stop.insert(0, on);
            a.aud(if on { "Everything stopped" } else { "Resumed" }, "");
            ok()
        }
        ("ses", _, false) => Ok(js(json!(a.db.all("select id,t0,t1,exp,ua,ip from ses where exp>? order by t1 desc", pa![now()]).into_iter().map(|mut r| {
            r["me"] = json!(r["id"].as_str() == Some(sid));
            r["id"] = json!(r["id"].as_str().unwrap_or("").chars().take(12).collect::<String>());
            r
        }).collect::<Vec<_>>()))),
        ("ses", "del", true) => {
            let pre = seg.get(1).copied().unwrap_or("");
            if pre.len() < 12 {
                return Err("invalid".into());
            }
            a.db.run("delete from ses where substr(id,1,12)=?", pa![pre.to_string()]);
            ok()
        }
        ("aud", _, false) => Ok(js(json!(a.db.all("select t,who,what,det from aud order by id desc limit 300", pa![])))),
        ("export", _, false) => {
            let mut r = js(crate::sys::export(&a.db));
            r.headers_mut().insert(header::CONTENT_DISPOSITION, HeaderValue::from_str(&format!("attachment; filename=\"apollo-office-{}.json\"", crate::db::day())).unwrap());
            Ok(r)
        }
        ("import", _, true) => {
            let v: Value = serde_json::from_slice(raw).map_err(|_| "unreadable file")?;
            if a.db.n("select count(*) from tk where st='run'", pa![]) > 0 {
                return Err("Tasks are still running. Stop everything first.".into());
            }
            let m = crate::sys::import(&a.db, &v)?;
            a.aud("Import", &m);
            crate::world::sync_gens(a);
            crate::world::sync_racks(a);
            Ok(js(json!({"ok": true, "msg": m})))
        }
        ("autostart", _, true) => Ok(js(json!({"ok": true, "msg": crate::sys::autostart(b["on"].as_bool() == Some(true), &a.me, &a.dd, a.port, &a.bind)?}))),
        ("usage", _, false) => {
            let days = q.get("d").and_then(|x| x.parse::<i64>().ok()).unwrap_or(7).clamp(1, 90);
            let from = (chrono::Local::now() - chrono::Duration::days(days - 1)).format("%Y-%m-%d").to_string();
            Ok(js(json!({
                "acc": a.db.all("select u.acc, a.nm, sum(tin) tin, sum(tout) tout, round(sum(usd),4) usd from us u left join acc a on a.id=u.acc where day>=? group by u.acc order by usd desc, tin desc", pa![from.clone()]),
                "wk": a.db.all("select u.wk, w.nm, sum(tin) tin, sum(tout) tout, round(sum(usd),4) usd from us u left join wk w on w.id=u.wk where day>=? group by u.wk order by usd desc, tin desc", pa![from.clone()]),
                "fl": a.db.all("select u.fl, f.nm, sum(tin) tin, sum(tout) tout, round(sum(usd),4) usd from us u left join fl f on f.id=u.fl where day>=? group by u.fl order by usd desc, tin desc", pa![from.clone()]),
                "day": a.db.all("select day, sum(tin+tout) tok, round(sum(usd),4) usd from us where day>=? group by day order by day", pa![from]),
                "usd_day": a.set()["usd_day"], "today": crate::prov::spent(a),
            })))
        }
        ("update", _, true) => {
            if s(b, "a") == "now" {
                if !crate::upd::ready(a) {
                    return Err("no update downloaded yet".into());
                }
                if !crate::upd::writable(&a.me) {
                    return Err(format!("can not replace the program file: {} is not writable", a.me.parent().map(|p| p.display().to_string()).unwrap_or_default()));
                }
                if a.db.n("select count(*) from tk where st='run'", pa![]) > 0 && b["ok"].as_bool() != Some(true) {
                    return Err("tasks are running; they will be restarted after the update".into());
                }
                crate::upd::apply_soon(a);
                return ok();
            }
            if s(b, "a") == "seen" {
                a.db.kd("updated");
                return ok();
            }
            Ok(js(crate::upd::check(a).await?))
        }
        ("quest", _, true) => {
            a.db.ks("quest", b);
            ok()
        }
        ("events", _, false) => Ok(js(json!(a.db.all("select t,w,m,tk from ev where (?1 is null or w=?1) order by id desc limit 100", pa![q.get("wk").cloned()])))),
        ("logout", _, true) => {
            a.db.run("delete from ses where id=?", pa![sid.to_string()]);
            ok()
        }
        _ => Err(format!("unknown: {} {p}", m)),
    }
}
