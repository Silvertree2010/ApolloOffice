use crate::cfg::Ax;
use crate::tools::Rc;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

fn reg_map() -> &'static Mutex<HashMap<String, Rc>> {
    static M: OnceLock<Mutex<HashMap<String, Rc>>> = OnceLock::new();
    M.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn reg(t: String, rc: Rc) {
    reg_map().lock().unwrap().insert(t, rc);
}

pub fn unreg(t: &str) {
    reg_map().lock().unwrap().remove(t);
}

pub fn get(t: &str) -> Option<Rc> {
    reg_map().lock().unwrap().get(t).cloned()
}

pub async fn handle(a: &Ax, t: &str, m: &Value) -> Value {
    let id = m["id"].clone();
    let Some(rc) = get(t) else { return json!({"jsonrpc": "2.0", "id": id, "error": {"code": -32001, "message": "run is over"}}) };
    match m["method"].as_str().unwrap_or("") {
        "initialize" => json!({"jsonrpc": "2.0", "id": id, "result": {"protocolVersion": m["params"]["protocolVersion"].as_str().unwrap_or("2025-06-18"), "capabilities": {"tools": {}}, "serverInfo": {"name": "office", "version": crate::cfg::V}}}),
        "tools/list" => {
            let t: Vec<Value> = crate::tools::defs(a, &rc).into_iter().map(|(n, d, s)| json!({"name": n, "description": d, "inputSchema": s})).collect();
            json!({"jsonrpc": "2.0", "id": id, "result": {"tools": t}})
        }
        "tools/call" => {
            let n = m["params"]["name"].as_str().unwrap_or("");
            let args = if m["params"]["arguments"].is_object() { m["params"]["arguments"].clone() } else { json!({}) };
            match crate::tools::call(a, &rc, n, &args).await {
                Ok(r) => json!({"jsonrpc": "2.0", "id": id, "result": {"content": [{"type": "text", "text": crate::sh::head(&r, 100_000)}]}}),
                Err(e) => json!({"jsonrpc": "2.0", "id": id, "result": {"content": [{"type": "text", "text": format!("error: {e}")}], "isError": true}}),
            }
        }
        "ping" => json!({"jsonrpc": "2.0", "id": id, "result": {}}),
        _ => json!({"jsonrpc": "2.0", "id": id, "error": {"code": -32601, "message": "method not found"}}),
    }
}

pub async fn bridge(port: u16, t: String) {
    let c = reqwest::Client::builder().no_proxy().timeout(std::time::Duration::from_secs(4 * 3600)).build().unwrap();
    let mut l = BufReader::new(tokio::io::stdin()).lines();
    let mut out = tokio::io::stdout();
    while let Ok(Some(ln)) = l.next_line().await {
        let Ok(m) = serde_json::from_str::<Value>(&ln) else { continue };
        if m["id"].is_null() {
            continue;
        }
        let c = c.clone();
        let t = t.clone();
        let r = match c.post(format!("http://127.0.0.1:{port}/int/mcp")).header("x-run", &t).json(&m).send().await {
            Ok(r) => r.json::<Value>().await.unwrap_or_else(|e| json!({"jsonrpc": "2.0", "id": m["id"], "error": {"code": -32000, "message": e.to_string()}})),
            Err(e) => json!({"jsonrpc": "2.0", "id": m["id"], "error": {"code": -32000, "message": e.to_string()}}),
        };
        let _ = out.write_all(format!("{r}\n").as_bytes()).await;
        let _ = out.flush().await;
    }
}
