use crate::cfg::Ax;
use crate::db::now;
use crate::pa;
use crate::perm::{shok, Pm};
use crate::tools::Rc;
use russh::client::{self, Handle};
use russh::keys::{ssh_key, HashAlg, PrivateKey, PrivateKeyWithHashAlg};
use russh::ChannelMsg;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use std::time::Duration;

struct H {
    want: Option<String>,
    seen: Arc<Mutex<Option<(String, String)>>>,
}

impl client::Handler for H {
    type Error = russh::Error;
    async fn check_server_key(&mut self, k: &ssh_key::PublicKey) -> Result<bool, Self::Error> {
        let fp = k.fingerprint(HashAlg::Sha256).to_string();
        *self.seen.lock().unwrap() = Some((fp.clone(), k.to_openssh().unwrap_or_default()));
        Ok(self.want.as_deref() == Some(fp.as_str()))
    }
}

pub fn q(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

async fn conn(host: &str, port: u16, want: Option<String>) -> Result<(Handle<H>, Option<(String, String)>), String> {
    let cfg = Arc::new(client::Config { inactivity_timeout: Some(Duration::from_secs(120)), ..Default::default() });
    let seen = Arc::new(Mutex::new(None));
    let h = H { want, seen: seen.clone() };
    let r = tokio::time::timeout(Duration::from_secs(15), client::connect(cfg, (host, port), h)).await;
    let s = seen.lock().unwrap().clone();
    match r {
        Ok(Ok(c)) => Ok((c, s)),
        Ok(Err(e)) => Err(if s.is_some() { format!("host key does not match or is not confirmed ({e})") } else { format!("no connection: {e}") }),
        Err(_) => Err("no connection (timeout)".into()),
    }
}

pub async fn probe(host: &str, port: u16) -> Result<(String, String), String> {
    match conn(host, port, None).await {
        Ok((_, Some(s))) => Ok(s),
        Err(_) | Ok((_, None)) => {
            let cfg = Arc::new(client::Config::default());
            let seen = Arc::new(Mutex::new(None));
            let _ = tokio::time::timeout(Duration::from_secs(15), client::connect(cfg, (host, port), H { want: None, seen: seen.clone() })).await;
            let s = seen.lock().unwrap().clone();
            s.ok_or_else(|| format!("{host}:{port} is not reachable"))
        }
    }
}

async fn exec(c: &Handle<H>, cmd: &str, input: Option<Vec<u8>>, secs: u64) -> Result<(i32, Vec<u8>), String> {
    exec2(c, cmd, input, secs, true).await
}

async fn exec2(c: &Handle<H>, cmd: &str, input: Option<Vec<u8>>, secs: u64, se: bool) -> Result<(i32, Vec<u8>), String> {
    let mut ch = c.channel_open_session().await.map_err(|e| e.to_string())?;
    ch.exec(true, cmd).await.map_err(|e| e.to_string())?;
    if let Some(d) = input {
        ch.data(&d[..]).await.map_err(|e| e.to_string())?;
    }
    ch.eof().await.map_err(|e| e.to_string())?;
    let mut o = vec![];
    let mut code = -1;
    let mut over = false;
    let r = tokio::time::timeout(Duration::from_secs(secs), async {
        while let Some(m) = ch.wait().await {
            match m {
                ChannelMsg::Data { ref data } => {
                    if o.len() < 60_000_000 {
                        o.extend_from_slice(data)
                    } else {
                        over = true;
                    }
                }
                ChannelMsg::ExtendedData { ref data, .. } if se => {
                    if o.len() < 60_000_000 {
                        o.extend_from_slice(data)
                    }
                }
                ChannelMsg::ExitStatus { exit_status } => code = exit_status as i32,
                _ => {}
            }
        }
    })
    .await;
    if r.is_err() {
        return Err("timeout".into());
    }
    if over {
        return Err("output is larger than 60 MB".into());
    }
    Ok((code, o))
}

fn newkey() -> PrivateKey {
    let seed: [u8; 32] = rand::random();
    PrivateKey::from(ssh_key::private::Ed25519Keypair::from_seed(&seed))
}

pub async fn setup(a: &Ax, b: &Value) -> Result<i64, String> {
    let host = b["host"].as_str().unwrap_or("").trim().to_string();
    let port = b["port"].as_u64().unwrap_or(22) as u16;
    let usr = b["user"].as_str().unwrap_or("root").trim().to_string();
    let fp = b["fp"].as_str().unwrap_or("").to_string();
    let fl = b["fl"].as_i64().unwrap_or(0);
    if host.is_empty() || fp.is_empty() {
        return Err("address and confirmed host key required".into());
    }
    if a.db.one("select id from fl where id=? and k='server'", pa![fl]).is_none() {
        return Err("servers go into a server room".into());
    }
    let (mut c, s) = conn(&host, port, Some(fp.clone())).await?;
    let hk = s.map(|x| x.1).unwrap_or_default();
    let pw = b["pw"].as_str().unwrap_or("").to_string();
    let ok = if let Some(k) = b["key"].as_str().filter(|k| !k.trim().is_empty()) {
        let pk = russh::keys::decode_secret_key(k, b["kpw"].as_str().filter(|x| !x.is_empty())).map_err(|e| format!("unreadable key: {e}"))?;
        let h = c.best_supported_rsa_hash().await.ok().flatten().flatten();
        c.authenticate_publickey(&usr, PrivateKeyWithHashAlg::new(Arc::new(pk), h)).await.map_err(|e| e.to_string())?.success()
    } else {
        c.authenticate_password(&usr, &pw).await.map_err(|e| e.to_string())?.success()
    };
    if !ok {
        return Err("admin login failed".into());
    }
    let k = newkey();
    let pubk = k.public_key().to_openssh().map_err(|e| e.to_string())?;
    let dock = b["docker"].as_bool() != Some(false);
    let sc = format!(
        r#"set -e
if [ "$(id -u)" = 0 ]; then S=""; else sudo -S -p '' -v >/dev/null 2>&1 || {{ echo NOSUDO; exit 9; }}; S="sudo -n"; fi
[ "$(uname -s)" = Linux ] || {{ echo NOLINUX; exit 8; }}
id apollo >/dev/null 2>&1 || $S useradd -m -s /bin/bash apollo
H=$(getent passwd apollo | cut -d: -f6)
$S mkdir -p "$H/.ssh" "$H/work" "$H/.ao"
echo {pk} | $S tee "$H/.ssh/authorized_keys" >/dev/null
$S chown -R apollo:apollo "$H/.ssh" "$H/work" "$H/.ao"
$S chmod 700 "$H/.ssh"; $S chmod 600 "$H/.ssh/authorized_keys"
if [ {d} = 1 ] && command -v docker >/dev/null 2>&1; then $S usermod -aG docker apollo; echo DOCKER; fi
echo OKAY
"#,
        pk = q(&pubk),
        d = if dock { 1 } else { 0 }
    );
    let (code, o) = exec(&c, &format!("bash -c {}", q(&sc)), Some(format!("{pw}\n").into_bytes()), 120).await?;
    let o = String::from_utf8_lossy(&o).to_string();
    if o.contains("NOSUDO") {
        return Err("The admin user cannot use sudo. Log in as root or with sudo rights.".into());
    }
    if o.contains("NOLINUX") {
        return Err("Only Linux servers are supported".into());
    }
    if code != 0 || !o.contains("OKAY") {
        return Err(format!("setup failed: {}", o.chars().rev().take(300).collect::<String>().chars().rev().collect::<String>()));
    }
    let _ = c.disconnect(russh::Disconnect::ByApplication, "", "").await;
    let ks = k.to_openssh(ssh_key::LineEnding::LF).map_err(|e| e.to_string())?.to_string();
    let nm = b["nm"].as_str().filter(|s| !s.trim().is_empty()).unwrap_or(&host).chars().take(24).collect::<String>();
    let cfg = json!({"lanes": 2, "cpu": 2, "mem": 2048, "img": "debian:stable-slim", "cmds": [], "hours": {}, "every": 30});
    let id = a.db.run(
        "insert into srv(fl,nm,host,port,usr,key,hk,dock,cfg,st,t0) values(?,?,?,?,'apollo',?,?,?,?,'{}',?)",
        pa![fl, nm.clone(), host.clone(), port as i64, crate::vault::enc(&a.key, &ks), fp.clone(), if o.contains("DOCKER") { 1 } else { 0 }, cfg.to_string(), now()],
    );
    let _ = hk;
    a.aud("Server added", &format!("{nm} ({host}:{port}), Host-Key {fp}, Docker {}", o.contains("DOCKER")));
    crate::world::sync_racks(a);
    Ok(id)
}

async fn login(a: &Ax, s: &Value) -> Result<Handle<H>, String> {
    let (mut c, _) = conn(s["host"].as_str().unwrap_or(""), s["port"].as_i64().unwrap_or(22) as u16, Some(s["hk"].as_str().unwrap_or("").to_string())).await?;
    let ks = a.db.blob("select key from srv where id=?", pa![s["id"].as_i64().unwrap_or(0)]).and_then(|b| crate::vault::dec(&a.key, &b)).ok_or("key missing")?;
    let pk = russh::keys::decode_secret_key(&ks, None).map_err(|e| e.to_string())?;
    let ok = tokio::time::timeout(Duration::from_secs(20), c.authenticate_publickey("apollo", PrivateKeyWithHashAlg::new(Arc::new(pk), None))).await.map_err(|_| "login timeout".to_string())?.map_err(|e| e.to_string())?.success();
    if !ok {
        return Err("login as apollo failed".into());
    }
    Ok(c)
}

fn lanes(s: &Value) -> i64 {
    let h = chrono::Local::now().format("%H").to_string().parse::<i64>().unwrap_or(0).to_string();
    s["cfg"]["hours"][&h].as_i64().unwrap_or(s["cfg"]["lanes"].as_i64().unwrap_or(2))
}

const MON: &str = "cat /proc/loadavg; nproc; free -b | awk '/^Mem:/{print $2, $7}'; df -B1 ~/work | tail -1 | awk '{print $2, $4}'";

pub async fn poll(a: &Ax) {
    for s in a.db.all("select * from srv", pa![]) {
        let id = s["id"].as_i64().unwrap_or(0);
        let every = s["cfg"]["every"].as_i64().unwrap_or(30).max(10) * 1000;
        if now() - s["st"]["t"].as_i64().unwrap_or(0) < every {
            continue;
        }
        a.db.run("update srv set st=json_set(coalesce(st,'{}'),'$.t',?) where id=?", pa![now(), id]);
        let a2 = a.clone();
        tokio::spawn(async move {
            let mut st = json!({"t": now()});
            match login(&a2, &s).await {
                Ok(c) => {
                    if let Ok((_, o)) = exec(&c, MON, None, 20).await {
                        let o = String::from_utf8_lossy(&o).to_string();
                        let l: Vec<&str> = o.lines().collect();
                        let ld: f64 = l.first().and_then(|x| x.split_whitespace().next()).and_then(|x| x.parse().ok()).unwrap_or(0.0);
                        let n: f64 = l.get(1).and_then(|x| x.trim().parse().ok()).unwrap_or(1.0);
                        let m: Vec<f64> = l.get(2).map(|x| x.split_whitespace().filter_map(|v| v.parse().ok()).collect()).unwrap_or_default();
                        let d: Vec<f64> = l.get(3).map(|x| x.split_whitespace().filter_map(|v| v.parse().ok()).collect()).unwrap_or_default();
                        st = json!({"t": now(), "on": true, "load": ld, "cpu": (ld / n.max(1.0) * 100.0).min(100.0), "cores": n,
                            "ram": if m.len() == 2 && m[0] > 0.0 { (1.0 - m[1] / m[0]) * 100.0 } else { 0.0 }, "ramt": m.first().cloned().unwrap_or(0.0),
                            "disk": if d.len() == 2 && d[0] > 0.0 { (1.0 - d[1] / d[0]) * 100.0 } else { 0.0 }, "diskf": d.get(1).cloned().unwrap_or(0.0)});
                    }
                    for j in a2.db.all("select * from job where srv=? and st='run'", pa![id]) {
                        let jid = j["id"].as_i64().unwrap_or(0);
                        let (stc, logc) = if s["dock"].as_i64() == Some(1) {
                            (format!("docker inspect -f '{{{{.State.Status}}}} {{{{.State.ExitCode}}}}' ao-{jid} 2>/dev/null || echo gone 1"), format!("docker logs --tail 300 ao-{jid} 2>&1"))
                        } else {
                            (format!("if [ -f ~/.ao/{jid}.exit ]; then echo exited $(cat ~/.ao/{jid}.exit); elif kill -0 $(cat ~/.ao/{jid}.pid 2>/dev/null) 2>/dev/null; then echo running 0; else echo gone 1; fi"), format!("tail -c 30000 ~/.ao/{jid}.log 2>/dev/null"))
                        };
                        if let (Ok((_, x)), Ok((_, lg))) = (exec(&c, &stc, None, 20).await, exec(&c, &logc, None, 20).await) {
                            let x = String::from_utf8_lossy(&x).to_string();
                            let mut p = x.split_whitespace();
                            let (sst, ex) = (p.next().unwrap_or("gone").to_string(), p.next().and_then(|v| v.parse::<i64>().ok()).unwrap_or(1));
                            let lg = crate::sh::cut(&String::from_utf8_lossy(&lg), 30000);
                            if sst == "running" || sst == "created" {
                                a2.db.run("update job set out=?, t1=? where id=?", pa![lg, now(), jid]);
                            } else {
                                a2.db.run("update job set out=?, st=?, ex=?, t1=? where id=?", pa![lg, if ex == 0 { "done" } else { "fail" }.to_string(), ex, now(), jid]);
                                if s["dock"].as_i64() == Some(1) {
                                    let _ = exec(&c, &format!("docker rm -f ao-{jid} >/dev/null 2>&1"), None, 20).await;
                                }
                            }
                        }
                    }
                    let _ = c.disconnect(russh::Disconnect::ByApplication, "", "").await;
                }
                Err(e) => st = json!({"t": now(), "on": false, "why": e}),
            }
            st["jobs"] = json!(a2.db.n("select count(*) from job where srv=? and st='run'", pa![id]));
            st["lanes"] = json!(lanes(&s));
            a2.db.run("update srv set st=? where id=?", pa![st.to_string(), id]);
        });
    }
}

fn srv_for(a: &Ax, rc: &Rc, n: &str) -> Result<Value, String> {
    let allowed: Vec<i64> = rc.wc["srv"].as_array().map(|x| x.iter().filter_map(|v| v.as_i64()).collect()).unwrap_or_default();
    let n = n.trim().to_lowercase();
    a.db.all("select * from srv", pa![]).into_iter().find(|s| allowed.contains(&s["id"].as_i64().unwrap_or(0)) && (s["nm"].as_str().map(|x| x.to_lowercase()) == Some(n.clone()) || s["id"].as_i64().map(|i| i.to_string()) == Some(n.clone()) || s["host"].as_str() == Some(&n))).ok_or_else(|| format!("server {n} is not allowed for you"))
}

fn rpath(p: &str) -> Result<String, String> {
    let p = p.trim().trim_start_matches("./");
    if p.is_empty() || p.starts_with('/') || p.split('/').any(|x| x == "..") {
        return Err("path must be relative inside the server's work folder".into());
    }
    Ok(p.to_string())
}

pub async fn tool(a: &Ax, rc: &Rc, n: &str, x: &Value) -> Result<String, String> {
    let s = |k: &str| x[k].as_str().unwrap_or("").to_string();
    match n {
        "server_status" => {
            let allowed: Vec<i64> = rc.wc["srv"].as_array().map(|x| x.iter().filter_map(|v| v.as_i64()).collect()).unwrap_or_default();
            let v: Vec<Value> = a.db.all("select id,nm,host,dock,cfg,st from srv", pa![]).into_iter().filter(|r| allowed.contains(&r["id"].as_i64().unwrap_or(0))).map(|r| json!({"name": r["nm"], "online": r["st"]["on"], "cpu": r["st"]["cpu"], "ram": r["st"]["ram"], "disk": r["st"]["disk"], "lanes": lanes(&r), "jobs": r["st"]["jobs"], "docker": r["dock"], "allowed_commands": r["cfg"]["cmds"]})).collect();
            Ok(serde_json::to_string_pretty(&v).unwrap())
        }
        "job_start" => {
            let sv = srv_for(a, rc, &s("server"))?;
            let cmd = s("cmd");
            let cmds: Vec<String> = sv["cfg"]["cmds"].as_array().map(|x| x.iter().filter_map(|v| v.as_str().map(String::from)).collect()).unwrap_or_default();
            shok(&Pm { sh: Some(cmds.clone()), any: false, ..Default::default() }, &cmd).map_err(|e| format!("not allowed on this server: {e}"))?;
            let sid = sv["id"].as_i64().unwrap_or(0);
            let id = {
                static L: std::sync::Mutex<()> = std::sync::Mutex::new(());
                let _g = L.lock().unwrap();
                let run = a.db.n("select count(*) from job where srv=? and st in ('run','start')", pa![sid]);
                if run >= lanes(&sv) {
                    return Err(format!("all {} lanes are busy, try again later", lanes(&sv)));
                }
                a.db.run("insert into job(srv,wk,tk,cmd,st,t0,t1) values(?,?,?,?,'start',?,?)", pa![sid, rc.wk, rc.tk, cmd.clone(), now(), now()])
            };
            let c = login(a, &sv).await.inspect_err(|e| {
                a.db.run("update job set st='fail', out=? where id=?", pa![e.clone(), id]);
            })?;
            let rcmd = if sv["dock"].as_i64() == Some(1) {
                format!("docker run -d --name ao-{id} --cpus {} --memory {}m -v ~/work:/work -w /work {} bash -c {}", sv["cfg"]["cpu"].as_f64().unwrap_or(2.0), sv["cfg"]["mem"].as_i64().unwrap_or(2048), q(sv["cfg"]["img"].as_str().unwrap_or("debian:stable-slim")), q(&cmd))
            } else {
                format!("cd ~/work && nohup setsid bash -c {} > ~/.ao/{id}.log 2>&1 < /dev/null & echo $! > ~/.ao/{id}.pid", q(&format!("{cmd}; echo $? > ~/.ao/{id}.exit")))
            };
            let (code, o) = exec(&c, &rcmd, None, 120).await.inspect_err(|e| {
                a.db.run("update job set st='fail', out=? where id=?", pa![e.clone(), id]);
            })?;
            let _ = c.disconnect(russh::Disconnect::ByApplication, "", "").await;
            if code != 0 {
                let o = String::from_utf8_lossy(&o).to_string();
                a.db.run("update job set st='fail', out=? where id=?", pa![o.clone(), id]);
                return Err(format!("job does not start: {}", o.chars().take(300).collect::<String>()));
            }
            a.db.run("update job set st='run' where id=? and st='start'", pa![id]);
            a.db.run("update srv set st=json_set(st,'$.t',0) where id=?", pa![sid]);
            Ok(format!("job #{id} runs on {}", sv["nm"].as_str().unwrap_or("")))
        }
        "job_log" | "job_stop" => {
            let id = x["job"].as_i64().unwrap_or(0);
            let j = a.db.one("select * from job where id=? and wk=?", pa![id, rc.wk]).ok_or("unknown job")?;
            let sv = a.db.one("select * from srv where id=?", pa![j["srv"].as_i64().unwrap_or(0)]).ok_or("server gone")?;
            srv_for(a, rc, &sv["id"].as_i64().unwrap_or(0).to_string())?;
            if n == "job_log" {
                return Ok(format!("status {} exit {}\n{}", j["st"].as_str().unwrap_or(""), j["ex"], j["out"].as_str().unwrap_or("")));
            }
            if j["st"] != "run" {
                return Ok(format!("job #{id} is not running ({})", j["st"].as_str().unwrap_or("")));
            }
            let c = login(a, &sv).await?;
            let k = if sv["dock"].as_i64() == Some(1) { format!("docker rm -f ao-{id}") } else { format!("kill -- -$(cat ~/.ao/{id}.pid) 2>/dev/null; kill $(cat ~/.ao/{id}.pid) 2>/dev/null; echo 143 > ~/.ao/{id}.exit") };
            let _ = exec(&c, &k, None, 30).await;
            a.db.run("update job set st='fail', ex=143, t1=? where id=? and st='run'", pa![now(), id]);
            Ok("stopped".into())
        }
        "put_file" | "get_file" => {
            let sv = srv_for(a, rc, &s("server"))?;
            let c = login(a, &sv).await?;
            if n == "put_file" {
                let rem = rpath(&if s("remote").is_empty() { std::path::Path::new(&s("path")).file_name().map(|x| x.to_string_lossy().to_string()).unwrap_or_default() } else { s("remote") })?;
                let txt = crate::tools::raw(a, rc, "read_bytes", &json!({"path": s("path")})).await;
                let data = match txt {
                    Ok(b64) => base64::Engine::decode(&base64::engine::general_purpose::STANDARD, b64).map_err(|e| e.to_string())?,
                    Err(e) => return Err(e),
                };
                let (code, _) = exec(&c, &format!("mkdir -p \"$(dirname ~/work/{r})\" && cat > ~/work/{r}", r = q(&rem)), Some(data), 600).await?;
                Ok(if code == 0 { format!("uploaded to ~/work/{rem}") } else { "upload failed".into() })
            } else {
                let rem = rpath(&s("remote"))?;
                let (code, data) = exec2(&c, &format!("cat ~/work/{}", q(&rem)), None, 600, false).await?;
                if code != 0 {
                    return Err("file not found".into());
                }
                crate::tools::raw(a, rc, "write_bytes", &json!({"path": s("path"), "b64": base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &data)})).await
            }
        }
        _ => Err("unknown".into()),
    }
}

pub async fn remove(a: &Ax, id: i64) {
    let js = a.db.all("select id from job where srv=? and st in ('run','start')", pa![id]);
    if !js.is_empty() {
        if let Some(sv) = a.db.one("select * from srv where id=?", pa![id]) {
            if let Ok(c) = login(a, &sv).await {
                for j in js {
                    let jid = j["id"].as_i64().unwrap_or(0);
                    let k = if sv["dock"].as_i64() == Some(1) { format!("docker rm -f ao-{jid} >/dev/null 2>&1") } else { format!("kill -- -$(cat ~/.ao/{jid}.pid) 2>/dev/null; kill $(cat ~/.ao/{jid}.pid) 2>/dev/null") };
                    let _ = exec(&c, &k, None, 30).await;
                }
                let _ = c.disconnect(russh::Disconnect::ByApplication, "", "").await;
            }
        }
    }
    a.db.run("delete from job where srv=?", pa![id]);
    a.db.run("delete from srv where id=?", pa![id]);
    crate::world::sync_racks(a);
}
