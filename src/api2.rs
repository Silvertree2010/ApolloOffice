use crate::app::Ax;
use crate::db::now;
use serde_json::{json, Map, Value};

type Res = Result<Value, (u16, String)>;

pub struct T {
    pub n: &'static str,
    pub m: &'static str,
    pub p: &'static str,
    pub w: bool,
    pub d: &'static str,
    pub a: &'static [(&'static str, &'static str, &'static str, bool)],
}

pub const TOOLS: &[T] = &[
    T { n: "office_status", m: "GET", p: "/status", w: false, d: "Overview: office state, job counts, workers and what each is doing.", a: &[] },
    T { n: "office_pause", m: "POST", p: "/office/pause", w: true, d: "Pause or resume the whole office.", a: &[("on", "boolean", "true pauses, false resumes", true)] },
    T { n: "list_workers", m: "GET", p: "/workers", w: false, d: "All workers with state, current job, model and token use.", a: &[] },
    T { n: "hold_worker", m: "POST", p: "/workers/{w}/hold", w: true, d: "Pause or resume one worker.", a: &[("w", "string", "worker key, e.g. fixer or x:security", true), ("on", "boolean", "true pauses", true)] },
    T { n: "list_jobs", m: "GET", p: "/jobs", w: false, d: "Jobs, newest first. Filter by state, repository or kind.", a: &[("st", "string", "state: vet, ready, repro, fix, ci, review, approve, submit, done, drop, park", false), ("repo", "string", "owner/name", false), ("kind", "string", "fix, hunt, rebase, review", false), ("limit", "integer", "1-200, default 50", false), ("before", "integer", "only jobs with a smaller id (paging)", false)] },
    T { n: "get_job", m: "GET", p: "/jobs/{id}", w: false, d: "One job with its diff, proof, cost and log.", a: &[("id", "integer", "job id", true)] },
    T { n: "create_job", m: "POST", p: "/jobs", w: true, d: "Report a bug as a new job (like Sentry or a failed CI run would).", a: &[("repo", "string", "owner/name", true), ("title", "string", "short title", true), ("body", "string", "what happened, steps, stack trace", true), ("src", "string", "where it comes from, e.g. my-agent", false)] },
    T { n: "drop_job", m: "POST", p: "/jobs/{id}/drop", w: true, d: "Drop a job.", a: &[("id", "integer", "job id", true)] },
    T { n: "approve_job", m: "POST", p: "/jobs/{id}/approve", w: true, d: "Approve a job that waits for approval, so its pull request is submitted.", a: &[("id", "integer", "job id", true)] },
    T { n: "requeue_job", m: "POST", p: "/jobs/{id}/requeue", w: true, d: "Put a dropped job back into the queue.", a: &[("id", "integer", "job id", true)] },
    T { n: "list_repos", m: "GET", p: "/repos", w: false, d: "Repositories with settings and 14-day numbers.", a: &[] },
    T { n: "add_repo", m: "POST", p: "/repos", w: true, d: "Add a GitHub repository.", a: &[("full", "string", "owner/name or GitHub link", true)] },
    T { n: "update_repo", m: "PATCH", p: "/repos/{owner}/{name}", w: true, d: "Change repository settings (on_, iss, hunt, feat, mode, ci, setup, skl, rules, maxo, maxd, usd).", a: &[("owner", "string", "owner", true), ("name", "string", "name", true), ("set", "object", "fields to change", true)] },
    T { n: "remove_repo", m: "DELETE", p: "/repos/{owner}/{name}", w: true, d: "Remove a repository.", a: &[("owner", "string", "owner", true), ("name", "string", "name", true)] },
    T { n: "list_prs", m: "GET", p: "/prs", w: false, d: "Pull requests the office opened.", a: &[("st", "string", "open, merged or closed", false), ("repo", "string", "owner/name", false), ("limit", "integer", "1-200", false)] },
    T { n: "costs", m: "GET", p: "/costs", w: false, d: "Costs and tokens by day, worker, model and repository.", a: &[] },
    T { n: "events", m: "GET", p: "/events", w: false, d: "Log lines, newest first.", a: &[("since", "integer", "only events after this unix time in ms", false), ("w", "string", "only this worker", false), ("job", "integer", "only this job", false), ("limit", "integer", "1-500", false)] },
    T { n: "list_hosts", m: "GET", p: "/hosts", w: false, d: "Build machines and whether they are online.", a: &[] },
    T { n: "get_settings", m: "GET", p: "/settings", w: false, d: "Office settings.", a: &[] },
    T { n: "update_settings", m: "PATCH", p: "/settings", w: true, d: "Change office settings (models per worker in md, hunters, pipe, office, notifications).", a: &[("set", "object", "fields to change", true)] },
    T { n: "list_flows", m: "GET", p: "/flows", w: false, d: "Pipelines (graphs of triggers, workers and checks) and the hired team.", a: &[] },
    T { n: "save_flows", m: "PUT", p: "/flows", w: true, d: "Replace pipelines and/or the team. Send flows and/or crew.", a: &[("flows", "array", "pipelines", false), ("crew", "array", "team members", false)] },
    T { n: "run_flow", m: "POST", p: "/flows/{id}/run", w: true, d: "Start a pipeline now. The input is passed to every step.", a: &[("id", "string", "pipeline id", true), ("input", "object", "data for the steps, e.g. {\"text\": \"...\"}", false)] },
    T { n: "list_runs", m: "GET", p: "/runs", w: false, d: "Pipeline runs, newest first.", a: &[("flow", "string", "only this pipeline", false), ("st", "string", "queued, run, wait, done, fail or stop", false), ("limit", "integer", "1-200", false)] },
    T { n: "get_run", m: "GET", p: "/runs/{id}", w: false, d: "One run with the output of every step.", a: &[("id", "integer", "run id", true)] },
    T { n: "answer_run", m: "POST", p: "/runs/{id}/answer", w: true, d: "Answer an Approval step of a waiting run.", a: &[("id", "integer", "run id", true), ("yes", "boolean", "true continues on yes, false on no", true)] },
    T { n: "stop_run", m: "POST", p: "/runs/{id}/stop", w: true, d: "Stop a run.", a: &[("id", "integer", "run id", true)] },
    T { n: "list_roles", m: "GET", p: "/roles", w: false, d: "Roles you can hire, with their default instructions.", a: &[] },
    T { n: "hire", m: "POST", p: "/crew", w: true, d: "Hire a team member, from a role or custom.", a: &[("role", "string", "role id from list_roles", false), ("n", "string", "name", false), ("p", "string", "instructions", false), ("md", "string", "model", false), ("tl", "array", "tools: shell, files, github, web", false)] },
    T { n: "fire", m: "DELETE", p: "/crew/{id}", w: true, d: "Let a team member go.", a: &[("id", "string", "crew id", true)] },
    T { n: "get_office", m: "GET", p: "/office", w: false, d: "Office look: floor, wall, room size and furniture.", a: &[] },
    T { n: "save_office", m: "PUT", p: "/office", w: true, d: "Change the office look. Send floor, wall, size and/or items.", a: &[("floor", "object", "{p, a, b}", false), ("wall", "object", "{p, a, b}", false), ("size", "object", "{w, h}", false), ("items", "array", "[{i, x, y}]", false)] },
];

fn th(t: &str) -> String {
    use sha2::{Digest, Sha256};
    hex::encode(Sha256::digest(t.as_bytes()))
}

pub fn toks(a: &Ax) -> Vec<Value> {
    a.db.kg("toks").as_array().cloned().unwrap_or_default()
}

pub fn auth(a: &Ax, bearer: &str) -> Option<bool> {
    let t = bearer.trim();
    if t.len() < 20 {
        return None;
    }
    let h = th(t);
    let mut ts = toks(a);
    if let Some(x) = ts.iter_mut().find(|x| x["h"].as_str() == Some(&h)) {
        x["last"] = json!(now());
        let w = x["sc"] == "write";
        a.db.ks("toks", &json!(ts));
        return Some(w);
    }
    None
}

pub fn tok_op(a: &Ax, b: &Value) -> Value {
    let mut ts = toks(a);
    match b["op"].as_str().unwrap_or("") {
        "new" => {
            let t = format!("ao_{}", hex::encode(rand::random::<[u8; 24]>()));
            let n: String = b["n"].as_str().unwrap_or("").trim().chars().take(40).collect();
            let id = hex::encode(rand::random::<[u8; 6]>());
            ts.push(json!({"id": id, "n": if n.is_empty() { "Token".into() } else { n }, "sc": if b["sc"] == "read" { "read" } else { "write" }, "h": th(&t), "t0": now(), "last": null}));
            a.db.ks("toks", &json!(ts));
            return json!({"token": t, "toks": list(a)});
        }
        "del" => {
            ts.retain(|x| x["id"] != b["id"]);
            a.db.ks("toks", &json!(ts));
        }
        _ => {}
    }
    json!({"toks": list(a)})
}

pub fn list(a: &Ax) -> Vec<Value> {
    toks(a).into_iter().map(|x| json!({"id": x["id"], "n": x["n"], "sc": x["sc"], "t0": x["t0"], "last": x["last"]})).collect()
}

fn qn(q: &Map<String, Value>, k: &str, d: i64, lo: i64, hi: i64) -> i64 {
    q.get(k).and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(d).clamp(lo, hi)
}

fn qs(q: &Map<String, Value>, k: &str) -> Option<String> {
    q.get(k).and_then(|v| v.as_str().map(String::from).or_else(|| (!v.is_null()).then(|| v.to_string()))).filter(|s| !s.is_empty())
}

async fn int(a: &Ax, m: &str, p: &str, q: &str, b: Value) -> Res {
    let (c, v) = crate::web::ij(a, m, p, q, b).await;
    if c >= 400 {
        return Err((c, v["error"].as_str().map(String::from).unwrap_or_else(|| v.to_string())));
    }
    Ok(v)
}

pub async fn run(a: &Ax, m: &str, path: &str, q: &Map<String, Value>, b: Value, wr: bool) -> Res {
    let s: Vec<&str> = path.trim_matches('/').split('/').filter(|x| !x.is_empty()).collect();
    if m != "GET" && !wr {
        return Err((403, "this token can only read".into()));
    }
    let id = |i: usize| s.get(i).and_then(|x| x.parse::<i64>().ok()).ok_or((400u16, "bad id".to_string()));
    match (m, s.as_slice()) {
        ("GET", ["status"]) => {
            let st = crate::web::state_v(a);
            let w: Map<String, Value> = st["w"].as_object().cloned().unwrap_or_default().into_iter().map(|(k, v)| (k, json!({"st": v["st"], "say": v["say"], "job": v["job"], "md": v["md"], "hold": v["hold"], "nm": v["nm"]}))).collect();
            Ok(json!({"version": crate::app::V, "office": st["o"], "counts": st["n"], "workers": w, "queue": st["q"].as_array().map(|x| x.len()).unwrap_or(0)}))
        }
        ("POST", ["office", "pause"]) => int(a, "POST", "/api/act", "", json!({"a": "pause", "on": b["on"].as_bool().unwrap_or(true)})).await.map(|_| json!({"ok": true})),
        ("GET", ["workers"]) => Ok(crate::web::state_v(a)["w"].clone()),
        ("POST", ["workers", w, "hold"]) => int(a, "POST", "/api/act", "", json!({"a": "hold", "w": w, "on": b["on"].as_bool().unwrap_or(true)})).await.map(|_| json!({"ok": true})),
        ("GET", ["jobs"]) => {
            let mut sql = "select id, repo, num, kind, title, url, st, why, pr, t0, t1 from jobs where 1=1".to_string();
            let mut ps: crate::db::P = vec![];
            for (k, c) in [("st", "st"), ("repo", "repo"), ("kind", "kind")] {
                if let Some(v) = qs(q, k) {
                    sql += &format!(" and {c}=?");
                    ps.push(Box::new(v));
                }
            }
            if q.contains_key("before") {
                sql += " and id<?";
                ps.push(Box::new(qn(q, "before", i64::MAX, 0, i64::MAX)));
            }
            sql += &format!(" order by id desc limit {}", qn(q, "limit", 50, 1, 200));
            Ok(json!(a.db.all(&sql, ps)))
        }
        ("GET", ["jobs", _]) => int(a, "GET", "/api/job", &format!("id={}", id(1)?), json!({})).await,
        ("POST", ["jobs"]) => crate::web::rep_v(a, &json!({"repo": b["repo"], "title": b["title"], "body": b["body"], "src": b["src"].as_str().unwrap_or("api")})),
        ("POST", ["jobs", _, op]) if ["drop", "approve", "requeue"].contains(op) => int(a, "POST", "/api/act", "", json!({"a": op, "id": id(1)?})).await.map(|_| json!({"ok": true})),
        ("GET", ["repos"]) => Ok(crate::web::cfg_v(a)["repos"].clone()),
        ("POST", ["repos"]) => int(a, "POST", "/api/repo", "", json!({"op": "add", "full": b["full"]})).await,
        ("PATCH", ["repos", o, n]) => {
            let mut x = if b["set"].is_object() { b["set"].clone() } else { b.clone() };
            x["op"] = json!("set");
            x["full"] = json!(format!("{o}/{n}"));
            int(a, "POST", "/api/repo", "", x).await
        }
        ("DELETE", ["repos", o, n]) => int(a, "POST", "/api/repo", "", json!({"op": "del", "full": format!("{o}/{n}")})).await,
        ("GET", ["prs"]) => {
            let mut sql = "select * from prs where 1=1".to_string();
            let mut ps: crate::db::P = vec![];
            for k in ["st", "repo"] {
                if let Some(v) = qs(q, k) {
                    sql += &format!(" and {k}=?");
                    ps.push(Box::new(v));
                }
            }
            sql += &format!(" order by t0 desc limit {}", qn(q, "limit", 50, 1, 200));
            Ok(json!(a.db.all(&sql, ps)))
        }
        ("GET", ["costs"]) => Ok(crate::web::costs_v(a)),
        ("GET", ["events"]) => {
            let mut sql = "select id, t, w, j, m from ev where t>?".to_string();
            let mut ps: crate::db::P = vec![Box::new(qn(q, "since", 0, 0, i64::MAX))];
            if let Some(w) = qs(q, "w") {
                sql += " and w=?";
                ps.push(Box::new(w));
            }
            if q.contains_key("job") {
                sql += " and j=?";
                ps.push(Box::new(qn(q, "job", 0, 0, i64::MAX)));
            }
            sql += &format!(" order by id desc limit {}", qn(q, "limit", 100, 1, 500));
            Ok(json!(a.db.all(&sql, ps)))
        }
        ("GET", ["hosts"]) => Ok(json!(crate::web::cfg_v(a)["hosts"].as_array().cloned().unwrap_or_default().into_iter().map(|mut h| { if let Some(o) = h.as_object_mut() { o.remove("ssh"); } h }).collect::<Vec<_>>())),
        ("GET", ["settings"]) => Ok(a.set()),
        ("PATCH", ["settings"]) => int(a, "POST", "/api/set", "", if b["set"].is_object() { b["set"].clone() } else { b }).await.map(|c| c["set"].clone()),
        ("GET", ["flows"]) => { let mut v = crate::flows::get(a); if let Some(o) = v.as_object_mut() { o.remove("xc"); } Ok(v) }
        ("PUT", ["flows"]) => Ok(crate::flows::put(a, &b)),
        ("POST", ["flows", fid, "run"]) => crate::eng::start(a, fid, None, if b["input"].is_null() { json!({}) } else { b["input"].clone() }).map(|id| json!({"run": id})).map_err(|e| (400, e)),
        ("GET", ["runs"]) => Ok(json!(crate::eng::list(a, qs(q, "flow").as_deref(), qs(q, "st").as_deref(), qn(q, "limit", 50, 1, 200)))),
        ("GET", ["runs", _]) => crate::eng::get(a, id(1)?).ok_or((404, "no such run".into())),
        ("POST", ["runs", _, "answer"]) => crate::eng::answer(a, id(1)?, b["yes"].as_bool().unwrap_or(false)).map(|_| json!({"ok": true})).map_err(|e| (400, e)),
        ("POST", ["runs", _, "stop"]) => crate::eng::stop(a, id(1)?).map(|_| json!({"ok": true})).map_err(|e| (400, e)),
        ("GET", ["roles"]) => Ok(json!(crate::flows::roles(a))),
        ("POST", ["crew"]) => {
            let r = b["role"].as_str().and_then(|t| crate::flows::roles(a).into_iter().find(|x| x["t"] == t));
            let n = b["n"].as_str().map(String::from).or_else(|| r.as_ref().and_then(|x| x["n"].as_str().map(String::from))).ok_or((400u16, "need a name (n) or a role".to_string()))?;
            let mut cw = crate::flows::get(a)["crew"].as_array().cloned().unwrap_or_default();
            let base: String = n.to_lowercase().chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect::<String>().trim_matches('-').chars().take(20).collect();
            let base = if base.is_empty() { "w".to_string() } else { base };
            let mut k = 1;
            while cw.iter().any(|x| x["id"] == format!("{base}-{k}")) {
                k += 1;
            }
            let pick = |f: &str| b[f].clone().as_str().map(|s| json!(s)).or_else(|| r.as_ref().map(|x| x[f].clone())).unwrap_or(json!(""));
            let w = json!({"id": format!("{base}-{k}"), "n": n, "r": r.as_ref().map(|x| x["n"].clone()).unwrap_or(json!("")), "p": pick("p"), "md": pick("md"), "tl": if b["tl"].is_array() { b["tl"].clone() } else { r.as_ref().map(|x| x["tl"].clone()).unwrap_or(json!([])) }});
            cw.push(w.clone());
            let out = crate::flows::put(a, &json!({"crew": cw}));
            out["crew"].as_array().and_then(|c| c.iter().find(|x| x["id"] == w["id"]).cloned()).ok_or((400, "invalid team member".into()))
        }
        ("DELETE", ["crew", cid]) => {
            let mut cw = crate::flows::get(a)["crew"].as_array().cloned().unwrap_or_default();
            let n = cw.len();
            cw.retain(|x| x["id"] != *cid);
            if cw.len() == n {
                return Err((404, "no such team member".into()));
            }
            crate::flows::put(a, &json!({"crew": cw}));
            Ok(json!({"ok": true}))
        }
        ("GET", ["office"]) => Ok(a.set()["office"].clone()),
        ("PUT", ["office"]) => int(a, "POST", "/api/set", "", json!({"office": b})).await.map(|c| c["set"]["office"].clone()),
        ("GET", ["openapi.json"]) => Ok(openapi()),
        _ => Err((404, "unknown endpoint, see /v2/openapi.json".into())),
    }
}

fn schema(t: &T) -> Value {
    let mut pr = Map::new();
    let mut rq = vec![];
    for (n, ty, d, r) in t.a {
        let mut s = json!({"type": ty, "description": d});
        if *ty == "array" {
            s["items"] = json!({});
        }
        pr.insert(n.to_string(), s);
        if *r {
            rq.push(json!(n));
        }
    }
    json!({"type": "object", "properties": pr, "required": rq})
}

pub fn openapi() -> Value {
    let mut ps = Map::new();
    for t in TOOLS {
        let path = format!("/v2{}", t.p);
        let pv: Vec<&str> = t.p.split('/').filter(|x| x.starts_with('{')).map(|x| x.trim_matches(|c| c == '{' || c == '}')).collect();
        let params: Vec<Value> = t.a.iter().filter(|(n, ..)| pv.contains(n) || t.m == "GET").map(|(n, ty, d, r)| json!({"name": n, "in": if pv.contains(n) { "path" } else { "query" }, "required": pv.contains(n) || *r, "description": d, "schema": {"type": ty}})).collect();
        let mut op = json!({"operationId": t.n, "summary": t.d, "parameters": params, "responses": {"200": {"description": "OK"}, "401": {"description": "missing or wrong token"}, "403": {"description": "read-only token"}}, "security": [{"bearer": []}]});
        if t.m != "GET" && t.m != "DELETE" {
            let mut s = schema(t);
            if let Some(o) = s["properties"].as_object_mut() {
                for p in &pv {
                    o.remove(*p);
                }
            }
            op["requestBody"] = json!({"content": {"application/json": {"schema": s}}});
        }
        ps.entry(path).or_insert_with(|| json!({}))[t.m.to_lowercase()] = op;
    }
    json!({"openapi": "3.1.0", "info": {"title": "ApolloOffice API", "version": crate::app::V}, "servers": [{"url": "/"}], "components": {"securitySchemes": {"bearer": {"type": "http", "scheme": "bearer"}}}, "paths": ps})
}

fn path(t: &T, g: &Value) -> Result<String, String> {
    let mut out = String::new();
    for seg in t.p.split('/').filter(|x| !x.is_empty()) {
        out.push('/');
        if let Some(k) = seg.strip_prefix('{').and_then(|x| x.strip_suffix('}')) {
            let v = match &g[k] {
                Value::String(s) => s.clone(),
                Value::Number(n) => n.to_string(),
                _ => return Err(format!("missing {k}")),
            };
            if v.is_empty() || v.contains('/') || v.contains("..") {
                return Err(format!("bad {k}"));
            }
            out.push_str(&v);
        } else {
            out.push_str(seg);
        }
    }
    Ok(out)
}

pub async fn mcp(a: &Ax, m: &Value, wr: bool) -> Value {
    let id = m["id"].clone();
    let ok = |r: Value| json!({"jsonrpc": "2.0", "id": id, "result": r});
    match m["method"].as_str().unwrap_or("") {
        "initialize" => ok(json!({"protocolVersion": m["params"]["protocolVersion"].as_str().unwrap_or("2025-06-18"), "capabilities": {"tools": {}}, "serverInfo": {"name": "apollo-office", "version": crate::app::V}, "instructions": "ApolloOffice runs AI workers that turn GitHub issues into verified pull requests and runs custom pipelines. Start with office_status. Writing tools need a write token."})),
        "tools/list" => ok(json!({"tools": TOOLS.iter().filter(|t| wr || !t.w).map(|t| json!({"name": t.n, "description": t.d, "inputSchema": schema(t), "annotations": {"readOnlyHint": !t.w, "destructiveHint": t.m == "DELETE" || t.n == "drop_job"}})).collect::<Vec<_>>()})),
        "tools/call" => {
            let n = m["params"]["name"].as_str().unwrap_or("");
            let g = if m["params"]["arguments"].is_object() { m["params"]["arguments"].clone() } else { json!({}) };
            let Some(t) = TOOLS.iter().find(|t| t.n == n) else { return json!({"jsonrpc": "2.0", "id": id, "error": {"code": -32602, "message": format!("unknown tool {n}")}}) };
            let r = match path(t, &g) {
                Err(e) => Err((400, e)),
                Ok(p) => {
                    let pv: Vec<&str> = t.p.split('/').filter(|x| x.starts_with('{')).map(|x| x.trim_matches(|c| c == '{' || c == '}')).collect();
                    let mut body = g.clone();
                    if let Some(o) = body.as_object_mut() {
                        for k in &pv {
                            o.remove(*k);
                        }
                    }
                    let q = if t.m == "GET" { body.as_object().cloned().unwrap_or_default() } else { Map::new() };
                    run(a, t.m, &p, &q, body, wr).await
                }
            };
            match r {
                Ok(v) => ok(json!({"content": [{"type": "text", "text": crate::sh::head(&serde_json::to_string_pretty(&v).unwrap_or_default(), 200_000)}], "structuredContent": if v.is_object() { v } else { json!({"result": v}) }})),
                Err((c, e)) => ok(json!({"content": [{"type": "text", "text": format!("error {c}: {e}")}], "isError": true})),
            }
        }
        "ping" => ok(json!({})),
        "notifications/initialized" => Value::Null,
        _ => json!({"jsonrpc": "2.0", "id": id, "error": {"code": -32601, "message": "method not found"}}),
    }
}

pub async fn stdio(port: u16, tok: String) {
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    let c = reqwest::Client::builder().no_proxy().timeout(std::time::Duration::from_secs(600)).build().unwrap();
    let mut l = BufReader::new(tokio::io::stdin()).lines();
    let mut out = tokio::io::stdout();
    while let Ok(Some(ln)) = l.next_line().await {
        let Ok(m) = serde_json::from_str::<Value>(&ln) else { continue };
        if m["id"].is_null() {
            continue;
        }
        let r = match c.post(format!("http://127.0.0.1:{port}/mcp")).bearer_auth(&tok).json(&m).send().await {
            Ok(r) if r.status().is_success() => r.json::<Value>().await.unwrap_or_else(|e| json!({"jsonrpc": "2.0", "id": m["id"], "error": {"code": -32000, "message": e.to_string()}})),
            Ok(r) => json!({"jsonrpc": "2.0", "id": m["id"], "error": {"code": -32001, "message": format!("ApolloOffice answered {}: check the token", r.status())}}),
            Err(e) => json!({"jsonrpc": "2.0", "id": m["id"], "error": {"code": -32000, "message": format!("ApolloOffice not reachable on port {port}: {e}")}}),
        };
        let _ = out.write_all(format!("{r}\n").as_bytes()).await;
        let _ = out.flush().await;
    }
}

#[cfg(test)]
mod t {
    use super::*;

    #[test]
    fn paths() {
        let t = TOOLS.iter().find(|t| t.n == "update_repo").unwrap();
        assert_eq!(path(t, &json!({"owner": "a", "name": "b"})).unwrap(), "/repos/a/b");
        assert!(path(t, &json!({"owner": "..", "name": "b"})).is_err());
        assert!(path(t, &json!({"owner": "a/b", "name": "c"})).is_err());
        assert!(path(t, &json!({"owner": "a"})).is_err());
        let o = openapi();
        assert!(o["paths"]["/v2/repos/{owner}/{name}"]["patch"].is_object());
        assert!(o["paths"]["/v2/jobs"]["get"].is_object() && o["paths"]["/v2/jobs"]["post"].is_object());
        let mut names: Vec<&str> = TOOLS.iter().map(|t| t.n).collect();
        names.sort();
        names.dedup();
        assert_eq!(names.len(), TOOLS.len());
    }
}
