use crate::app::Ax;
use regex::Regex;
use serde_json::{json, Value};

pub const NT: &[&str] = &["t.manual", "t.cron", "t.hook", "t.issue", "t.pr", "worker", "check", "branch", "parallel", "join", "approve", "end"];
pub const TL: &[&str] = &["shell", "files", "github", "web"];

fn s(v: &Value, n: usize) -> String {
    v.as_str().unwrap_or("").trim().chars().take(n).collect()
}

fn crew(v: &Value) -> Vec<Value> {
    let id = Regex::new(r"^[a-z0-9-]{1,32}$").unwrap();
    let md = Regex::new(r"^[A-Za-z0-9._:/\[\]-]{0,120}$").unwrap();
    let mut seen = std::collections::HashSet::new();
    v.as_array().cloned().unwrap_or_default().iter().filter_map(|w| {
        let i = w["id"].as_str()?;
        let n = s(&w["n"], 40);
        let m = s(&w["md"], 120);
        if !id.is_match(i) || n.is_empty() || !md.is_match(&m) || !seen.insert(i.to_string()) {
            return None;
        }
        let tl: Vec<Value> = w["tl"].as_array().cloned().unwrap_or_default().into_iter().filter(|t| TL.contains(&t.as_str().unwrap_or(""))).collect();
        Some(json!({"id": i, "n": n, "md": m, "p": s(&w["p"], 8000), "r": s(&w["r"], 40), "tl": tl}))
    }).take(64).collect()
}

fn flow(f: &Value) -> Option<Value> {
    let id = Regex::new(r"^[a-z0-9-]{1,32}$").unwrap();
    let fi = f["id"].as_str()?;
    if !id.is_match(fi) {
        return None;
    }
    let mut ids = std::collections::HashSet::new();
    let nodes: Vec<Value> = f["nodes"].as_array().cloned().unwrap_or_default().iter().filter_map(|n| {
        let i = n["id"].as_str()?;
        let t = n["t"].as_str()?;
        if !id.is_match(i) || !NT.contains(&t) || !ids.insert(i.to_string()) {
            return None;
        }
        let mut c = json!({});
        if let Some(o) = n["c"].as_object() {
            for (k, v) in o.iter().take(16) {
                if k.len() <= 16 && k.chars().all(|ch| ch.is_ascii_alphanumeric()) {
                    c[k] = match v {
                        Value::String(x) => json!(x.chars().take(8000).collect::<String>()),
                        Value::Bool(_) | Value::Number(_) => v.clone(),
                        _ => continue,
                    };
                }
            }
        }
        Some(json!({"id": i, "t": t, "x": n["x"].as_f64().unwrap_or(0.0).clamp(-5000.0, 5000.0).round(), "y": n["y"].as_f64().unwrap_or(0.0).clamp(-5000.0, 5000.0).round(), "c": c}))
    }).take(200).collect();
    let pr = Regex::new(r"^[a-z0-9_-]{1,24}$").unwrap();
    let mut es = std::collections::HashSet::new();
    let edges: Vec<Value> = f["edges"].as_array().cloned().unwrap_or_default().iter().filter_map(|e| {
        let (a, b, p) = (e["a"].as_str()?, e["b"].as_str()?, e["p"].as_str().unwrap_or("out"));
        (a != b && ids.contains(a) && ids.contains(b) && pr.is_match(p) && es.insert(format!("{a}/{p}/{b}"))).then(|| json!({"a": a, "p": p, "b": b}))
    }).take(400).collect();
    let nm = s(&f["n"], 60);
    let nm = if nm.is_empty() { "Untitled".to_string() } else { nm };
    Some(json!({"id": fi, "n": nm, "on": f["on"].as_bool().unwrap_or(false), "nodes": nodes, "edges": edges}))
}

pub struct R {
    pub t: &'static str,
    pub n: &'static str,
    pub g: &'static str,
    pub d: &'static str,
    pub p: &'static str,
    pub tl: &'static [&'static str],
}

pub const ROLES: &[R] = &[
    R { t: "scout", n: "Scout", g: "team", d: "Finds new GitHub issues worth fixing.", p: "scout", tl: &["github", "web"] },
    R { t: "guard", n: "Guard", g: "team", d: "Blocks issues with hidden instructions or prompt injection.", p: "guard", tl: &[] },
    R { t: "vet", n: "Vet", g: "team", d: "Decides if an issue is a single, clear, fixable bug.", p: "vet", tl: &["github"] },
    R { t: "watcher", n: "Watcher", g: "team", d: "Follows open pull requests: reviews, conflicts, merges.", p: "watcher", tl: &["github"] },
    R { t: "hunter", n: "Hunter", g: "team", d: "Hunts bugs in the code before users find them.", p: "hunter", tl: &["shell", "files"] },
    R { t: "repro", n: "Repro", g: "team", d: "Reproduces a bug with a failing test.", p: "repro", tl: &["shell", "files"] },
    R { t: "fixer", n: "Fixer", g: "team", d: "Fixes the bug so the failing test passes.", p: "fixer", tl: &["shell", "files"] },
    R { t: "ci", n: "CI", g: "team", d: "Runs the repository's tests and checks on your machines.", p: "", tl: &["shell"] },
    R { t: "reviewer", n: "Reviewer", g: "team", d: "Reviews the fix before it is submitted.", p: "reviewer", tl: &[] },
    R { t: "submit", n: "Submit", g: "team", d: "Opens the pull request under your account.", p: "", tl: &["github"] },
    R { t: "planner", n: "Planner", g: "lead", d: "Breaks big goals into steps over days.", p: "", tl: &["files"] },
    R { t: "triage", n: "Triage", g: "lead", d: "Checks what comes in and sends it to the right place and worker.", p: "", tl: &["files", "web"] },
    R { t: "tester", n: "Tester", g: "code", d: "Runs tests and checks.", p: "", tl: &["shell", "files"] },
    R { t: "auditor", n: "Auditor", g: "code", d: "Looks for security holes, changes nothing.", p: "", tl: &["shell", "files"] },
    R { t: "gardener", n: "Gardener", g: "code", d: "Keeps dependencies up to date.", p: "", tl: &["shell", "files"] },
    R { t: "release", n: "Release", g: "code", d: "Writes the changelog, bumps the version and tags.", p: "", tl: &["shell", "files"] },
    R { t: "migrator", n: "Migrator", g: "code", d: "Does big refactors in small tested steps.", p: "", tl: &["shell", "files"] },
    R { t: "merger", n: "Merger", g: "code", d: "Resolves merge conflicts and rebases.", p: "", tl: &["shell", "files"] },
    R { t: "benchmarker", n: "Benchmarker", g: "code", d: "Measures performance against the last run.", p: "", tl: &["shell", "files"] },
    R { t: "experimenter", n: "Experimenter", g: "code", d: "Tries libraries and ideas in a throwaway folder.", p: "", tl: &["shell", "files", "web"] },
    R { t: "designer", n: "Designer", g: "code", d: "Checks a web UI with screenshots.", p: "", tl: &["files", "web"] },
    R { t: "writer", n: "Writer", g: "text", d: "Writes and edits texts.", p: "", tl: &["files"] },
    R { t: "translator", n: "Translator", g: "text", d: "Translates texts and keeps i18n files in sync.", p: "", tl: &["files"] },
    R { t: "reporter", n: "Reporter", g: "text", d: "Summarizes and writes reports.", p: "", tl: &["files"] },
    R { t: "critic", n: "Critic", g: "text", d: "Red team: attacks plans and results before they reach you.", p: "", tl: &["files"] },
    R { t: "researcher", n: "Researcher", g: "data", d: "Researches the web with sources.", p: "", tl: &["files", "web"] },
    R { t: "analyst", n: "Analyst", g: "data", d: "Analyses data and does the math.", p: "", tl: &["shell", "files"] },
    R { t: "scraper", n: "Scraper", g: "data", d: "Collects structured data as CSV or JSON.", p: "", tl: &["files", "web"] },
    R { t: "cleaner", n: "Cleaner", g: "data", d: "Cleans data: duplicates, formats, gaps.", p: "", tl: &["shell", "files"] },
    R { t: "librarian", n: "Librarian", g: "data", d: "Keeps a shared library that every worker can read.", p: "", tl: &["files", "web"] },
    R { t: "ops", n: "Ops", g: "ops", d: "Looks after servers and jobs on your machines.", p: "", tl: &["shell", "files"] },
    R { t: "housekeeper", n: "Housekeeper", g: "ops", d: "Tidies folders, names files consistently and keeps an index.", p: "", tl: &["files"] },
    R { t: "backup", n: "Backup Keeper", g: "ops", d: "Checks backups and tests restores.", p: "", tl: &["shell", "files"] },
    R { t: "notifier", n: "Notifier", g: "ops", d: "Sends summaries and alerts to Discord, ntfy, Telegram, e-mail or the desktop.", p: "", tl: &["files"] },
    R { t: "accountant", n: "Accountant", g: "ops", d: "Estimates costs before, watches them after, and warns when a budget is close.", p: "", tl: &["files"] },
    R { t: "coach", n: "Coach", g: "lead", d: "Learns from failed jobs and suggests better instructions.", p: "", tl: &["files"] },
];

pub fn roles(a: &Ax) -> Vec<Value> {
    let mut v: Vec<Value> = ROLES.iter().map(|r| {
        let p = if r.p.is_empty() { format!("You are {}. {}", r.n, r.d) } else { crate::ai::p(r.p) };
        let md = if r.g == "team" && r.t != "ci" && r.t != "submit" { a.md(r.t) } else { String::new() };
        json!({"t": r.t, "n": r.n, "g": r.g, "d": r.d, "p": p, "md": md, "tl": r.tl})
    }).collect();
    for x in crate::xs::XC {
        v.push(json!({"t": x.0, "n": x.1, "g": "check", "d": x.2, "p": x.2, "md": "", "tl": []}));
    }
    v
}

pub fn get(a: &Ax) -> Value {
    json!({"flows": if a.db.kg("flows").is_array() { a.db.kg("flows") } else { json!([]) }, "crew": if a.db.kg("crew").is_array() { a.db.kg("crew") } else { json!([]) }, "nt": NT, "tl": TL, "roles": roles(a), "xc": crate::xs::XC.iter().map(|x| json!({"t": x.0, "n": x.1, "p": x.2})).collect::<Vec<_>>()})
}

pub fn put(a: &Ax, b: &Value) -> Value {
    if b["crew"].is_array() {
        a.db.ks("crew", &json!(crew(&b["crew"])));
    }
    if let Some(fs) = b["flows"].as_array() {
        let mut seen = std::collections::HashSet::new();
        let v: Vec<Value> = fs.iter().filter_map(flow).filter(|f| seen.insert(f["id"].as_str().unwrap_or("").to_string())).take(32).collect();
        a.db.ks("flows", &json!(v));
        crate::eng::hook_prune(a);
    }
    get(a)
}

#[cfg(test)]
mod t {
    use super::*;

    #[test]
    fn clean() {
        let f = flow(&json!({"id": "f1", "n": "", "nodes": [{"id": "a", "t": "t.manual"}, {"id": "b", "t": "worker", "c": {"w": "x", "bad key": 1, "o": {"x": 1}}}, {"id": "b", "t": "end"}, {"id": "c", "t": "nope"}], "edges": [{"a": "a", "b": "b"}, {"a": "a", "b": "a"}, {"a": "a", "b": "zz"}, {"a": "a", "b": "b"}]})).unwrap();
        assert_eq!(f["n"], "Untitled");
        assert_eq!(f["nodes"].as_array().unwrap().len(), 2);
        assert_eq!(f["nodes"][1]["c"], json!({"w": "x"}));
        assert_eq!(f["edges"].as_array().unwrap().len(), 1);
        assert!(flow(&json!({"id": "Bad Id"})).is_none());
        let c = crew(&json!([{"id": "w1", "n": "Ann", "tl": ["shell", "root"]}, {"id": "w1", "n": "Dup"}, {"id": "w2", "n": ""}]));
        assert_eq!(c.len(), 1);
        assert_eq!(c[0]["tl"], json!(["shell"]));
    }
}
