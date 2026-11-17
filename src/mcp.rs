use crate::app::{Ax, Rn};
use crate::sh::{hx, q};
use base64::Engine;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

pub const BAD: &str = r"(?i)\bgit\s+(push|remote|config|credential)|\.git/(hooks|config|info)|hooksPath|fsmonitor|\bgh\b|\bcurl\b.*\|\s*(ba)?sh|\bwget\b.*\|\s*(ba)?sh|\bssh\b|\bscp\b|rm\s+-rf\s+[~/$]|\bsudo\b|security\s+find|\.ssh\b|keychain|GIT_CONFIG|extraheader";

fn pa(p: &str) -> Result<String, String> {
    let s = p.trim().trim_start_matches('/');
    let mut o: Vec<&str> = vec![];
    for c in s.split(['/', '\\']) {
        match c {
            "" | "." => {}
            ".." => return Err("path outside repo".into()),
            x => o.push(x),
        }
    }
    Ok(if o.is_empty() { ".".into() } else { o.join("/") })
}

fn pw(p: &str) -> Result<String, String> {
    let s = pa(p)?;
    if s == ".git" || s.to_lowercase().starts_with(".git/") {
        return Err("writing inside .git is not allowed".into());
    }
    Ok(s)
}

pub fn defs() -> Vec<(&'static str, &'static str, Value)> {
    vec![
        ("read", "Read a file in the repo (path relative to repo root). Returns numbered lines.", json!({"type": "object", "properties": {"path": {"type": "string"}, "from": {"type": "number"}, "n": {"type": "number"}}, "required": ["path"]})),
        ("write", "Create or overwrite a file in the repo with the given text.", json!({"type": "object", "properties": {"path": {"type": "string"}, "text": {"type": "string"}}, "required": ["path", "text"]})),
        ("edit", "Replace an exact string in a file. old must match exactly once unless all=true.", json!({"type": "object", "properties": {"path": {"type": "string"}, "old": {"type": "string"}, "new": {"type": "string"}, "all": {"type": "boolean"}}, "required": ["path", "old", "new"]})),
        ("grep", "Search tracked files with git grep -n -E. Optional path or glob to narrow.", json!({"type": "object", "properties": {"pattern": {"type": "string"}, "path": {"type": "string"}}, "required": ["pattern"]})),
        ("ls", "List a directory in the repo.", json!({"type": "object", "properties": {"path": {"type": "string"}}})),
        ("sh", "Run a shell command (bash) in the repo root on the build machine. For builds, tests and git (no push). Output is truncated to the last 30000 chars. Default timeout 20 min, max 60; free-first model commands are capped at 3 min.", json!({"type": "object", "properties": {"cmd": {"type": "string"}, "min": {"type": "number"}}, "required": ["cmd"]})),
    ]
}

pub fn allowed(r: &Rn, n: &str) -> bool {
    match &r.tl {
        None => !n.starts_with("gh_"),
        Some(t) => (n == "sh" && t.iter().any(|x| x == "shell")) || (["read", "write", "edit", "grep", "ls"].contains(&n) && t.iter().any(|x| x == "files")) || (n.starts_with("gh_") && t.iter().any(|x| x == "github")),
    }
}

fn ghd() -> Vec<(&'static str, &'static str, Value)> {
    let rn = |extra: Value, req: &[&str]| {
        let mut p = json!({"repo": {"type": "string", "description": "owner/name"}, "number": {"type": "number"}});
        if let Some(o) = extra.as_object() {
            for (k, v) in o {
                p[k] = v.clone();
            }
        }
        json!({"type": "object", "properties": p, "required": req})
    };
    vec![
        ("gh_issue_view", "Read an issue with its labels and comments. Only in repositories added to the office.", rn(json!({}), &["repo", "number"])),
        ("gh_issue_list", "List issues of a repository.", json!({"type": "object", "properties": {"repo": {"type": "string"}, "state": {"type": "string", "enum": ["open", "closed", "all"]}, "label": {"type": "string"}, "limit": {"type": "number"}}, "required": ["repo"]})),
        ("gh_pr_view", "Read a pull request with files, reviews and comments.", rn(json!({}), &["repo", "number"])),
        ("gh_pr_list", "List pull requests of a repository.", json!({"type": "object", "properties": {"repo": {"type": "string"}, "state": {"type": "string", "enum": ["open", "closed", "merged", "all"]}, "limit": {"type": "number"}}, "required": ["repo"]})),
        ("gh_pr_diff", "Read the diff of a pull request.", rn(json!({}), &["repo", "number"])),
        ("gh_search_issues", "Search issues and pull requests in the repositories added to the office.", json!({"type": "object", "properties": {"query": {"type": "string"}, "limit": {"type": "number"}}, "required": ["query"]})),
        ("gh_comment", "Comment on an issue or pull request. Only in repositories added to the office. Posted under the owner's account with an AI note.", rn(json!({"body": {"type": "string"}}), &["repo", "number", "body"])),
        ("gh_label", "Add or remove labels on an issue or pull request. Only in repositories added to the office.", rn(json!({"add": {"type": "array", "items": {"type": "string"}}, "remove": {"type": "array", "items": {"type": "string"}}}), &["repo", "number"])),
        ("gh_issue_create", "Open a new issue. Only in repositories added to the office. Posted under the owner's account with an AI note.", json!({"type": "object", "properties": {"repo": {"type": "string"}, "title": {"type": "string"}, "body": {"type": "string"}, "labels": {"type": "array", "items": {"type": "string"}}}, "required": ["repo", "title", "body"]})),
    ]
}

pub fn defs_for(r: &Rn) -> Vec<(&'static str, &'static str, Value)> {
    defs().into_iter().chain(ghd()).filter(|(n, ..)| allowed(r, n)).collect()
}

const AINOTE: &str = "\n\n<sub>Written by an AI worker in ApolloOffice.</sub>";

fn repo_ok(r: &str) -> bool {
    regex::Regex::new(r"^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$").unwrap().is_match(r) && !r.contains("..")
}

async fn ghcall(a: &Ax, n: &str, g: &Value) -> Result<String, String> {
    let s = |k: &str| g[k].as_str().unwrap_or("").trim().to_string();
    let repo = s("repo");
    let num = g["number"].as_u64().map(|x| x.to_string()).unwrap_or_default();
    let lim = g["limit"].as_u64().unwrap_or(20).clamp(1, 100).to_string();
    if n != "gh_search_issues" && !repo_ok(&repo) {
        return Err("repo must be owner/name".into());
    }
    if n != "gh_search_issues" && a.db.n("select count(*) from rp where lower(full)=lower(?)", crate::pa![repo.clone()]) == 0 {
        return Err(format!("{repo} is not added to the office, so workers may not use it"));
    }
    if matches!(n, "gh_issue_view" | "gh_pr_view" | "gh_pr_diff" | "gh_comment" | "gh_label") && num.is_empty() {
        return Err("number is required".into());
    }
    let st = s("state");
    let st = if st.is_empty() { "open".to_string() } else { st };
    let o = match n {
        "gh_issue_view" => crate::sh::gh(&["issue", "view", &num, "-R", &repo, "--json", "number,title,body,state,author,labels,comments,url"], 60).await,
        "gh_issue_list" => {
            let lb = s("label");
            let mut v = vec!["issue", "list", "-R", &repo, "--state", &st, "--limit", &lim, "--json", "number,title,state,labels,author,createdAt,url"];
            if !lb.is_empty() {
                v.extend(["--label", &lb]);
            }
            crate::sh::gh(&v, 60).await
        }
        "gh_pr_view" => crate::sh::gh(&["pr", "view", &num, "-R", &repo, "--json", "number,title,body,state,author,files,reviews,comments,mergeable,url"], 60).await,
        "gh_pr_list" => crate::sh::gh(&["pr", "list", "-R", &repo, "--state", &st, "--limit", &lim, "--json", "number,title,state,author,createdAt,url"], 60).await,
        "gh_pr_diff" => crate::sh::gh(&["pr", "diff", &num, "-R", &repo], 90).await,
        "gh_search_issues" => {
            let qy = s("query");
            if qy.is_empty() {
                return Err("query is required".into());
            }
            let rs: Vec<String> = a.db.all("select full from rp order by full", crate::pa![]).iter().filter_map(|x| x["full"].as_str().map(|f| format!("repo:{f}"))).collect();
            if rs.is_empty() {
                return Err("no repositories are added to the office".into());
            }
            let qq = format!("{} {}", qy.split_whitespace().filter(|t| !t.to_lowercase().starts_with("repo:") && !t.to_lowercase().starts_with("org:") && !t.to_lowercase().starts_with("user:")).collect::<Vec<_>>().join(" "), rs.join(" "));
            crate::sh::gh(&["search", "issues", "--limit", &lim, "--json", "number,title,state,repository,url", "--", &qq], 60).await
        }
        "gh_comment" => {
            let b = s("body");
            if b.is_empty() {
                return Err("body is required".into());
            }
            crate::sh::gh(&["issue", "comment", &num, "-R", &repo, "--body", &format!("{b}{AINOTE}")], 60).await
        }
        "gh_label" => {
            let add: Vec<String> = g["add"].as_array().map(|x| x.iter().filter_map(|v| v.as_str().map(String::from)).collect()).unwrap_or_default();
            let rm: Vec<String> = g["remove"].as_array().map(|x| x.iter().filter_map(|v| v.as_str().map(String::from)).collect()).unwrap_or_default();
            if add.is_empty() && rm.is_empty() {
                return Err("add or remove at least one label".into());
            }
            let (ja, jr) = (add.join(","), rm.join(","));
            let mut v = vec!["issue", "edit", &num, "-R", &repo];
            if !ja.is_empty() {
                v.extend(["--add-label", &ja]);
            }
            if !jr.is_empty() {
                v.extend(["--remove-label", &jr]);
            }
            crate::sh::gh(&v, 60).await
        }
        "gh_issue_create" => {
            let (t, b) = (s("title"), s("body"));
            if t.is_empty() || b.is_empty() {
                return Err("title and body are required".into());
            }
            let lb: Vec<String> = g["labels"].as_array().map(|x| x.iter().filter_map(|v| v.as_str().map(String::from)).collect()).unwrap_or_default();
            let jl = lb.join(",");
            let body = format!("{b}{AINOTE}");
            let mut v = vec!["issue", "create", "-R", &repo, "--title", &t, "--body", &body];
            if !jl.is_empty() {
                v.extend(["--label", &jl]);
            }
            crate::sh::gh(&v, 60).await
        }
        _ => return Err("unknown tool".into()),
    }?;
    Ok(crate::sh::head(&o, 60_000))
}

pub async fn call(a: &Ax, r: &Rn, n: &str, g: &Value) -> Result<String, String> {
    let o = call0(a, r, n, g).await;
    if r.sec.is_empty() {
        return o;
    }
    o.map(|t| crate::eng::redact(&t, &r.sec)).map_err(|e| crate::eng::redact(&e, &r.sec))
}

async fn call0(a: &Ax, r: &Rn, n: &str, g: &Value) -> Result<String, String> {
    if !allowed(r, n) {
        return Err(format!("the tool {n} is not allowed for this worker"));
    }
    if n.starts_with("gh_") {
        if !r.w.is_empty() {
            a.cmd(&r.w, &format!("github: {n} {}", g["repo"].as_str().unwrap_or("")));
        }
        return ghcall(a, n, g).await;
    }
    let d = &r.dir;
    let s = |k: &str| g[k].as_str().unwrap_or("").to_string();
    if !r.w.is_empty() {
        let x = match n {
            "sh" => s("cmd"),
            "grep" => s("pattern"),
            _ => s("path"),
        };
        a.cmd(&r.w, &format!("{}: {n} {}", r.h, x.split_whitespace().collect::<Vec<_>>().join(" ")));
    }
    match n {
        "read" => {
            let f = g["from"].as_u64().unwrap_or(1).max(1);
            let c = g["n"].as_u64().unwrap_or(400).clamp(1, 2000);
            let o = hx(a, &r.h, &format!("cd \"{d}\" && awk -v a={f} -v b={} 'NR>=a && NR<=b {{printf \"%6d\\t%s\\n\", NR, $0}}' {}", f + c - 1, q(&pa(&s("path"))?)), 120).await;
            if o.c != 0 {
                return Err(if o.e.trim().is_empty() { "read failed".into() } else { o.e });
            }
            Ok(if o.o.is_empty() { "(empty or past end)".into() } else { o.o })
        }
        "write" => wr(a, r, &pw(&s("path"))?, &s("text")).await.map(|_| "ok".into()),
        "edit" => {
            let p = pw(&s("path"))?;
            let o = hx(a, &r.h, &format!("cd \"{d}\" && base64 < {}", q(&p)), 120).await;
            if o.c != 0 {
                return Err(if o.e.trim().is_empty() { "read failed".into() } else { o.e });
            }
            let b = base64::engine::general_purpose::STANDARD.decode(o.o.split_whitespace().collect::<String>()).map_err(|e| e.to_string())?;
            let t = String::from_utf8(b).map_err(|_| "file is not UTF-8".to_string())?;
            let (ol, nw) = (s("old"), s("new"));
            if ol.is_empty() {
                return Err("old must not be empty".into());
            }
            let k = t.matches(&ol).count();
            if k == 0 {
                return Err("old string not found".into());
            }
            let al = g["all"].as_bool().unwrap_or(false);
            if k > 1 && !al {
                return Err(format!("old string found {k} times, make it unique or set all"));
            }
            let nt = if al { t.replace(&ol, &nw) } else { t.replacen(&ol, &nw, 1) };
            wr(a, r, &p, &nt).await?;
            Ok(format!("replaced {}", if al { k } else { 1 }))
        }
        "grep" => {
            let pt = g["path"].as_str().map(|x| q(x)).unwrap_or(".".into());
            let o = hx(a, &r.h, &format!("cd \"{d}\" && git grep -n -I -E -e {} -- {pt} | head -300", q(&s("pattern"))), 120).await;
            Ok(if o.o.is_empty() { "(no matches)".into() } else { o.o })
        }
        "ls" => Ok(hx(a, &r.h, &format!("cd \"{d}\" && ls -la {}", q(&pa(g["path"].as_str().unwrap_or("."))?)), 60).await.all()),
        "sh" => {
            let c = s("cmd");
            if regex::Regex::new(BAD).unwrap().is_match(&c) {
                return Err("command not allowed here".into());
            }
            let m = g["min"].as_u64().unwrap_or(20).clamp(1, 60);
            let m=if crate::routing::enabled(a) && crate::routing::is_free(&r.md) {m.min(3)} else {m};
            // The controller already prepared this project environment. Make it
            // the default for model commands too, including commands that cd
            // into a subdirectory. Never source repository activation scripts.
            let env = "if [ -x .venv/bin/python ]; then export VIRTUAL_ENV=\"$PWD/.venv\"; export PATH=\"$PWD/.venv/bin:$PATH\"; fi";
            let ex: String = r.sec.iter().map(|(n, v)| format!("export {n}={}; ", q(v))).collect();
            let o = hx(a, &r.h, &format!("cd \"{d}\" && {{ {ex}{env}; to {} bash -c {}\n}} 2>&1; echo \"[exit $?]\"", m * 60, q(&c)), m * 60 + 30).await;
            let t = o.all();
            Ok(if t.len() > 30000 { format!("…{}", crate::sh::last(&t, 30000)) } else { t })
        }
        _ => Err("unknown tool".into()),
    }
}

async fn wr(a: &Ax, r: &Rn, p: &str, t: &str) -> Result<(), String> {
    let b = base64::engine::general_purpose::STANDARD.encode(t.as_bytes());
    let o = hx(a, &r.h, &format!("cd \"{}\" && c=; IFS=/ read -ra xs <<< {p}; for x in \"${{xs[@]}}\"; do c=\"${{c:+$c/}}$x\"; if [ -L \"$c\" ]; then echo 'path goes through a symlink' >&2; exit 9; fi; done; mkdir -p \"$(dirname {p})\" && base64 -d > {p} <<'B64'\n{b}\nB64", r.dir, p = q(p)), 120).await;
    if o.c != 0 {
        return Err(if o.e.trim().is_empty() { "write failed".into() } else { o.e });
    }
    Ok(())
}

pub async fn handle(a: &Ax, t: &str, m: &Value) -> Value {
    let id = m["id"].clone();
    let Some(r) = a.runs.lock().unwrap().get(t).cloned() else { return json!({"jsonrpc": "2.0", "id": id, "error": {"code": -32001, "message": "run is over"}}) };
    match m["method"].as_str().unwrap_or("") {
        "initialize" => json!({"jsonrpc": "2.0", "id": id, "result": {"protocolVersion": m["params"]["protocolVersion"].as_str().unwrap_or("2025-06-18"), "capabilities": {"tools": {}}, "serverInfo": {"name": "office", "version": crate::app::V}}}),
        "tools/list" => json!({"jsonrpc": "2.0", "id": id, "result": {"tools": defs_for(&r).into_iter().map(|(n, d, s)| json!({"name": n, "description": d, "inputSchema": s})).collect::<Vec<_>>()}}),
        "tools/call" => {
            let n = m["params"]["name"].as_str().unwrap_or("");
            let g = if m["params"]["arguments"].is_object() { m["params"]["arguments"].clone() } else { json!({}) };
            match call(a, &r, n, &g).await {
                Ok(x) => json!({"jsonrpc": "2.0", "id": id, "result": {"content": [{"type": "text", "text": crate::sh::head(&x, 100_000)}]}}),
                Err(e) => json!({"jsonrpc": "2.0", "id": id, "result": {"content": [{"type": "text", "text": format!("error: {e}")}], "isError": true}}),
            }
        }
        "ping" => json!({"jsonrpc": "2.0", "id": id, "result": {}}),
        _ => json!({"jsonrpc": "2.0", "id": id, "error": {"code": -32601, "message": "method not found"}}),
    }
}

pub async fn bridge(port: u16, t: String) {
    let t = match t.strip_prefix('@') {
        Some(f) => std::fs::read_to_string(f).unwrap_or_default().trim().to_string(),
        None => t,
    };
    let c = reqwest::Client::builder().no_proxy().timeout(std::time::Duration::from_secs(4 * 3600)).build().unwrap();
    let mut l = BufReader::new(tokio::io::stdin()).lines();
    let mut out = tokio::io::stdout();
    while let Ok(Some(ln)) = l.next_line().await {
        let Ok(m) = serde_json::from_str::<Value>(&ln) else { continue };
        if m["id"].is_null() {
            continue;
        }
        let r = match c.post(format!("http://127.0.0.1:{port}/int/mcp")).header("x-run", &t).json(&m).send().await {
            Ok(r) => r.json::<Value>().await.unwrap_or_else(|e| json!({"jsonrpc": "2.0", "id": m["id"], "error": {"code": -32000, "message": e.to_string()}})),
            Err(e) => json!({"jsonrpc": "2.0", "id": m["id"], "error": {"code": -32000, "message": e.to_string()}}),
        };
        let _ = out.write_all(format!("{r}\n").as_bytes()).await;
        let _ = out.flush().await;
    }
}

#[cfg(test)]
mod t {

    #[test]
    fn scoped_tools() {
        let r = |t: Option<Vec<&str>>| super::Rn { h: "local".into(), dir: "/tmp".into(), w: String::new(), md: String::new(), tl: t.map(|v| v.into_iter().map(String::from).collect()), sec: vec![] };
        assert!(super::allowed(&r(None), "sh"));
        assert!(super::allowed(&r(Some(vec!["shell"])), "sh"));
        assert!(!super::allowed(&r(Some(vec!["shell"])), "write"));
        assert!(super::allowed(&r(Some(vec!["files"])), "edit"));
        assert!(!super::allowed(&r(Some(vec!["files"])), "sh"));
        assert_eq!(super::defs_for(&r(Some(vec!["files"]))).len(), 5);
        assert!(!super::allowed(&r(None), "gh_comment"));
        assert!(super::allowed(&r(Some(vec!["github"])), "gh_pr_diff"));
        assert!(!super::allowed(&r(Some(vec!["github"])), "sh"));
        assert_eq!(super::defs_for(&r(Some(vec!["github"]))).len(), 9);
        assert!(super::repo_ok("storytold/texturecraft") && !super::repo_ok("a/../b") && !super::repo_ok("x"));
    }

    use super::*;

    #[cfg(unix)]
    #[tokio::test]
    async fn shell_uses_prepared_project_environment_after_changing_directory() {
        use std::os::unix::fs::PermissionsExt;
        let root=std::env::temp_dir().join(format!("apollo-venv-{}",hex::encode(rand::random::<[u8;8]>())));
        std::fs::create_dir_all(root.join(".venv/bin")).unwrap();std::fs::create_dir(root.join("tool")).unwrap();
        let python=root.join(".venv/bin/python");
        std::fs::write(&python,"#!/bin/sh\nprintf 'prepared-project-python\\n'\n").unwrap();
        std::fs::set_permissions(&python,std::fs::Permissions::from_mode(0o755)).unwrap();
        std::os::unix::fs::symlink("python",root.join(".venv/bin/python3")).unwrap();
        std::fs::write(root.join(".venv/bin/activate"),"echo UNSAFE_ACTIVATION >&2; exit 90\n").unwrap();
        let db=crate::db::Db::mem();db.run("insert into hs(id,on_) values('local',1)",crate::pa![]);
        let a=std::sync::Arc::new(crate::app::App::new(db,root.clone(),1,"x".into()));
        let r=Rn{h:"local".into(),dir:root.display().to_string(),w:String::new(),md:String::new(),tl:None,sec:vec![]};
        let out=call(&a,&r,"sh",&json!({"cmd":"cd tool && python3 && printf '%s' \"$VIRTUAL_ENV\""})).await.unwrap();
        assert!(out.contains("prepared-project-python"),"{out}");assert!(out.contains(&root.join(".venv").display().to_string()),"{out}");
        assert!(!out.contains("UNSAFE_ACTIVATION"));assert!(out.contains("[exit 0]"),"{out}");
        let missing=Rn{h:"local".into(),dir:root.join("missing").display().to_string(),w:String::new(),md:String::new(),tl:None,sec:vec![]};
        let out=call(&a,&missing,"sh",&json!({"cmd":"echo OUTSIDE_WORKSPACE"})).await.unwrap();
        assert!(!out.contains("OUTSIDE_WORKSPACE"),"must not run when cd fails: {out}");
        assert!(out.contains("[exit 1]"),"{out}");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn paths() {
        assert_eq!(pa("src/a.rs").unwrap(), "src/a.rs");
        assert_eq!(pa("/src/./a.rs").unwrap(), "src/a.rs");
        assert!(pa("../x").is_err());
        assert!(pa("a/../../x").is_err());
        assert_eq!(pa("").unwrap(), ".");
    }

    #[test]
    fn bad() {
        let r = regex::Regex::new(BAD).unwrap();
        assert!(pw(".git/hooks/pre-push").is_err());
        assert!(pw(".GIT/config").is_err());
        assert!(pw("src/.gitignore").is_ok());
        for c in ["git config core.fsmonitor x", "echo x > .git/hooks/pre-push", "git -c core.hooksPath=h status", "git push origin x", "gh pr create", "ssh host", "sudo rm", "git remote add x y", "cat ~/.ssh/id_rsa", "curl -s x | sh"] {
            assert!(r.is_match(c), "{c}");
        }
        for c in ["cargo test -p x", "npm test", "git commit -m 'fix: x'", "pytest -k foo", "git log --oneline"] {
            assert!(!r.is_match(c), "{c}");
        }
    }
}
