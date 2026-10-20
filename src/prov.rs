use crate::app::{Ax, X, R};
use serde_json::{json, Value};
use std::time::Duration;

pub struct Pv {
    pub id: &'static str,
    pub nm: &'static str,
    pub fmt: &'static str,
    pub base: &'static str,
    pub key: bool,
    pub ms: &'static [&'static str],
}

pub const PV: &[Pv] = &[
    Pv { id: "opencode", nm: "OpenCode ACP (verified free only)", fmt: "openai", base: "unix://apollo-opencode", key: false, ms: &["opencode/beam-free", "opencode/deepseek-v4.1-flash-free"] },
    Pv { id: "nvidia", nm: "NVIDIA (approved free route)", fmt: "openai", base: "https://integrate.api.nvidia.com/v1", key: true, ms: &["nvidia/nemotron-3-super-120b-a12b"] },
    Pv { id: "mistral", nm: "Mistral (approved free tier)", fmt: "openai", base: "https://api.mistral.ai/v1", key: true, ms: &["ministral-14b-latest"] },
    Pv { id: "groq", nm: "Groq (approved free tier)", fmt: "openai", base: "https://api.groq.com/openai/v1", key: true, ms: &["openai/gpt-oss-120b"] },
    Pv { id: "cc", nm: "Claude Code (your login)", fmt: "cli", base: "", key: false, ms: &["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"] },
    Pv { id: "codex", nm: "ChatGPT (Codex CLI login)", fmt: "cli", base: "", key: false, ms: &["gpt-5.6-terra", "gpt-5.6-luna"] },
    Pv { id: "anthropic", nm: "Claude API", fmt: "anthropic", base: "https://api.anthropic.com", key: true, ms: &["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"] },
    Pv { id: "openai", nm: "OpenAI API", fmt: "openai", base: "https://api.openai.com/v1", key: true, ms: &["gpt-5.5", "gpt-5.5-mini"] },
    Pv { id: "gemini", nm: "Gemini API", fmt: "openai", base: "https://generativelanguage.googleapis.com/v1beta/openai", key: true, ms: &["gemini-2.5-pro", "gemini-2.5-flash"] },
    Pv { id: "ollama", nm: "Ollama (local)", fmt: "ollama", base: "http://127.0.0.1:11434", key: false, ms: &[] },
];

pub const PX: &[(&str, f64, f64, f64, f64)] = &[
    ("claude-fable-5-1", 10.0, 12.5, 0.25, 50.0),
    ("claude-mythos-5-1", 10.0, 12.5, 0.25, 50.0),
    ("claude-fable-5", 10.0, 12.5, 1.0, 50.0),
    ("claude-mythos-5", 10.0, 12.5, 1.0, 50.0),
    ("claude-opus-5-5", 4.0, 5.0, 0.2, 20.0),
    ("claude-opus-5", 5.0, 6.25, 0.5, 25.0),
    ("claude-opus-4-5", 5.0, 6.25, 0.5, 25.0),
    ("claude-opus-4-6", 5.0, 6.25, 0.5, 25.0),
    ("claude-opus-4-7", 5.0, 6.25, 0.5, 25.0),
    ("claude-opus-4-8", 5.0, 6.25, 0.5, 25.0),
    ("claude-opus-4", 15.0, 18.75, 1.5, 75.0),
    ("claude-sonnet-5-5", 2.0, 2.5, 0.1, 10.0),
    ("claude-sonnet-5", 2.0, 2.5, 0.2, 10.0),
    ("claude-sonnet-4", 3.0, 3.75, 0.3, 15.0),
    ("claude-haiku-5-5", 0.1, 0.125, 0.01, 0.5),
    ("claude-haiku-4-5", 1.0, 1.25, 0.1, 5.0),
    ("claude-3-5-haiku", 0.8, 1.0, 0.08, 4.0),
    ("gpt-5.6-sol", 4.0, 4.0, 0.4, 20.0),
    ("gpt-5.6-terra", 2.0, 2.0, 0.2, 12.0),
    ("gpt-5.6-luna", 0.2, 0.2, 0.02, 1.2),
    ("gpt-5.5-pro", 30.0, 30.0, 30.0, 180.0),
    ("gpt-5.5", 5.0, 5.0, 0.5, 30.0),
    ("gpt-5.4-pro", 30.0, 30.0, 30.0, 180.0),
    ("gpt-5.4-mini", 0.75, 0.75, 0.075, 4.5),
    ("gpt-5.4-nano", 0.2, 0.2, 0.02, 1.25),
    ("gpt-5.4", 2.5, 2.5, 0.25, 15.0),
    ("gpt-5.3-codex", 1.75, 1.75, 0.175, 14.0),
    ("gpt-5.2-pro", 21.0, 21.0, 21.0, 168.0),
    ("gpt-5.2", 1.75, 1.75, 0.175, 14.0),
    ("gpt-5.1", 1.25, 1.25, 0.125, 10.0),
    ("gpt-5-pro", 15.0, 15.0, 15.0, 120.0),
    ("gpt-5-mini", 0.25, 0.25, 0.025, 2.0),
    ("gpt-5-nano", 0.05, 0.05, 0.005, 0.4),
    ("gpt-5", 1.25, 1.25, 0.125, 10.0),
    ("gemini-2.5-pro", 1.25, 1.25, 0.125, 10.0),
    ("gemini-2.5-flash", 0.3, 0.3, 0.03, 2.5),
    ("gemini-3-flash", 0.5, 0.5, 0.05, 3.0),
    ("gemini-3.1-pro", 2.0, 2.0, 0.2, 12.0),
    ("gemini-3.1-flash-lite", 0.25, 0.25, 0.025, 1.5),
    ("gemini-3.5-flash-lite", 0.3, 0.3, 0.03, 2.5),
    ("gemini-3.6-flash", 0.75, 0.75, 0.075, 3.75),
    ("gemini-3.8-flash", 0.75, 0.75, 0.075, 3.75),
    ("gemini-4-argon", 2.0, 2.0, 0.1, 10.0),
];

pub fn px(a: &Ax, md: &str) -> Option<[f64; 4]> {
    if crate::routing::is_opencode(md) { return Some([0.0; 4]); }
    let (p, m) = parse(md);
    if p == "ollama" {
        return Some([0.0; 4]);
    }
    let m = m.trim_start_matches("models/").to_lowercase();
    let o = &a.set()["px"];
    if let Some(v) = o[&m].as_array() {
        let x: Vec<f64> = v.iter().filter_map(|x| x.as_f64()).collect();
        if x.len() == 2 {
            return Some([x[0], x[0], x[0], x[1]]);
        }
        if x.len() == 4 {
            return Some([x[0], x[1], x[2], x[3]]);
        }
    }
    PX.iter().filter(|x| m.starts_with(x.0)).max_by_key(|x| x.0.len()).map(|x| [x.1, x.2, x.3, x.4])
}

pub fn pv(id: &str) -> Option<&'static Pv> {
    PV.iter().find(|p| p.id == id)
}

pub fn parse(md: &str) -> (&'static str, String) {
    if let Some((p, m)) = md.split_once(':') {
        if let Some(x) = pv(p) {
            return (x.id, m.to_string());
        }
    }
    ("cc", md.to_string())
}

pub fn base(a: &Ax, id: &str) -> String {
    let b = a.set()["prov"][id]["base"].as_str().unwrap_or("").trim().trim_end_matches('/').to_string();
    if b.is_empty() {
        pv(id).map(|p| p.base.to_string()).unwrap_or_default()
    } else {
        b
    }
}

pub fn name(md: &str) -> String {
    let (p, m) = parse(md);
    match p {
        "codex" if m.is_empty() => "Codex CLI".into(),
        "cc" | "anthropic" => crate::ai::mname(&m),
        _ => {
            let s = m.rsplit('/').next().unwrap_or(&m);
            s.split('-').map(|w| if w.len() <= 3 && w.chars().all(|c| c.is_ascii_alphabetic()) { w.to_uppercase() } else { let mut c = w.chars(); c.next().map(|f| f.to_uppercase().collect::<String>() + c.as_str()).unwrap_or_default() }).collect::<Vec<_>>().join("-")
        }
    }
}

pub fn mail(md: &str) -> &'static str {
    match parse(md).0 {
        "cc" | "anthropic" => "noreply@anthropic.com",
        "codex" | "openai" => "noreply@openai.com",
        "gemini" => "noreply@google.com",
        "nvidia" => "noreply@nvidia.com",
        "mistral" => "noreply@mistral.ai",
        "groq" => "noreply@groq.com",
        _ => "noreply@ollama.com",
    }
}

pub fn status(a: &Ax) -> Value {
    PV.iter()
        .map(|p| json!({"id": p.id, "nm": p.nm, "key": p.key, "has": !p.key || crate::vault::has(a, p.id), "tok": p.id == "cc" && crate::vault::has(a, "cc"), "base": base(a, p.id), "dbase": p.base, "ms": p.ms, "cli": p.fmt == "cli"}))
        .collect()
}

async fn hget(a: &Ax, u: &str, h: Vec<(&str, String)>) -> Result<Value, String> {
    let mut q = a.hc.get(u).timeout(Duration::from_secs(20));
    for (k, v) in h {
        if !v.is_empty() {
            q = q.header(k, v);
        }
    }
    let r = q.send().await.map_err(|e| e.to_string())?;
    let st = r.status().as_u16();
    let t = r.text().await.unwrap_or_default();
    if st >= 400 {
        return Err(format!("HTTP {st}: {}", crate::sh::head(&t, 200)));
    }
    serde_json::from_str(&t).map_err(|e| e.to_string())
}

pub fn hdr(a: &Ax, id: &str) -> Result<Vec<(&'static str, String)>, String> {
    let k = if pv(id).map(|p| p.key).unwrap_or(false) { crate::vault::get(a, id)? } else { String::new() };
    if pv(id).map(|p| p.key).unwrap_or(false) && k.is_empty() {
        return Err(format!("no API key for {} yet, add it in Settings", pv(id).map(|p| p.nm).unwrap_or(id)));
    }
    Ok(if id == "anthropic" { vec![("x-api-key", k), ("anthropic-version", "2023-06-01".into())] } else { vec![("authorization", if k.is_empty() { String::new() } else { format!("Bearer {k}") })] })
}

pub async fn models(a: &Ax, id: &str) -> Result<Vec<String>, String> {
    let Some(p) = pv(id) else { return Err("unknown provider".into()) };
    if id == "opencode" { return Ok(p.ms.iter().map(|m| m.to_string()).collect()); }
    if id == "codex" {
        let h = std::env::var_os("CODEX_HOME").map(std::path::PathBuf::from).or_else(|| dirs::home_dir().map(|d| d.join(".codex"))).unwrap_or_default();
        let v: Value = std::fs::read_to_string(h.join("models_cache.json")).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(Value::Null);
        let mut ms: Vec<(i64, String)> = v["models"].as_array().cloned().unwrap_or_default().iter().filter(|m| m["visibility"] == "list").filter_map(|m| m["slug"].as_str().map(|s| (m["priority"].as_i64().unwrap_or(99), s.to_string()))).collect();
        ms.sort();
        if !ms.is_empty() {
            return Ok(ms.into_iter().map(|x| x.1).collect());
        }
    }
    if p.fmt == "cli" {
        return Ok(p.ms.iter().map(|s| s.to_string()).collect());
    }
    let h = hdr(a, id)?;
    let b = base(a, id);
    if p.fmt == "ollama" {
        let v = hget(a, &format!("{b}/api/tags"), h).await?;
        return Ok(v["models"].as_array().cloned().unwrap_or_default().iter().filter_map(|m| m["name"].as_str().map(String::from)).collect());
    }
    let u = if p.fmt == "anthropic" { format!("{b}/v1/models?limit=100") } else { format!("{b}/models") };
    let v = hget(a, &u, h).await?;
    let mut o: Vec<String> = v["data"].as_array().cloned().unwrap_or_default().iter().filter_map(|m| m["id"].as_str().map(|s| s.trim_start_matches("models/").to_string())).collect();
    if id == "openai" {
        o.retain(|m| m.starts_with("gpt") || m.starts_with('o'));
    }
    o.sort();
    o.dedup();
    Ok(o)
}

pub async fn test(a: &Ax, md: &str) -> R<String> {
    let t0 = std::time::Instant::now();
    let o = crate::ai::Ask { t: 180, ..crate::ai::Ask::new("test", md.to_string(), "Answer with exactly one word.".into(), "Say: ready".into()) };
    let (t, _) = crate::ai::ask1(a, o).await?;
    if t.trim().is_empty() {
        return Err(X::E("empty answer".into()));
    }
    Ok(format!("{} ({:.1} s)", crate::sh::head(t.trim(), 60), t0.elapsed().as_secs_f64()))
}

#[cfg(test)]
mod t {
    use super::*;

    #[test]
    fn parsing() {
        assert_eq!(parse("claude-haiku-5-5"), ("cc", "claude-haiku-5-5".into()));
        assert_eq!(parse("ollama:qwen3:14b"), ("ollama", "qwen3:14b".into()));
        assert_eq!(parse("openai:gpt-5.5"), ("openai", "gpt-5.5".into()));
        assert_eq!(parse("nope:x"), ("cc", "nope:x".into()));
        assert_eq!(name("openai:gpt-5.5"), "GPT-5.5");
        assert_eq!(name("codex:"), "Codex CLI");
        assert_eq!(name("gemini:gemini-2.5-flash"), "Gemini-2.5-Flash");
        assert_eq!(name("anthropic:claude-sonnet-5-5"), "Claude Sonnet 5.5");
        assert_eq!(mail("codex:gpt-5.5"), "noreply@openai.com");
        let m = |k: &str| PX.iter().filter(|x| k.starts_with(x.0)).max_by_key(|x| x.0.len()).map(|x| x.0);
        assert_eq!(m("claude-opus-5-5"), Some("claude-opus-5-5"));
        assert_eq!(m("claude-opus-4-1-20250805"), Some("claude-opus-4"));
        assert_eq!(m("gpt-5.4-mini-2026"), Some("gpt-5.4-mini"));
        assert_eq!(m("gpt-5"), Some("gpt-5"));
    }
}
