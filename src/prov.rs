use crate::cfg::Ax;
use crate::db::{day, now};
use crate::pa;
use serde_json::{json, Value};

pub const PRE: &[(&str, &str, &str, &str)] = &[
    ("anthropic", "anthropic", "https://api.anthropic.com", "claude-sonnet-5-5"),
    ("openai", "openai", "https://api.openai.com/v1", "gpt-5.5"),
    ("deepseek", "openai", "https://api.deepseek.com/v1", "deepseek-chat"),
    ("mistral", "openai", "https://api.mistral.ai/v1", "mistral-large-latest"),
    ("openrouter", "openai", "https://openrouter.ai/api/v1", "anthropic/claude-sonnet-5.5"),
    ("groq", "openai", "https://api.groq.com/openai/v1", "llama-3.3-70b-versatile"),
    ("gemini", "openai", "https://generativelanguage.googleapis.com/v1beta/openai", "gemini-2.5-flash"),
    ("ollama", "openai", "http://127.0.0.1:11434/v1", "llama3.2"),
    ("lmstudio", "openai", "http://127.0.0.1:1234/v1", "local-model"),
    ("custom", "openai", "", ""),
];

pub fn cli_kind(k: &str) -> bool {
    matches!(k, "claude" | "codex" | "gemini")
}

pub fn bin(k: &str) -> &'static str {
    match k {
        "claude" => "claude",
        "codex" => "codex",
        _ => "gemini",
    }
}

pub fn tier(acc: &Value, t: &str) -> String {
    if let Some(m) = acc["cfg"]["tiers"][t].as_str() {
        if !m.is_empty() {
            return m.to_string();
        }
    }
    let k = acc["k"].as_str().unwrap_or("");
    match (k, t) {
        ("claude", "klein") => "claude-haiku-5-5".into(),
        ("claude", "mittel") => "claude-sonnet-5-5".into(),
        ("claude", "gross") => "claude-opus-5-5".into(),
        ("claude", m) | ("codex", m) | ("gemini", m) | ("api", m) if !matches!(m, "klein" | "mittel" | "gross") => m.to_string(),
        ("api", _) => acc["md"].as_str().unwrap_or("").to_string(),
        _ => String::new(),
    }
}

pub fn price(acc: &Value, md: &str) -> (f64, f64) {
    if let (Some(a), Some(b)) = (acc["cfg"]["pin"].as_f64(), acc["cfg"]["pout"].as_f64()) {
        return (a, b);
    }
    if acc["k"] != "api" {
        return (0.0, 0.0);
    }
    let m = md.to_lowercase();
    if acc["base"].as_str().map(|b| b.contains("127.0.0.1") || b.contains("localhost")).unwrap_or(false) {
        return (0.0, 0.0);
    }
    if m.contains("opus") {
        (5.0, 25.0)
    } else if m.contains("sonnet") {
        (3.0, 15.0)
    } else if m.contains("haiku") {
        (1.0, 5.0)
    } else if m.contains("mini") || m.contains("flash") || m.contains("nano") {
        (0.25, 2.0)
    } else if m.contains("deepseek") {
        (0.28, 0.42)
    } else if m.contains("gpt") || m.contains("o3") || m.contains("gemini") || m.contains("mistral-large") {
        (1.25, 10.0)
    } else {
        (1.0, 4.0)
    }
}

pub fn spent(a: &Ax) -> f64 {
    a.db.f("select coalesce(sum(usd),0) from us where day=?", pa![day()])
}

pub fn record(a: &Ax, acc: &Value, md: &str, wk: i64, fl: i64, tin: i64, tout: i64) {
    let (pi, po) = price(acc, md);
    let usd = tin as f64 / 1e6 * pi + tout as f64 / 1e6 * po;
    a.db.run(
        "insert into us(day,acc,wk,fl,tin,tout,usd) values(?,?,?,?,?,?,?) on conflict(day,acc,wk,fl) do update set tin=tin+excluded.tin, tout=tout+excluded.tout, usd=usd+excluded.usd",
        pa![day(), acc["id"].as_i64().unwrap_or(0), wk, fl, tin, tout, usd],
    );
}

pub fn st_set(a: &Ax, id: i64, f: impl FnOnce(&mut Value)) {
    let mut s = a.db.one("select st from acc where id=?", pa![id]).map(|r| r["st"].clone()).unwrap_or(json!({}));
    if !s.is_object() {
        s = json!({});
    }
    f(&mut s);
    s["t"] = json!(now());
    a.db.run("update acc set st=? where id=?", pa![s.to_string(), id]);
}

pub fn rl(a: &Ax, id: i64, i: &Value) {
    let s = i["status"].as_str().unwrap_or("allowed").to_string();
    let reset = i["resetsAt"].as_i64().map(|x| x * 1000);
    let pct = i["utilization"].as_f64().map(|u| if u <= 1.0 { u * 100.0 } else { u });
    st_set(a, id, |x| {
        x["s"] = json!(match s.as_str() {
            "rejected" => "off",
            "allowed_warning" => "warn",
            _ => "run",
        });
        if let Some(r) = reset {
            x["reset"] = json!(r);
        }
        if let Some(p) = pct {
            x["pct"] = json!(p);
        } else if s == "allowed_warning" && x["pct"].as_f64().unwrap_or(0.0) < 80.0 {
            x["pct"] = json!(80.0);
        } else if s == "rejected" {
            x["pct"] = json!(100.0);
        }
        if let Some(t) = i["rateLimitType"].as_str() {
            x["win"] = json!(t);
        }
        x["why"] = json!("");
    });
}

pub fn limit(a: &Ax, id: i64, reset: Option<i64>, why: &str) {
    st_set(a, id, |x| {
        x["s"] = json!("off");
        x["pct"] = json!(100.0);
        x["reset"] = json!(reset.unwrap_or(now() + 15 * 60_000));
        x["why"] = json!(why.chars().take(200).collect::<String>());
    });
}

pub fn err(a: &Ax, id: i64, why: &str) {
    st_set(a, id, |x| {
        x["err"] = json!(why.chars().take(300).collect::<String>());
        x["et"] = json!(now());
    });
}

pub fn ok(a: &Ax, id: i64) {
    st_set(a, id, |x| {
        if x["s"] == "off" && x["reset"].as_i64().unwrap_or(0) <= now() {
            x["s"] = json!("run");
            x["pct"] = json!(0.0);
        }
        x["err"] = json!("");
    });
}

pub fn view(a: &Ax, r: &Value) -> Value {
    let mut v = r.clone();
    let id = r["id"].as_i64().unwrap_or(0);
    let has = a.db.blob("select sec from acc where id=?", pa![id]).and_then(|b| crate::vault::dec(&a.key, &b));
    v["sec"] = json!(has.map(|s| crate::vault::tail(&s)).unwrap_or_default());
    let mut st = r["st"].clone();
    if !st.is_object() {
        st = json!({});
    }
    if st["s"] == "off" && st["reset"].as_i64().unwrap_or(0) <= now() {
        st["s"] = json!("run");
        st["pct"] = json!(0.0);
    }
    if st["s"].is_null() {
        st["s"] = json!("run");
    }
    let td = a.db.one("select coalesce(sum(tin),0) tin, coalesce(sum(tout),0) tout, coalesce(sum(usd),0) usd from us where day=? and acc=?", pa![day(), id]).unwrap_or(json!({}));
    let lim_t = r["cfg"]["tok_day"].as_i64().unwrap_or(0);
    let lim_u = r["cfg"]["usd_day"].as_f64().unwrap_or(0.0);
    if r["k"] == "api" {
        let used_t = td["tin"].as_i64().unwrap_or(0) + td["tout"].as_i64().unwrap_or(0);
        let mut pct: f64 = 0.0;
        if lim_t > 0 {
            pct = pct.max(used_t as f64 * 100.0 / lim_t as f64);
        }
        if lim_u > 0.0 {
            pct = pct.max(td["usd"].as_f64().unwrap_or(0.0) * 100.0 / lim_u);
        }
        st["pct"] = json!(pct.min(100.0));
        st["s"] = json!(if pct >= 100.0 { "off" } else if pct >= 80.0 { "warn" } else if st["s"] == "off" { "off" } else { "run" });
    }
    if st["err"].as_str().map(|e| !e.is_empty()).unwrap_or(false) && st["s"] != "off" && now() - st["et"].as_i64().unwrap_or(0) < 30 * 60_000 {
        st["s"] = json!("err");
    }
    v["st"] = st;
    v["today"] = td;
    v
}

pub fn list(a: &Ax) -> Vec<Value> {
    a.db.all("select id,k,fmt,nm,base,md,dir,cfg,st,t0 from acc order by id", pa![]).iter().map(|r| view(a, r)).collect()
}

pub fn pick(a: &Ax, wc: &Value, tdef: &str) -> Result<(Value, String), String> {
    let all = list(a);
    let fixed = wc["acct"].as_i64().unwrap_or(0);
    let pk = wc["pk"].as_str().unwrap_or("");
    let sub = wc["sub"].as_bool() == Some(true);
    let cut = wc["cut"].as_f64().unwrap_or(100.0);
    let tdef = if tdef.is_empty() { "mittel" } else { tdef };
    let md = wc["md"].as_str().filter(|s| !s.is_empty()).unwrap_or(tdef).to_string();
    let avail = |x: &Value| x["st"]["s"] != "off" && x["st"]["pct"].as_f64().unwrap_or(0.0) < cut && !(x["k"] == "api" && spent(a) >= a.set()["usd_day"].as_f64().unwrap_or(5.0) && crate::prov::price(x, &tier(x, &md)).0 > 0.0);
    if all.is_empty() {
        return Err("Kein Konto im Keller. Erst Strom anschliessen.".into());
    }
    if fixed > 0 {
        let x = all.iter().find(|x| x["id"] == fixed).ok_or("Das gewählte Konto gibt es nicht mehr")?;
        if !avail(x) {
            return Err(format!("{} ist gerade voll oder aus", x["nm"].as_str().unwrap_or("Konto")));
        }
        return Ok((x.clone(), tier(x, &md)));
    }
    let mut c: Vec<&Value> = all.iter().filter(|x| (pk.is_empty() || x["k"] == pk) && (!sub || cli_kind(x["k"].as_str().unwrap_or(""))) && avail(x)).collect();
    if c.is_empty() && !sub && wc["fb"].as_bool() == Some(true) {
        c = all.iter().filter(|x| x["k"] == "api" && avail(x)).collect();
    }
    c.sort_by(|x, y| {
        let p = |v: &Value| (if cli_kind(v["k"].as_str().unwrap_or("")) { 0.0 } else { 1000.0 }) + v["st"]["pct"].as_f64().unwrap_or(0.0);
        p(x).partial_cmp(&p(y)).unwrap()
    });
    let x = c.first().ok_or("Alle passenden Konten sind voll oder aus")?;
    Ok(((*x).clone(), tier(x, &md)))
}

pub fn ef(e: &str) -> &'static str {
    match e {
        "niedrig" | "low" => "low",
        "hoch" | "high" => "high",
        "max" => "max",
        _ => "medium",
    }
}

#[cfg(test)]
mod t {
    use super::*;

    #[test]
    fn tiers() {
        let c = json!({"k": "claude", "cfg": {}});
        assert_eq!(tier(&c, "klein"), "claude-haiku-5-5");
        assert_eq!(tier(&c, "claude-opus-5-5"), "claude-opus-5-5");
        let o = json!({"k": "api", "md": "deepseek-chat", "base": "https://api.deepseek.com/v1", "cfg": {"tiers": {"gross": "deepseek-reasoner"}}});
        assert_eq!(tier(&o, "klein"), "deepseek-chat");
        assert_eq!(tier(&o, "gross"), "deepseek-reasoner");
        assert_eq!(price(&o, "deepseek-chat"), (0.28, 0.42));
        assert_eq!(price(&json!({"k": "api", "base": "http://127.0.0.1:11434/v1", "cfg": {}}), "llama"), (0.0, 0.0));
    }
}
