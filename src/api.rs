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
    let r = q.send().await.map_err(|e| Er::E(format!("request failed: {e}")))?;
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
    serde_json::from_str(&t).map_err(|e| Er::E(format!("unreadable answer: {e}")))
}

pub async fn run(a: &Ax, j: Job, u: &mut (i64, i64)) -> Result<Res, Er> {
    let fmt = j.acc["fmt"].as_str().unwrap_or("openai").to_string();
    let base = j.acc["base"].as_str().unwrap_or("").trim_end_matches('/').to_string();
    if base.is_empty() {
        return Err(Er::E("account without address".into()));
    }
    let k = key(a, &j.acc);
    let md = if j.md.is_empty() { j.acc["md"].as_str().unwrap_or("").to_string() } else { j.md.clone() };
    if md.is_empty() {
        return Err(Er::E("no model set".into()));
    }
    let defs = j.rc.as_ref().map(|rc| crate::tools::defs(a, rc)).unwrap_or_default();
    let tk = j.rc.as_ref().map(|r| r.tk);
    let deadline = std::time::Instant::now() + Duration::from_secs(j.min * 60);
    let mx = if defs.is_empty() { 1 } else { j.turns.max(1) };
    if fmt == "anthropic" {
        let tools: Vec<Value> = defs.iter().map(|(n, d, s)| json!({"name": n, "description": d, "input_schema": s})).collect();
        let mut msgs = vec![json!({"role": "user", "content": j.p})];
        for _ in 0..mx {
            if std::time::Instant::now() > deadline {
                return Err(Er::E(format!("timeout after {} min", j.min)));
            }
            if crate::run::gone(a, j.tid) {
                return Err(Er::E("cancelled".into()));
            }
            let mut b = json!({"model": md, "max_tokens": 8192, "system": j.sys, "messages": msgs});
            if !tools.is_empty() {
                b["tools"] = json!(tools);
            }
            let r = post(a, &format!("{base}/v1/messages"), vec![("x-api-key", k.clone()), ("anthropic-version", "2023-06-01".into())], &b, j.min).await?;
            u.0 += r["usage"]["input_tokens"].as_i64().unwrap_or(0) + r["usage"]["cache_creation_input_tokens"].as_i64().unwrap_or(0) + r["usage"]["cache_read_input_tokens"].as_i64().unwrap_or(0) / 10;
            u.1 += r["usage"]["output_tokens"].as_i64().unwrap_or(0);
            let ct = r["content"].as_array().cloned().unwrap_or_default();
            let txt: String = ct.iter().filter(|c| c["type"] == "text").filter_map(|c| c["text"].as_str()).collect::<Vec<_>>().join("\n");
            if !txt.trim().is_empty() {
                a.say(j.who, &txt, tk);
            }
            let uses: Vec<Value> = ct.iter().filter(|c| c["type"] == "tool_use").cloned().collect();
            if r["stop_reason"] == "max_tokens" {
                return Err(Er::E("answer was cut off (max_tokens)".into()));
            }
            if uses.is_empty() || r["stop_reason"] != "tool_use" {
                if txt.trim().is_empty() {
                    return Err(Er::E("empty answer".into()));
                }
                return Ok(Res { txt, tin: 0, tout: 0 });
            }
            msgs.push(json!({"role": "assistant", "content": ct}));
            let mut res = vec![];
            for x in uses {
                if crate::run::gone(a, j.tid) {
                    return Err(Er::E("cancelled".into()));
                }
                let n = x["name"].as_str().unwrap_or("");
                let o = match &j.rc {
                    Some(rc) => crate::tools::call(a, rc, n, &x["input"]).await,
                    None => Err("no tools".into()),
                };
                let (t, e) = match o {
                    Ok(t) => (t, false),
                    Err(e) => (format!("error: {e}"), true),
                };
                let c: Vec<Value> = crate::tools::parts(&t).into_iter().map(|p| match p {
                    crate::tools::Part::T(t) => json!({"type": "text", "text": crate::sh::head(&t, 100_000)}),
                    crate::tools::Part::I(d) => json!({"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": d}}),
                }).collect();
                res.push(json!({"type": "tool_result", "tool_use_id": x["id"], "content": c, "is_error": e}));
            }
            msgs.push(json!({"role": "user", "content": res}));
        }
        Err(Er::E("too many steps".into()))
    } else {
        let tools: Vec<Value> = defs.iter().map(|(n, d, s)| json!({"type": "function", "function": {"name": n, "description": d, "parameters": s}})).collect();
        let mut msgs = vec![json!({"role": "system", "content": j.sys}), json!({"role": "user", "content": j.p})];
        for _ in 0..mx {
            if std::time::Instant::now() > deadline {
                return Err(Er::E(format!("timeout after {} min", j.min)));
            }
            if crate::run::gone(a, j.tid) {
                return Err(Er::E("cancelled".into()));
            }
            let mut b = json!({"model": md, "messages": msgs});
            if !tools.is_empty() {
                b["tools"] = json!(tools);
            }
            let r = post(a, &format!("{base}/chat/completions"), vec![("authorization", if k.is_empty() { String::new() } else { format!("Bearer {k}") })], &b, j.min).await?;
            u.0 += r["usage"]["prompt_tokens"].as_i64().unwrap_or(0);
            u.1 += r["usage"]["completion_tokens"].as_i64().unwrap_or(0);
            let m = r["choices"][0]["message"].clone();
            let txt = m["content"].as_str().unwrap_or("").to_string();
            if !txt.trim().is_empty() {
                a.say(j.who, &txt, tk);
            }
            let calls = m["tool_calls"].as_array().cloned().unwrap_or_default();
            if r["choices"][0]["finish_reason"] == "length" {
                return Err(Er::E("answer was cut off (length)".into()));
            }
            if calls.is_empty() {
                if txt.trim().is_empty() {
                    return Err(Er::E("empty answer".into()));
                }
                return Ok(Res { txt, tin: 0, tout: 0 });
            }
            let mut am = json!({"role": "assistant", "content": m["content"].clone(), "tool_calls": calls});
            if am["content"].is_null() {
                am["content"] = json!("");
            }
            msgs.push(am);
            for c in calls {
                if crate::run::gone(a, j.tid) {
                    return Err(Er::E("cancelled".into()));
                }
                let n = c["function"]["name"].as_str().unwrap_or("");
                let args: Value = serde_json::from_str(c["function"]["arguments"].as_str().unwrap_or("{}")).unwrap_or(json!({}));
                let o = match &j.rc {
                    Some(rc) => crate::tools::call(a, rc, n, &args).await,
                    None => Err("no tools".into()),
                };
                let t = o.unwrap_or_else(|e| format!("error: {e}"));
                let t: String = crate::tools::parts(&t).into_iter().filter_map(|p| match p {
                    crate::tools::Part::T(t) => Some(t),
                    crate::tools::Part::I(_) => Some("(image not shown: this account can not read images through tools)".into()),
                }).collect::<Vec<_>>().join("\n");
                msgs.push(json!({"role": "tool", "tool_call_id": c["id"], "content": crate::sh::head(&t, 100_000)}));
            }
        }
        Err(Er::E("too many steps".into()))
    }
}
