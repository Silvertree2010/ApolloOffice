use crate::ai::{ask, p as P, wrap, Ask};
use crate::app::{drop, e, sl, Ax, Rn, X, R};
use crate::db::{now, Job};
use crate::net::need;
use crate::pa;
use crate::sh::{gh, ghj, hb, hbid, ho, hosts, hx, hxl, q, Out};
use regex::Regex;
use serde_json::{json, Value};
use std::collections::BTreeSet;

pub const RND: u64 = 2;
const CIT: u64 = 150 * 60;

pub fn gitb() -> String {
    std::env::var("APOLLO_OFFICE_REMOTE").unwrap_or_else(|_| "https://github.com/".into())
}

pub fn slug(r: &str) -> String {
    r.replace('/', "__")
}

fn dir(a: &Ax, j: &Job) -> String {
    format!("{}/{}", hbid(a, &j.h()), slug(&j.repo))
}

pub fn rp(a: &Ax, r: &str) -> Value {
    a.db.one("select * from rp where full=?", pa![r.to_string()]).unwrap_or(json!({}))
}

fn oe(o: &Out, s: &str, h: &str) -> X {
    let m = format!("{h}: {} → exit {}: {}", crate::sh::head(s, 80), o.c, crate::sh::last(if o.e.trim().is_empty() { o.o.trim() } else { o.e.trim() }, 300));
    if crate::app::netish(&m) {
        X::Net(m)
    } else {
        X::E(m)
    }
}

pub(crate) async fn x(a: &Ax, j: &Job, s: &str, t: u64) -> Out {
    hx(a, &j.h(), &format!("cd \"{}\" && {s}", dir(a, j)), t).await
}

async fn ok(a: &Ax, j: &Job, s: &str, t: u64) -> R<String> {
    let ro = Regex::new(r"^git (log|diff|rev-parse|rev-list|status|symbolic-ref|range-diff) [^;&|]*(\| head -c \d+)?$").unwrap();
    let mut r = x(a, j, s, t).await;
    for _ in 0..2 {
        if r.c == 0 || !(r.all().trim().is_empty() || ro.is_match(s)) {
            break;
        }
        sl(15_000).await;
        r = x(a, j, s, t).await;
    }
    if r.c != 0 {
        return Err(oe(&r, s, &j.h()));
    }
    Ok(r.o.trim().to_string())
}

async fn tenv() -> R<Vec<(String, String)>> {
    let t = gh(&["auth", "token"], 30).await.map_err(X::E)?.trim().to_string();
    if t.is_empty() {
        return e("gh has no token, run gh auth login");
    }
    use base64::Engine;
    let h = format!("AUTHORIZATION: basic {}", base64::engine::general_purpose::STANDARD.encode(format!("x-access-token:{t}")));
    Ok(vec![("GIT_CONFIG_COUNT".into(), "3".into()), ("GIT_CONFIG_KEY_0".into(), "http.https://github.com/.extraheader".into()), ("GIT_CONFIG_VALUE_0".into(), h), ("GIT_CONFIG_KEY_1".into(), "core.hooksPath".into()), ("GIT_CONFIG_VALUE_1".into(), if cfg!(windows) { "NUL".into() } else { "/dev/null".into() }), ("GIT_CONFIG_KEY_2".into(), "core.fsmonitor".into()), ("GIT_CONFIG_VALUE_2".into(), "false".into()), ("GIT_TERMINAL_PROMPT".into(), "0".into()), ("GIT_CONFIG_NOSYSTEM".into(), "1".into())])
}

fn mir(a: &Ax, r: &str) -> std::path::PathBuf {
    a.dd.join("mirror").join(format!("{}.git", slug(r)))
}

async fn lg(a: &Ax, r: &str, av: &[&str], tok: bool, t: u64) -> Out {
    let m = mir(a, r);
    if !m.join("HEAD").exists() {
        let _ = std::fs::create_dir_all(&m);
        crate::sh::run(&crate::sh::tool("git"), &["init".into(), "-q".into(), "--bare".into(), m.display().to_string()], crate::sh::Rq::default()).await;
    }
    let env = if tok {
        match tenv().await {
            Ok(v) => v,
            Err(x) => return Out { c: -1, o: String::new(), e: x.to_string() },
        }
    } else {
        vec![("GIT_TERMINAL_PROMPT".into(), "0".into())]
    };
    let mut v: Vec<String> = vec!["--git-dir".into(), m.display().to_string()];
    v.extend(av.iter().map(|x| x.to_string()));
    crate::sh::run(&crate::sh::tool("git"), &v, crate::sh::Rq { t, env, ..Default::default() }).await
}

async fn lok(a: &Ax, r: &str, av: &[&str], tok: bool, t: u64) -> R<String> {
    let o = lg(a, r, av, tok, t).await;
    if o.c != 0 {
        return Err(oe(&o, &format!("git {}", av.iter().take(2).cloned().collect::<Vec<_>>().join(" ")), "office"));
    }
    Ok(o.o.trim().to_string())
}

async fn public(a: &Ax, j: &Job) -> R<bool> {
    let mt = crate::gh::meta(a, &j.repo).await.map_err(X::E)?;
    Ok(!mt["private"].as_bool().unwrap_or(true))
}

async fn ship(a: &Ax, j: &Job, src: &str, dst: &str) -> R<()> {
    let tg = lok(a, &j.repo, &["rev-parse", src], false, 60).await?;
    let have = x(a, j, &format!("git rev-parse -q --verify {}", q(dst)), 60).await.o.trim().to_string();
    if have == tg {
        return Ok(());
    }
    let f = a.dd.join("run").join(format!("ship-{}.bundle", j.id));
    let _ = std::fs::create_dir_all(f.parent().unwrap());
    let fs = f.display().to_string();
    let inc = !have.is_empty() && lg(a, &j.repo, &["cat-file", "-e", &format!("{have}^{{commit}}")], false, 60).await.c == 0;
    let ex = format!("^{have}");
    let mut av = vec!["bundle", "create", "-q", fs.as_str(), src];
    if inc {
        av.push(ex.as_str());
    }
    if lg(a, &j.repo, &av, false, 1800).await.c != 0 {
        lok(a, &j.repo, &["bundle", "create", "-q", &fs, src], false, 1800).await?;
    }
    use base64::Engine;
    let b = base64::engine::general_purpose::STANDARD.encode(std::fs::read(&f).map_err(|x| X::E(x.to_string()))?);
    let _ = std::fs::remove_file(&f);
    let tf = format!("/tmp/ao-in-{}.bundle", j.id);
    let r = x(a, j, &format!("base64 -d > {tf} <<'B64'\n{b}\nB64\ngit fetch -q --no-tags {tf} +{src}:{dst}; e=$?; rm -f {tf}; exit $e"), 1800).await;
    if r.c != 0 {
        return Err(oe(&r, "git fetch bundle", &j.h()));
    }
    Ok(())
}

async fn pull(a: &Ax, j: &Job, url: &str, br: &str, dst: &str) -> R<()> {
    if public(a, j).await? {
        let r = x(a, j, &format!("git fetch -q --no-tags {} +refs/heads/{}:{}", q(url), q(br), dst), 1800).await;
        if r.c != 0 {
            return Err(oe(&r, "git fetch", &j.h()));
        }
        return Ok(());
    }
    let tm = format!("refs/ao/in/{}", j.id);
    lok(a, &j.repo, &["fetch", "-q", "--no-tags", url, &format!("+refs/heads/{br}:{tm}")], true, 1800).await?;
    ship(a, j, &tm, dst).await
}

pub fn cfg_ok(l: &str, url: &str) -> Result<(), String> {
    let ok = Regex::new(r"^(core\.(repositoryformatversion|filemode|bare|logallrefupdates|ignorecase|precomposeunicode|symlinks)|remote\.origin\.(url|fetch|promisor|partialclonefilter)|branch\.[^=]*\.(remote|merge)|user\.(name|email)|extensions\.(objectformat|partialclone)|gc\.[a-z]+|maintenance\.[a-z]+|fetch\.[a-z]+|init\.[a-z]+)$").unwrap();
    for x in l.lines().map(|x| x.trim()).filter(|x| !x.is_empty()) {
        let (k, v) = x.split_once('=').unwrap_or((x, ""));
        let k = k.to_lowercase();
        if !ok.is_match(&k) {
            return Err(format!("unexpected git config {k}"));
        }
        if k == "remote.origin.url" && v != url {
            return Err("origin points somewhere else".into());
        }
    }
    Ok(())
}

fn use_(a: &Ax, j: &mut Job, md: &str) {
    let mut ms: Vec<String> = j.d["ms"].as_array().cloned().unwrap_or_default().iter().filter_map(|x| x.as_str().map(String::from)).collect();
    if !ms.iter().any(|x| x == md) {
        ms.push(md.into());
        j.d["ms"] = json!(ms);
        a.db.jd(j);
    }
}

fn trs(j: &Job) -> Vec<String> {
    let ms: BTreeSet<String> = j.d["ms"].as_array().cloned().unwrap_or_default().iter().filter_map(|x| x.as_str().map(|m| format!("Co-Authored-By: {} <{}>", crate::prov::name(m), crate::prov::mail(m)))).collect();
    ms.into_iter().collect()
}

pub const FOOT: &str = "🤖 Generated with AI by [ApolloOffice](https://github.com/Silvertree2010/ApolloOffice), see the Co-Authored-By trailers for the models";
pub const FOOT0: &str = "🤖 Generated with AI, see the Co-Authored-By trailers for the models";

fn fo(a: &Ax, j: &Job) -> &'static str {
    if rp(a, &j.repo)["nm"].as_i64().unwrap_or(1) == 1 {
        FOOT
    } else {
        FOOT0
    }
}

fn kill(a: &Ax, j: &Job) -> R<()> {
    if a.db.kg(&format!("kill:{}", j.id)).as_bool().unwrap_or(false) {
        return drop("dropped by the owner");
    }
    Ok(())
}

fn bslug(j: &Job) -> String {
    let t: String = j.title.to_lowercase().chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
    let t: String = t.split('-').filter(|x| !x.is_empty()).collect::<Vec<_>>().join("-").chars().take(32).collect();
    let t = t.trim_end_matches('-');
    if j.hunt() || j.num == 0 {
        format!("fix/h{}-{t}", j.id)
    } else {
        format!("fix/{}-{t}", j.num)
    }
}

const ART: &[&str] = &[".venv-bootstrap/", ".venv/", "venv/", "__pycache__/", "*.pyc", ".pytest_cache/", ".mypy_cache/", ".ruff_cache/", ".tox/", ".coverage", "node_modules/", ".next/", ".turbo/", "target/", ".gradle/"];

async fn prep(a: &Ax, j: &mut Job) -> R<()> {
    need(a, "repro", &[&j.h(), "gh"]).await?;
    if j.d["rp"].as_bool().unwrap_or(false) {
        j.d.as_object_mut().unwrap().remove("rp");
        a.db.jd(j);
        let br = j.s("br");
        if !br.is_empty() && x(a, j, &format!("git rev-parse -q --verify refs/heads/{}", q(&br)), 60).await.c == 0 {
            ok(a, j, &format!("git checkout -q {}", q(&br)), 120).await?;
            a.say("repro", &format!("[{}] resuming {} on its existing clone", j.h(), j.tag()), Some(j.id));
            return Ok(());
        }
    }
    let mt = crate::gh::meta(a, &j.repo).await.map_err(X::E)?;
    let mn = mt["main"].as_str().unwrap_or("main").to_string();
    let d = dir(a, j);
    let base = hbid(a, &j.h());
    let url = format!("{}{}.git", gitb(), j.repo);
    let pb = public(a, j).await?;
    hx(a, &j.h(), &format!("pkill -f \"{d}/\" 2>/dev/null; true"), 60).await;
    let ex = hx(a, &j.h(), &format!("test -d \"{d}/.git\""), 60).await.c == 0;
    let ex = ex && {
        let l = hx(a, &j.h(), &format!("cd \"{d}\" && git config --local --list"), 60).await;
        l.c == 0 && cfg_ok(&l.o, &format!("{}{}.git", gitb(), j.repo)).is_ok()
    };
    if ex {
        let r = hx(a, &j.h(), &format!("cd \"{d}\" && {{ git rebase --abort; git merge --abort; git cherry-pick --abort; }} 2>/dev/null; git reset -q --hard && git clean -fdq"), 1200).await;
        if r.c != 0 {
            hx(a, &j.h(), &format!("rm -rf \"{d}\""), 600).await;
        }
    }
    if hx(a, &j.h(), &format!("test -d \"{d}/.git\""), 60).await.c != 0 {
        a.say("repro", &format!("[{}] cloning {}", j.h(), j.repo), Some(j.id));
        let c = if pb { format!("git clone -q --no-checkout --filter=blob:none {} \"{d}\"", q(&url)) } else { format!("git init -q \"{d}\" && git -C \"{d}\" remote add origin {}", q(&url)) };
        let r = hx(a, &j.h(), &format!("mkdir -p \"{base}\" && rm -rf \"{d}\" && {c}"), 1800).await;
        if r.c != 0 {
            return Err(oe(&r, "git clone", &j.h()));
        }
    }
    pull(a, j, &url, &mn, &format!("refs/remotes/origin/{mn}")).await?;
    ok(a, j, &format!("mkdir -p .git/info && printf '%s\\n' {} > .git/info/exclude", ART.iter().map(|x| q(x)).collect::<Vec<_>>().join(" ")), 60).await?;
    let me = crate::gh::me(a).await.map_err(X::E)?;
    ok(a, j, &format!("git config user.name {} && git config user.email {}", q(me["name"].as_str().unwrap_or("")), q(me["mail"].as_str().unwrap_or(""))), 60).await?;
    let br = if j.kind == "fix" || j.kind == "hunt" { bslug(j) } else { j.s("branch") };
    if j.kind == "fix" || j.kind == "hunt" {
        let at = j.s("at");
        ok(a, j, &format!("git checkout -q -B {} {}", q(&br), if at.is_empty() { format!("origin/{}", q(&mn)) } else { q(&at) }), 1800).await?;
    } else {
        let src = format!("{}{}.git", gitb(), j.s("head"));
        pull(a, j, &src, &br, "refs/ao/head").await?;
        ok(a, j, &format!("git checkout -q -B {} refs/ao/head", q(&br)), 1800).await?;
        j.d["old"] = json!(ok(a, j, "git rev-parse HEAD", 60).await?);
    }
    let su = rp(a, &j.repo)["setup"].as_str().unwrap_or("").trim().to_string();
    if !su.is_empty() {
        a.say("repro", &format!("[{}] setup: {}", j.h(), crate::sh::head(&su, 80)), Some(j.id));
        let r = x(a, j, &format!("to 1800 bash -c {} 2>&1 | tail -c 3000; exit ${{PIPESTATUS[0]}}", q(&su)), 1900).await;
        if r.c != 0 {
            return drop(format!("setup command failed (exit {}): {}", r.c, crate::sh::last(r.o.trim(), 300)));
        }
        ok(a, j, "git checkout -q -- . 2>/dev/null; true", 60).await?;
    }
    let bs = ok(a, j, "git rev-parse HEAD", 60).await?;
    j.d["br"] = json!(br);
    j.d["mn"] = json!(mn);
    j.d["base"] = json!(bs);
    a.db.jd(j);
    Ok(())
}

fn rn(a: &Ax, j: &Job) -> Option<Rn> {
    Some(Rn { h: j.h(), dir: dir(a, j), w: String::new(), md: String::new() })
}

fn rules(a: &Ax, j: &Job) -> String {
    let r = rp(a, &j.repo)["rules"].as_str().unwrap_or("").trim().to_string();
    if r.is_empty() {
        String::new()
    } else {
        format!("\n\nOwner's rules for this repository (trusted):\n{r}")
    }
}

fn cx(a: &Ax, j: &Job) -> bool {
    j.s("cx") == "complex" && a.set()["big"].as_bool().unwrap_or(true)
}

async fn repro(a: &Ax, j: &mut Job) -> R<()> {
    a.db.jset(j.id, &[("st", json!("repro"))]);
    let p = format!("Repository: {}. {}.\nVet note: {}\n\n{}", j.repo, j.orig(), j.d["hint"].as_str().unwrap_or("-"), wrap("issue", &format!("{}\n\n{}", if j.s("title").is_empty() { &j.title } else { j.d["title"].as_str().unwrap() }, j.s("body"))));
    let p = format!("{p}{}{}", rules(a,j),crate::quality::context(j));
    let ms = if crate::routing::enabled(a) { crate::routing::plan(a) } else if cx(a, j) { vec![a.md("big")] } else { vec![a.md("repro"), a.md("repro2")] };
    let mut reproduction_feedback=String::new();
    for (attempt, md) in ms.into_iter().enumerate() {
        crate::routing::event(a, Some(j.id), "repro", attempt, &md, &reproduction_feedback);
        a.st("repro", "work", Some(j.id), "");
        use_(a, j, &md);
        a.say("repro", &format!("{} reproducing {}", crate::prov::name(&md), j.tag()), Some(j.id));
        let mut o = Ask::new("repro", md, P("repro"), format!("{p}\n{}",wrap("previous-reproduction-diagnostic",&reproduction_feedback)));
        o.job = Some(j.id);
        o.rn = rn(a, j);
        o.turns = 40;
        o.ef = Some("medium");
        o.t = 90 * 60;
        let result = ask(a, o).await;
        x(a, j, "git checkout -q -- . && git clean -fdq", 120).await;
        let (_, js) = match result {
            Ok(v) => v,
            Err(X::Back(e)) => return Err(X::Back(e)),
            Err(X::Drop(e)) => return Err(X::Drop(e)),
            Err(e) if crate::routing::enabled(a) => {
                a.say("repro", &format!("attempt failed: {e}"), Some(j.id));
                reproduction_feedback=crate::sh::head(&e.to_string(),3000);
                continue;
            }
            Err(e) => return Err(e),
        };
        if js["ok"].as_bool().unwrap_or(false) {
            j.d["repro"] = json!({"how": js["how"], "where": js["where"], "test": js["test"]});
            a.db.jd(j);
            a.say("repro", &format!("reproduced: {}", js["how"].as_str().unwrap_or("")), Some(j.id));
            a.flow("repro", "fixer", &j.tag());
            a.st("repro", "idle", None, "ok");
            return Ok(());
        }
        reproduction_feedback=crate::sh::head(&js.to_string(),3000);
        a.say("repro", &format!("not reproduced: {}", js["how"].as_str().unwrap_or("no answer")), Some(j.id));
    }
    a.st("repro", "idle", None, "sad");
    drop("not reproducible")
}

pub fn junk(p: &str) -> bool {
    Regex::new(r"(^|/)__pycache__/|\.py[co]$|\.class$|\.o$").unwrap().is_match(p)
}

async fn dirty(a: &Ax, j: &Job) -> R<Option<String>> {
    let st = ok(a, j, "git status --porcelain", 60).await?;
    let ps: Vec<String> = st.lines().filter(|l| l.len() > 3).map(|l| l[3..].trim().trim_matches('"').to_string()).collect();
    if ps.is_empty() {
        return Ok(None);
    }
    if ps.iter().all(|p| junk(p)) && st.lines().all(|l| l.starts_with(" M")) {
        ok(a, j, &format!("git checkout -q -f -- {}", ps.iter().map(|p| q(p)).collect::<Vec<_>>().join(" ")), 60).await?;
        return Ok(None);
    }
    Ok(Some(format!("working tree not clean, uncommitted changes in: {}. Commit them into the test or fix commit, or restore them with git checkout / remove them.", ps.iter().take(10).cloned().collect::<Vec<_>>().join(", "))))
}

async fn run_t(a: &Ax, j: &Job, at: &str, c: &str) -> (i32, String) {
    let l = format!("/tmp/ao-t-{}.log", j.id);
    let r = x(a, j, &format!("rm -f {l}; if git checkout -q {} 2>&1; then {{ to 3600 bash -c {}\n}} > {l} 2>&1; e=$?; tail -c 30000 {l}; git checkout -q -f -- . 2>/dev/null; git clean -fdq 2>/dev/null; else e=125; echo \"[checkout failed]\"; git status --short 2>&1 | head -20; fi; echo \"[exit $e]\"", q(at), q(c)), 3700).await;
    let e = Regex::new(r"\[exit (\d+)\]\s*$").unwrap().captures(&r.o).and_then(|m| m[1].parse::<i32>().ok()).unwrap_or(-1);
    (e, r.o)
}

pub fn fails(o: &str) -> Vec<String> {
    let rs = [r"(?m)^test (\S+) \.\.\. FAILED\s*$", r"(?m)^FAILED (\S+?)(?: - .*)?\s*$", r"(?m)^\s*--- FAIL: (\S+)", r"(?m)^\s*(?:✕|×)\s+(.+?)(?:\s+\(\d+(?:\.\d+)? ?m?s\))?\s*$", r"(?m)^not ok \d+ - (.+?)\s*$"];
    let mut v = BTreeSet::new();
    for r in rs {
        for c in Regex::new(r).unwrap().captures_iter(o) {
            v.insert(c[1].trim().to_string());
        }
    }
    v.into_iter().collect()
}

pub fn bare(t: &str) -> String {
    t.rsplit(|c| c == ':' || c == '.' || c == '/' || c == '>' || c == ' ').find(|x| !x.trim().is_empty()).unwrap_or(t).trim().to_string()
}

pub const CE: &str = r"error\[E\d+\]|could not compile|error: no test target|no such command|SyntaxError|ModuleNotFoundError|ImportError while|cannot find module|Cannot find module|ERROR collecting|error TS\d{4}|no tests ran|No tests found|build failed|\[setup failed\]|undefined: |command not found|(?m:^[^\n]*\.java:\d+: error:)|ClassNotFoundException|NoClassDefFoundError";

pub fn judge(ts: &[String], a_e: i32, a_o: &str, b_e: i32, b_o: &str) -> String {
    if Regex::new(r"\[checkout failed\]").unwrap().is_match(&format!("{a_o}{b_o}")) {
        return format!("git checkout of the test or fix commit failed, the tests did not run. Leave a clean working tree with no stray files, then answer again. Output:\n{}", crate::sh::last(&format!("{a_o}\n{b_o}"), 3000));
    }
    if a_e == 0 {
        return format!("Test already passes on the test commit without the fix (it must fail). Output:\n{}", crate::sh::last(a_o, 3000));
    }
    if Regex::new(CE).unwrap().is_match(a_o) {
        return format!("Test commit does not compile or load; a compile or import error does not count as a failing test. Output:\n{}", crate::sh::last(a_o, 3000));
    }
    if !ts.iter().any(|t| a_o.contains(&bare(t))) {
        return format!("No failure of the named tests on the test commit (none of the test names appears in the output). Output:\n{}", crate::sh::last(a_o, 3000));
    }
    if b_e != 0 {
        return format!("Test fails with the fix. Output:\n{}", crate::sh::last(b_o, 3000));
    }
    let f = fails(b_o);
    if !f.is_empty() {
        return format!("Tests still reported as failing with the fix: {}. Output:\n{}", f.join(", "), crate::sh::last(b_o, 3000));
    }
    String::new()
}

async fn verify(a: &Ax, j: &mut Job, f: &Value) -> R<String> {
    let ts: Vec<String> = f["tests"].as_array().cloned().unwrap_or_default().iter().filter_map(|x| x.as_str().map(String::from)).filter(|x| !x.is_empty()).collect();
    let tc = f["test_cmd"].as_str().unwrap_or("").to_string();
    if tc.is_empty() || ts.is_empty() {
        return Ok("answer without test_cmd or tests".into());
    }
    if Regex::new(crate::mcp::BAD).unwrap().is_match(&tc) {
        return Ok("test_cmd contains forbidden commands".into());
    }
    let n: i64 = ok(a, j, &format!("git rev-list --count {}..HEAD", j.s("base")), 60).await?.parse().unwrap_or(0);
    if n != 2 {
        return Ok(format!("expected exactly 2 commits (test, fix) on top of the base, found {n}"));
    }
    if let Some(m) = dirty(a, j).await? {
        return Ok(m);
    }
    let l = ok(a, j, "git log --format=%H -n2", 60).await?;
    let mut it = l.lines();
    let (b, at) = (it.next().unwrap_or("").to_string(), it.next().unwrap_or("").to_string());
    let (ae, ao) = run_t(a, j, &at, &tc).await;
    let (be, bo) = run_t(a, j, &b, &tc).await;
    ok(a, j, &format!("git checkout -q {}", q(&j.s("br"))), 120).await?;
    let r = judge(&ts, ae, &ao, be, &bo);
    if r.is_empty() {
        let fl = Regex::new(r"(?i)FAIL|panicked|assert|Error|expected|^not ok\b").unwrap();
        let pl = Regex::new(r"(?i)\bok\b|pass|✓").unwrap();
        j.d["proof"] = json!({"a_exit":ae,"b_exit":be,"test_commit":at,"fix_commit":b,"command":tc,"a": ao.lines().filter(|x| fl.is_match(x)).take(4).collect::<Vec<_>>().join("\n"), "b": bo.lines().filter(|x| pl.is_match(x)).take(6).collect::<Vec<_>>().join("\n")});
        a.db.jd(j);
    }
    if !r.is_empty() { return Ok(r); }
    crate::quality::check(a,j).await
}

async fn slot(a: &Ax, h: &str) {
    let cap = ho(a, h).map(|x| x.ci).unwrap_or(1) as usize;
    loop {
        {
            let mut s = a.sem.lock().unwrap();
            let n = s.entry(h.to_string()).or_insert(0);
            if *n < cap {
                *n += 1;
                return;
            }
        }
        sl(5000).await;
    }
}

fn unslot(a: &Ax, h: &str) {
    if let Some(n) = a.sem.lock().unwrap().get_mut(h) {
        *n = n.saturating_sub(1);
    }
}

async fn cirun(a: &Ax, j: &Job, at: Option<&str>) -> (i32, String) {
    let c = rp(a, &j.repo)["ci"].as_str().unwrap_or("").to_string();
    let id = j.id;
    let ax = a.clone();
    let ln = move |l: &str| {
        if !l.trim().is_empty() {
            ax.lv.lock().unwrap().cil.insert(id, crate::sh::head(l.trim(), 160));
        }
    };
    let co = match at {
        Some(s) => format!("git checkout -q {} && ", q(s)),
        None => String::new(),
    };
    let r = hxl(a, &j.h(), &format!("cd \"{}\" && {co}{{ to {CIT} bash -c {}\n}} 2>&1; e=$?; git checkout -q -f -- . 2>/dev/null; git clean -fdq 2>/dev/null; echo \"[exit $e]\"", dir(a, j), q(&c)), CIT + 120, Some(&ln)).await;
    a.lv.lock().unwrap().cil.remove(&id);
    let o = r.o;
    let e = Regex::new(r"\[exit (\d+)\]\s*$").unwrap().captures(&o).and_then(|m| m[1].parse::<i32>().ok()).unwrap_or(if r.c == 0 { -1 } else { r.c });
    (e, o)
}

fn lost(o: &str) -> bool {
    !Regex::new(r"\[exit -?\d+\]\s*$").unwrap().is_match(o)
}

pub fn tool(o: &str) -> Option<(String, Option<String>)> {
    let l = Regex::new(r"(?im)^.*(?:is required in CI|command not found|no such (?:sub)?command|is not installed|not found in PATH).*$").unwrap().find(o)?.as_str().trim().to_string();
    let k = Regex::new(r"cargo install ([A-Za-z0-9_-]+)").unwrap().captures(&l).map(|m| m[1].to_string()).or_else(|| Regex::new(r"no such (?:sub)?command:? `?([a-z0-9-]+)`?").unwrap().captures(&l).map(|m| format!("cargo-{}", &m[1])));
    Some((crate::sh::head(&l, 200), k))
}

fn errs(o: &str) -> String {
    let re = Regex::new(r"(?i)^(error|failures:|test result: FAILED|---- |FAILED|FAIL|✕|×|E  )|panicked at|AssertionError|Diff in").unwrap();
    let h: Vec<&str> = o.lines().filter(|l| re.is_match(l)).take(60).collect();
    format!("{}\n----\n{}", h.join("\n"), crate::sh::last(o, 4000))
}

async fn ci(a: &Ax, j: &mut Job) -> R<String> {
    a.say("ci", &format!("[{}] waiting for the build slot", j.h()), Some(j.id));
    slot(a, &j.h()).await;
    struct SlotGuard(Ax,String);
    impl Drop for SlotGuard {fn drop(&mut self) {unslot(&self.0,&self.1);}}
    let _guard=SlotGuard(a.clone(),j.h());
    ci0(a, j).await
}

async fn ci0(a: &Ax, j: &mut Job) -> R<String> {
    a.db.jset(j.id, &[("st", json!("ci"))]);
    a.st("ci", "work", Some(j.id), "");
    a.flow("fixer", "ci", &j.tag());
    let c = rp(a, &j.repo)["ci"].as_str().unwrap_or("").to_string();
    j.d["known"] = json!([]);
    let mut ie = 0;
    let mut it = false;
    loop {
        a.say("ci", &format!("{c} running for {}", j.tag()), Some(j.id));
        let t0 = now();
        let (ec, o) = cirun(a, j, None).await;
        j.d["ci_evidence"]=json!({"command":c,"exit":ec,"output_tail":crate::sh::last(&o,4000),"candidate":j.d["proof"]["fix_commit"]});
        a.db.jd(j);
        let m = (now() - t0) / 60000;
        if ec == 0 {
            a.st("ci", "idle", None, "ok");
            a.say("ci", &format!("green after {m} min"), Some(j.id));
            return Ok(String::new());
        }
        if ec == 124 || ec == 137 && m >= (CIT / 60) as i64 - 1 {
            a.st("ci", "idle", None, "sad");
            return Ok(format!("CI aborted after {} min (timeout)", CIT / 60));
        }
        a.say("ci", &format!("red (exit {ec}) after {m} min"), Some(j.id));
        let inf = if lost(&o) { Some("connection lost".to_string()) } else { Regex::new(r"No space left on device|failed to unpack package|invalid gzip header|corrupt deflate stream|failed to download from|ECONNRESET|ETIMEDOUT|Could not resolve host|EAI_AGAIN").unwrap().find(&o).map(|m| m.as_str().to_string()) };
        if let Some(m) = inf {
            if ie < 2 {
                ie += 1;
                a.say("ci", &format!("infra error on {} ({m}), restarting CI ({ie}/2)", j.h()), Some(j.id));
                sl(30_000).await;
                continue;
            }
            if lost(&o) {
                return Err(X::Back(format!("lost the connection to {} during CI", j.h())));
            }
        }
        let fs = fails(&o);
        if fs.is_empty() {
            if let Some(t) = tool(&o) {
                if let Some(k) = t.1.filter(|_| !it) {
                    it = true;
                    a.say("ci", &format!("[{}] {c} needs {k}, installing it", j.h()), Some(j.id));
                    let r = hx(a, &j.h(), &format!("{}cargo install {} --locked 2>&1 | tail -3", crate::sh::PRE, q(&k)), 2400).await;
                    if r.c == 0 {
                        continue;
                    }
                }
                a.st("ci", "idle", None, "sad");
                return drop(format!("`{c}` needs a tool that is missing on {}: {}", j.h(), t.0));
            }
        }
        let bk = format!("cibase:{}", j.repo);
        let bs = j.s("base");
        let cb = a.db.kg(&bk);
        let (bred, bn) = if cb["sha"].as_str() == Some(bs.as_str()) {
            (cb["red"].as_bool().unwrap_or(false), cb["n"].as_array().cloned().unwrap_or_default().iter().filter_map(|x| x.as_str().map(String::from)).collect::<Vec<_>>())
        } else {
            a.say("ci", &format!("checking whether CI is also red on {} without the fix", j.s("mn")), Some(j.id));
            let (be, bo) = cirun(a, j, Some(&bs)).await;
            ok(a, j, &format!("git checkout -q {}", q(&j.s("br"))), 120).await?;
            if lost(&bo) {
                return Err(X::Back(format!("lost the connection to {} while checking {}", j.h(), j.s("mn"))));
            }
            let bn = fails(&bo);
            a.db.ks(&bk, &json!({"sha": bs, "red": be != 0, "n": bn, "t": now()}));
            (be != 0, bn)
        };
        if !bred {
            {
                a.say("ci", "default branch is green, rerunning once to rule out flaky tests", Some(j.id));
                let (e2, o2) = cirun(a, j, None).await;
                j.d["ci_evidence"]=json!({"command":c,"exit":e2,"output_tail":crate::sh::last(&o2,4000),"candidate":j.d["proof"]["fix_commit"],"rerun":true});
                a.db.jd(j);
                if e2 == 0 {
                    a.st("ci", "idle", None, "ok");
                    a.say("ci", "green on rerun (flaky test)", Some(j.id));
                    return Ok(String::new());
                }
                a.st("ci", "idle", None, "sad");
                return Ok(format!("`{c}` fails with the fix (exit {e2}) but passes on {} without it:\n{}", j.s("mn"), crate::sh::last(&errs(&o2), 6000)));
            }
        }
        if bred {
            let nw: Vec<String> = fs.iter().filter(|n| !bn.contains(n)).cloned().collect();
            if !fs.is_empty() && nw.is_empty() {
                j.d["known"] = json!(fs);
                a.db.jd(j);
                a.st("ci", "idle", None, "ok");
                a.say("ci", &format!("green except tests that also fail on {}: {}", j.s("mn"), fs.join(", ")), Some(j.id));
                return Ok(String::new());
            }
            if fs.is_empty() || bn.is_empty() {
                a.st("ci", "idle", None, "sad");
                a.db.ks(&format!("cired:{}", j.repo), &json!({"sha": bs, "t": now()}));
                return drop(format!("`{c}` also fails on {} without the fix, the office cannot verify changes until it is green again", j.s("mn")));
            }
            a.st("ci", "idle", None, "sad");
            return Ok(format!("`{c}` has new failures with the fix: {}\n{}", nw.join(", "), crate::sh::last(&errs(&o), 6000)));
        }
        a.st("ci", "idle", None, "sad");
        return Ok(format!("`{c}` fails (exit {ec}):\n{}", crate::sh::last(&errs(&o), 6000)));
    }
}

fn san(s: &str) -> String {
    let r = Regex::new(r"(?i)\s*\b(Fixes|Closes|Resolves)\s+#0\b\.?").unwrap().replace_all(s, "");
    Regex::new(r"(?i)\bissue\s+#0\b").unwrap().replace_all(&r, "this bug").trim().to_string()
}

pub fn body(j: &Job, f: &Value, ci: &str, ft: &str) -> String {
    let g = |k: &str| {
        let s = f[k].as_str().unwrap_or("").to_string();
        if j.own() {
            san(&s)
        } else {
            s
        }
    };
    let ts: Vec<String> = f["tests"].as_array().cloned().unwrap_or_default().iter().filter_map(|x| x.as_str().map(String::from)).collect();
    let pl = ts.len() > 1;
    let kn: Vec<String> = j.d["known"].as_array().cloned().unwrap_or_default().iter().filter_map(|x| x.as_str().map(String::from)).collect();
    let mn = j.s("mn");
    let mut v = vec![];
    if j.kind == "fix" {
        if j.hunt() {
            v.push(format!("Found while testing `{}` (no existing issue): {}.", j.d["hunt"]["where"].as_str().unwrap_or(""), j.d["hunt"]["title"].as_str().unwrap_or("")));
        } else if j.ext() {
            v.push("Reported to us directly (no existing issue).".to_string());
        } else {
            v.push(format!("Fixes #{}", j.num));
        }
        v.push(String::new());
    }
    v.extend(["## Cause".into(), g("cause"), String::new(), "## Fix".into(), g("fix"), String::new(), "## Verified".into()]);
    if !ts.is_empty() {
        v.push(format!("- Regression test{} {}: fail{} on `{mn}` without the fix and pass{} with it (`{}`).", if pl { "s" } else { "" }, ts.iter().map(|t| format!("`{t}`")).collect::<Vec<_>>().join(", "), if pl { "" } else { "s" }, if pl { "" } else { "es" }, f["test_cmd"].as_str().unwrap_or("")));
    }
    if kn.is_empty() {
        v.push(format!("- `{ci}` passes."));
    } else {
        v.push(format!("- `{ci}` passes except {}, which also fail{} on `{mn}` without this change.", kn.iter().map(|n| format!("`{n}`")).collect::<Vec<_>>().join(", "), if kn.len() > 1 { "" } else { "s" }));
    }
    let u = g("untouched");
    if !u.trim().is_empty() {
        v.extend([String::new(), "## Not changed".into(), u]);
    }
    if !ft.is_empty() {
        v.extend([String::new(), ft.into()]);
    }
    v.join("\n").trim().to_string()
}

async fn review(a: &Ax, j: &mut Job, f: &mut Value) -> R<String> {
    review_mode(a,j,f,false).await
}

async fn diagnosis(a:&Ax,j:&mut Job,f:&mut Value) -> R<String> {
    match review_mode(a,j,f,true).await {
        Ok(text)=>Ok(text),
        Err(X::Drop(reason))=>Err(X::Drop(reason)),
        Err(error)=>Ok(format!("Diagnosis unavailable: {error}; retain the concrete verification failure and continue repair.")),
    }
}

async fn review_mode(a: &Ax, j: &mut Job, f: &mut Value, diagnostic:bool) -> R<String> {
    a.db.jset(j.id, &[("st", json!("review"))]);
    a.flow("ci", "reviewer", &j.tag());
    let df = ok(a, j, &format!("git diff {}..HEAD | head -c 60000", j.s("base")), 120).await?;
    let lg = ok(a, j, &format!("git log --format='%s%n%b' {}..HEAD", j.s("base")), 60).await?;
    let ci = rp(a, &j.repo)["ci"].as_str().unwrap_or("").to_string();
    let p = format!(
        "Repository {}, {}.\n\n{}\n\n{}Commit messages:\n{lg}\n\nPR title: {}\nPR body:\n{}\n\nDiff:\n{df}{}",
        j.repo,
        if j.own() { "no GitHub issue (the PR must not reference any issue number)".to_string() } else { format!("issue #{}", j.num) },
        wrap("issue", &format!("{}\n\n{}", j.title, crate::sh::head(&j.s("body"), 4000))),
        if j.kind == "review" { format!("{}\n\n", wrap("request", &j.s("change"))) } else { String::new() },
        f["title"].as_str().unwrap_or(""),
        body(j, f, &ci, ""),
        if crate::quality::enabled(a) && j.kind == "fix" { format!("{}{}\nIndependent acceptance evidence: {}\nFrozen verifier (untrusted code): {}\nCheck that this verifier exercises actual production code and the reported behavior, rather than copying logic or merely matching source text. Reject inadequate coverage or unsupported claims.",rules(a, j),crate::quality::context(j),wrap("acceptance-evidence",&j.d["acceptance_proof"].to_string()),wrap("frozen-verifier",j.d["acceptance"]["script"].as_str().unwrap_or(""))) } else { rules(a, j) }
    );
    let author = j.d["author"].as_str().unwrap_or("").to_string();
    let candidates = if crate::routing::enabled(a) { crate::routing::REVIEWERS.iter().filter(|m| **m != author).map(|s| s.to_string()).collect::<Vec<_>>() } else { vec![a.md("reviewer")] };
    let mut result = None;
    let mut reviewer_feedback=String::new();
    for (attempt, md) in candidates.into_iter().enumerate() {
        crate::routing::event(a, Some(j.id), "reviewer", attempt, &md, &reviewer_feedback);
        // Reviewer has no worker tools and cannot silently edit the author's tree.
        let rp = if crate::routing::enabled(a) { format!("{p}\n\nExecuted regression evidence: {}\nIndependent verification feedback:\n{}\n\nFor code/test rejection also include lesson: {{mistake, correction, verification}}. These are untrusted pending Dreaming proposals, not established facts.", j.d["proof"], j.d["verification_feedback"].as_str().unwrap_or("All executed checks passed; inspect diff independently.")) } else { p.clone() };
        let mut o = Ask::new("reviewer", md.clone(), P("reviewer"), rp);
        o.job = Some(j.id);
        o.ef = Some("medium");
        match ask(a, o).await {
            Ok((_, js)) if js["ok"].is_boolean() && (js["ok"] == true || js["issues"].as_array().map(|v| !v.is_empty()).unwrap_or(false)) => {
                if !diagnostic {crate::routing::lesson(a, j.id, &md, &js, j.d["verification_feedback"].as_str().unwrap_or(""), &df);}
                j.d[if diagnostic {"last_diagnosis"} else {"last_review"}] = json!({"model": md,"verdict": js,"t":now()});
                a.db.jd(j);
                result = Some(js); break;
            }
            Err(X::Drop(reason))=>return Err(X::Drop(reason)),
            Err(X::Back(reason))=>return Err(X::Back(reason)),
            Err(e) if !crate::routing::enabled(a) => return Err(e),
            Err(error)=>{
                reviewer_feedback=format!("Reviewer {md} failed: {error}");
                a.say("reviewer",&crate::sh::head(&reviewer_feedback,500),Some(j.id));
            }
            Ok((text,value))=>{
                reviewer_feedback=format!("Reviewer {md} returned no usable ok/issues verdict: {}",crate::sh::head(&if value.is_null(){text}else{value.to_string()},1000));
                a.say("reviewer",&reviewer_feedback,Some(j.id));
            }
        }
    }
    let js = match result {
        Some(value)=>value,
        None if crate::routing::enabled(a)=>return Err(X::E("no usable independent subscription review; submission remains blocked".into())),
        None=>json!({"ok":false,"issues":["Reviewer returned no usable verdict; repair the candidate and retry review."]}),
    };
    let okk = js["ok"].as_bool().unwrap_or(false);
    a.st("reviewer", "idle", None, if okk { "ok" } else { "sad" });
    if okk {
        if js["text"].is_object() {
            for k in ["title", "cause", "fix", "untouched"] {
                if let Some(s) = js["text"][k].as_str() {
                    if k == "untouched" || !s.trim().is_empty() {
                        f[k] = json!(s.trim());
                    }
                }
            }
            a.say("reviewer", "ok, PR text corrected", Some(j.id));
        } else {
            a.say("reviewer", "ok", Some(j.id));
        }
        return Ok(String::new());
    }
    let is: Vec<String> = js["issues"].as_array().cloned().unwrap_or_else(|| vec![json!("no usable answer")]).iter().map(|x| format!("- {}", x.as_str().unwrap_or(&x.to_string()))).collect();
    let is = is.join("\n");
    a.say("reviewer", &format!("back to Fixer: {}", crate::sh::head(&is, 200)), Some(j.id));
    Ok(format!("Reviewer objections:\n{is}"))
}

fn fixp(a: &Ax, j: &Job, fb: &str) -> String {
    let h = format!("Repository: {}. Branch {} is checked out. Base commit: {}.", j.repo, j.s("br"), j.s("base"));
    if j.kind == "review" {
        let tc = j.s("test_cmd");
        return format!(
            "{h}\nThis branch is an open pull request (#{}). A maintainer requested a change:\n{}\n\nOriginal comment:\n{}\n\nImplement exactly the requested change as ONE new commit on top of the base commit (do not rewrite existing commits). Keep the existing regression tests passing.{}\nThen answer with the JSON from your instructions; \"tests\" are the regression tests that must pass, \"title\" is a short commit summary.{}{}",
            j.pr.unwrap_or(0),
            wrap("request", &j.s("change")),
            wrap("comment", &j.s("comment")),
            if tc.is_empty() { String::new() } else { format!(" Existing test command: {tc}") },
            if fb.is_empty() { String::new() } else { format!("\n\nYour previous attempt was rejected:\n{fb}\nThe branch still contains your previous work; fix the problems.") },
            rules(a, j)
        );
    }
    let ci = rp(a, &j.repo)["ci"].as_str().unwrap_or("").to_string();
    let h = if ci.is_empty() { h } else { format!("{h} The repository's full test command is `{ci}`; your test_cmd runs in a fresh shell from the repo root, so use the same environment (for example the same virtualenv or package manager).") };
    format!(
        "{h}\n{}:\n{}\n\nRepro result (from a previous agent): {}{}{}",
        j.orig(),
        wrap("issue", &format!("{}\n\n{}", j.title, j.s("body"))),
        j.d["repro"],
        if fb.is_empty() { String::new() } else { format!("\n\nYour previous attempt was rejected by the pipeline:\n{fb}\nThe branch still contains your previous commits; fix the problems and make sure there are exactly two commits (test, fix) on top of the base commit.") },
        format!("{}{}",rules(a, j),crate::quality::context(j))
    )
}

async fn vrev(a: &Ax, j: &Job, f: &Value) -> R<String> {
    let n: i64 = ok(a, j, &format!("git rev-list --count {}..HEAD", j.s("base")), 60).await?.parse().unwrap_or(0);
    if n != 1 {
        return Ok(format!("expected exactly 1 new commit on top of the PR head, found {n}"));
    }
    if let Some(m) = dirty(a, j).await? {
        return Ok(m);
    }
    let c = f["test_cmd"].as_str().map(String::from).filter(|x| !x.is_empty()).unwrap_or(j.s("test_cmd"));
    if !c.is_empty() {
        if Regex::new(crate::mcp::BAD).unwrap().is_match(&c) {
            return Ok("test_cmd contains forbidden commands".into());
        }
        let (e, o) = run_t(a, j, "HEAD", &c).await;
        ok(a, j, &format!("git checkout -q {}", q(&j.s("br"))), 120).await?;
        if e != 0 {
            return Ok(format!("Tests fail:\n{}", crate::sh::last(&o, 3000)));
        }
    }
    Ok(String::new())
}

async fn fix(a: &Ax, j: &mut Job, fb0: String, k0: u64) -> R<Value> {
    crate::quality::prepare(a,j).await?;
    let mut fb = fb0;
    let plan = crate::routing::plan(a);
    let rounds = if crate::routing::enabled(a) { plan.len() as u64 } else { RND + 1 };
    for k in k0..rounds {
        kill(a, j)?;
        a.db.jset(j.id, &[("st", json!("fix"))]);
        a.st("fixer", "work", Some(j.id), "");
        a.say("fixer", &format!("{}fixing {}", if k > 0 { format!("round {}: ", k + 1) } else { String::new() }, j.tag()), Some(j.id));
        let c = cx(a, j);
        let md = if crate::routing::enabled(a) { plan[k as usize].clone() } else if c { a.md("big") } else { a.md("fixer") };
        crate::routing::event(a, Some(j.id), "fixer", k as usize, &md, &fb);
        use_(a, j, &md);
        j.d["author"] = json!(md);
        let mut o = Ask::new("fixer", md, P("fixer"), fixp(a, j, &fb));
        o.job = Some(j.id);
        o.rn = rn(a, j);
        o.turns = if c { 200 } else { 120 };
        o.t = if c { 180 * 60 } else { 120 * 60 };
        let (_, js) = match ask(a, o).await {
            Ok(v) => v,
            Err(X::Back(e)) => return Err(X::Back(e)),
            Err(X::Drop(e)) => return Err(X::Drop(e)),
            Err(e) if crate::routing::enabled(a) => { fb = format!("Model attempt failed: {e}. Inspect the existing tree and preserve useful work."); continue; }
            Err(e) => return Err(e),
        };
        a.st("fixer", "idle", None, "");
        if js.is_null() {
            fb = "Your answer contained no JSON.".into();
            continue;
        }
        if let Some(g) = js["give_up"].as_str() {
            a.st("fixer", "idle", None, "sad");
            if crate::routing::enabled(a) { fb = format!("Previous model gave up: {g}. Inspect the tree and repair the actual issue."); continue; }
            return drop(format!("Fixer gave up: {g}"));
        }
        a.say("fixer", &format!("done: {}", js["title"].as_str().unwrap_or("")), Some(j.id));
        j.d["f0"] = js.clone();
        j.d["k"] = json!(k);
        a.db.jd(j);
        a.flow("fixer", "ci", "proof");
        fb = if j.kind == "review" { vrev(a, j, &js).await? } else { verify(a, j, &js).await? };
        if !fb.is_empty() {
            a.say("fixer", &format!("proof missing: {}", fb.lines().next().unwrap_or("")), Some(j.id));
            if crate::routing::enabled(a) {
                j.d["verification_feedback"] = json!(fb.clone());
                let diagnosis = diagnosis(a, j, &mut js.clone()).await?;
                fb.push_str(&format!("\n{diagnosis}"));
            }
            continue;
        }
        fb = ci(a, j).await?;
        if fb.starts_with("CI aborted after") {
            a.st("fixer", "idle", None, "sad");
            return drop(format!("{fb} on {}", j.h()));
        }
        if !fb.is_empty() {
            if crate::routing::enabled(a) {
                j.d["verification_feedback"] = json!(fb.clone());
                let diagnosis = diagnosis(a, j, &mut js.clone()).await?;
                fb.push_str(&format!("\n{diagnosis}"));
            }
            continue;
        }
        j.d["verification_feedback"] = json!("Executed regression proof and repository CI passed.");
        let mut f = js.clone();
        fb = review(a, j, &mut f).await?;
        if !fb.is_empty() {
            a.flow("reviewer", "fixer", "back");
            continue;
        }
        j.d["f"] = f.clone();
        a.db.jd(j);
        return Ok(f);
    }
    a.st("fixer", "idle", None, "sad");
    drop(format!("no valid fix after {} rounds: {}", rounds, fb.lines().next().unwrap_or("")))
}

async fn reb(a: &Ax, j: &mut Job) -> R<()> {
    a.db.jset(j.id, &[("st", json!("fix"))]);
    a.st("fixer", "work", Some(j.id), "");
    let mn = j.s("mn");
    a.say("fixer", &format!("rebasing {}#{} onto {mn}", j.repo, j.pr.unwrap_or(0)), Some(j.id));
    pull(a, j, &format!("{}{}.git", gitb(), j.repo), &mn, &format!("refs/remotes/origin/{mn}")).await?;
    let r = x(a, j, &format!("git rebase -q origin/{}", q(&mn)), 600).await;
    if r.c != 0 {
        let fs = x(a, j, "git diff --name-only --diff-filter=U", 60).await.o.trim().to_string();
        a.say("fixer", &format!("conflicts in {} file(s), resolving", fs.lines().count()), Some(j.id));
        let md = a.md("fixer");
        use_(a, j, &md);
        let mut o = Ask::new("fixer", md, P("rebase"), format!("Repository {}. The rebase of pull request branch {} (PR #{}: {}) onto origin/{mn} stopped with conflicts in:\n{fs}\n\nResolve every conflict, `git add` the files and run `GIT_EDITOR=true git rebase --continue`; repeat until the rebase is finished. Do not add other changes. Run targeted builds and tests for touched files. Finish with a clean tree: `git status --porcelain` must print nothing. Then answer only with JSON {{\"title\": \"one line on how you resolved it\"}} or {{\"give_up\": \"reason\"}}.", j.repo, j.s("br"), j.pr.unwrap_or(0), wrap("title", &j.title)));
        o.job = Some(j.id);
        o.rn = rn(a, j);
        o.turns = 80;
        o.t = 90 * 60;
        let (_, js) = ask(a, o).await?;
        if js.is_null() || js["give_up"].is_string() {
            x(a, j, "git rebase --abort", 60).await;
            return drop(format!("conflict not resolved: {}", js["give_up"].as_str().unwrap_or("no answer")));
        }
        if x(a, j, "test -d .git/rebase-merge -o -d .git/rebase-apply", 60).await.c == 0 {
            x(a, j, "git rebase --abort", 60).await;
            return drop("rebase left unfinished");
        }
        j.d["fx"] = json!(js["title"].as_str().unwrap_or("resolved conflicts"));
    }
    if x(a, j, &format!("git merge-base --is-ancestor origin/{} HEAD", q(&mn)), 60).await.c != 0 {
        return drop("branch is not on top of the default branch after rebase");
    }
    let dt = ok(a, j, "git status --porcelain", 60).await?;
    if !dt.is_empty() {
        return drop(format!("working tree not clean after rebase: {}", dt.lines().take(5).collect::<Vec<_>>().join(", ")));
    }
    j.d["base"] = json!(ok(a, j, &format!("git rev-parse origin/{}", q(&mn)), 60).await?);
    let fx = j.s("fx");
    j.d["f"] = json!({"title": if fx.is_empty() { format!("Rebase onto {mn}") } else { format!("Rebase onto {mn}: {fx}") }, "tests": [], "test_cmd": j.s("test_cmd"), "cause": "", "fix": ""});
    a.db.jd(j);
    let tc = j.s("test_cmd");
    if !tc.is_empty() && !Regex::new(crate::mcp::BAD).unwrap().is_match(&tc) {
        let (e, _) = run_t(a, j, "HEAD", &tc).await;
        ok(a, j, &format!("git checkout -q {}", q(&j.s("br"))), 120).await?;
        if e != 0 {
            return drop("PR tests fail after rebase");
        }
    }
    a.st("fixer", "idle", None, "");
    let c = ci(a, j).await?;
    if !c.is_empty() {
        return drop(rbw(j, &c));
    }
    if !fx.is_empty() {
        let df = ok(a, j, &format!("git range-diff {o}~$(git rev-list --count {b}..HEAD)..{o} {b}..HEAD | head -c 40000", o = j.s("old"), b = j.s("base")), 120).await.unwrap_or_default();
        let fd = ok(a, j, &format!("git diff {}..HEAD | head -c 30000", j.s("base")), 120).await.unwrap_or_default();
        let md = a.md("reviewer");
        use_(a, j, &md);
        let mut o = Ask::new("reviewer", md, P("rebrev"), format!("PR #{} {}\nResolution note: {fx}\n\ngit range-diff (old PR commits vs rebased commits):\n{df}\n\nFinal diff {mn}..HEAD:\n{fd}", j.pr.unwrap_or(0), wrap("title", &j.title)));
        o.job = Some(j.id);
        o.ef = Some("medium");
        let (_, js) = ask(a, o).await?;
        let g = js["ok"].as_bool().unwrap_or(false);
        a.st("reviewer", "idle", None, if g { "ok" } else { "sad" });
        if !g {
            return drop(format!("conflict resolution rejected by Reviewer: {}", crate::sh::head(&js["issues"].to_string(), 200)));
        }
    }
    Ok(())
}

fn rbw(j: &Job, c: &str) -> String {
    if c.starts_with("CI aborted after") {
        format!("after rebase: {c} on {}", j.h())
    } else {
        format!("CI red after rebase: {}", crate::sh::head(c.lines().next().unwrap_or(""), 160))
    }
}

async fn taken(a: &Ax, j: &Job) -> R<String> {
    if j.kind != "fix" || j.own() || j.num == 0 {
        return Ok(String::new());
    }
    let me = crate::gh::login(a).await;
    let is = ghj(&["issue", "view", &j.num.to_string(), "-R", &j.repo, "--json", "state,assignees,comments"], 60).await.map_err(X::E)?;
    if is["state"] != "OPEN" {
        return Ok("someone was faster: issue is closed".into());
    }
    let oa: Vec<String> = is["assignees"].as_array().cloned().unwrap_or_default().iter().filter_map(|x| x["login"].as_str().map(String::from)).filter(|x| *x != me).collect();
    if !oa.is_empty() {
        return Ok(format!("someone was faster: assigned to {}", oa.join(", ")));
    }
    let cl = Regex::new(r"(?i)\b(i'?m (now )?(working|taking|looking into|on it|fixing)|i am (now )?(working|taking|fixing)|i'?ll (take|fix|work|handle|open a pr|send a pr)|i will (take|fix|work|handle)|working on (this|it|a fix)|claim(ed|ing)? (this|it|#[0-9]+)|assign (this |it )?(to )?me|pr (is )?(coming|incoming|soon|on the way)|on it\b)").unwrap();
    let va = j.d["va"].as_i64().unwrap_or(j.t0);
    for c in is["comments"].as_array().cloned().unwrap_or_default() {
        let by = c["author"]["login"].as_str().unwrap_or("");
        let t = chrono::DateTime::parse_from_rfc3339(c["createdAt"].as_str().unwrap_or("")).map(|d| d.timestamp_millis()).unwrap_or(0);
        if by != me && t > va && cl.is_match(c["body"].as_str().unwrap_or("")) {
            return Ok(format!("someone was faster: {by} claimed it in a comment"));
        }
    }
    let lv: Vec<String> = crate::gh::live(crate::gh::refs(&j.repo, j.num).await.map_err(X::E)?).into_iter().filter(|p| p.by != me).map(|p| format!("{}#{}", p.rp, p.n)).collect();
    if !lv.is_empty() {
        return Ok(format!("someone was faster: {}", lv.join(", ")));
    }
    Ok(String::new())
}

async fn race(a: &Ax, j: &Job, at: &str) -> R<()> {
    let t = taken(a, j).await?;
    if !t.is_empty() {
        return drop(format!("{t} ({at})"));
    }
    Ok(())
}

async fn gate(a: &Ax, j: &mut Job) -> R<()> {
    a.db.jset(j.id, &[("st", json!("gate"))]);
    a.st("submit", "work", Some(j.id), "");
    a.say("submit", &format!("pre-push gate for {}", j.tag()), Some(j.id));
    need(a, "submit", &["gh", &j.h()]).await?;
    if j.kind != "fix" {
        let p = ghj(&["pr", "view", &j.pr.unwrap_or(0).to_string(), "-R", &j.repo, "--json", "state"], 60).await.map_err(X::E)?;
        if p["state"] != "OPEN" {
            return drop("PR is no longer open");
        }
        return Ok(());
    }
    race(a, j, "at the gate").await?;
    let mn = j.s("mn");
    pull(a, j, &format!("{}{}.git", gitb(), j.repo), &mn, &format!("refs/remotes/origin/{mn}")).await?;
    let nb = ok(a, j, &format!("git rev-parse origin/{}", q(&mn)), 60).await?;
    if !j.own() && j.num > 0 {
        let hit = ok(a, j, &format!("git log --format='%h %s' {}..origin/{} | grep -E '#{}([^0-9]|$)' || true", j.s("base"), q(&mn), j.num), 60).await?;
        if !hit.is_empty() {
            return drop(format!("someone was faster: commit on {mn} mentions #{}: {}", j.num, hit.lines().next().unwrap_or("")));
        }
    }
    if nb == j.s("base") {
        let result=crate::quality::check(a,j).await?;
        if !result.is_empty() { return drop(result); }
        a.say("submit", "default branch unchanged, proofs still valid", Some(j.id));
        return Ok(());
    }
    a.say("submit", "default branch moved, rebasing and re-verifying everything", Some(j.id));
    let rb = x(a, j, &format!("git rebase -q origin/{}", q(&mn)), 600).await;
    if rb.c != 0 {
        x(a, j, "git rebase --abort", 60).await;
        return drop("rebase conflict with the current default branch");
    }
    let ob = j.s("base");
    j.d["base"] = json!(nb);
    a.db.jd(j);
    let f = j.d["f"].clone();
    let v = verify(a, j, &f).await?;
    if !v.is_empty() {
        j.d["base"] = json!(ob);
        return drop(format!("after rebase: {}", v.lines().next().unwrap_or("")));
    }
    let c = ci(a, j).await?;
    if !c.is_empty() {
        return drop(rbw(j, &c));
    }
    Ok(())
}

async fn tmpl(r: &str) -> Option<String> {
    for p in [".github/pull_request_template.md", ".github/PULL_REQUEST_TEMPLATE.md", "pull_request_template.md", "PULL_REQUEST_TEMPLATE.md", "docs/pull_request_template.md"] {
        if let Some(t) = crate::gh::file(r, p).await {
            if !t.trim().is_empty() {
                return Some(t);
            }
        }
    }
    None
}

async fn mkbody(a: &Ax, j: &mut Job) -> R<()> {
    let f = j.d["f"].clone();
    let ci = rp(a, &j.repo)["ci"].as_str().unwrap_or("").to_string();
    let ft = fo(a, j);
    let mut b = body(j, &f, &ci, ft);
    if j.kind == "fix" {
        if let Some(t) = tmpl(&j.repo).await {
            a.say("submit", "repo has a PR template, filling it in", Some(j.id));
            let md = a.md("reviewer");
            let mut o = Ask::new("submit", md, P("desc"), format!("Fill in this repository's pull request template for the change below. Keep the template's headings and checklist structure. Tick a checkbox only when the facts below prove it (tests added, tests pass, CI command passes, linked issue). Remove instructions and HTML comments that are meant for the author. Put the facts into the matching sections; if a fact has no section, keep it in a section at the end. Use only the facts given, never invent. Answer only with JSON {{\"body\": \"the filled template in Markdown\"}}.\n\n{}\n\nFacts (our PR text):\n{}", wrap("template", &crate::sh::head(&t, 8000)), body(j, &f, &ci, "")));
            o.job = Some(j.id);
            o.ef = Some("low");
            if let Ok((_, js)) = ask(a, o).await {
                if let Some(s) = js["body"].as_str().filter(|s| s.len() > 40) {
                    b = s.trim().to_string();
                    if j.own() {
                        b = san(&b);
                    }
                    if !b.contains(ft) {
                        b = format!("{b}\n\n{ft}");
                    }
                }
            }
            a.st("submit", "work", Some(j.id), "");
        }
    }
    j.d["pt"] = json!(f["title"].as_str().unwrap_or(&j.title));
    j.d["pb"] = json!(b);
    j.d["df"] = json!(ok(a, j, &format!("git diff {}..HEAD | head -c 120000", j.s("base")), 120).await.unwrap_or_default());
    a.db.jd(j);
    Ok(())
}

async fn submit(a: &Ax, j: &mut Job) -> R<(String, i64)> {
    // Every path, including recovery/resume, must pass this boundary before any
    // squash, push or GitHub request. A resumed job is not an approval grant.
    if crate::routing::enabled(a) && j.d["ap"].as_bool() != Some(true) {
        // Persist the hold before any fallible worker/preview operation.
        a.db.jset(j.id,&[("st",json!("approve")),("why",json!("waiting for explicit owner approval, including resumed jobs"))]);
        let f=j.d["f"].clone();
        let ci=rp(a,&j.repo)["ci"].as_str().unwrap_or("").to_string();
        j.d["pt"]=json!(f["title"].as_str().unwrap_or(&j.title));
        j.d["pb"]=json!(body(j,&f,&ci,fo(a,j)));
        let tip=if j.s("br").is_empty() { "HEAD".to_string() } else { j.s("br") };
        let range=q(&format!("{}..{}",j.s("base"),tip));
        j.d["df"]=json!(ok(a,j,&format!("git diff {range} -- | head -c 120000"),120).await.unwrap_or_default());
        a.db.jd(j);
        a.say("submit","submission held: resumed work does not grant owner approval",Some(j.id));
        clean(a,j).await;
        return Err(X::Back(String::new()));
    }
    a.db.jset(j.id, &[("st", json!("submit"))]);
    a.st("submit", "work", Some(j.id), "");
    a.flow("reviewer", "submit", &j.tag());
    need(a, "submit", &["gh", &j.h()]).await?;
    let f = j.d["f"].clone();
    let ft = fo(a, j);
    let tr = trs(j);
    let ti = j.d["pt"].as_str().map(String::from).filter(|x| !x.trim().is_empty()).unwrap_or(f["title"].as_str().unwrap_or(&j.title).to_string());
    if j.kind == "fix" && !j.d["sq"].as_bool().unwrap_or(false) {
        let rf = if j.ext() { "Reported to us directly".to_string() } else if j.hunt() || j.num == 0 { format!("Found while testing {}", j.wh()) } else { format!("Fixes #{}", j.num) };
        ok(a, j, &format!("git reset -q --soft {} && git commit -q -F - <<'MSG'\n{ti}\n\n{rf}\n\n{}\nMSG", j.s("base"), tr.join("\n")), 120).await?;
        j.d["sq"] = json!(true);
        a.db.jd(j);
    }
    if (j.kind == "review" || j.kind == "rebase" && !j.s("fx").is_empty()) && !j.d["sq"].as_bool().unwrap_or(false) && !tr.is_empty() {
        ok(a, j, &format!("git commit -q --amend --no-edit {}", tr.iter().map(|t| format!("--trailer {}", q(t))).collect::<Vec<_>>().join(" ")), 120).await?;
        j.d["sq"] = json!(true);
        a.db.jd(j);
    }
    let sha = ok(a, j, "git rev-parse HEAD", 60).await?;
    let pb = j.d["pb"].as_str().map(String::from).unwrap_or_else(|| body(j, &f, rp(a, &j.repo)["ci"].as_str().unwrap_or(""), ft));
    let msg = ok(a, j, "git log -1 --format=%B", 60).await?;
    if Regex::new(r"#0\b").unwrap().is_match(&pb) || Regex::new(r"#0\b").unwrap().is_match(&msg) {
        return drop("PR text or commit still references #0, not pushing");
    }
    if (j.kind != "rebase" || !j.s("fx").is_empty()) && (!tr.iter().all(|t| msg.contains(t)) || j.kind == "fix" && !pb.contains(ft)) {
        return drop("AI disclosure missing (Co-Authored-By trailer or footer), not pushing");
    }
    if std::env::var("APOLLO_OFFICE_DRY").map(|v| v == "1").unwrap_or(false) || j.d["dry"].as_bool().unwrap_or(false) {
        a.say("submit", &format!("DRY: would push {} ({}) and open PR \"{ti}\"", j.s("br"), crate::sh::head(&sha, 8)), Some(j.id));
        return Ok((String::new(), 0));
    }
    let me = crate::gh::login(a).await;
    let mt = crate::gh::meta(a, &j.repo).await.map_err(X::E)?;
    let hr = if j.kind == "fix" {
        if mt["push"].as_bool().unwrap_or(false) {
            j.repo.clone()
        } else {
            let fk = ghj(&["api", "-X", "POST", &format!("repos/{}/forks", j.repo), "-f", "default_branch_only=true"], 120).await.map_err(X::E)?;
            let n = fk["full_name"].as_str().unwrap_or("").to_string();
            if n.is_empty() {
                return e("could not create a fork");
            }
            for _ in 0..12 {
                if ghj(&["api", &format!("repos/{n}")], 30).await.is_ok() {
                    break;
                }
                sl(5000).await;
            }
            n
        }
    } else {
        j.s("head")
    };
    let url = format!("{}{}.git", gitb(), hr);
    let br = j.s("br");
    let pr = format!("refs/ao/push/{}", j.id);
    let _ = lg(a, &j.repo, &["fetch", "-q", "--no-tags", &format!("{}{}.git", gitb(), j.repo), &format!("+refs/heads/{}:refs/ao/main", j.s("mn"))], true, 1800).await;
    let tf = format!("/tmp/ao-out-{}.bundle", j.id);
    let bf = a.dd.join("run").join(format!("out-{}.bundle", j.id));
    let _ = std::fs::create_dir_all(bf.parent().unwrap());
    let bfs = bf.display().to_string();
    let mut got = false;
    for ex in [true, false] {
        let c = format!("cd \"{}\" && rm -f {tf} && git bundle create -q {tf} {} {} >/dev/null 2>&1 || exit 3; base64 < {tf} | tr -d '\\n\\r'; rm -f {tf}", dir(a, j), q(&format!("refs/heads/{br}")), if ex { format!("^{}", q(&j.s("base"))) } else { String::new() });
        let o = crate::sh::hxk(a, &j.h(), &c, 1800).await;
        if o.c != 0 {
            continue;
        }
        use base64::Engine;
        let Ok(b) = base64::engine::general_purpose::STANDARD.decode(o.o.trim()) else { continue };
        if std::fs::write(&bf, b).is_err() {
            continue;
        }
        let f = lg(a, &j.repo, &["fetch", "-q", "--no-tags", &bfs, &format!("+refs/heads/{br}:{pr}")], false, 600).await;
        if f.c == 0 && lg(a, &j.repo, &["rev-parse", &pr], false, 60).await.o.trim() == sha {
            got = true;
            break;
        }
    }
    let _ = std::fs::remove_file(&bf);
    if !got {
        return e("could not take the commits from the build machine");
    }
    let lr = |o: String| o.split_whitespace().next().unwrap_or("").to_string();
    let rem = lr(lok(a, &j.repo, &["ls-remote", &url, &format!("refs/heads/{br}")], true, 120).await.unwrap_or_default());
    if rem != sha {
        let fo = if j.kind == "rebase" || j.kind == "review" { format!("--force-with-lease=refs/heads/{br}:{}", j.s("old")) } else { "--force".into() };
        lok(a, &j.repo, &["push", "-q", &fo, &url, &format!("{pr}:refs/heads/{br}")], true, 600).await?;
    }
    let mut r2 = String::new();
    for i in 0..4 {
        if r2 == sha {
            break;
        }
        if i > 0 {
            sl(15_000).await;
        }
        r2 = lr(lok(a, &j.repo, &["ls-remote", &url, &format!("refs/heads/{br}")], true, 120).await.unwrap_or_default());
    }
    if r2 != sha {
        return e("push did not arrive");
    }
    let pn = j.pr.unwrap_or(0);
    if j.kind == "rebase" || j.kind == "review" {
        let u = format!("https://github.com/{}/pull/{pn}", j.repo);
        a.say("submit", &format!("PR #{pn} updated ({})", j.kind), Some(j.id));
        a.note(if j.kind == "rebase" { "Rebased" } else { "Review applied" }, &format!("{}#{pn}: {}\n{u}", j.repo, f["title"].as_str().unwrap_or("")), 2);
        return Ok((u, pn));
    }
    let hd = if hr == j.repo { br.clone() } else { format!("{}:{br}", hr.split('/').next().unwrap_or(&me)) };
    let ex = ghj(&["pr", "list", "-R", &j.repo, "--head", &br, "--state", "open", "--json", "number,url,headRepositoryOwner"], 60).await.map_err(X::E)?;
    let ex = ex.as_array().cloned().unwrap_or_default().into_iter().find(|p| p["headRepositoryOwner"]["login"].as_str() == hr.split('/').next());
    let (u, n) = match ex {
        Some(p) => (p["url"].as_str().unwrap_or("").to_string(), p["number"].as_i64().unwrap_or(0)),
        None => {
            let o = gh(&["pr", "create", "-R", &j.repo, "--head", &hd, "--base", &j.s("mn"), "--title", &ti, "--body", &pb], 120).await.map_err(X::E)?;
            let u = o.trim().lines().last().unwrap_or("").to_string();
            let n = u.rsplit('/').next().and_then(|x| x.parse().ok()).unwrap_or(0);
            (u, n)
        }
    };
    a.db.run("insert into prs(repo,num,st,title,url,upd,d,t0) values(?,?,?,?,?,?,?,?) on conflict do update set st=excluded.st, d=excluded.d", pa![j.repo.clone(), n, "open".to_string(), ti.clone(), u.clone(), chrono::Utc::now().to_rfc3339(), json!({"job": j.id, "test_cmd": f["test_cmd"], "tests": f["tests"], "branch": br, "head": hr}).to_string(), now()]);
    a.say("submit", &format!("PR opened: {u}"), Some(j.id));
    a.note("PR opened", &format!("{} → {ti}\n{u}", j.tag()), 3);
    Ok((u, n))
}

async fn clean(a: &Ax, j: &Job) {
    hx(a, &j.h(), &format!("cd \"{}\" 2>/dev/null && {{ git rebase --abort; git merge --abort; }} 2>/dev/null; cd \"{}\" 2>/dev/null && git reset -q --hard && git clean -fdq && git checkout -q --detach origin/HEAD 2>/dev/null; true", dir(a, j), dir(a, j)), 600).await;
}

async fn stage<T, F, Fu>(a: &Ax, w: &str, mut f: F) -> R<T>
where
    F: FnMut() -> Fu,
    Fu: std::future::Future<Output = R<T>>,
{
    let mut k = 0;
    loop {
        match f().await {
            Ok(v) => return Ok(v),
            Err(X::Lim(m)) | Err(X::Net(m)) if k < 8 && !crate::routing::enabled(a) => {
                k += 1;
                a.say(w, &format!("waiting: {}", crate::sh::head(&m, 120)), None);
                let _ = need(a, w, &["gh", "an"]).await;
                sl(if m.to_lowercase().contains("limit") { 600_000 } else { 30_000 }).await;
            }
            Err(x) => return Err(x),
        }
    }
}

async fn hunt(a: &Ax, j: &mut Job) -> R<i64> {
    a.db.jset(j.id, &[("st", json!("hunt"))]);
    a.st("hunter", "work", Some(j.id), "");
    a.say("hunter", &format!("[{}] hunting bugs in {}", j.h(), j.repo), Some(j.id));
    let mut ti: Vec<String> = a.db.all("select id, json_extract(d,'$.title') t, coalesce(json_extract(d,'$.hunt.where'),json_extract(d,'$.ext.where'),'') w from jobs where repo=? and num=0 and kind='fix' and st not in ('drop') order by id desc limit 200", pa![j.repo.clone()]).iter().map(|x| format!("office find #{}: {}\n  where: {}", x["id"], x["t"].as_str().unwrap_or(""), x["w"].as_str().unwrap_or(""))).collect();
    for x in ghj(&["pr", "list", "-R", &j.repo, "--state", "open", "--limit", "1000", "--json", "number,title,body"], 240).await.unwrap_or_default().as_array().cloned().unwrap_or_default() {
        ti.push(format!("pr #{}: {}\n  {}", x["number"], x["title"].as_str().unwrap_or(""), crate::sh::head(&x["body"].as_str().unwrap_or("").split_whitespace().collect::<Vec<_>>().join(" "), 250)));
    }
    for x in ghj(&["issue", "list", "-R", &j.repo, "--state", "open", "--limit", "1000", "--json", "number,title"], 240).await.unwrap_or_default().as_array().cloned().unwrap_or_default() {
        ti.push(format!("issue #{}: {}", x["number"], x["title"].as_str().unwrap_or("")));
    }
    let md = a.md("hunter");
    let mut o = Ask::new("hunter", md.clone(), P("hunter"), format!("Repository: {}.\n\nAlready reported or in progress (do not report these again):\n{}{}", j.repo, wrap("known", &crate::sh::head(&ti.join("\n"), 200_000)), rules(a, j)));
    o.job = Some(j.id);
    o.rn = rn(a, j);
    o.turns = 100;
    o.t = 90 * 60;
    let (_, js) = ask(a, o).await?;
    x(a, j, "git checkout -q -- . && git clean -fdq", 120).await;
    let fs: Vec<Value> = js["finds"].as_array().cloned().unwrap_or_default().into_iter().filter(|x| x["title"].is_string() && x["desc"].is_string() && x["where"].is_string()).take(1).collect();
    a.st("hunter", "idle", None, if fs.is_empty() { "sad" } else { "ok" });
    if fs.is_empty() {
        a.say("hunter", &format!("{}: nothing proven", j.repo), Some(j.id));
        return Ok(0);
    }
    let g = crate::wk::guard(a, fs.iter().enumerate().map(|(k, x)| (format!("h{k}"), format!("{}\n{}\n{}\n{}", x["title"].as_str().unwrap_or(""), x["where"].as_str().unwrap_or(""), x["desc"].as_str().unwrap_or(""), x["proof"].as_str().unwrap_or("")))).collect(), "hunter", Some(j.id)).await?;
    let mut n = 0;
    for (k, x) in fs.iter().enumerate() {
        if g[&format!("h{k}")]["inj"].as_bool().unwrap_or(false) {
            a.say("guard", &format!("hunter find blocked: {}", g[&format!("h{k}")]["why"].as_str().unwrap_or("")), Some(j.id));
            continue;
        }
        let t = x["title"].as_str().unwrap_or("").chars().take(200).collect::<String>();
        a.db.jnew(&j.repo, 0, "fix", &t, &format!("https://github.com/{}", j.repo), "vet", "found by Hunter", json!({"ms": [md], "hunt": {"title": x["title"], "where": x["where"], "proof": x["proof"]}, "title": x["title"], "body": format!("{}\n\nWhere: {}\nProof: {}", x["desc"].as_str().unwrap_or(""), x["where"].as_str().unwrap_or(""), x["proof"].as_str().unwrap_or("-"))}), None, 0.0);
        a.flow("hunter", "guard", &j.repo);
        n += 1;
    }
    a.say("hunter", &format!("{}: {n} bug(s) found, sent to Vet", j.repo), Some(j.id));
    Ok(n)
}

async fn desc(a: &Ax, j: &mut Job) -> R<Value> {
    let df = ok(a, j, &format!("git diff {}..HEAD | head -c 50000", j.s("base")), 120).await?;
    let lg = ok(a, j, &format!("git log --format='%s%n%b' {}..HEAD", j.s("base")), 60).await?;
    let mut o = Ask::new("fixer", a.md("reviewer"), P("desc"), format!("Repository {}. {}\n\nProof lines from the verification run:\n{}\n\nCommits:\n{lg}\n\nDiff:\n{df}\n\nAnswer with {{\"title\": \"PR title, imperative, max 72 chars\", \"cause\": \"root cause, 1-3 sentences\", \"fix\": \"what changed, 1-3 sentences\", \"untouched\": \"\", \"tests\": [\"exact names of the regression tests added in the diff\"], \"test_cmd\": \"exact shell command from the repo root that runs only those tests\"}}", j.repo, wrap("issue", &format!("{}\n\n{}", j.title, crate::sh::head(&j.s("body"), 3000))), j.d["proof"]));
    o.job = Some(j.id);
    o.ef = Some("medium");
    let (_, js) = ask(a, o).await?;
    if !js["title"].is_string() || js["tests"].as_array().map(|x| x.is_empty()).unwrap_or(true) || !js["test_cmd"].is_string() {
        return e("could not reconstruct the fix description");
    }
    Ok(js)
}

async fn resume(a: &Ax, j: &mut Job) -> R<Value> {
    a.say("ci", &format!("[{}] resuming {} after a restart", j.h(), j.tag()), Some(j.id));
    ok(a, j, &format!("git checkout -q {}", q(&j.s("br"))), 120).await?;
    let mut f = j.d["f0"].clone();
    if f.is_null() {
        f = desc(a, j).await?;
        j.d["f0"] = f.clone();
        a.db.jd(j);
    }
    let k = j.d["k"].as_u64().unwrap_or(0);
    let mut fb = crate::quality::check(a,j).await?;
    if fb.is_empty() { fb = ci(a, j).await?; }
    if fb.starts_with("CI aborted after") {
        return drop(format!("{fb} on {}", j.h()));
    }
    if fb.is_empty() {
        fb = review(a, j, &mut f).await?;
    }
    if !fb.is_empty() {
        return fix(a, j, fb, k + 1).await;
    }
    j.d["f"] = f.clone();
    a.db.jd(j);
    Ok(f)
}

fn idle_all(a: &Ax, id: i64) {
    for w in ["repro", "fixer", "ci", "reviewer", "submit", "hunter"] {
        let b = a.lv.lock().unwrap().w.get(w).map(|x| x.job == Some(id)).unwrap_or(false);
        if b {
            a.st(w, "idle", None, "");
        }
    }
}

async fn go(a: &Ax, id: i64, h: &str) {
    let Some(mut j) = a.db.jg(id) else { return };
    let rs = j.d["rs"].as_bool().unwrap_or(false);
    let rpp = j.d["rp"].as_bool().unwrap_or(false);
    if (j.st != "submit" && !rs && !rpp) || j.h().is_empty() {
        j.d["h"] = json!(h);
        a.db.jd(&j);
    }
    a.say("repro", &format!("[{h}] takes {}", j.tag()), Some(id));
    let r: R<()> = async {
        if j.st == "submit" {
            ok(a, &j, &format!("git checkout -q {}", q(&j.s("br"))), 120).await?;
            stage(a, "submit", || {
                let mut jj = j.clone();
                async move {
                    gate(a, &mut jj).await?;
                    Ok(jj)
                }
            })
            .await
            .map(|x| j = x)?;
            if j.kind == "fix" && j.s("base") != j.s("pbase") {
                j.d["df"] = json!(ok(a, &j, &format!("git diff {}..HEAD | head -c 120000", j.s("base")), 120).await.unwrap_or_default());
                a.db.jd(&j);
            }
        } else if rs {
            j.d.as_object_mut().unwrap().remove("rs");
            a.db.jd(&j);
            let mut jj = j.clone();
            resume(a, &mut jj).await?;
            j = jj;
            kill(a, &j)?;
            let mut jj = j.clone();
            gate(a, &mut jj).await?;
            j = jj;
            kill(a, &j)?;
        } else {
            let mut jj = j.clone();
            stage(a, "repro", || {
                let mut k = jj.clone();
                async move {
                    prep(a, &mut k).await?;
                    Ok(k)
                }
            })
            .await
            .map(|x| jj = x)?;
            j = jj;
            crate::quality::inspect(a,&mut j).await?;
            kill(a, &j)?;
            if j.kind == "hunt" {
                let mut jj = j.clone();
                let n = stage(a, "hunter", || {
                    let mut k = jj.clone();
                    async move { hunt(a, &mut k).await }
                })
                .await?;
                jj = a.db.jg(id).unwrap_or(jj);
                a.db.jset(id, &[("st", json!("done")), ("why", json!(format!("{n} bug(s) found")))]);
                clean(a, &jj).await;
                return Err(X::Back(String::new()));
            }
            if let Some(cr) = a.db.kg(&format!("cired:{}", j.repo)).as_object() {
                if cr.get("sha").and_then(|x| x.as_str()) == Some(j.s("base").as_str()) {
                    return Err(X::Back(format!("{}: CI is red on the default branch, waiting until it moves", j.repo)));
                }
                a.db.kd(&format!("cired:{}", j.repo));
            }
            if j.kind == "fix" {
                stage(a, "repro", || race(a, &j, "before repro")).await?;
                let mut jj = j.clone();
                stage(a, "repro", || {
                    let mut k = jj.clone();
                    async move {
                        repro(a, &mut k).await?;
                        Ok(k)
                    }
                })
                .await
                .map(|x| jj = x)?;
                j = jj;
            }
            kill(a, &j)?;
            stage(a, "fixer", || race(a, &j, "before fix")).await?;
            let mut jj = j.clone();
            if j.kind == "rebase" {
                stage(a, "fixer", || {
                    let mut k = jj.clone();
                    async move {
                        reb(a, &mut k).await?;
                        Ok(k)
                    }
                })
                .await
                .map(|x| jj = x)?;
            } else {
                stage(a, "fixer", || {
                    let mut k = jj.clone();
                    async move {
                        fix(a, &mut k, String::new(), 0).await?;
                        Ok(k)
                    }
                })
                .await
                .map(|x| jj = x)?;
            }
            j = jj;
            kill(a, &j)?;
            let mut jj = j.clone();
            stage(a, "submit", || {
                let mut k = jj.clone();
                async move {
                    gate(a, &mut k).await?;
                    Ok(k)
                }
            })
            .await
            .map(|x| jj = x)?;
            j = jj;
            kill(a, &j)?;
            mkbody(a, &mut j).await?;
            j.d["pbase"] = json!(j.s("base"));
            a.db.jd(&j);
            let auto = !crate::routing::enabled(a) && (rp(a, &j.repo)["mode"].as_str() == Some("auto") || j.kind != "fix");
            if !auto && !j.d["ap"].as_bool().unwrap_or(false) {
                a.db.jset(id, &[("st", json!("approve")), ("why", json!("waiting for your approval"))]);
                a.st("submit", "idle", None, "ok");
                a.say("submit", &format!("{} is ready and waits for your approval", j.tag()), Some(id));
                a.note("PR waits for approval", &format!("{}: {}", j.tag(), j.d["pt"].as_str().unwrap_or("")), 3);
                clean(a, &j).await;
                return Err(X::Back(String::new()));
            }
        }
        let mut jj = j.clone();
        let (u, n) = stage(a, "submit", || {
            let mut k = jj.clone();
            async move {
                let r = submit(a, &mut k).await?;
                Ok((r, k))
            }
        })
        .await
        .map(|(r, k)| {
            jj = k;
            r
        })?;
        j = jj;
        a.db.jset(id, &[("st", json!("done")), ("pr", if n > 0 { json!(n) } else { Value::Null }), ("why", json!(if u.is_empty() { "DRY".to_string() } else { u }))]);
        a.st("submit", "idle", None, "ok");
        clean(a, &j).await;
        Ok(())
    }
    .await;
    match r {
        Ok(()) => {}
        Err(X::Back(m)) => {
            if !m.is_empty() {
                a.db.jset(id, &[("st", json!("ready"))]);
                a.say("ci", &format!("{m}, {} goes back to the queue", j.tag()), Some(id));
                clean(a, &j).await;
            }
            idle_all(a, id);
        }
        Err(x) => {
            let m = match &x {
                X::Drop(m) => m.clone(),
                o => format!("error: {}", crate::sh::head(&o.to_string(), 300)),
            };
            let jj = a.db.jg(id).unwrap_or(j.clone());
            a.db.jset(id, &[("st", json!("drop")), ("why", json!(m.clone()))]);
            idle_all(a, id);
            a.say("submit", &format!("{} dropped: {m}", jj.tag()), Some(id));
            if Regex::new(r"faster|conflict|error|rounds|gave up|CI").unwrap().is_match(&m) && jj.kind != "hunt" {
                a.note("Dropped", &format!("{}: {m}", jj.tag()), if m.starts_with("error") { 4 } else { 2 });
            }
            clean(a, &jj).await;
        }
    }
}

pub fn recover(a: &Ax) {
    for j in a.db.all("select id, st, kind, d from jobs where st in ('repro','fix','ci','review','gate','hunt','submit')", pa![]) {
        let id = j["id"].as_i64().unwrap_or(0);
        let mut d = j["d"].clone();
        let st = j["st"].as_str().unwrap_or("");
        let kd = j["kind"].as_str().unwrap_or("");
        if st == "submit" && d["ap"].as_bool().unwrap_or(false) {
            continue;
        }
        if kd == "fix" && ["ci", "review", "gate", "submit"].contains(&st) && d["h"].is_string() && d["br"].is_string() {
            d["rs"] = json!(true);
        } else if (kd == "fix" || kd == "hunt") && d["h"].is_string() {
            d["rp"] = json!(true);
        }
        a.db.jset(id, &[("st", json!("ready")), ("d", d), ("prio", json!(-2))]);
    }
}

async fn red(a: &Ax, r: &str) -> bool {
    let cr = a.db.kg(&format!("cired:{r}"));
    if cr.is_null() {
        return false;
    }
    let k = format!("head:{r}");
    let h = match crate::gh::cg(a, &k, 600_000) {
        Some(v) => v,
        None => {
            let v = ghj(&["api", &format!("repos/{r}/commits/HEAD"), "--jq", "{s: .sha}"], 60).await.unwrap_or(Value::Null);
            crate::gh::cs(a, &k, &v);
            v
        }
    };
    !(h["s"].is_string() && cr["sha"].is_string() && h["s"] != cr["sha"])
}

async fn pick(a: &Ax, h: &str) -> Option<i64> {
    if a.drain.load(std::sync::atomic::Ordering::Relaxed) {
        return None;
    }
    let mut c = a.db.all("select * from jobs where st in ('ready','submit') order by id", pa![]);
    let rk = |j: &Value| -> (i32, i32, f64, i64) {
        let d = &j["d"];
        (
            if j["st"] == "submit" { 0 } else { 1 },
            if d["rs"].as_bool().unwrap_or(false) || d["rp"].as_bool().unwrap_or(false) { 0 } else { 1 },
            match j["kind"].as_str().unwrap_or("fix") {
                "hunt" => 1.0,
                "fix" => 2.0 + j["prio"].as_f64().unwrap_or(0.0) / 1000.0,
                _ => 0.0,
            },
            j["id"].as_i64().unwrap_or(0),
        )
    };
    c.sort_by(|x, y| rk(x).partial_cmp(&rk(y)).unwrap_or(std::cmp::Ordering::Equal));
    for j in c {
        let id = j["id"].as_i64().unwrap_or(0);
        let r = j["repo"].as_str().unwrap_or("").to_string();
        let d = &j["d"];
        let pin = j["st"] == "submit" || d["rs"].as_bool().unwrap_or(false) || d["rp"].as_bool().unwrap_or(false);
        if a.act.lock().unwrap().contains(&format!("{r} {h}")) || a.lk.lock().unwrap().contains(&id) {
            continue;
        }
        if j["kind"] == "hunt" && a.hold("hunter") {
            continue;
        }
        if pin && d["h"].as_str().map(|x| x != h).unwrap_or(false) {
            continue;
        }
        if !pin && crate::sh::ho(a, h).map(|x| x.skips(&r)).unwrap_or(false) {
            continue;
        }
        let rr = rp(a, &r);
        if rr["on_"].as_i64().unwrap_or(0) != 1 && !pin {
            continue;
        }
        if rr["ci"].as_str().unwrap_or("").trim().is_empty() && !pin {
            continue;
        }
        if !pin && red(a, &r).await {
            continue;
        }
        if !pin && j["kind"] == "fix" {
            let mo = rr["maxo"].as_i64().unwrap_or(3);
            let md = rr["maxd"].as_i64().unwrap_or(5);
            if crate::gh::opened(a, &r).await + a.db.n("select count(*) from jobs where repo=? and kind='fix' and st in ('repro','fix','ci','review','gate','submit')", pa![r.clone()]) >= mo || crate::gh::today(a, &r).await >= md {
                continue;
            }
        }
        {
            let mut ac = a.act.lock().unwrap();
            let mut lk = a.lk.lock().unwrap();
            if ac.contains(&format!("{r} {h}")) || lk.contains(&id) {
                continue;
            }
            ac.insert(format!("{r} {h}"));
            lk.insert(id);
        }
        return Some(id);
    }
    None
}

fn hn(a: &Ax) -> i64 {
    if crate::routing::enabled(a) { return 0; }
    let cap = a.set()["hunters"].as_i64().unwrap_or(2).clamp(0, 12);
    let l: i64 = hosts(a).iter().filter(|h| h.on && a.net(&h.id)).map(|h| h.ln).sum();
    let hf = a.db.n("select count(*) from jobs where kind='fix' and num=0 and st in ('vet','ready') and json_extract(d,'$.ext') is null", pa![]);
    if cap == 0 {
        return 0;
    }
    (l - 1 - hf).clamp(1, cap)
}

fn mk_hunt(a: &Ax) -> bool {
    let on = a.db.all("select repo from jobs where kind='hunt' and st not in ('done','drop')", pa![]);
    if on.len() as i64 >= hn(a) {
        return false;
    }
    let d0 = crate::db::day0();
    let rs: Vec<String> = a.db.all("select full from rp where on_=1 and hunt=1 and ci<>''", pa![]).iter().filter_map(|x| x["full"].as_str().map(String::from)).collect();
    let act: Vec<String> = a.act.lock().unwrap().iter().map(|k| k.split(' ').next().unwrap_or("").to_string()).collect();
    let cnt = |r: &str| a.db.n("select count(*) from jobs where kind='hunt' and repo=? and t0>?", pa![r.to_string(), d0]);
    let mut c: Vec<String> = rs.into_iter().filter(|r| !act.contains(r) && !on.iter().any(|x| x["repo"].as_str() == Some(r.as_str())) && cnt(r) < 6).collect();
    c.sort_by_key(|r| cnt(r));
    let Some(r) = c.first() else { return false };
    a.db.jnew(r, 0, "hunt", &format!("Hunt for bugs in {r}"), &format!("https://github.com/{r}"), "ready", "hunter slot", json!({}), None, 99.0);
    a.say("hunter", &format!("starting a hunt in {r}"), None);
    true
}

async fn lane(a: Ax, h: String, k: i64) {
    let key = format!("{h}#{k}");
    loop {
        let Some(x) = ho(&a, &h) else { break };
        if !x.on || k > x.ln {
            break;
        }
        for w in ["repro", "fixer", "submit"] {
            a.held(w).await;
        }
        if !a.net(&h) {
            sl(60_000).await;
            continue;
        }
        while !a.hold("hunter") && !a.drain.load(std::sync::atomic::Ordering::Relaxed) && mk_hunt(&a) {}
        let Some(id) = pick(&a, &h).await else {
            sl(20_000).await;
            continue;
        };
        let r = a.db.jg(id).map(|j| j.repo).unwrap_or_default();
        a.lv.lock().unwrap().ln.insert(id, key.clone());
        go(&a,id,&h).await;
        a.lv.lock().unwrap().ln.remove(&id);
        a.act.lock().unwrap().remove(&format!("{r} {h}"));
        a.lk.lock().unwrap().remove(&id);
    }
    a.lanes.lock().unwrap().remove(&key);
}

static ENS: std::sync::LazyLock<std::sync::Mutex<std::collections::HashSet<String>>> = std::sync::LazyLock::new(Default::default);
static ING: std::sync::LazyLock<std::sync::Mutex<std::collections::HashSet<String>>> = std::sync::LazyLock::new(Default::default);

pub async fn lanes(a: Ax) {
    loop {
        for x in hosts(&a) {
            if !x.on {
                continue;
            }
            if x.dk && !ENS.lock().unwrap().contains(&x.id) {
                if ING.lock().unwrap().insert(x.id.clone()) {
                    let (a2, id) = (a.clone(), x.id.clone());
                    tokio::spawn(async move {
                        a2.say("ci", &format!("[{id}] preparing the build container"), None);
                        match crate::sh::ensure(&a2, &id).await {
                            Ok(()) => {
                                a2.db.ks(&format!("up:{id}"), &json!(true));
                                ENS.lock().unwrap().insert(id.clone());
                            }
                            Err(m) => a2.say("ci", &format!("[{id}] machine not ready: {m}"), None),
                        }
                        ING.lock().unwrap().remove(&id);
                    });
                }
                continue;
            }
            for k in 1..=x.ln {
                let key = format!("{}#{k}", x.id);
                let new = a.lanes.lock().unwrap().insert(key);
                if new {
                    tokio::spawn(lane(a.clone(), x.id.clone(), k));
                    sl(3000).await;
                }
            }
        }
        sl(30_000).await;
    }
}

async fn disk(a: &Ax, h: &crate::sh::Ho) -> Out {
    let ac: Vec<String> = a.act.lock().unwrap().iter().filter(|k| k.ends_with(&format!(" {}", h.id))).map(|k| slug(k.split(' ').next().unwrap_or(""))).collect();
    let pn: Vec<String> = a.db.all("select repo, d from jobs where st in ('ready','submit','approve')", pa![]).iter().filter(|y| y["d"]["h"].as_str() == Some(h.id.as_str())).map(|y| slug(y["repo"].as_str().unwrap_or(""))).collect();
    let ex = |l: &[String]| std::iter::once("-e __none__/".to_string()).chain(l.iter().map(|r| format!("-e {}", q(&format!("{r}/"))))).collect::<Vec<_>>().join(" ");
    let mut ap = ac.clone();
    ap.extend(pn);
    let s = format!(
        "cd \"{b}\" 2>/dev/null || exit 0\nfr() {{ df -Pk . | awk 'NR==2{{print int($4/1048576)}}'; }}\nus() {{ du -sk . 2>/dev/null | awk '{{print int($1/1048576)}}'; }}\ngd() {{ [ \"$(fr)\" -ge 20 ] && [ \"$(us)\" -le {gb} ]; }}\nwhile ! gd; do t=$(ls -1td */ 2>/dev/null | grep -v -x {e1} | while read d; do for x in target node_modules .venv build dist; do [ -d \"$d$x\" ] && echo \"$d$x\"; done; done | tail -1); [ -z \"$t\" ] && break; echo \"rm $t\"; rm -rf \"$t\"; done\nwhile ! gd; do o=$(ls -1td */ 2>/dev/null | grep -v -x {e2} | tail -1); [ -z \"$o\" ] && break; echo \"rm $o\"; rm -rf \"$o\"; done\nf=$(fr); if [ \"$f\" -lt 5 ]; then echo \"hard $f\"; fi\necho \"free $(fr) GB, office $(us) GB\"",
        b = hb(a, h),
        gb = h.gb,
        e1 = ex(&ac),
        e2 = ex(&ap)
    );
    hx(a, &h.id, &s, 1200).await
}

pub async fn guard(a: Ax) {
    loop {
        for h in hosts(&a) {
            if !h.on || !a.net(&h.id) {
                continue;
            }
            let r = disk(&a, &h).await;
            if r.c != 0 {
                continue;
            }
            let rm: Vec<&str> = r.o.lines().filter_map(|l| l.strip_prefix("rm ")).collect();
            let tl = r.o.trim().lines().last().unwrap_or("").to_string();
            if !rm.is_empty() {
                a.say("ci", &format!("[{}] disk guard freed {} · {tl}", h.id, rm.join(", ")), None);
            }
            if r.o.lines().any(|l| l.starts_with("hard ")) {
                a.note("Disk almost full", &format!("{}: under 5 GB free · {tl}", h.id), 4);
            }
        }
        sl(300_000).await;
    }
}

#[cfg(test)]
mod t {
    use super::*;

    #[cfg(unix)]
    #[tokio::test]
    async fn cancelled_ci_releases_build_capacity() {
        let root=std::env::temp_dir().join(format!("apollo-ci-cancel-{}",hex::encode(rand::random::<[u8;8]>())));
        std::fs::create_dir_all(root.join("work/o__r")).unwrap();
        let db=crate::db::Db::mem();db.ks("set",&json!({"free_first":true}));
        db.run("insert into hs(id,on_,ci) values('local',1,1)",crate::pa![]);
        db.run("insert into rp(full,ci) values('o/r','sleep 30')",crate::pa![]);
        let id=db.jnew("o/r",0,"fix","test","","ci","",json!({"h":"local"}),None,0.0);
        let a=std::sync::Arc::new(crate::app::App::new(db,root.clone(),1,"x".into()));
        let mut job=a.db.jg(id).unwrap();
        assert!(tokio::time::timeout(std::time::Duration::from_millis(100),ci(&a,&mut job)).await.is_err());
        assert_eq!(a.sem.lock().unwrap().get("local").copied(),Some(0));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn names() {
        let o = "test a::b::c ... FAILED\ntest x ... ok\nFAILED tests/t.py::test_x - assert 1 == 2\n--- FAIL: TestFoo (0.00s)\n  ✕ adds numbers (3 ms)\nnot ok 2 - parses empty\n";
        assert_eq!(fails(o), vec!["TestFoo", "a::b::c", "adds numbers", "parses empty", "tests/t.py::test_x"]);
        assert_eq!(bare("a::b::c"), "c");
        assert_eq!(bare("tests/t.py::test_x"), "test_x");
        assert_eq!(bare("TestFoo"), "TestFoo");
    }

    #[test]
    fn infra() {
        let o = "CI: 6 passed, FAILED at `deny`: cargo-deny is required in CI: cargo install cargo-deny --locked\nxtask ci: error: ci failed at `deny`\n[exit 1]";
        assert!(!lost(o));
        assert!(lost("Compiling foo\n"));
        assert_eq!(tool(o).unwrap().1.as_deref(), Some("cargo-deny"));
        assert_eq!(tool("error: no such command: `nextest`\n[exit 101]").unwrap().1.as_deref(), Some("cargo-nextest"));
        assert_eq!(tool("sh: 1: pnpm: command not found\n[exit 127]").unwrap().1, None);
        assert!(tool("test a ... FAILED\n[exit 101]").is_none());
    }

    #[test]
    fn judging() {
        let ts = vec!["m::t_empty".to_string()];
        assert!(judge(&ts, 101, "test m::t_empty ... FAILED\npanicked at x", 0, "test m::t_empty ... ok").is_empty());
        assert!(judge(&ts, 0, "", 0, "").contains("already passes"));
        assert!(judge(&ts, 101, "error[E0425]: cannot find", 0, "").contains("does not compile"));
        assert!(judge(&ts, 1, "something else failed", 0, "").contains("No failure"));
        assert!(judge(&ts, 101, "t_empty FAILED", 1, "boom").contains("fails with the fix"));
        assert!(judge(&ts, 1, "t_empty", 0, "[checkout failed]").contains("checkout"));
    }

    #[test]
    fn bodies() {
        let j = Job::of(json!({"id": 5, "repo": "o/r", "num": 12, "kind": "fix", "title": "T", "d": {"mn": "main", "known": []}}));
        let f = json!({"cause": "c", "fix": "f", "tests": ["t1"], "test_cmd": "cargo test t1", "untouched": ""});
        let b = body(&j, &f, "cargo test", FOOT);
        assert!(b.starts_with("Fixes #12"));
        assert!(b.contains("`t1`: fails on `main`"));
        assert!(b.ends_with(FOOT));
        assert!(!body(&j, &f, "cargo test", "").contains(FOOT));
        assert!(body(&j, &f, "cargo test", FOOT0).ends_with(FOOT0) && !FOOT0.contains("ApolloOffice"));
        let h = Job::of(json!({"id": 6, "repo": "o/r", "num": 0, "kind": "fix", "title": "T", "d": {"mn": "main", "hunt": {"where": "a.rs:3", "title": "x"}}}));
        let b = body(&h, &json!({"cause": "Fixes #0. c", "fix": "f", "tests": ["a", "b"], "test_cmd": "t"}), "make test", FOOT);
        assert!(b.starts_with("Found while testing `a.rs:3`"));
        assert!(!b.contains("#0"));
        assert!(b.contains("Regression tests `a`, `b`: fail on"));
    }

    #[test]
    fn junks() {
        assert!(junk("__pycache__/tb.cpython-314.pyc"));
        assert!(junk("tests/__pycache__/x.pyc"));
        assert!(junk("build/a.o"));
        assert!(!junk("tb.py"));
        assert!(!junk("src/main.rs"));
    }

    #[test]
    fn gitcfg() {
        let u = "https://github.com/o/r.git";
        let l = "core.repositoryformatversion=0\ncore.filemode=true\nremote.origin.url=https://github.com/o/r.git\nremote.origin.fetch=+refs/heads/*:refs/remotes/origin/*\nremote.origin.promisor=true\nremote.origin.partialclonefilter=blob:none\nbranch.main.remote=origin\nbranch.main.merge=refs/heads/main\nuser.name=T\nuser.email=t@t\nextensions.partialclone=origin\n";
        assert!(cfg_ok(l, u).is_ok());
        assert!(cfg_ok(&format!("{l}core.fsmonitor=curl x\n"), u).is_err());
        assert!(cfg_ok(&format!("{l}core.hookspath=/tmp/h\n"), u).is_err());
        assert!(cfg_ok(&format!("{l}url.https://evil/.insteadof=https://github.com/\n"), u).is_err());
        assert!(cfg_ok(&format!("{l}include.path=/tmp/x\n"), u).is_err());
        assert!(cfg_ok(&l.replace("github.com/o/r", "evil.com/o/r"), u).is_err());
    }

    #[test]
    fn slugs() {
        let j = Job::of(json!({"id": 5, "repo": "o/r", "num": 12, "title": "Crash on empty input!!", "d": {}}));
        assert_eq!(bslug(&j), "fix/12-crash-on-empty-input");
        assert_eq!(slug("a/b"), "a__b");
    }
    #[cfg(unix)]
    #[tokio::test]
    async fn subscription_review_returns_free_author_feedback_and_stages_proposal() {
        let _cli_lock=crate::ai::CLI_TEST_LOCK.lock().await;
        use std::os::unix::fs::PermissionsExt;
        let dd=std::env::temp_dir().join(format!("apollo-review-{}",hex::encode(rand::random::<[u8;8]>())));
        let repo=dd.join("work/o__r");std::fs::create_dir_all(&repo).unwrap();
        let git=|args:&[&str]| {
            let out=std::process::Command::new("git").args(args).current_dir(&repo).output().unwrap();
            assert!(out.status.success(),"{}",String::from_utf8_lossy(&out.stderr));
            String::from_utf8_lossy(&out.stdout).trim().to_string()
        };
        git(&["init","-q","-b","main"]);
        std::fs::write(repo.join("sum.py"),"def add(a,b): return a-b\n").unwrap();
        git(&["add","sum.py"]);git(&["-c","user.name=fixture","-c","user.email=fixture@localhost","commit","-qm","base"]);
        let base=git(&["rev-parse","HEAD"]);
        std::fs::write(repo.join("sum.py"),"def add(a,b): return 5\n").unwrap();
        git(&["add","sum.py"]);git(&["-c","user.name=fixture","-c","user.email=fixture@localhost","commit","-qm","bad hardcoded fix"]);
        let cli=dd.join("review-cli");
        std::fs::write(&cli,r##"#!/usr/bin/python3
import sys,json,pathlib
args=sys.argv[1:];text=sys.stdin.read()
assert 'read-only' in args and '--ignore-user-config' in args
assert not any('mcp_servers.office' in x for x in args), 'reviewer must have no worker tools'
assert 'def add(a,b): return 5' in text
assert 'real fixture verification: negative addition fails' in text
answer=json.dumps({'ok':False,'issues':['Replace hardcoded 5 with a+b; test negative values too.'],'lesson':{'mistake':'Hardcoded example instead of general arithmetic.','correction':'Implement a+b.','verification':'Exercise positive and negative integers.'}})
pathlib.Path(args[args.index('-o')+1]).write_text(answer)
print(json.dumps({'type':'item.completed','item':{'type':'agent_message','text':answer}}))
print(json.dumps({'type':'turn.completed','usage':{'input_tokens':10,'output_tokens':10}}))
"##).unwrap();
        std::fs::set_permissions(&cli,std::fs::Permissions::from_mode(0o700)).unwrap();
        std::env::set_var("APOLLO_OFFICE_CODEX",&cli);
        let db=crate::db::Db::mem();
        db.ks("set",&json!({"free_first":true}));
        db.run("insert into hs(id,ssh,dk,raw,on_) values('local','',0,1,1)",pa![]);
        db.run("insert into rp(full,ci) values('o/r','python3 sum.py')",pa![]);
        let id=db.jnew("o/r",0,"fix","addition bug","", "fix","",json!({"h":"local","base":base,"ext":{"src":"fixture"},"verification_feedback":"real fixture verification: negative addition fails"}),None,0.0);
        let a=std::sync::Arc::new(crate::app::App::new(db,dd.clone(),1,"apollo-office".into()));
        let mut job=a.db.jg(id).unwrap();
        let mut f=json!({"title":"Fix addition","cause":"subtraction","fix":"hardcode five"});
        let feedback=review(&a,&mut job,&mut f).await.unwrap();
        std::env::remove_var("APOLLO_OFFICE_CODEX");
        assert!(feedback.contains("Replace hardcoded 5"));
        assert_eq!(a.db.jg(id).unwrap().d["last_review"]["model"],"codex:");
        assert_eq!(a.db.n("select count(*) from kv where k like 'lesson:%'",pa![]),1);
        assert!(!a.db.jg(id).unwrap().d["ms"].as_array().map(|v|v.contains(&json!("codex:"))).unwrap_or(false),"review must not claim code authorship");
        std::fs::remove_dir_all(dd).unwrap();
    }

    #[test]
    fn java_compile_or_loading_failure_is_not_a_regression_proof() {
        let names=vec!["channel_identity".to_string()];
        assert!(judge(&names,1,"BlockedChannelData.java:24: error: cannot find symbol\nchannel_identity",0,"channel_identity OK").contains("compile or load"));
        assert!(judge(&names,1,"channel_identity java.lang.ClassNotFoundException: BlockedChannelData",0,"channel_identity OK").contains("compile or load"));
        assert!(judge(&names,1,"channel_identity java.lang.AssertionError: distinct IDs collide",0,"channel_identity OK").is_empty());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn independent_acceptance_rejects_author_tests_green_and_feedback_reaches_fixer() {
        use sha2::{Digest,Sha256};
        let dd=std::env::temp_dir().join(format!("apollo-independent-{}",hex::encode(rand::random::<[u8;8]>())));
        let repo=dd.join("work/o__r");std::fs::create_dir_all(&repo).unwrap();
        let git=|args:&[&str]| {
            let out=std::process::Command::new("git").args(args).current_dir(&repo).output().unwrap();
            assert!(out.status.success(),"{}",String::from_utf8_lossy(&out.stderr));String::from_utf8_lossy(&out.stdout).trim().to_string()
        };
        let commit=||{git(&["add","."]);git(&["-c","user.name=fixture","-c","user.email=fixture@localhost","commit","-qm","fixture"]);git(&["rev-parse","HEAD"])};
        git(&["init","-q","-b","work"]);
        std::fs::write(repo.join("maths.py"),"def add(a,b): return a-b\n").unwrap();let base=commit();
        std::fs::write(repo.join("author_test.py"),"from maths import add\nimport sys\nok=add(2,3)==5\nprint('positive_addition', 'PASS' if ok else 'FAIL')\nsys.exit(0 if ok else 1)\n").unwrap();commit();
        std::fs::write(repo.join("maths.py"),"def add(a,b): return 5\n").unwrap();commit();
        let script="import os,pathlib,runpy\nm=runpy.run_path(str(pathlib.Path(os.environ['APOLLO_SOURCE_ROOT'])/'maths.py'))\nok=m['add'](-2,3)==1\nprint('APOLLO_CHECK:negative_addition:'+('PASS' if ok else 'FAIL'))\nraise SystemExit(0 if ok else 1)\n";
        let frozen=json!({"base":base,"baseline_valid":true,"designer":"fixture-independent-reviewer","checks":["negative_addition"],"script":script});
        let db=crate::db::Db::mem();db.ks("set",&json!({"quality_checks":true}));
        db.run("insert into hs(id,ssh,dk,raw,on_) values('local','',0,1,1)",pa![]);
        db.run("insert into rp(full,ci) values('o/r','python3 author_test.py')",pa![]);
        let id=db.jnew("o/r",0,"fix","addition","","fix","",json!({"h":"local","base":base,"br":"work","acceptance":frozen}),None,0.0);
        let a=std::sync::Arc::new(crate::app::App::new(db,dd.clone(),1,"apollo-office".into()));let mut job=a.db.jg(id).unwrap();
        let feedback=verify(&a,&mut job,&json!({"tests":["positive_addition"],"test_cmd":"PYTHONDONTWRITEBYTECODE=1 python3 author_test.py"})).await.unwrap();
        assert_eq!(job.d["proof"]["b_exit"],0,"author's tests must really be green");
        assert!(feedback.contains("negative_addition"),"{feedback}");
        assert_eq!(job.d["acceptance_proof"]["ok"],false);
        assert!(fixp(&a,&job,&feedback).contains("Independent acceptance rejected"));
        assert_eq!(job.d["acceptance_proof"]["run"]["script_sha256"],json!(hex::encode(Sha256::digest(script.as_bytes()))));
        std::fs::remove_dir_all(dd).unwrap();
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn resumed_free_first_submission_without_owner_approval_never_invokes_github() {
        use std::os::unix::fs::PermissionsExt;
        let dd=std::env::temp_dir().join(format!("apollo-publish-{}",hex::encode(rand::random::<[u8;8]>())));
        let repo=dd.join("work/o__r");std::fs::create_dir_all(&repo).unwrap();
        let git=|args:&[&str]| {
            let out=std::process::Command::new("git").args(args).current_dir(&repo).output().unwrap();
            assert!(out.status.success());String::from_utf8_lossy(&out.stdout).trim().to_string()
        };
        git(&["init","-q","-b","work"]);std::fs::write(repo.join("file"),"fixture\n").unwrap();
        git(&["add","file"]);git(&["-c","user.name=fixture","-c","user.email=fixture@localhost","commit","-qm","base"]);
        let base=git(&["rev-parse","HEAD"]);let marker=dd.join("github-called");let gh=dd.join("gh");
        std::fs::write(&gh,format!("#!/bin/sh\nprintf called > {}\nexit 97\n",q(&marker.display().to_string()))).unwrap();
        std::fs::set_permissions(&gh,std::fs::Permissions::from_mode(0o700)).unwrap();
        std::env::set_var("APOLLO_OFFICE_GH",&gh);
        let db=crate::db::Db::mem();db.ks("set",&json!({"free_first":true}));
        db.run("insert into hs(id,ssh,dk,raw,on_) values('local','',0,1,1)",pa![]);
        db.run("insert into rp(full,mode) values('o/r','auto')",pa![]);
        let id=db.jnew("o/r",0,"fix","fixture","","ready","resumed",json!({"h":"local","base":base,"br":"work","rs":true,"ap":false,"f":{"title":"Fixture","tests":[],"test_cmd":"true"}}),None,0.0);
        let a=std::sync::Arc::new(crate::app::App::new(db,dd.clone(),1,"apollo-office".into()));
        // Missing and malformed grants, plus an unusable preview base, must
        // all remain held. The fake GitHub executable detects publication.
        for grant in [json!(false),Value::Null,json!("true"),json!(1)] {
            let mut job=a.db.jg(id).unwrap();
            job.d["ap"]=grant;
            job.d["base"]=json!("nonexistent-preview-base");
            a.db.jset(id,&[("st",json!("ready"))]);
            let result=tokio::time::timeout(std::time::Duration::from_secs(2),submit(&a,&mut job)).await;
            assert!(!marker.exists(),"resuming a job must not invoke GitHub without owner approval");
            assert!(matches!(result,Ok(Err(X::Back(ref reason))) if reason.is_empty()));
            assert_eq!(a.db.jg(id).unwrap().st,"approve");
        }
        std::env::remove_var("APOLLO_OFFICE_GH");
        std::fs::remove_dir_all(dd).unwrap();
    }

}
