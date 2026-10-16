use crate::cfg::Ax;
use crate::db::{day, now};
use crate::pa;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

pub const KINDS: &[&str] = &["discord", "ntfy", "telegram", "email", "webhook", "desktop"];
pub const EVS: &[(&str, &str)] = &[("done", "Task done"), ("fail", "Task failed"), ("rej", "Task rejected"), ("cost", "Daily cost cap reached"), ("acc", "Account error"), ("srv", "Server offline"), ("upd", "Update available")];
const PER_MIN: u32 = 10;
const DUP_MS: i64 = 10 * 60_000;

static RT: Mutex<Option<HashMap<i64, (i64, u32)>>> = Mutex::new(None);
static DUP: Mutex<Option<HashMap<String, i64>>> = Mutex::new(None);

fn s<'a>(v: &'a Value, k: &str) -> &'a str {
    v[k].as_str().unwrap_or("")
}

fn rated(id: i64) -> bool {
    let mut g = RT.lock().unwrap();
    let m = g.get_or_insert_with(HashMap::new);
    let t = now() / 60_000;
    let e = m.entry(id).or_insert((t, 0));
    if e.0 != t {
        *e = (t, 0);
    }
    e.1 += 1;
    e.1 > PER_MIN
}

fn dup(id: i64, ti: &str, tx: &str) -> bool {
    let mut g = DUP.lock().unwrap();
    let m = g.get_or_insert_with(HashMap::new);
    let n = now();
    m.retain(|_, t| n - *t < DUP_MS);
    let k = format!("{id}\u{0}{ti}\u{0}{tx}");
    if m.contains_key(&k) {
        return true;
    }
    m.insert(k, n);
    false
}

fn https(u: &str) -> Result<url::Url, String> {
    let p = url::Url::parse(u.trim()).map_err(|_| "invalid address")?;
    if p.scheme() != "https" && p.scheme() != "http" {
        return Err("address must start with https://".into());
    }
    if p.host_str().map(|h| h.is_empty()).unwrap_or(true) {
        return Err("address has no host".into());
    }
    Ok(p)
}

fn mail_ok(m: &str) -> bool {
    regex::Regex::new(r"^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$").unwrap().is_match(m.trim())
}

pub fn check(k: &str, c: &Value, sec: &str, has: bool) -> Result<Value, String> {
    let need = |x: &str, m: &str| if x.trim().is_empty() && !has { Err(m.to_string()) } else { Ok(()) };
    match k {
        "discord" => {
            need(sec, "webhook address missing")?;
            if !sec.is_empty() {
                let u = https(sec)?;
                let h = u.host_str().unwrap_or("");
                if u.scheme() != "https" || !["discord.com", "discordapp.com", "canary.discord.com", "ptb.discord.com"].contains(&h) || !u.path().starts_with("/api/webhooks/") {
                    return Err("use the webhook address from Discord (https://discord.com/api/webhooks/…)".into());
                }
            }
            Ok(json!({}))
        }
        "ntfy" => {
            let srv = if s(c, "url").trim().is_empty() { "https://ntfy.sh".to_string() } else { s(c, "url").trim().trim_end_matches('/').to_string() };
            https(&srv)?;
            let tp = s(c, "topic").trim();
            if !regex::Regex::new(r"^[A-Za-z0-9_-]{1,64}$").unwrap().is_match(tp) {
                return Err("topic: letters, digits, - and _ only".into());
            }
            Ok(json!({"url": srv, "topic": tp}))
        }
        "telegram" => {
            need(sec, "bot token missing")?;
            if !sec.is_empty() && !regex::Regex::new(r"^\d+:[A-Za-z0-9_-]{20,}$").unwrap().is_match(sec.trim()) {
                return Err("bot token looks wrong (123456:ABC…)".into());
            }
            let ch = s(c, "chat").trim();
            if !regex::Regex::new(r"^(-?\d{1,20}|@[A-Za-z0-9_]{4,64})$").unwrap().is_match(ch) {
                return Err("chat id: a number or @channelname".into());
            }
            Ok(json!({"chat": ch}))
        }
        "email" => {
            let h = s(c, "host").trim();
            if h.is_empty() || !crate::perm::hostok(h) {
                return Err("SMTP server missing".into());
            }
            let tls = match s(c, "tls") {
                "" | "starttls" => "starttls",
                "tls" => "tls",
                _ => return Err("encryption: starttls or tls".into()),
            };
            let port = c["port"].as_u64().or_else(|| s(c, "port").parse().ok()).unwrap_or(if tls == "tls" { 465 } else { 587 });
            if port == 0 || port > 65535 {
                return Err("invalid port".into());
            }
            let (fr, to) = (s(c, "from").trim(), s(c, "to").trim());
            if !mail_ok(fr) {
                return Err("sender address is not valid".into());
            }
            if !mail_ok(to) {
                return Err("recipient address is not valid".into());
            }
            Ok(json!({"host": h, "port": port, "tls": tls, "user": s(c, "user").trim(), "from": fr, "to": to}))
        }
        "webhook" => {
            need(sec, "address missing")?;
            if !sec.is_empty() {
                https(sec)?;
            }
            Ok(json!({}))
        }
        "desktop" => Ok(json!({})),
        _ => Err("unknown channel kind".into()),
    }
}

async fn ok(r: reqwest::Response) -> Result<(), String> {
    let c = r.status();
    if c.is_success() {
        return Ok(());
    }
    let b: String = r.text().await.unwrap_or_default().chars().take(200).collect();
    Err(format!("HTTP {}: {}", c.as_u16(), b.trim()))
}

fn cut(t: &str, n: usize) -> String {
    crate::tools::cut_s(t, n)
}

async fn mail(c: &Value, pw: &str, ti: &str, tx: &str) -> Result<(), String> {
    use lettre::message::{header::ContentType, Mailbox};
    use lettre::transport::smtp::authentication::Credentials;
    use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
    let fr: Mailbox = format!("ApolloOffice <{}>", s(c, "from")).parse().map_err(|_| "sender address is not valid")?;
    let to: Mailbox = s(c, "to").parse().map_err(|_| "recipient address is not valid")?;
    let m = Message::builder().from(fr).to(to).subject(cut(ti, 150)).header(ContentType::TEXT_PLAIN).body(tx.to_string()).map_err(|e| e.to_string())?;
    let h = s(c, "host");
    let b = if s(c, "tls") == "tls" { AsyncSmtpTransport::<Tokio1Executor>::relay(h) } else { AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(h) }.map_err(|e| e.to_string())?;
    let mut b = b.port(c["port"].as_u64().unwrap_or(587) as u16).timeout(Some(Duration::from_secs(20)));
    let u = s(c, "user");
    if !u.is_empty() || !pw.is_empty() {
        b = b.credentials(Credentials::new(if u.is_empty() { s(c, "from").to_string() } else { u.to_string() }, pw.to_string()));
    }
    b.build().send(m).await.map(|_| ()).map_err(|e| e.to_string())
}

async fn desktop(ti: &str, tx: &str) -> Result<(), String> {
    let (ti, tx) = (cut(ti, 120), cut(tx, 400));
    let mut c;
    if cfg!(target_os = "macos") {
        c = tokio::process::Command::new("osascript");
        c.args(["-e", "on run argv", "-e", "display notification (item 2 of argv) with title (item 1 of argv)", "-e", "end run", &ti, &tx]);
    } else if cfg!(windows) {
        c = tokio::process::Command::new("powershell");
        c.args(["-NoProfile", "-NonInteractive", "-Command", "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null; $t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02); $x = $t.GetElementsByTagName('text'); $x.Item(0).AppendChild($t.CreateTextNode($env:AO_T)) > $null; $x.Item(1).AppendChild($t.CreateTextNode($env:AO_X)) > $null; [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe').Show([Windows.UI.Notifications.ToastNotification]::new($t))"]);
        c.env("AO_T", &ti).env("AO_X", &tx);
        #[cfg(windows)]
        c.creation_flags(0x0800_0000);
    } else {
        c = tokio::process::Command::new("notify-send");
        c.args(["-a", "ApolloOffice", "--", &ti, &tx]);
    }
    c.stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::piped()).kill_on_drop(true);
    let o = tokio::time::timeout(Duration::from_secs(20), c.output()).await.map_err(|_| "desktop notification timed out".to_string())?.map_err(|e| if cfg!(target_os = "linux") { format!("notify-send not found ({e})") } else { e.to_string() })?;
    if o.status.success() {
        Ok(())
    } else {
        Err(cut(String::from_utf8_lossy(&o.stderr).trim(), 200))
    }
}

pub async fn deliver(a: &Ax, ch: &Value, ti: &str, tx: &str) -> Result<(), String> {
    let id = ch["id"].as_i64().unwrap_or(0);
    let c = &ch["cfg"];
    let sec = a.db.blob("select sec from ch where id=?", pa![id]).and_then(|b| crate::vault::dec(&a.key, &b)).unwrap_or_default();
    let (ti, tx) = (cut(ti.trim(), 200), cut(tx.trim(), 3500));
    let hc = &a.hc;
    let to = Duration::from_secs(20);
    match ch["k"].as_str().unwrap_or("") {
        "discord" => {
            let body = cut(&format!("**{}**\n{}", ti.replace('*', "\\*"), tx), 1990);
            ok(hc.post(&sec).timeout(to).json(&json!({"content": body, "username": "ApolloOffice", "allowed_mentions": {"parse": []}})).send().await.map_err(|e| e.to_string())?).await
        }
        "ntfy" => {
            let mut r = hc.post(format!("{}/{}", s(c, "url").trim_end_matches('/'), s(c, "topic"))).timeout(to).header("Title", ti.replace(['\r', '\n'], " ")).body(tx.clone());
            if !sec.is_empty() {
                r = r.bearer_auth(&sec);
            }
            ok(r.send().await.map_err(|e| e.to_string())?).await
        }
        "telegram" => {
            let r = hc.post(format!("https://api.telegram.org/bot{sec}/sendMessage")).timeout(to).json(&json!({"chat_id": s(c, "chat"), "text": cut(&format!("{ti}\n\n{tx}"), 4000), "disable_web_page_preview": true})).send().await.map_err(|e| e.to_string().replace(&sec, "…"))?;
            ok(r).await.map_err(|e| e.replace(&sec, "…"))
        }
        "email" => mail(c, &sec, &ti, &tx).await,
        "webhook" => ok(hc.post(&sec).timeout(to).json(&json!({"app": "ApolloOffice", "title": ti, "text": tx, "t": now()})).send().await.map_err(|e| e.to_string().replace(&sec, "…"))?).await,
        "desktop" => desktop(&ti, &tx).await,
        _ => Err("unknown channel kind".into()),
    }
}

pub async fn send(a: &Ax, ch: &Value, ti: &str, tx: &str) -> Result<(), String> {
    let id = ch["id"].as_i64().unwrap_or(0);
    if ch["on"].as_i64() == Some(0) {
        return Err(format!("channel {} is switched off", s(ch, "nm")));
    }
    if dup(id, ti, tx) {
        return Ok(());
    }
    if rated(id) {
        return Err(format!("channel {} sent too much in the last minute", s(ch, "nm")));
    }
    let r = deliver(a, ch, ti, tx).await;
    if let Err(e) = &r {
        a.aud("Notification failed", &format!("{}: {e}", s(ch, "nm")));
    }
    r
}

pub fn list(a: &Ax) -> Vec<Value> {
    a.db.all("select id,nm,k,cfg,on_ as \"on\",t0 from ch order by id", pa![])
}

pub fn view(a: &Ax) -> Vec<Value> {
    list(a)
        .into_iter()
        .map(|mut c| {
            let id = c["id"].as_i64().unwrap_or(0);
            c["sec"] = json!(a.db.blob("select sec from ch where id=?", pa![id]).and_then(|b| crate::vault::dec(&a.key, &b)).map(|x| crate::vault::tail(&x)).unwrap_or_default());
            c
        })
        .collect()
}

pub fn by_name(a: &Ax, n: &str) -> Option<Value> {
    let n = n.trim().to_lowercase();
    list(a).into_iter().find(|c| s(c, "nm").to_lowercase() == n)
}

pub fn rules(a: &Ax) -> Value {
    let r = a.db.kg("ntf");
    let mut o = json!({});
    for (k, _) in EVS {
        o[*k] = json!(r[*k].as_array().map(|v| v.iter().filter_map(|x| x.as_i64()).collect::<Vec<_>>()).unwrap_or_default());
    }
    o
}

pub fn set_rules(a: &Ax, b: &Value) -> Result<(), String> {
    let ids: Vec<i64> = list(a).iter().filter_map(|c| c["id"].as_i64()).collect();
    let mut o = json!({});
    for (k, _) in EVS {
        let v: Vec<i64> = b[*k].as_array().map(|v| v.iter().filter_map(|x| x.as_i64()).filter(|x| ids.contains(x)).collect()).unwrap_or_default();
        o[*k] = json!(v);
    }
    a.db.ks("ntf", &o);
    Ok(())
}

pub fn save(a: &Ax, id: i64, b: &Value) -> Result<i64, String> {
    let old = if id > 0 { Some(a.db.one("select id,k from ch where id=?", pa![id]).ok_or("unknown channel")?) } else { None };
    let k = old.as_ref().map(|o| s(o, "k").to_string()).unwrap_or_else(|| s(b, "k").to_string());
    if !KINDS.contains(&k.as_str()) {
        return Err("unknown channel kind".into());
    }
    let nm: String = s(b, "nm").trim().chars().take(32).collect();
    if nm.is_empty() {
        return Err("give the channel a name".into());
    }
    if list(a).iter().any(|c| c["id"].as_i64() != Some(id) && s(c, "nm").to_lowercase() == nm.to_lowercase()) {
        return Err("a channel with this name exists".into());
    }
    let sec = s(b, "sec").trim().to_string();
    let c = check(&k, &b["cfg"], &sec, old.is_some())?;
    let on = b["on"].as_bool().unwrap_or(true) as i64;
    let id = match old {
        Some(_) => {
            a.db.run("update ch set nm=?, cfg=?, on_=? where id=?", pa![nm.clone(), c.to_string(), on, id]);
            id
        }
        None => a.db.run("insert into ch(nm,k,cfg,on_,t0) values(?,?,?,?,?)", pa![nm.clone(), k.clone(), c.to_string(), on, now()]),
    };
    if !sec.is_empty() {
        a.db.run("update ch set sec=? where id=?", pa![crate::vault::enc(&a.key, &sec), id]);
    }
    a.aud("Channel saved", &format!("{nm} ({k})"));
    Ok(id)
}

pub fn del(a: &Ax, id: i64) -> Result<(), String> {
    let r = a.db.one("select nm from ch where id=?", pa![id]).ok_or("unknown channel")?;
    a.db.run("delete from ch where id=?", pa![id]);
    let mut rl = rules(a);
    for (k, _) in EVS {
        if let Some(v) = rl[*k].as_array_mut() {
            v.retain(|x| x.as_i64() != Some(id));
        }
    }
    a.db.ks("ntf", &rl);
    a.aud("Channel deleted", s(&r, "nm"));
    Ok(())
}

pub fn fire(a: &Ax, ev: &str, ti: String, tx: String) {
    let ids: Vec<i64> = rules(a)[ev].as_array().map(|v| v.iter().filter_map(|x| x.as_i64()).collect()).unwrap_or_default();
    if ids.is_empty() {
        return;
    }
    for c in list(a).into_iter().filter(|c| ids.contains(&c["id"].as_i64().unwrap_or(0)) && c["on"].as_i64() != Some(0)) {
        let (a2, ti, tx) = (a.clone(), ti.clone(), tx.clone());
        tokio::spawn(async move {
            let _ = send(&a2, &c, &ti, &tx).await;
        });
    }
}

fn first(t: &str) -> String {
    cut(t.trim().lines().find(|l| !l.trim().is_empty()).unwrap_or("").trim().trim_start_matches('#').trim(), 300)
}

pub fn poll(a: &Ax) {
    let mut st = a.db.kg("ntf_st");
    if !st.is_object() {
        st = json!({"c": now(), "acc": [], "srv": [], "cost": "", "upd": ""});
        a.db.ks("ntf_st", &st);
        return;
    }
    let c0 = st["c"].as_i64().unwrap_or(now());
    let tks = a.db.all("select t.id,t.ti,t.st,t.res,t.t1,w.nm wn,f.nm fn from tk t left join wk w on w.id=t.wk left join fl f on f.id=t.fl where t.kind='task' and t.st in ('done','fail','rej') and t.t1>? order by t.t1 limit 200", pa![c0]);
    let mut c = c0;
    for t in &tks {
        c = c.max(t["t1"].as_i64().unwrap_or(c));
        let res = s(t, "res");
        if res == "cancelled by you" {
            continue;
        }
        let who = [s(t, "wn"), s(t, "fn")].iter().filter(|x| !x.is_empty()).cloned().collect::<Vec<_>>().join(", ");
        let (ev, verb) = match s(t, "st") {
            "done" => ("done", "Done"),
            "fail" => ("fail", "Failed"),
            _ => ("rej", "Rejected"),
        };
        let body = if who.is_empty() { first(res) } else { format!("{who}: {}", first(res)) };
        fire(a, ev, format!("{verb}: #{} {}", t["id"], cut(s(t, "ti"), 120)), body);
    }
    st["c"] = json!(c);

    let errs: Vec<Value> = crate::prov::list(a).into_iter().filter(|x| x["st"]["s"] == "err").collect();
    let was: Vec<i64> = st["acc"].as_array().map(|v| v.iter().filter_map(|x| x.as_i64()).collect()).unwrap_or_default();
    for x in errs.iter().filter(|x| !was.contains(&x["id"].as_i64().unwrap_or(0))) {
        fire(a, "acc", format!("Account error: {}", s(x, "nm")), cut(s(&x["st"], "err"), 600));
    }
    st["acc"] = json!(errs.iter().filter_map(|x| x["id"].as_i64()).collect::<Vec<_>>());

    let off: Vec<Value> = a.db.all("select id,nm,st from srv", pa![]).into_iter().filter(|x| x["st"]["on"] == false).collect();
    let was: Vec<i64> = st["srv"].as_array().map(|v| v.iter().filter_map(|x| x.as_i64()).collect()).unwrap_or_default();
    for x in off.iter().filter(|x| !was.contains(&x["id"].as_i64().unwrap_or(0))) {
        fire(a, "srv", format!("Server offline: {}", s(x, "nm")), cut(s(&x["st"], "why"), 600));
    }
    st["srv"] = json!(off.iter().filter_map(|x| x["id"].as_i64()).collect::<Vec<_>>());

    let cap = a.set()["usd_day"].as_f64().unwrap_or(0.0);
    let sp = crate::prov::spent(a);
    if cap > 0.0 && sp >= cap && s(&st, "cost") != day() {
        st["cost"] = json!(day());
        fire(a, "cost", "Daily cost cap reached".into(), format!("{sp:.2} $ of {cap:.2} $ spent today. Workers on API keys wait until tomorrow."));
    }

    let u = a.db.kg("upd");
    if let Some(v) = u["ready"].as_str().or(u["latest"].as_str()).filter(|v| crate::upd::newer(v, crate::cfg::V)) {
        if s(&st, "upd") != v {
            st["upd"] = json!(v);
            fire(a, "upd", format!("Update {v} available"), format!("ApolloOffice {} can be updated to {v}.", crate::cfg::V));
        }
    }
    a.db.ks("ntf_st", &st);
}

#[cfg(test)]
mod t {
    use super::*;

    #[test]
    fn checks() {
        assert!(check("discord", &json!({}), "https://discord.com/api/webhooks/1/abc", false).is_ok());
        assert!(check("discord", &json!({}), "https://evil.example/api/webhooks/1/abc", false).is_err());
        assert!(check("discord", &json!({}), "", false).is_err());
        assert!(check("discord", &json!({}), "", true).is_ok());
        assert_eq!(check("ntfy", &json!({"topic": "ao-test"}), "", false).unwrap()["url"], "https://ntfy.sh");
        assert!(check("ntfy", &json!({"topic": "a/b"}), "", false).is_err());
        assert!(check("telegram", &json!({"chat": "12345"}), "123:ABCDEFGHIJKLMNOPQRSTUVWX", false).is_ok());
        assert!(check("telegram", &json!({"chat": "x y"}), "123:ABCDEFGHIJKLMNOPQRSTUVWX", false).is_err());
        let e = check("email", &json!({"host": "smtp.resend.com", "tls": "tls", "from": "a@b.dev", "to": "c@d.ch"}), "pw", false).unwrap();
        assert_eq!(e["port"], 465);
        assert!(check("email", &json!({"host": "smtp.resend.com", "from": "nope", "to": "c@d.ch"}), "pw", false).is_err());
        assert!(check("webhook", &json!({}), "ftp://x", false).is_err());
        assert!(check("sms", &json!({}), "", false).is_err());
    }

    #[test]
    fn limits() {
        assert!(!dup(-7, "a", "b"));
        assert!(dup(-7, "a", "b"));
        assert!(!dup(-7, "a", "c"));
        for _ in 0..PER_MIN {
            assert!(!rated(-8));
        }
        assert!(rated(-8));
    }
}
