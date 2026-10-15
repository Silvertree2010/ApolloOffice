use crate::cfg::Ax;
use crate::run::{Er, Job, Res};
use serde_json::{json, Value};
use std::time::Duration;

fn key(a: &Ax, acc: &Value) -> String {
    a.db.blob("select sec from acc where id=?", crate::pa![acc["id"].as_i64().unwrap_or(0)]).and_then(|b| crate::vault::dec(&a.key, &b)).unwrap_or_default()
}

async fn post(a: &Ax, u: &str, h: Vec<(&str, String)>, b: &Value, min: u64) -> Result<Value, Er> {
    let mut q = a.hc.post(u).timeout(Duration::from_secs(min.max(1) * 60)).json(b);
    for (k, v) in h {
        if !v.is_empty() {
            q = q.header(k, v);
        }
    }
    let r = q.send().await.map_err(|e| Er::E(format!("Anfrage fehlgeschlagen: {e}")))?;
    let st = r.status().as_u16();
    let ra = r.headers().get("retry-after").and_then(|v| v.to_str().ok()).and_then(|s| s.parse::<i64>().ok());
    let t = r.text().await.unwrap_or_default();
    if st == 429 || st == 529 {
        return Err(Er::Lim(ra.map(|s| crate::db::now() + s * 1000), format!("{st} {}", t.chars().take(200).collect::<String>())));
    }
    if st >= 400 {
        let m = serde_json::from_str::<Value>(&t).ok().and_then(|v| v["error"]["message"].as_str().map(String::from)).unwrap_or_else(|| t.chars().take(300).collect());
        if st == 402 || m.to_lowercase().contains("credit") || m.to_lowercase().contains("quota") {
            return Err(Er::Lim(None, m));
        }
        return Err(Er::E(format!("HTTP {st}: {m}")));
    }
    serde_json::from_str(&t).map_err(|e| Er::E(format!("Antwort unlesbar: {e}")))
}

pub async fn run(a: &Ax, j: Job) -> Result<Res, Er> {
    let fmt = j.acc["fmt"].as_str().unwrap_or("openai").to_string();
    let base = j.acc["base"].as_str().unwrap_or("").trim_end_matches('/').to_string();
    if base.is_empty() {
        return Err(Er::E("Konto ohne Adresse".into()));
    }
    let k = key(a, &j.acc);
    let md = if j.md.is_empty() { j.acc["md"].as_str().unwrap_or("").to_string() } else { j.md.clone() };
    if md.is_empty() {
        return Err(Er::E("kein Modell eingestellt".into()));
    }
    let defs = j.rc.as_ref().map(|rc| crate::tools::defs(a, rc)).unwrap_or_default();
    let tk = j.rc.as_ref().map(|r| r.tk);
    let (mut tin, mut tout) = (0i64, 0i64);
    let deadline = std::time::Instant::now() + Duration::from_secs(j.min * 60);
    let mx = if defs.is_empty() { 1 } else { j.turns.max(1) };
    if fmt == "anthropic" {
        let tools: Vec<Value> = defs.iter().map(|(n, d, s)| json!({"name": n, "description": d, "input_schema": s})).collect();
        let mut msgs = vec![json!({"role": "user", "content": j.p})];
        for _ in 0..mx {
            if std::time::Instant::now() > deadline {
                return Err(Er::E(format!("Zeitlimit nach {} min", j.min)));
            }
            let mut b = json!({"model": md, "max_tokens": 8192, "system": j.sys, "messages": msgs});
            if !tools.is_empty() {
                b["tools"] = json!(tools);
            }
            let r = post(a, &format!("{base}/v1/messages"), vec![("x-api-key", k.clone()), ("anthropic-version", "2023-06-01".into())], &b, j.min).await?;
            tin += r["usage"]["input_tokens"].as_i64().unwrap_or(0) + r["usage"]["cache_creation_input_tokens"].as_i64().unwrap_or(0);
            tout += r["usage"]["output_tokens"].as_i64().unwrap_or(0);
            let ct = r["content"].as_array().cloned().unwrap_or_default();
            let txt: String = ct.iter().filter(|c| c["type"] == "text").filter_map(|c| c["text"].as_str()).collect::<Vec<_>>().join("\n");
            if !txt.trim().is_empty() {
                a.say(j.who, &txt, tk);
            }
            let uses: Vec<Value> = ct.iter().filter(|c| c["type"] == "tool_use").cloned().collect();
            if uses.is_empty() || r["stop_reason"] != "tool_use" {
                return Ok(Res { txt, tin, tout });
            }
            msgs.push(json!({"role": "assistant", "content": ct}));
            let mut res = vec![];
            for u in uses {
                let n = u["name"].as_str().unwrap_or("");
                let o = match &j.rc {
                    Some(rc) => crate::tools::call(a, rc, n, &u["input"]).await,
                    None => Err("keine Werkzeuge".into()),
                };
                let (t, e) = match o {
                    Ok(t) => (t, false),
                    Err(e) => (format!("error: {e}"), true),
                };
                res.push(json!({"type": "tool_result", "tool_use_id": u["id"], "content": crate::sh::head(&t, 100_000), "is_error": e}));
            }
            msgs.push(json!({"role": "user", "content": res}));
        }
        Err(Er::E("zu viele Schritte".into()))
    } else {
        let tools: Vec<Value> = defs.iter().map(|(n, d, s)| json!({"type": "function", "function": {"name": n, "description": d, "parameters": s}})).collect();
        let mut msgs = vec![json!({"role": "system", "content": j.sys}), json!({"role": "user", "content": j.p})];
        for _ in 0..mx {
            if std::time::Instant::now() > deadline {
                return Err(Er::E(format!("Zeitlimit nach {} min", j.min)));
            }
            let mut b = json!({"model": md, "messages": msgs});
            if !tools.is_empty() {
                b["tools"] = json!(tools);
            }
            let r = post(a, &format!("{base}/chat/completions"), vec![("authorization", if k.is_empty() { String::new() } else { format!("Bearer {k}") })], &b, j.min).await?;
            tin += r["usage"]["prompt_tokens"].as_i64().unwrap_or(0);
            tout += r["usage"]["completion_tokens"].as_i64().unwrap_or(0);
            let m = r["choices"][0]["message"].clone();
            let txt = m["content"].as_str().unwrap_or("").to_string();
            if !txt.trim().is_empty() {
                a.say(j.who, &txt, tk);
            }
            let calls = m["tool_calls"].as_array().cloned().unwrap_or_default();
            if calls.is_empty() {
                return Ok(Res { txt, tin, tout });
            }
            let mut am = json!({"role": "assistant", "content": m["content"].clone(), "tool_calls": calls});
            if am["content"].is_null() {
                am["content"] = json!("");
            }
            msgs.push(am);
            for c in calls {
                let n = c["function"]["name"].as_str().unwrap_or("");
                let args: Value = serde_json::from_str(c["function"]["arguments"].as_str().unwrap_or("{}")).unwrap_or(json!({}));
                let o = match &j.rc {
                    Some(rc) => crate::tools::call(a, rc, n, &args).await,
                    None => Err("keine Werkzeuge".into()),
                };
                let t = o.unwrap_or_else(|e| format!("error: {e}"));
                msgs.push(json!({"role": "tool", "tool_call_id": c["id"], "content": crate::sh::head(&t, 100_000)}));
            }
        }
        Err(Er::E("zu viele Schritte".into()))
    }
}
