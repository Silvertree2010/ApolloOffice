use crate::cfg::Ax;
use crate::tools::Rc;
use rquickjs::{CatchResultExt, Context, Function, Runtime};
use serde_json::{json, Value};
use std::time::{Duration, Instant};

const PRE: &str = r#"
const __c = (n, a) => { const r = JSON.parse(__call(n, JSON.stringify(a || {}))); if (r.e !== undefined) throw new Error(r.e); return r.ok; };
const ctx = Object.freeze({
  read: (path) => __c("read", { path, n: 3000 }).split("\n").map((l) => l.replace(/^\s*\d+\t/, "")).join("\n"),
  write: (path, text) => __c("write", { path, text: String(text) }),
  ls: (path) => __c("ls", { path: path || "." }).split("\n"),
  exists: (path) => __c("exists", { path }) === "true",
  grep: (pattern, path) => __c("grep", { pattern, path }),
  sh: (cmd, o) => { const t = __c("sh", { cmd, min: (o && o.min) || 20 }); const m = t.match(/\n\[exit (-?\d+)\]$/); return { c: m ? Number(m[1]) : -1, o: m ? t.slice(0, m.index) : t }; },
  fetch: (url, o) => { const t = __c("web", Object.assign({ url }, o || {})); const m = t.match(/^status (\d+)\n/); return { status: m ? Number(m[1]) : 0, text: m ? t.slice(m[0].length) : t }; },
  deliver: (name, text) => __c("deliver", { name, text: String(text) }),
  log: (s) => __c("log", { m: String(s) }),
});
"#;

const OK: &[&str] = &["read", "write", "ls", "exists", "grep", "sh", "web", "deliver", "log"];

pub async fn run(a: Ax, rc: Rc, src: String, entry: &'static str, arg: Value) -> Result<String, String> {
    let h = tokio::runtime::Handle::current();
    tokio::task::spawn_blocking(move || exec(h, a, rc, &src, entry, arg)).await.map_err(|e| e.to_string())?
}

fn exec(h: tokio::runtime::Handle, a: Ax, rc: Rc, src: &str, entry: &str, arg: Value) -> Result<String, String> {
    let rt = Runtime::new().map_err(|e| e.to_string())?;
    rt.set_memory_limit(64 << 20);
    rt.set_max_stack_size(1 << 20);
    let dl = Instant::now() + Duration::from_secs(10 * 60);
    rt.set_interrupt_handler(Some(Box::new(move || Instant::now() > dl)));
    let cx = Context::full(&rt).map_err(|e| e.to_string())?;
    cx.with(|c| -> Result<String, String> {
        let (a2, rc2, h2) = (a.clone(), rc.clone(), h.clone());
        let f = Function::new(c.clone(), move |n: String, x: String| -> String {
            if !OK.contains(&n.as_str()) {
                return json!({"e": "not allowed"}).to_string();
            }
            let v: Value = serde_json::from_str(&x).unwrap_or(json!({}));
            if n == "log" {
                a2.say(rc2.wk, v["m"].as_str().unwrap_or(""), Some(rc2.tk));
                return json!({"ok": ""}).to_string();
            }
            match h2.block_on(crate::tools::raw(&a2, &rc2, &n, &v)) {
                Ok(s) => json!({"ok": s}).to_string(),
                Err(e) => json!({"e": e}).to_string(),
            }
        })
        .map_err(|e| e.to_string())?;
        c.globals().set("__call", f).map_err(|e| e.to_string())?;
        c.eval::<(), _>(PRE).catch(&c).map_err(|e| e.to_string())?;
        c.eval::<(), _>(src).catch(&c).map_err(|e| format!("error in script: {e}"))?;
        let call = format!("(() => {{ if (typeof {entry} !== 'function') throw new Error('function {entry}(args, ctx) is missing'); const r = {entry}(JSON.parse({}), ctx); return typeof r === 'string' ? r : JSON.stringify(r === undefined ? null : r); }})()", json!(arg.to_string()));
        c.eval::<String, _>(call).catch(&c).map_err(|e| format!("error in script: {e}"))
    })
}

pub async fn check(a: &Ax, rc: &Rc, src: &str, res: &str) -> Result<(bool, String), String> {
    let r = run(a.clone(), rc.clone(), src.to_string(), "check", json!({"result": res, "task": rc.tk})).await?;
    let v: Value = serde_json::from_str(&r).unwrap_or(json!({}));
    Ok((v["ok"].as_bool().unwrap_or(false), v["why"].as_str().unwrap_or("").to_string()))
}
