use crate::cfg::Ax;
use crate::db::now;
use crate::pa;
use crate::tools::{accepts, cut_s, wk_by_name};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::{Mutex, OnceLock};

#[derive(Default)]
struct P {
    pid: u32,
    tok: String,
    up: bool,
    end: i64,
}

fn m() -> &'static Mutex<HashMap<i64, P>> {
    static M: OnceLock<Mutex<HashMap<i64, P>>> = OnceLock::new();
    M.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn up(w: i64) -> bool {
    m().lock().unwrap().get(&w).map(|p| p.up).unwrap_or(false)
}

fn who(t: &str) -> Option<i64> {
    if t.is_empty() {
        return None;
    }
    m().lock().unwrap().iter().find(|(_, p)| p.up && p.tok == t).map(|(w, _)| *w)
}

pub fn log(a: &Ax, w: i64) -> std::path::PathBuf {
    let d = a.dd.join("scripts");
    let _ = std::fs::create_dir_all(&d);
    d.join(format!("{w}.log"))
}

fn stop(w: i64) {
    let mut g = m().lock().unwrap();
    if let Some(p) = g.get_mut(&w) {
        if p.up && p.pid > 0 {
            #[cfg(unix)]
            {
                let _ = std::process::Command::new("kill").args(["-TERM", &format!("-{}", p.pid)]).stderr(Stdio::null()).status();
            }
            let pid = p.pid;
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(8));
                crate::sh::kill(pid);
            });
        }
        p.up = false;
        p.tok.clear();
    }
}

pub fn stop_all() {
    let ids: Vec<i64> = m().lock().unwrap().keys().cloned().collect();
    for w in ids {
        stop(w);
    }
}

fn start(a: &Ax, w: &Value) {
    let id = w["id"].as_i64().unwrap_or(0);
    let run = w["cfg"]["run"].as_str().unwrap_or("").to_string();
    let dir = std::path::PathBuf::from(w["cfg"]["dir"].as_str().unwrap_or(""));
    let lf = log(a, id);
    if std::fs::metadata(&lf).map(|x| x.len() > 20_000_000).unwrap_or(false) {
        let _ = std::fs::rename(&lf, lf.with_extension("log.1"));
    }
    let Ok(f) = std::fs::OpenOptions::new().create(true).append(true).open(&lf) else { return };
    let Ok(f2) = f.try_clone() else { return };
    let tok = crate::auth::rnd();
    let mut x = HashMap::new();
    x.insert("AO_URL".to_string(), format!("http://127.0.0.1:{}", a.port));
    x.insert("AO_TOKEN".to_string(), tok.clone());
    x.insert("AO_WORKER".to_string(), id.to_string());
    let Some(b) = crate::sh::bash() else { return };
    let mut c = tokio::process::Command::new(b);
    c.arg("-c").arg(&run).current_dir(&dir).stdin(Stdio::null()).stdout(f).stderr(f2).kill_on_drop(false);
    crate::sh::env(&mut c, &x);
    crate::sh::grp(&mut c);
    match c.spawn() {
        Ok(mut ch) => {
            let pid = ch.id().unwrap_or(0);
            m().lock().unwrap().insert(id, P { pid, tok, up: true, end: 0 });
            let mut v: Vec<Value> = a.db.kg("spids").as_array().cloned().unwrap_or_default();
            v.retain(|x| x["w"].as_i64() != Some(id));
            v.push(json!({"w": id, "p": pid, "t": now()}));
            a.db.ks("spids", &json!(v));
            a.say(id, "script started", None);
            let a2 = a.clone();
            tokio::spawn(async move {
                let st = ch.wait().await.ok().and_then(|s| s.code()).unwrap_or(-1);
                let mut g = m().lock().unwrap();
                if let Some(p) = g.get_mut(&id) {
                    if p.pid == pid {
                        p.up = false;
                        p.tok.clear();
                        p.end = now();
                    }
                }
                drop(g);
                a2.say(id, &format!("script ended (exit {st})"), None);
            });
        }
        Err(e) => {
            m().lock().unwrap().insert(id, P { end: now(), ..Default::default() });
            a.say(id, &format!("script does not start: {e}"), None);
        }
    }
}

pub fn reap(a: &Ax) {
    for x in a.db.kg("spids").as_array().cloned().unwrap_or_default() {
        if let (Some(p), Some(t)) = (x["p"].as_u64(), x["t"].as_i64()) {
            if crate::sh::age(p as u32).map(|s| (now() - s * 1000 - t).abs() < 15_000).unwrap_or(false) {
                #[cfg(unix)]
                {
                    let _ = std::process::Command::new("kill").args(["-TERM", &format!("-{p}")]).stderr(Stdio::null()).status();
                }
                std::thread::sleep(std::time::Duration::from_secs(3));
                crate::sh::kill(p as u32);
            }
        }
    }
    a.db.ks("spids", &json!([]));
}

pub fn tick(a: &Ax) {
    let all = a.lv.lock().unwrap().stop.get(&0).copied().unwrap_or(false);
    let ws = a.db.all("select id,hold,cfg from wk where ty='script'", pa![]);
    let ids: Vec<i64> = ws.iter().filter_map(|w| w["id"].as_i64()).collect();
    let gone: Vec<i64> = m().lock().unwrap().keys().filter(|k| !ids.contains(k)).cloned().collect();
    for g in gone {
        stop(g);
        m().lock().unwrap().remove(&g);
    }
    for w in ws {
        let id = w["id"].as_i64().unwrap_or(0);
        let run = w["cfg"]["run"].as_str().unwrap_or("").trim().to_string();
        let dir = w["cfg"]["dir"].as_str().unwrap_or("");
        let want = !run.is_empty() && w["hold"].as_i64() != Some(1) && !all && std::path::Path::new(dir).is_dir();
        let (on, end) = m().lock().unwrap().get(&id).map(|p| (p.up, p.end)).unwrap_or((false, 0));
        if want && !on && now() - end > 30_000 {
            start(a, &w);
        } else if !want && on {
            stop(id);
            a.say(id, "script stopped", None);
        }
    }
}

fn wname(a: &Ax, fl: i64, n: &Value) -> Option<Value> {
    match n {
        Value::Number(x) => a.db.one("select * from wk where id=?", pa![x.as_i64().unwrap_or(0)]),
        Value::String(s) => wk_by_name(a, fl, s),
        _ => None,
    }
}

fn mine(a: &Ax, sid: i64, fl: i64, n: &Value) -> Result<Value, String> {
    if n.is_null() {
        return a.db.one("select * from wk where id=?", pa![sid]).ok_or_else(|| "script worker is gone".to_string());
    }
    let w = wname(a, fl, n).ok_or_else(|| format!("no worker {n}"))?;
    if w["id"].as_i64() != Some(sid) {
        accepts(a, &w, sid)?;
    }
    Ok(w)
}

fn srv_id(a: &Ax, v: &Value) -> Option<i64> {
    match v {
        Value::Number(x) => x.as_i64().filter(|i| a.db.one("select id from srv where id=?", pa![*i]).is_some()),
        Value::String(s) => a.db.one("select id from srv where lower(nm)=lower(?) or host=?", pa![s.clone(), s.clone()]).and_then(|r| r["id"].as_i64()),
        _ => None,
    }
}

pub async fn api(a: &Ax, t: &str, b: &Value) -> Result<Value, String> {
    let sid = who(t).ok_or("unknown or stopped script")?;
    let me = a.db.one("select * from wk where id=?", pa![sid]).ok_or("script worker is gone")?;
    let fl = me["fl"].as_i64().unwrap_or(0);
    let s = |k: &str| b[k].as_str().unwrap_or("").to_string();
    match b["op"].as_str().unwrap_or("") {
        "who" => {
            let ws: Vec<Value> = a.db.all("select w.id,w.nm,w.ty,w.fl,w.hold,t.nm tn from wk w left join ty t on t.id=w.ty", pa![]).into_iter().map(|mut w| {
                let id = w["id"].as_i64().unwrap_or(0);
                w["mine"] = json!(id == sid || a.db.one("select * from wk where id=?", pa![id]).map(|x| accepts(a, &x, sid).is_ok()).unwrap_or(false));
                w
            }).collect();
            let sv = a.db.all("select id,nm,host,cfg,st from srv", pa![]);
            let ac: Vec<Value> = crate::prov::list(a).into_iter().map(|x| json!({"id": x["id"], "nm": x["nm"], "k": x["k"], "st": x["st"]})).collect();
            Ok(json!({"me": sid, "fl": fl, "w": ws, "srv": sv, "acc": ac, "stop": a.lv.lock().unwrap().stop.get(&0).copied().unwrap_or(false)}))
        }
        "task" => {
            let to = mine(a, sid, fl, &b["to"])?;
            let tid = to["id"].as_i64().unwrap_or(0);
            if tid == sid {
                return Err("a script cannot give itself a task".into());
            }
            if to["ty"] == "script" {
                return Err(format!("{} is a script and takes no tasks", to["nm"].as_str().unwrap_or("")));
            }
            let key = s("key");
            if !key.is_empty() {
                if let Some(r) = a.db.one("select id,st from tk where key=? and src=?", pa![key.clone(), format!("w:{sid}")]) {
                    return Ok(json!({"id": r["id"], "st": r["st"], "old": true}));
                }
            }
            let mut ctx = json!({});
            if b["ctx"].is_object() {
                let sv = srv_id(a, &b["ctx"]["srv"]).ok_or("unknown workspace server")?;
                let d = b["ctx"]["dir"].as_str().unwrap_or("");
                if !crate::rws::dir_ok(d) {
                    return Err("invalid workspace folder".into());
                }
                ctx = json!({"srv": sv, "dir": d});
            }
            let mut ov = json!({});
            for k in ["sys", "md", "ef"] {
                if let Some(v) = b[k].as_str().filter(|x| !x.is_empty()) {
                    ov[k] = json!(v);
                }
            }
            for k in ["turns", "min"] {
                if let Some(v) = b[k].as_i64() {
                    ov[k] = json!(v);
                }
            }
            let ti = if s("ti").trim().is_empty() { "Task".to_string() } else { s("ti") };
            let id = a.db.run(
                "insert into tk(ti,tx,src,wk,fl,st,kind,mk,prio,ctx,ov,key,t0,t1) values(?,?,?,?,?,'wait','task',0,?,?,?,?,?,?)",
                pa![cut_s(&ti, 300), cut_s(&s("tx"), 400_000), format!("w:{sid}"), tid, to["fl"].as_i64().unwrap_or(fl), b["prio"].as_i64().unwrap_or(3), ctx.to_string(), ov.to_string(), if key.is_empty() { None } else { Some(key) }, now(), now()],
            );
            a.flow(sid, tid, "order");
            a.say(tid, &format!("new order: {}", cut_s(&ti, 80)), Some(id));
            Ok(json!({"id": id, "st": "wait"}))
        }
        "get" => {
            let r = a.db.one("select id,st,res,n,t0,t1,wk from tk where id=? and src=?", pa![b["id"].as_i64().unwrap_or(0), format!("w:{sid}")]).ok_or("unknown task")?;
            Ok(r)
        }
        "cancel" => {
            let id = b["id"].as_i64().unwrap_or(0);
            a.db.one("select id from tk where id=? and src=?", pa![id, format!("w:{sid}")]).ok_or("unknown task")?;
            let _ = crate::eng::cancel(a, id);
            Ok(json!({"ok": true}))
        }
        "say" => {
            let w = mine(a, sid, fl, &b["w"])?;
            let wid = w["id"].as_i64().unwrap_or(0);
            let tk = b["tk"].as_i64();
            if !s("m").trim().is_empty() {
                a.say(wid, &s("m"), tk);
            }
            if let Some(st) = b["st"].as_str() {
                let mut l = a.lv.lock().unwrap();
                let x = l.w.entry(wid).or_default();
                x.xs = if ["work", "idle", "wait", "hold", "off"].contains(&st) { st.to_string() } else { String::new() };
                x.xt = now();
            }
            if let Some(md) = b["mood"].as_str() {
                a.mood(wid, md);
            }
            Ok(json!({"ok": true}))
        }
        "flow" => {
            let x = mine(a, sid, fl, &b["a"])?;
            let y = mine(a, sid, fl, &b["b"])?;
            a.flow(x["id"].as_i64().unwrap_or(0), y["id"].as_i64().unwrap_or(0), b["k"].as_str().unwrap_or("order"));
            Ok(json!({"ok": true}))
        }
        "notify" => {
            let c = crate::ntf::by_name(a, &s("ch")).ok_or_else(|| format!("no channel named {}", s("ch")))?;
            crate::ntf::send(a, &c, &s("ti"), &s("tx")).await?;
            Ok(json!({"ok": true}))
        }
        o => Err(format!("unknown op {o}")),
    }
}
