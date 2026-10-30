use crate::ai::{ask, by_id, p as P, wrap, Ask};
use crate::app::{sl, Ax, X, R};
use crate::db::now;
use crate::net::need;
use crate::pa;
use crate::pipe::{bl, qn, rp};
use crate::sh::{apip, gh, ghj};
use regex::Regex;
use serde_json::{json, Value};
use std::future::Future;
use std::pin::Pin;


fn guard1<'a>(a: &'a Ax, b: Vec<(String, String)>, job: Option<i64>, d: u32) -> Pin<Box<dyn Future<Output = R<Value>> + Send + 'a>> {
    Box::pin(async move {
        let ids: Vec<String> = b.iter().map(|x| x.0.clone()).collect();
        let p = format!("{}\n\nUse exactly these ids as JSON keys, in this order: {}", b.iter().map(|(i, t)| wrap(i, &crate::sh::head(t, 3500))).collect::<Vec<_>>().join("\n\n"), ids.join(", "));
        let mut o = Ask::new("guard", a.md("guard"), P("guard"), p);
        o.job = job;
        o.ef = Some("low");
        let (txt, js) = ask(a, o).await?;
        if let Some(js) = by_id(&js, &ids) {
            if ids.iter().all(|i| js[i]["inj"].is_boolean()) {
                return Ok(Value::Object(ids.iter().map(|i| (i.clone(), json!({"inj": js[i]["inj"], "why": js[i]["why"].as_str().unwrap_or("")}))).collect()));
            }
        }
        if b.len() > 1 && d < 3 {
            let h = b.len() / 2;
            let mut l = guard1(a, b[..h].to_vec(), job, d + 1).await?;
            let r = guard1(a, b[h..].to_vec(), job, d + 1).await?;
            for (k, v) in r.as_object().cloned().unwrap_or_default() {
                l[k] = v;
            }
            return Ok(l);
        }
        a.say("guard", &format!("unreadable answer for {}: {}", ids.join(", "), crate::sh::head(&txt, 160)), job);
        Err(X::E("Guard gave no readable verdict".into()))
    })
}

pub async fn guard(a: &Ax, xs: Vec<(String, String)>, from: &str, job: Option<i64>) -> R<Value> {
    let mut r = json!({});
    for c in xs.chunks(10) {
        a.flow(from, "guard", "check");
        let v = guard1(a, c.to_vec(), job, 0).await?;
        for (k, x) in v.as_object().cloned().unwrap_or_default() {
            r[k] = x;
        }
    }
    a.st("guard", "idle", None, "");
    Ok(r)
}

pub fn errm(e: &X) -> String {
    match e {
        X::Lim(m) => format!("usage limit: {m}"),
        X::Net(m) => format!("network: {m}"),
        o => format!("error: {}", crate::sh::head(&o.to_string(), 200)),
    }
}

async fn scout1(a: &Ax) -> R<()> {
    need(a, "scout", &["gh"]).await?;
    a.st("scout", "work", None, "");
    let me = crate::gh::login(a).await;
    let no = Regex::new(r"(?i)\b(enhancement|feature|question|wontfix|won't fix|duplicate|invalid|discussion|idea|roadmap|docs?|documentation)\b").unwrap();
    let ft = Regex::new(r"(?i)^\s*(\[?feat(ure)?\]?|\[?request\]?|idea|proposal)[:\] ]").unwrap();
    let rs = a.db.all("select full from rp where on_=1 and iss=1 and ci<>''", pa![]);
    for r in rs {
        let r = r["full"].as_str().unwrap_or("").to_string();
        let b = bl(a, &r);
        if b == 0 || qn(a, &r, "'vet','ready'") >= 4 * b {
            continue;
        }
        a.held("scout").await;
        a.st("scout", "work", None, "");
        let is = ghj(&["issue", "list", "-R", &r, "--state", "open", "--limit", "200", "--json", "number,title,body,author,updatedAt,labels,assignees,url"], 120).await.map_err(X::E)?;
        let mut nw = vec![];
        for i in is.as_array().cloned().unwrap_or_default() {
            let n = i["number"].as_i64().unwrap_or(0);
            let up = i["updatedAt"].as_str().unwrap_or("").to_string();
            if i["assignees"].as_array().map(|x| x.iter().any(|y| y["login"].as_str() != Some(&me))).unwrap_or(false) {
                continue;
            }
            if a.db.n("select count(*) from jobs where repo=? and num=?", pa![r.clone(), n]) > 0 {
                continue;
            }
            if a.db.one("select upd from seen where repo=? and num=?", pa![r.clone(), n]).map(|x| x["upd"].as_str() == Some(&up)).unwrap_or(false) {
                continue;
            }
            if i["labels"].as_array().map(|l| l.iter().any(|x| no.is_match(x["name"].as_str().unwrap_or("")))).unwrap_or(false) || ft.is_match(i["title"].as_str().unwrap_or("")) {
                a.db.run("insert into seen(repo,num,upd) values(?,?,?) on conflict do update set upd=excluded.upd", pa![r.clone(), n, up]);
                continue;
            }
            nw.push(i);
        }
        if nw.is_empty() {
            continue;
        }
        a.say("scout", &format!("{r}: {} new issues", nw.len()), None);
        for b in nw.chunks(15) {
            let ids: Vec<String> = b.iter().map(|i| format!("{r}#{}", i["number"])).collect();
            let p = format!("{}\n\nUse exactly these ids as JSON keys, in this order: {}", b.iter().map(|i| wrap(&format!("{r}#{}", i["number"]), &format!("#{} {}\n\n{}", i["number"], i["title"].as_str().unwrap_or(""), crate::sh::head(i["body"].as_str().unwrap_or(""), 2500)))).collect::<Vec<_>>().join("\n\n"), ids.join(", "));
            let mut o = Ask::new("scout", a.md("scout"), P("scout"), p);
            o.ef = Some("low");
            let (_, j0) = ask(a, o).await?;
            let Some(js) = by_id(&j0, &ids) else { return Err(X::E("Scout gave no readable verdict".into())) };
            let mut pk = vec![];
            for i in b {
                let id = format!("{r}#{}", i["number"]);
                if js[&id]["pick"].as_bool().unwrap_or(false) {
                    pk.push(i.clone());
                } else {
                    a.db.run("insert into seen(repo,num,upd) values(?,?,?) on conflict do update set upd=excluded.upd", pa![r.clone(), i["number"].as_i64().unwrap_or(0), i["updatedAt"].as_str().unwrap_or("").to_string()]);
                }
            }
            if pk.is_empty() {
                continue;
            }
            let g = guard(a, pk.iter().map(|i| (format!("{r}#{}", i["number"]), format!("#{} {}\n\n{}", i["number"], i["title"].as_str().unwrap_or(""), crate::sh::head(i["body"].as_str().unwrap_or(""), 5000)))).collect(), "scout", None).await?;
            for i in pk {
                let n = i["number"].as_i64().unwrap_or(0);
                let id = format!("{r}#{n}");
                let ti = i["title"].as_str().unwrap_or("").to_string();
                let u = i["url"].as_str().map(String::from).unwrap_or(format!("https://github.com/{r}/issues/{n}"));
                if g[&id]["inj"].as_bool().unwrap_or(false) {
                    a.db.jnew(&r, n, "fix", &ti, &u, "drop", &format!("Guard: {}", g[&id]["why"].as_str().unwrap_or("")), json!({}), None, 0.0);
                    a.say("guard", &format!("{id} blocked: {}", g[&id]["why"].as_str().unwrap_or("")), None);
                    continue;
                }
                let v = &js[&id];
                a.db.jnew(&r, n, "fix", &ti, &u, "vet", v["why"].as_str().unwrap_or(""), json!({"cx": if v["cx"] == "complex" { "complex" } else { "simple" }}), None, 0.0);
                a.flow("scout", "vet", &id);
                a.say("scout", &format!("{id} → Vet: {}", v["why"].as_str().unwrap_or("")), None);
            }
        }
    }
    a.st("scout", "idle", None, "");
    Ok(())
}

pub async fn scout(a: Ax) {
    loop {
        a.held("scout").await;
        if let Err(x) = scout1(&a).await {
            a.st("scout", "idle", None, "err");
            a.say("scout", &errm(&x), None);
        }
        tokio::select! {
            _ = sl(300_000) => {}
            _ = a.sw.notified() => {}
        }
    }
}

async fn thread(r: &str, n: i64) -> R<Value> {
    ghj(&["issue", "view", &n.to_string(), "-R", r, "--json", "title,body,author,state,comments,assignees,labels"], 60).await.map_err(X::E)
}

async fn vet1(a: &Ax, id: i64) -> R<()> {
    let Some(j) = a.db.jg(id) else { return Ok(()) };
    let rl = rp(a, &j.repo)["rules"].as_str().unwrap_or("").trim().to_string();
    let rl = if rl.is_empty() { String::new() } else { format!("\n\nOwner's rules for this repository (trusted):\n{rl}") };
    a.st("vet", "work", Some(id), "");
    if j.own() {
        if j.ext() {
            let g = guard(a, vec![("r".into(), format!("from: {}\n{}\n\n{}", j.d["ext"]["src"].as_str().unwrap_or(""), j.s("title"), j.s("body")))], "vet", Some(id)).await?;
            if g["r"]["inj"].as_bool().unwrap_or(false) {
                a.db.jset(id, &[("st", json!("drop")), ("why", json!(format!("Guard: {}", g["r"]["why"].as_str().unwrap_or(""))))]);
                a.say("guard", &format!("{} blocked: {}", j.tag(), g["r"]["why"].as_str().unwrap_or("")), Some(id));
                return Ok(());
            }
        }
        let q = if j.ext() {
            format!("This is not a GitHub issue but a bug report sent to us directly from {}. Nobody has proved it yet. Judge only: is it plausibly a real bug in this repository's code, a focused fix (complex is fine, no rewrite or feature), worth a PR, and testable headless?", j.d["ext"]["src"].as_str().unwrap_or("an external tool"))
        } else {
            "This is not a GitHub issue but a bug our own testing found and proved with a failing test. Judge only: is it a real bug, a focused fix (complex is fine, no rewrite or feature), worth a PR, and testable headless?".to_string()
        };
        let mut o = Ask::new("vet", a.md("vet"), P("vet"), format!("Repository {}. {q}\n\n{}{rl}", j.repo, wrap("issue", &format!("{}\n\n{}", j.s("title"), j.s("body")))));
        o.job = Some(id);
        o.ef = Some("low");
        let (_, js) = ask(a, o).await?;
        if !js["ok"].as_bool().unwrap_or(false) {
            a.db.jset(id, &[("st", json!("drop")), ("why", json!(format!("Vet: {}", js["why"].as_str().unwrap_or("no answer"))))]);
            return Ok(());
        }
        let (h, ot) = crate::gh::twins(a, &j.repo, &j.wh()).await.map_err(X::E)?;
        let of: Vec<Value> = a.db.all("select id, d from jobs where repo=? and num=0 and kind='fix' and id<>? and st not in ('drop','done') and (st<>'vet' or id<?) order by id desc limit 50", pa![j.repo.clone(), id, id]);
        if !h.is_empty() || !ot.is_empty() || !of.is_empty() {
            let mut ps = vec![wrap("bug", &format!("{}\n\n{}", j.s("title"), j.s("body")))];
            for x in &h {
                ps.push(wrap(&format!("pr{}", x["number"]), &format!("PR #{}: {}\nFiles: {}\n\n{}", x["number"], x["title"].as_str().unwrap_or(""), x["files"].as_array().map(|f| f.iter().filter_map(|y| y["path"].as_str()).collect::<Vec<_>>().join(", ")).unwrap_or_default(), crate::sh::head(x["body"].as_str().unwrap_or(""), 3000))));
            }
            ps.push(wrap("other", &format!("Other open PRs (title and start of body):\n\n{}", ot.iter().map(|x| format!("#{} {}\n{}", x["number"], x["title"].as_str().unwrap_or(""), crate::sh::head(&x["body"].as_str().unwrap_or("").split_whitespace().collect::<Vec<_>>().join(" "), 400))).collect::<Vec<_>>().join("\n\n"))));
            if !of.is_empty() {
                ps.push(wrap("ours", &format!("Our own earlier finds, fix in progress, no PR yet:\n\n{}", of.iter().map(|x| format!("find {}: {}\nwhere: {}\n{}", x["id"], x["d"]["title"].as_str().unwrap_or(""), x["d"]["hunt"]["where"].as_str().or(x["d"]["ext"]["where"].as_str()).unwrap_or(""), crate::sh::head(&x["d"]["body"].as_str().unwrap_or("").split_whitespace().collect::<Vec<_>>().join(" "), 600))).collect::<Vec<_>>().join("\n\n"))));
            }
            let mut o = Ask::new("vet", a.md("vet"), P("twin"), crate::sh::head(&ps.join("\n\n"), 250_000));
            o.job = Some(id);
            o.ef = Some("low");
            let (_, dj) = ask(a, o).await?;
            if dj["dup"].as_bool().unwrap_or(false) {
                let w = if dj["find"].as_i64().unwrap_or(0) > 0 { format!("same bug as office find #{} ({})", dj["find"], dj["why"].as_str().unwrap_or("")) } else { format!("PR already exists: {}#{} ({})", j.repo, dj["pr"], dj["why"].as_str().unwrap_or("")) };
                a.db.jset(id, &[("st", json!("drop")), ("why", json!(w))]);
                return Ok(());
            }
        }
        let mut d = j.d.clone();
        d["hint"] = json!(js["hint"].as_str().unwrap_or(""));
        d["cx"] = json!(if js["cx"] == "complex" { "complex" } else { "simple" });
        let k = if j.ext() { "report" } else { "Hunter find" };
        a.db.jset(id, &[("st", json!("ready")), ("why", json!(format!("{k}: {}", js["why"].as_str().unwrap_or("")))), ("d", d), ("prio", json!(-0.5))]);
        a.flow("vet", "repro", &j.repo);
        a.say("vet", &format!("{} {} approved: {}", j.repo, k.to_lowercase(), j.s("title")), Some(id));
        return Ok(());
    }
    a.say("vet", &format!("checking {}", j.tag()), Some(id));
    let i = thread(&j.repo, j.num).await?;
    if i["state"] != "OPEN" {
        a.db.jset(id, &[("st", json!("drop")), ("why", json!("issue closed"))]);
        return Ok(());
    }
    let me = crate::gh::login(a).await;
    let oa: Vec<String> = i["assignees"].as_array().cloned().unwrap_or_default().iter().filter_map(|x| x["login"].as_str().map(String::from)).filter(|x| *x != me).collect();
    if !oa.is_empty() {
        a.db.jset(id, &[("st", json!("drop")), ("why", json!(format!("assigned to {}", oa.join(", "))))]);
        return Ok(());
    }
    let lv = crate::gh::live(crate::gh::refs(&j.repo, j.num).await.map_err(X::E)?);
    if !lv.is_empty() {
        a.db.jset(id, &[("st", json!("drop")), ("why", json!(format!("PR already exists: {}", lv.iter().map(|p| format!("{}#{} ({})", p.rp, p.n, p.st)).collect::<Vec<_>>().join(", "))))]);
        return Ok(());
    }
    let cs: Vec<Value> = i["comments"].as_array().cloned().unwrap_or_default();
    let cs: Vec<Value> = cs[cs.len().saturating_sub(25)..].to_vec();
    let mut gs: Vec<(String, String)> = cs.iter().enumerate().map(|(k, c)| (format!("c{k}"), c["body"].as_str().unwrap_or("").to_string())).collect();
    if j.d["gi"].as_bool().unwrap_or(false) {
        gs.push(("issue".into(), format!("#{} {}\n\n{}", j.num, i["title"].as_str().unwrap_or(""), crate::sh::head(i["body"].as_str().unwrap_or(""), 5000))));
    }
    if !gs.is_empty() {
        let g = guard(a, gs, "vet", Some(id)).await?;
        if let Some((k, v)) = g.as_object().and_then(|o| o.iter().find(|(_, v)| v["inj"].as_bool().unwrap_or(false))) {
            a.db.jset(id, &[("st", json!("drop")), ("why", json!(format!("Guard: {} {}", if k == "issue" { "issue" } else { "comment" }, v["why"].as_str().unwrap_or(""))))]);
            return Ok(());
        }
    }
    let mut ps = vec![wrap("issue", &format!("#{} {}\nby {}\nlabels: {}\n\n{}", j.num, i["title"].as_str().unwrap_or(""), i["author"]["login"].as_str().unwrap_or(""), i["labels"].as_array().map(|l| l.iter().filter_map(|x| x["name"].as_str()).collect::<Vec<_>>().join(", ")).unwrap_or_default(), crate::sh::head(i["body"].as_str().unwrap_or(""), 8000)))];
    for (k, c) in cs.iter().enumerate() {
        ps.push(wrap(&format!("c{k}"), &format!("comment by {} ({})\n\n{}", c["author"]["login"].as_str().unwrap_or(""), c["authorAssociation"].as_str().unwrap_or(""), crate::sh::head(c["body"].as_str().unwrap_or(""), 3000))));
    }
    let mut o = Ask::new("vet", a.md("vet"), P("vet"), format!("Repository {}.\n\n{}{rl}", j.repo, ps.join("\n\n")));
    o.job = Some(id);
    o.ef = Some("low");
    let (_, js) = ask(a, o).await?;
    if !js["ok"].as_bool().unwrap_or(false) {
        a.db.jset(id, &[("st", json!("drop")), ("why", json!(format!("Vet: {}", js["why"].as_str().unwrap_or("no answer"))))]);
        return Ok(());
    }
    let mut d = j.d.clone();
    d["va"] = json!(now());
    d["cx"] = json!(if js["cx"] == "complex" || j.s("cx") == "complex" { "complex" } else { "simple" });
    d["hint"] = json!(js["hint"].as_str().unwrap_or(""));
    d["body"] = json!(crate::sh::head(i["body"].as_str().unwrap_or(""), 8000));
    d["title"] = json!(i["title"].as_str().unwrap_or(""));
    a.db.jset(id, &[("st", json!("ready")), ("why", json!(js["why"].as_str().unwrap_or(""))), ("d", d), ("title", json!(i["title"].as_str().unwrap_or(&j.title)))]);
    a.flow("vet", "repro", &j.tag());
    a.say("vet", &format!("{} approved: {}", j.tag(), js["why"].as_str().unwrap_or("")), Some(id));
    Ok(())
}

async fn vetl(a: Ax) {
    loop {
        a.held("vet").await;
        let mut n = None;
        let mut fu = std::collections::HashMap::new();
        for x in a.db.all("select id, repo from jobs where st='vet' order by json_extract(d,'$.vt') is not null, t1", pa![]) {
            let id = x["id"].as_i64().unwrap_or(0);
            let r = x["repo"].as_str().unwrap_or("").to_string();
            if *fu.entry(r.clone()).or_insert_with(|| qn(&a, &r, "'ready'") >= 2 * bl(&a, &r)) {
                continue;
            }
            let mut t = a.vtk.lock().unwrap();
            if t.insert(id) {
                n = Some(id);
                break;
            }
        }
        a.lv.lock().unwrap().o.vn = a.vtk.lock().unwrap().len();
        let Some(id) = n else {
            if a.vtk.lock().unwrap().is_empty() {
                a.st("vet", "idle", None, "");
            }
            sl(30_000).await;
            continue;
        };
        let r = async {
            need(&a, "vet", &["gh"]).await?;
            vet1(&a, id).await
        }
        .await;
        if let Some(j) = a.db.jg(id) {
            if j.st == "drop" {
                a.say("vet", &format!("{} dropped: {}", j.tag(), j.why), Some(id));
            }
        }
        if let Err(x) = r {
            a.say("vet", &errm(&x), Some(id));
            if !matches!(x, X::Lim(_) | X::Net(_)) {
                if let Some(j) = a.db.jg(id) {
                    let vt = j.d["vt"].as_i64().unwrap_or(0) + 1;
                    if vt >= 3 {
                        a.db.jset(id, &[("st", json!("drop")), ("why", json!(format!("Vet error: {}", crate::sh::head(&x.to_string(), 150))))]);
                    } else {
                        let mut d = j.d.clone();
                        d["vt"] = json!(vt);
                        a.db.jset(id, &[("d", d)]);
                    }
                }
            }
            sl(30_000).await;
        }
        a.vtk.lock().unwrap().remove(&id);
        a.lv.lock().unwrap().o.vn = a.vtk.lock().unwrap().len();
    }
}

pub async fn vet(a: Ax) {
    for _ in 0..2 {
        tokio::spawn(vetl(a.clone()));
        sl(3000).await;
    }
}

const MA: &[&str] = &["OWNER", "MEMBER", "COLLABORATOR"];

pub fn pending(cs: Vec<Value>, last: &str) -> Vec<Value> {
    let Ok(l) = chrono::DateTime::parse_from_rfc3339(last) else { return cs };
    cs.into_iter().filter(|c| c["at"].as_str().and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok()).map(|t| t > l).unwrap_or(false)).collect()
}

async fn comments(r: &str, n: i64, me: &str) -> R<Vec<Value>> {
    let bot = Regex::new(r"(?i)\[bot\]$|^github-actions$|^dependabot").unwrap();
    let (u1, u2, u3) = (format!("repos/{r}/issues/{n}/comments?per_page=100"), format!("repos/{r}/pulls/{n}/reviews?per_page=100"), format!("repos/{r}/pulls/{n}/comments?per_page=100"));
    let (a, b, c) = tokio::join!(apip(&u1), apip(&u2), apip(&u3));
    let mut o = vec![];
    for x in a.map_err(X::E)? {
        o.push(json!({"id": format!("i{}", x["id"]), "by": x["user"]["login"], "as": x["author_association"], "t": x["body"].as_str().unwrap_or(""), "k": "comment", "at": x["created_at"]}));
    }
    for x in b.map_err(X::E)? {
        if x["body"].as_str().map(|s| !s.is_empty()).unwrap_or(false) || x["state"] == "CHANGES_REQUESTED" {
            o.push(json!({"id": format!("r{}", x["id"]), "by": x["user"]["login"], "as": x["author_association"], "t": format!("[review: {}] {}", x["state"].as_str().unwrap_or(""), x["body"].as_str().unwrap_or("")), "k": "review", "at": x["submitted_at"]}));
        }
    }
    for x in c.map_err(X::E)? {
        let dh = x["diff_hunk"].as_str().map(|d| format!("```diff\n{}\n```\n", crate::sh::last(d, 800))).unwrap_or_default();
        o.push(json!({"id": format!("c{}", x["id"]), "by": x["user"]["login"], "as": x["author_association"], "t": format!("[on {}:{}]\n{dh}{}", x["path"].as_str().unwrap_or(""), x["line"].as_i64().or(x["original_line"].as_i64()).map(|l| l.to_string()).unwrap_or("?".into()), x["body"].as_str().unwrap_or("")), "k": "line", "at": x["created_at"]}));
    }
    Ok(o.into_iter().filter(|x| x["by"].as_str().map(|b| b != me && !bot.is_match(b)).unwrap_or(false)).collect())
}

async fn late(a: &Ax, r: &str, n: i64, me: &str, v: &Value) -> R<()> {
    let tag = format!("{r}#{n}");
    let mut nw: Vec<Value> = vec![];
    for c in comments(r, n, me).await? {
        let id = c["id"].as_str().unwrap_or("").to_string();
        if a.db.n("select count(*) from cm where id=? or id=?", pa![format!("{r}:{id}"), id.clone()]) > 0 {
            continue;
        }
        a.db.run("insert or ignore into cm(id,t) values(?,?)", pa![format!("{r}:{id}"), now()]);
        if MA.contains(&c["as"].as_str().unwrap_or("")) {
            nw.push(c);
        }
    }
    if nw.is_empty() {
        return Ok(());
    }
    let g = guard(a, nw.iter().map(|c| (c["id"].as_str().unwrap_or("").to_string(), c["t"].as_str().unwrap_or("").to_string())).collect(), "watcher", None).await?;
    let ok: Vec<&Value> = nw.iter().filter(|c| !g[c["id"].as_str().unwrap_or("")]["inj"].as_bool().unwrap_or(false)).collect();
    if ok.is_empty() {
        return Ok(());
    }
    let cs = ok.iter().map(|c| wrap(c["id"].as_str().unwrap_or(""), &format!("{} by {} ({})\n\n{}", c["k"].as_str().unwrap_or(""), c["by"].as_str().unwrap_or(""), c["as"].as_str().unwrap_or(""), crate::sh::head(c["t"].as_str().unwrap_or(""), 4000)))).collect::<Vec<_>>().join("\n\n");
    let pr = format!("PR {tag}: {}\n\nThis PR is already merged. Set act only if a maintainer asks for a follow-up change or reports a problem the merged change caused; the change will become a new pull request from the default branch. A thank-you or merge notice is not a request.\n\n{cs}", v["title"].as_str().unwrap_or(""));
    let mut o = Ask::new("watcher", a.md("watcher"), P("watcher"), pr);
    o.ef = Some("low");
    let (_, js) = ask(a, o).await?;
    let by = ok.iter().filter_map(|c| c["by"].as_str()).collect::<Vec<_>>().join(", ");
    if !js["act"].as_bool().unwrap_or(false) {
        return Ok(());
    }
    let ch = js["change"].as_str().unwrap_or("").to_string();
    let ti = format!("Follow-up to #{n}: {}", v["title"].as_str().unwrap_or(""));
    let body = format!("{ch}\n\nRequested after #{n} was merged ({}). Open a new pull request from the default branch that references #{n}.\n\nMaintainer comment:\n{}", v["url"].as_str().unwrap_or(""), crate::sh::head(&ok.iter().map(|c| format!("{}: {}", c["by"].as_str().unwrap_or(""), c["t"].as_str().unwrap_or(""))).collect::<Vec<_>>().join("\n\n"), 6000));
    a.db.jnew(r, 0, "fix", &ti, v["url"].as_str().unwrap_or(""), "vet", &format!("follow-up requested by {by} after merge"), json!({"title": ti, "body": body, "after": n}), None, -1.0);
    a.say("watcher", &format!("{tag}: {by} asked for a follow-up after merge, sent to Vet"), None);
    a.note("Follow-up after merge", &format!("{tag} ({by}): {ch}\n\nDraft reply:\n{}\n{}", js["draft"].as_str().unwrap_or("-"), v["url"].as_str().unwrap_or("")), 4);
    Ok(())
}

async fn watch1(a: &Ax) -> R<()> {
    need(a, "watcher", &["gh"]).await?;
    a.st("watcher", "work", None, "");
    let me = crate::gh::login(a).await;
    for p in a.db.all("select * from prs where st='open' or (st='merged' and merged>strftime('%Y-%m-%dT%H:%M:%SZ','now','-2 days'))", pa![]) {
        a.held("watcher").await;
        let r = p["repo"].as_str().unwrap_or("").to_string();
        let n = p["num"].as_i64().unwrap_or(0);
        if p["st"] == "merged" {
            let wk = format!("wm:{r}#{n}");
            if a.db.kg(&wk).as_i64().map(|t| now() - t < 1_800_000).unwrap_or(false) {
                continue;
            }
            a.db.ks(&wk, &json!(now()));
            let v = ghj(&["pr", "view", &n.to_string(), "-R", &r, "--json", "updatedAt,title,url"], 60).await.map_err(X::E)?;
            let up = v["updatedAt"].as_str().unwrap_or("").to_string();
            if p["upd"].as_str() != Some(up.as_str()) {
                a.db.run("update prs set upd=? where repo=? and num=?", pa![up, r.clone(), n]);
                late(a, &r, n, &me, &v).await?;
            }
            continue;
        }
        let v = ghj(&["pr", "view", &n.to_string(), "-R", &r, "--json", "state,mergedAt,updatedAt,title,url,mergeable,headRefName,headRepositoryOwner,headRepository,baseRefName"], 60).await.map_err(X::E)?;
        let up = v["updatedAt"].as_str().unwrap_or("").to_string();
        let st = if v["mergedAt"].is_string() { "merged".to_string() } else { v["state"].as_str().unwrap_or("OPEN").to_lowercase() };
        a.db.run("update prs set st=?, title=?, upd=?, merged=? where repo=? and num=?", pa![st.clone(), v["title"].as_str().unwrap_or("").to_string(), up.clone(), v["mergedAt"].as_str().map(String::from), r.clone(), n]);
        let tag = format!("{r}#{n}");
        if st == "merged" {
            a.note("Merged", &format!("{tag} {}\n{}", v["title"].as_str().unwrap_or(""), v["url"].as_str().unwrap_or("")), 3);
            a.flow("watcher", "submit", "merged");
            a.say("watcher", &format!("{tag} merged"), None);
            a.db.ks("lm", &json!({"repo": r, "num": n, "title": v["title"], "url": v["url"], "t": now()}));
            a.db.ks(&format!("wm:{tag}"), &json!(now()));
            late(a, &r, n, &me, &v).await?;
            continue;
        }
        if st == "closed" {
            a.note("Closed without merge", &format!("{tag} {}\n{}", v["title"].as_str().unwrap_or(""), v["url"].as_str().unwrap_or("")), 4);
            a.say("watcher", &format!("{tag} closed without merge"), None);
            continue;
        }
        if p["upd"].as_str() == Some(up.as_str()) && p["d"]["seen"].as_bool().unwrap_or(false) {
            continue;
        }
        let first = !p["d"]["seen"].as_bool().unwrap_or(false);
        let cs = comments(&r, n, &me).await?;
        let mut nw: Vec<Value> = cs.into_iter().filter(|c| a.db.n("select count(*) from cm where id=? or id=?", pa![format!("{r}:{}", c["id"].as_str().unwrap_or("")), c["id"].as_str().unwrap_or("").to_string()]) == 0).collect();
        for c in &nw {
            a.db.run("insert or ignore into cm(id,t) values(?,?)", pa![format!("{r}:{}", c["id"].as_str().unwrap_or("")), now()]);
        }
        if first && !nw.is_empty() {
            let lc = ghj(&["pr", "view", &n.to_string(), "-R", &r, "--json", "commits", "--jq", ".commits[-1].committedDate"], 60).await.ok().and_then(|x| x.as_str().map(String::from)).unwrap_or_default();
            nw = pending(nw, &lc);
        }
        if first {
            let mut d = p["d"].clone();
            d["seen"] = json!(true);
            a.db.run("update prs set d=? where repo=? and num=?", pa![d.to_string(), r.clone(), n]);
        }
        let hd = format!("{}/{}", v["headRepositoryOwner"]["login"].as_str().unwrap_or(""), v["headRepository"]["name"].as_str().unwrap_or(""));
        let hrn = v["headRefName"].as_str().unwrap_or("").to_string();
        if !nw.is_empty() {
            a.say("watcher", &format!("{tag}: {} new comment(s)", nw.len()), None);
            let g = guard(a, nw.iter().map(|c| (c["id"].as_str().unwrap_or("").to_string(), c["t"].as_str().unwrap_or("").to_string())).collect(), "watcher", None).await?;
            for c in nw.iter().filter(|c| g[c["id"].as_str().unwrap_or("")]["inj"].as_bool().unwrap_or(false)) {
                a.note("Guard: suspicious comment", &format!("{tag} by {}: {}\n{}", c["by"].as_str().unwrap_or(""), g[c["id"].as_str().unwrap_or("")]["why"].as_str().unwrap_or(""), v["url"].as_str().unwrap_or("")), 4);
            }
            let okc: Vec<&Value> = nw.iter().filter(|c| !g[c["id"].as_str().unwrap_or("")]["inj"].as_bool().unwrap_or(false)).collect();
            if !okc.is_empty() {
                let mc: Vec<&Value> = okc.iter().filter(|c| MA.contains(&c["as"].as_str().unwrap_or(""))).cloned().collect();
                let ma = !mc.is_empty();
                let src: &Vec<&Value> = if ma { &mc } else { &okc };
                let pv = ghj(&["pr", "view", &n.to_string(), "-R", &r, "--json", "body,files"], 60).await.unwrap_or(Value::Null);
                let fl = pv["files"].as_array().map(|x| x.iter().filter_map(|f| f["path"].as_str()).collect::<Vec<_>>().join("\n")).unwrap_or_default();
                let pr = format!("PR {tag}: {}\n\n{}\n\n{}\n\n{}", v["title"].as_str().unwrap_or(""), wrap("description", &crate::sh::head(pv["body"].as_str().unwrap_or(""), 4000)), wrap("files", &crate::sh::head(&fl, 2000)), src.iter().map(|c| wrap(c["id"].as_str().unwrap_or(""), &format!("{} by {} ({})\n\n{}", c["k"].as_str().unwrap_or(""), c["by"].as_str().unwrap_or(""), c["as"].as_str().unwrap_or(""), crate::sh::head(c["t"].as_str().unwrap_or(""), 4000)))).collect::<Vec<_>>().join("\n\n"));
                let mut o = Ask::new("watcher", a.md("watcher"), P("watcher"), pr);
                o.ef = Some("low");
                let (_, js) = ask(a, o).await?;
                let by = okc.iter().filter_map(|c| c["by"].as_str()).collect::<Vec<_>>().join(", ");
                let act = js["act"].as_bool().unwrap_or(false);
                let rp = js["reply"].as_str().unwrap_or("").trim().to_string();
                let wk = format!("wr:{tag}");
                if ma && !rp.is_empty() && a.db.kg(&wk).as_i64().map(|t| now() - t > 86_400_000).unwrap_or(true) {
                    match gh(&["pr", "comment", &n.to_string(), "-R", &r, "--body", &crate::sh::head(&rp, 1500)], 60).await {
                        Ok(_) => {
                            a.db.ks(&wk, &json!(now()));
                            a.say("watcher", &format!("{tag}: answered {by}"), None);
                        }
                        Err(e) => a.say("watcher", &format!("{tag}: reply failed: {e}"), None),
                    }
                }
                if act && ma && a.db.n("select count(*) from jobs where repo=? and pr=? and kind='review' and st not in ('done','drop')", pa![r.clone(), n]) == 0 {
                    let ch = js["change"].as_str().unwrap_or("").to_string();
                    a.db.jnew(&r, n, "review", v["title"].as_str().unwrap_or(""), v["url"].as_str().unwrap_or(""), "ready", &ch, json!({"change": ch, "comment": crate::sh::head(&mc.iter().map(|c| format!("{}: {}", c["by"].as_str().unwrap_or(""), c["t"].as_str().unwrap_or(""))).collect::<Vec<_>>().join("\n\n"), 6000), "branch": hrn, "head": hd, "test_cmd": p["d"]["test_cmd"]}), Some(n), -1.0);
                    a.flow("watcher", "fixer", "review");
                    a.say("watcher", &format!("{tag}: change requested by {by}, sent to Fixer"), None);
                    a.note("Change requested", &format!("{tag} ({by}): {ch}\n\nDraft reply:\n{}\n{}", js["draft"].as_str().unwrap_or("-"), v["url"].as_str().unwrap_or("")), 4);
                } else {
                    a.say("watcher", &format!("{tag}: {by} commented{}", if act && !ma { " (not a maintainer, not applied)" } else { "" }), None);
                    a.note(&format!("Comment on {tag}"), &format!("{by}: {}\n\nDraft reply:\n{}\n{}", crate::sh::head(okc.last().and_then(|c| c["t"].as_str()).unwrap_or(""), 600), js["draft"].as_str().unwrap_or("-"), v["url"].as_str().unwrap_or("")), 3);
                }
            }
        }
        if v["mergeable"] == "CONFLICTING" && v["headRepositoryOwner"]["login"].as_str() == Some(&me) && a.db.n("select count(*) from jobs where repo=? and pr=? and kind='rebase' and (st not in ('done','drop') or t1>?)", pa![r.clone(), n, now() - 86_400_000]) == 0 {
            a.db.jnew(&r, n, "rebase", v["title"].as_str().unwrap_or(""), v["url"].as_str().unwrap_or(""), "ready", &format!("merge conflict with {}", v["baseRefName"].as_str().unwrap_or("")), json!({"branch": hrn, "head": hd, "test_cmd": p["d"]["test_cmd"]}), Some(n), -1.0);
            a.flow("watcher", "fixer", "rebase");
            a.say("watcher", &format!("{tag} has a merge conflict, sent to rebase"), None);
        }
    }
    a.st("watcher", "idle", None, "");
    Ok(())
}

pub async fn watch(a: Ax) {
    loop {
        a.held("watcher").await;
        if let Err(x) = watch1(&a).await {
            a.st("watcher", "idle", None, "sad");
            a.say("watcher", &errm(&x), None);
        }
        sl(600_000).await;
    }
}

#[cfg(test)]
mod t {
    use super::*;

    #[test]
    fn pend() {
        let c = |at: &str| json!({"id": at, "at": at});
        let v = pending(vec![c("2026-10-18T10:00:00Z"), c("2026-10-19T10:00:00Z")], "2026-10-18T12:00:00Z");
        assert_eq!(v.len(), 1);
        assert_eq!(v[0]["at"], "2026-10-19T10:00:00Z");
        assert_eq!(pending(vec![c("2026-10-18T10:00:00Z")], "").len(), 1);
    }
}
