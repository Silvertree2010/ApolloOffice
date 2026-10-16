use crate::cfg::Ax;
use crate::pa;
use crate::ssh::q;
use crate::tools::Rc;
use base64::Engine;
use regex::Regex;
use serde_json::Value;
use std::sync::OnceLock;

const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;

pub fn on(rc: &Rc) -> bool {
    rc.ctx["srv"].as_i64().is_some() && rc.ctx["dir"].as_str().is_some()
}

fn bad() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"(?i)\bgit\s+(push|remote|config\s+--global|credential)|\bgh\b|\bcurl\b|\bwget\b|\bssh\b|\bscp\b|rm\s+-rf\s+[~/$]|\bsudo\b|security\s+find|\.ssh\b|keychain").unwrap())
}

pub fn dir_ok(d: &str) -> bool {
    !d.is_empty() && d.chars().all(|c| c.is_ascii_alphanumeric() || "_./$-".contains(c)) && !d.split('/').any(|p| p == "..")
}

fn rel(p: &str) -> Result<String, String> {
    let p = p.trim().trim_start_matches("./");
    let p = if p.is_empty() { "." } else { p };
    if p.starts_with('/') || p.starts_with('~') || p.split('/').any(|x| x == "..") {
        return Err("path must stay inside the workspace (relative, no ..)".into());
    }
    Ok(p.to_string())
}

fn srv(a: &Ax, rc: &Rc) -> Result<(Value, String), String> {
    let id = rc.ctx["srv"].as_i64().unwrap_or(0);
    let ok: Vec<i64> = rc.wc["srv"].as_array().map(|x| x.iter().filter_map(|v| v.as_i64()).collect()).unwrap_or_default();
    if !ok.contains(&id) {
        return Err("this task's workspace is on a server you may not use".into());
    }
    let sv = a.db.one("select * from srv where id=?", pa![id]).ok_or("the workspace server no longer exists")?;
    let d = rc.ctx["dir"].as_str().unwrap_or("").to_string();
    if !dir_ok(&d) {
        return Err("invalid workspace folder".into());
    }
    Ok((sv, d))
}

async fn x(a: &Ax, sv: &Value, d: &str, sc: &str, secs: u64) -> Result<(i32, String, String), String> {
    crate::ssh::rx(a, sv, &format!("cd \"{d}\" || exit 97\n{sc}"), secs).await
}

pub async fn call(a: &Ax, rc: &Rc, n: &str, v: &Value) -> Result<String, String> {
    let s = |k: &str| v[k].as_str().unwrap_or("").to_string();
    let (sv, d) = srv(a, rc)?;
    let ck = |r: (i32, String, String), w: &str| -> Result<String, String> {
        if r.0 == 97 {
            return Err("workspace folder is missing on the server".into());
        }
        if r.0 != 0 {
            return Err(format!("{w} failed: {}", crate::sh::cut(if r.2.trim().is_empty() { &r.1 } else { &r.2 }, 400)));
        }
        Ok(r.1)
    };
    match n {
        "read" => {
            let f = v["from"].as_u64().unwrap_or(1).max(1);
            let k = v["n"].as_u64().unwrap_or(500).min(3000);
            let o = ck(x(a, &sv, &d, &format!("awk -v a={f} -v b={} 'NR>=a && NR<=b {{printf \"%6d\\t%s\\n\", NR, $0}}' {}", f + k - 1, q(&rel(&s("path"))?)), 120).await?, "read")?;
            Ok(if o.is_empty() { "(empty or past the end)".into() } else { o })
        }
        "write" => {
            let p = rel(&s("path"))?;
            let b = B64.encode(s("text").as_bytes());
            ck(x(a, &sv, &d, &format!("mkdir -p \"$(dirname {p})\" && base64 -d > {p} <<'B64'\n{b}\nB64", p = q(&p)), 120).await?, "write")?;
            Ok(format!("wrote {p}"))
        }
        "edit" => {
            let p = rel(&s("path"))?;
            let o = ck(x(a, &sv, &d, &format!("base64 < {}", q(&p)), 120).await?, "read")?;
            let t = String::from_utf8(B64.decode(o.split_whitespace().collect::<String>()).map_err(|e| e.to_string())?).map_err(|_| "file is not text".to_string())?;
            let (old, nw) = (s("old"), s("new"));
            if old.is_empty() {
                return Err("old is empty".into());
            }
            let k = t.matches(&old).count();
            if k == 0 {
                return Err("old string not found".into());
            }
            let all = v["all"].as_bool() == Some(true);
            if k > 1 && !all {
                return Err(format!("old string found {k} times, make it unique or set all"));
            }
            let nt = if all { t.replace(&old, &nw) } else { t.replacen(&old, &nw, 1) };
            ck(x(a, &sv, &d, &format!("base64 -d > {} <<'B64'\n{}\nB64", q(&p), B64.encode(nt.as_bytes())), 120).await?, "write")?;
            Ok(format!("replaced {}", if all { k } else { 1 }))
        }
        "grep" => {
            let p = rel(&s("path"))?;
            let i = if v["i"].as_bool() == Some(true) { "-i " } else { "" };
            let r = x(a, &sv, &d, &format!("if git rev-parse --git-dir >/dev/null 2>&1; then git grep -n -I -E {i}-e {pt} -- {p}; else grep -rnIE {i}--exclude-dir=.git --exclude-dir=target --exclude-dir=node_modules -e {pt} {p}; fi | head -300", pt = q(&s("pattern")), p = q(&p)), 300).await?;
            Ok(if r.1.trim().is_empty() { "(no matches)".into() } else { r.1 })
        }
        "ls" => {
            let p = q(&rel(&s("path"))?);
            let sc = if v["deep"].as_bool() == Some(true) { format!("cd {p} && find . -type d \\( -name .git -o -name target -o -name node_modules \\) -prune -o -type f -print | sed 's|^./||' | head -2000") } else { format!("ls -1Ap {p}") };
            let o = ck(x(a, &sv, &d, &sc, 120).await?, "ls")?;
            Ok(if o.trim().is_empty() { "(empty)".into() } else { o })
        }
        "delete" => {
            let p = rel(&s("path"))?;
            if p == "." {
                return Err("the workspace itself cannot be deleted".into());
            }
            ck(x(a, &sv, &d, &format!("rm -rf {}", q(&p)), 300).await?, "delete")?;
            Ok(format!("deleted {p}"))
        }
        "sh" => {
            let c = s("cmd");
            if bad().is_match(&c) {
                return Err("command not allowed on a server workspace (push, gh, curl, wget, ssh, sudo, credentials)".into());
            }
            crate::perm::shok(&rc.pm, &c)?;
            let mx = rc.dl.map(|t| ((t - crate::db::now()) / 60_000).max(1) as u64).unwrap_or(60);
            let min = v["min"].as_u64().unwrap_or(20).clamp(1, 60).min(mx);
            let r = x(a, &sv, &d, &format!("{{ {c}\n}} 2>&1; echo \"[exit $?]\""), min * 60).await?;
            if r.0 == 97 {
                return Err("workspace folder is missing on the server".into());
            }
            let o = format!("{}{}", r.1, r.2);
            Ok(crate::sh::cut(&o, 30000))
        }
        _ => Err(format!("{n} is not available in a server workspace")),
    }
}
