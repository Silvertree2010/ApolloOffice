use crate::cfg::Ax;
use crate::sh::{env, grp, kill, which};
use crate::tools::Rc;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

pub struct Job {
    pub acc: Value,
    pub md: String,
    pub ef: String,
    pub sys: String,
    pub p: String,
    pub turns: u32,
    pub min: u64,
    pub rc: Option<Rc>,
    pub who: i64,
    pub tid: i64,
    pub fl: i64,
}

pub struct Res {
    pub txt: String,
    pub tin: i64,
    pub tout: i64,
}

#[derive(Debug)]
pub enum Er {
    Lim(Option<i64>, String),
    E(String),
}

impl std::fmt::Display for Er {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            Er::Lim(_, s) => write!(f, "Limit: {s}"),
            Er::E(s) => write!(f, "{s}"),
        }
    }
}

fn limtxt(s: &str) -> bool {
    regex::Regex::new(r"(?i)usage limit|rate.?limit|limit reached|\b429\b|quota|too many requests").unwrap().is_match(s)
}

pub async fn go(a: &Ax, j: Job) -> Result<Res, Er> {
    let k = j.acc["k"].as_str().unwrap_or("").to_string();
    let (acc, md, who, fl) = (j.acc.clone(), j.md.clone(), j.who, j.fl);
    let mut u = (0i64, 0i64);
    let r = match k.as_str() {
        "claude" | "codex" | "gemini" => cli(a, j, &k, &mut u).await,
        "api" => crate::api::run(a, j, &mut u).await,
        _ => Err(Er::E("unknown account kind".into())),
    };
    if u.0 > 0 || u.1 > 0 {
        crate::prov::record(a, &acc, &md, who, fl, u.0, u.1);
    }
    r.map(|mut x| {
        x.tin = u.0;
        x.tout = u.1;
        x
    })
}

pub fn gone(a: &Ax, tid: i64) -> bool {
    tid > 0 && a.db.one("select st from tk where id=?", crate::pa![tid]).map(|r| r["st"] != "run").unwrap_or(true)
}

fn rundir(a: &Ax) -> PathBuf {
    let d = a.dd.join("runs").join(hex::encode(rand::random::<[u8; 6]>()));
    let _ = std::fs::create_dir_all(&d);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&d, std::fs::Permissions::from_mode(0o700));
    }
    d
}

fn tokfile(rd: &std::path::Path, t: &str) -> String {
    let f = rd.join("run.tok");
    let _ = std::fs::write(&f, t);
    crate::vault::tight(&f);
    format!("@{}", f.display())
}

fn token(a: &Ax, rc: &Option<Rc>) -> Option<String> {
    let rc = rc.as_ref()?;
    let t = crate::auth::rnd();
    a.lv.lock().unwrap().runs.insert(t.clone(), json!({"wk": rc.wk, "tk": rc.tk}));
    crate::mcp::reg(t.clone(), rc.clone());
    Some(t)
}

fn untoken(a: &Ax, t: &Option<String>) {
    if let Some(t) = t {
        a.lv.lock().unwrap().runs.remove(t);
        crate::mcp::unreg(t);
    }
}

pub async fn cli(a: &Ax, j: Job, k: &str, u: &mut (i64, i64)) -> Result<Res, Er> {
    let b = j.acc["cfg"]["bin"].as_str().filter(|s| !s.is_empty()).map(PathBuf::from).or_else(|| which(crate::prov::bin(k))).ok_or_else(|| Er::E(format!("{} is not installed", crate::prov::bin(k))))?;
    let rd = rundir(a);
    let me = a.me.display().to_string();
    let tk = token(a, &j.rc);
    let port = a.port.to_string();
    let ta = tk.as_ref().map(|t| tokfile(&rd, t));
    let mut x: HashMap<String, String> = HashMap::new();
    let dir = j.acc["dir"].as_str().unwrap_or("").to_string();
    let mut c = Command::new(&b);
    let mut stdin = j.p.clone();
    match k {
        "claude" => {
            c.args(["-p", "--output-format", "stream-json", "--verbose", "--setting-sources", "project", "--no-session-persistence", "--strict-mcp-config"]);
            let sf = rd.join("sys.txt");
            let _ = std::fs::write(&sf, &j.sys);
            c.arg("--system-prompt-file").arg(&sf).args(["--max-turns", &j.turns.to_string()]);
            if !j.md.is_empty() {
                c.args(["--model", &j.md]);
            }
            if !j.ef.is_empty() {
                c.args(["--effort", crate::prov::ef(&j.ef)]);
            }
            if let Some(t) = &ta {
                let mf = rd.join("mcp.json");
                let _ = std::fs::write(&mf, json!({"mcpServers": {"office": {"type": "stdio", "command": me, "args": ["mcp", port, t]}}}).to_string());
                c.arg("--mcp-config").arg(&mf).args(["--tools", "", "--allowedTools", "mcp__office"]);
            } else {
                c.args(["--tools", ""]);
            }
            x.insert("CLAUDE_CODE_DISABLE_AUTO_MEMORY".into(), "1".into());
            x.insert("MCP_TOOL_TIMEOUT".into(), "10800000".into());
            x.insert("DISABLE_AUTOUPDATER".into(), "1".into());
            x.insert("DISABLE_TELEMETRY".into(), "1".into());
            if !dir.is_empty() {
                x.insert("CLAUDE_CONFIG_DIR".into(), dir.clone());
            }
            if cfg!(windows) {
                if let Some(bb) = crate::sh::bash() {
                    x.insert("CLAUDE_CODE_GIT_BASH_PATH".into(), bb.display().to_string());
                }
            }
        }
        "codex" => {
            c.args(["exec", "--json", "--skip-git-repo-check", "--ephemeral", "--ignore-user-config", "--ignore-rules", "-s", "read-only", "--color", "never"]);
            for f in ["shell_tool", "unified_exec", "browser_use", "browser_use_external", "computer_use", "image_generation", "hooks"] {
                c.args(["--disable", f]);
            }
            c.arg("-C").arg(&rd);
            c.args(["-c", "approval_policy=\"never\"", "-c", "apps._default.enabled=false", "-c", "include_apply_patch_tool=false", "-c", "tools.web_search=false"]);
            c.arg("-o").arg(rd.join("last.txt"));
            if let Some(t) = &ta {
                c.arg("-c").arg(format!("mcp_servers.office.command={}", json!(me)));
                c.arg("-c").arg(format!("mcp_servers.office.args={}", json!(["mcp", port, t])));
                c.args(["-c", "mcp_servers.office.tool_timeout_sec=10800", "-c", "mcp_servers.office.default_tools_approval_mode=\"approve\""]);
            }
            if !j.md.is_empty() {
                c.args(["-m", &j.md]);
            }
            if !j.ef.is_empty() {
                c.arg("-c").arg(format!("model_reasoning_effort=\"{}\"", match crate::prov::ef(&j.ef) { "max" => "high", e => e }));
            }
            c.arg("-");
            stdin = format!("{}\n\n---\n\n{}", j.sys, j.p);
            if !dir.is_empty() {
                x.insert("CODEX_HOME".into(), dir.clone());
            }
        }
        _ => {
            let gd = rd.join(".gemini");
            let _ = std::fs::create_dir_all(&gd);
            let mut st = json!({"coreTools": [], "tools": {"core": []}, "telemetry": {"enabled": false}, "privacy": {"usageStatisticsEnabled": false}});
            if let Some(t) = &ta {
                st["mcpServers"] = json!({"office": {"command": me, "args": ["mcp", port, t], "trust": true, "timeout": 10800000}});
            }
            let _ = std::fs::write(gd.join("settings.json"), st.to_string());
            c.args(["-o", "stream-json", "--skip-trust", "--allowed-mcp-server-names", "office"]);
            if !j.md.is_empty() {
                c.args(["-m", &j.md]);
            }
            c.args(["-p", ""]);
            stdin = format!("{}\n\n---\n\n{}", j.sys, j.p);
            if !dir.is_empty() {
                x.insert("GEMINI_CLI_HOME".into(), dir.clone());
            }
        }
    }
    c.current_dir(&rd).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
    env(&mut c, &x);
    grp(&mut c);
    let mut ch = match c.spawn() {
        Ok(x) => x,
        Err(e) => {
            untoken(a, &tk);
            let _ = std::fs::remove_dir_all(&rd);
            return Err(Er::E(format!("{} does not start: {e}", b.display())));
        }
    };
    let pid = ch.id().unwrap_or(0);
    crate::tools::pid(a, j.tid, pid, true);
    if let Some(mut si) = ch.stdin.take() {
        tokio::spawn(async move {
            let _ = si.write_all(stdin.as_bytes()).await;
        });
    }
    let so = ch.stdout.take().unwrap();
    let mut se = ch.stderr.take().unwrap();
    let ert = tokio::spawn(async move {
        let mut b = vec![];
        let _ = se.read_to_end(&mut b).await;
        String::from_utf8_lossy(&b).chars().rev().take(4000).collect::<String>().chars().rev().collect::<String>()
    });
    let mut txt = String::new();
    let mut acc_txt = String::new();
    let (mut tin, mut tout) = (0i64, 0i64);
    let mut done = false;
    let mut errs = String::new();
    let aid = j.acc["id"].as_i64().unwrap_or(0);
    let rd2 = async {
        let mut l = BufReader::new(so).lines();
        while let Ok(Some(ln)) = l.next_line().await {
            let Ok(d) = serde_json::from_str::<Value>(&ln) else { continue };
            let ty = d["type"].as_str().unwrap_or("");
            match (k, ty) {
                ("claude", "rate_limit_event") => crate::prov::rl(a, aid, &d["rate_limit_info"]),
                ("claude", "assistant") => {
                    for c in d["message"]["content"].as_array().cloned().unwrap_or_default() {
                        if c["type"] == "text" {
                            let t = c["text"].as_str().unwrap_or("");
                            if !t.trim().is_empty() {
                                a.say(j.who, t, j.rc.as_ref().map(|r| r.tk));
                            }
                        }
                    }
                }
                ("claude", "result") => {
                    txt = d["result"].as_str().unwrap_or("").to_string();
                    let u = &d["usage"];
                    tin += u["input_tokens"].as_i64().unwrap_or(0) + u["cache_creation_input_tokens"].as_i64().unwrap_or(0) + u["cache_read_input_tokens"].as_i64().unwrap_or(0) / 10;
                    tout += u["output_tokens"].as_i64().unwrap_or(0);
                    if d["is_error"].as_bool() == Some(true) || d["subtype"] != "success" {
                        errs.push_str(&format!(" {} {}", d["subtype"].as_str().unwrap_or(""), d["result"].as_str().unwrap_or("")));
                    }
                    done = true;
                }
                ("codex", "item.completed") => {
                    let it = &d["item"];
                    if it["type"] == "agent_message" {
                        txt = it["text"].as_str().unwrap_or("").to_string();
                        a.say(j.who, &txt, j.rc.as_ref().map(|r| r.tk));
                    }
                }
                ("codex", "turn.completed") => {
                    let u = &d["usage"];
                    tin += u["input_tokens"].as_i64().unwrap_or(0) - u["cached_input_tokens"].as_i64().unwrap_or(0) * 9 / 10;
                    tout += u["output_tokens"].as_i64().unwrap_or(0);
                    done = true;
                }
                ("codex", "turn.failed") | ("codex", "error") => {
                    errs.push_str(&format!(" {}", d["error"]["message"].as_str().or(d["message"].as_str()).unwrap_or("")));
                }
                ("gemini", "message") => {
                    if d["role"] == "assistant" {
                        let t = d["content"].as_str().unwrap_or("");
                        if d["delta"].as_bool() == Some(true) {
                            acc_txt.push_str(t);
                        } else {
                            acc_txt = t.to_string();
                        }
                    }
                }
                ("gemini", "result") => {
                    let s = &d["stats"];
                    tin += s["input_tokens"].as_i64().or(s["prompt_tokens"].as_i64()).unwrap_or(0);
                    tout += s["output_tokens"].as_i64().or(s["candidates_tokens"].as_i64()).unwrap_or(0);
                    if d["status"] == "error" {
                        errs.push_str(&format!(" {}", d["error"]["message"].as_str().unwrap_or("")));
                    }
                    done = true;
                }
                ("gemini", "error") => errs.push_str(&format!(" {}", d["message"].as_str().unwrap_or(""))),
                _ => {}
            }
        }
    };
    let to = tokio::time::timeout(Duration::from_secs(j.min * 60), rd2).await;
    if to.is_err() {
        kill(pid);
    }
    let _ = tokio::time::timeout(Duration::from_secs(10), ch.wait()).await;
    kill(pid);
    crate::tools::pid(a, j.tid, pid, false);
    untoken(a, &tk);
    let er = ert.await.unwrap_or_default();
    if k == "codex" && txt.is_empty() {
        txt = std::fs::read_to_string(rd.join("last.txt")).unwrap_or_default();
    }
    if k == "gemini" {
        txt = acc_txt;
    }
    let _ = std::fs::remove_dir_all(&rd);
    *u = (tin.max(0), tout.max(0));
    if to.is_err() {
        return Err(Er::E(format!("timeout after {} min", j.min)));
    }
    let all = format!("{errs} {er}");
    if limtxt(&all) && (txt.is_empty() || !errs.trim().is_empty()) {
        return Err(Er::Lim(None, all.trim().chars().take(200).collect()));
    }
    if txt.trim().is_empty() || (!done && k != "gemini") {
        return Err(Er::E(format!("{} returned no result: {}", crate::prov::bin(k), all.trim().chars().rev().take(400).collect::<String>().chars().rev().collect::<String>())));
    }
    if !errs.trim().is_empty() && k != "codex" {
        return Err(Er::E(errs.trim().chars().take(2000).collect()));
    }
    Ok(Res { txt, tin: 0, tout: 0 })
}

pub async fn test(a: &Ax, acc: &Value) -> Result<String, String> {
    let md = crate::prov::tier(acc, "small");
    let j = Job { acc: acc.clone(), md: md.clone(), ef: "low".into(), sys: "Answer with exactly one word.".into(), p: "Say: ready".into(), turns: 1, min: 3, rc: None, who: 0, tid: 0, fl: 0 };
    let t0 = std::time::Instant::now();
    match go(a, j).await {
        Ok(r) => {
            crate::prov::ok(a, acc["id"].as_i64().unwrap_or(0));
            Ok(format!("{} ({:.1} s, model {})", r.txt.trim().chars().take(60).collect::<String>(), t0.elapsed().as_secs_f64(), if md.is_empty() { "default".into() } else { md }))
        }
        Err(e) => {
            crate::prov::err(a, acc["id"].as_i64().unwrap_or(0), &e.to_string());
            Err(e.to_string())
        }
    }
}

pub async fn detect() -> Value {
    let mut o = json!({});
    for k in ["claude", "codex", "gemini"] {
        let p = which(k);
        let mut v = json!({"found": p.is_some(), "path": p.as_ref().map(|x| x.display().to_string())});
        if let Some(p) = p {
            let mut c = Command::new(&p);
            c.arg("--version").stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null()).kill_on_drop(true);
            env(&mut c, &HashMap::new());
            if let Ok(Ok(o)) = tokio::time::timeout(Duration::from_secs(15), c.output()).await {
                v["ver"] = json!(String::from_utf8_lossy(&o.stdout).trim().lines().next().unwrap_or("").to_string());
            }
            if k == "codex" {
                let mut c = Command::new(&p);
                c.args(["login", "status"]).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
                env(&mut c, &HashMap::new());
                if let Ok(Ok(o)) = tokio::time::timeout(Duration::from_secs(15), c.output()).await {
                    let s = format!("{}{}", String::from_utf8_lossy(&o.stdout), String::from_utf8_lossy(&o.stderr));
                    v["login"] = json!(s.to_lowercase().contains("logged in"));
                }
            }
            if k == "claude" {
                let h = dirs::home_dir().unwrap_or_default();
                v["login"] = json!(h.join(".claude/.credentials.json").exists() || h.join(".claude.json").exists() || cfg!(target_os = "macos"));
            }
        }
        o[k] = v;
    }
    o["bash"] = json!(crate::sh::bash().map(|b| b.display().to_string()));
    o
}

pub fn login_cmd(k: &str, dir: &str) -> String {
    let b = crate::prov::bin(k);
    let sub = match k {
        "codex" => " login",
        _ => "",
    };
    if dir.is_empty() {
        return format!("{b}{sub}");
    }
    let var = match k {
        "claude" => "CLAUDE_CONFIG_DIR",
        "codex" => "CODEX_HOME",
        _ => "GEMINI_CLI_HOME",
    };
    if cfg!(windows) {
        format!("set \"{var}={dir}\" && {b}{sub}")
    } else {
        format!("{var}='{dir}' {b}{sub}")
    }
}

pub fn term(cmd: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("cmd").args(["/c", "start", "ApolloOffice Login", "cmd", "/k", cmd]).spawn().map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        let s = format!("tell application \"Terminal\" to do script {}", json!(cmd));
        std::process::Command::new("osascript").args(["-e", &s, "-e", "tell application \"Terminal\" to activate"]).spawn().map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        for t in ["x-terminal-emulator", "gnome-terminal", "konsole", "kitty", "alacritty", "xterm"] {
            if which(t).is_some() {
                let r = if t == "gnome-terminal" { std::process::Command::new(t).args(["--", "sh", "-c", &format!("{cmd}; exec $SHELL")]).spawn() } else { std::process::Command::new(t).args(["-e", "sh", "-c", &format!("{cmd}; exec $SHELL")]).spawn() };
                return r.map(|_| ()).map_err(|e| e.to_string());
            }
        }
        Err("no terminal found".into())
    }
}
