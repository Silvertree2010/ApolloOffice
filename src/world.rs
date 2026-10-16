use crate::cfg::Ax;
use crate::db::Db;
use crate::pa;
use rand::seq::SliceRandom;
use rand::Rng;
use serde_json::{json, Value};

pub const MW: i64 = 20;
pub const MH: i64 = 12;
pub const KINDS: &[&str] = &["office", "lounge", "server", "accounting"];
pub const COLS: &[&str] = &["#d97757", "#3fb6a8", "#9c7ae0", "#5c7fd6", "#d0649f", "#62b86f", "#c4614d", "#4f9fc4", "#8a6fd1", "#a8574f"];
pub const NAMES: &[&str] = &["Mira", "Ole", "Juna", "Tamo", "Lio", "Fenja", "Rasmus", "Ivo", "Nele", "Bo", "Kaja", "Emil", "Sina", "Taro", "Ada", "Linus", "Maja", "Noah", "Elin", "Jaro", "Timo", "Ronja", "Levi", "Alma", "Finn", "Greta", "Mats", "Yara", "Ben"];
pub const ACCS: &[&str] = &["none", "tie", "cap", "antenna", "shield", "glasses", "magnifier", "pen", "headset", "hat", "beanie", "scarf", "badge", "apron", "shades", "headband", "tophat", "bun"];
pub const FS: &[(&str, i64, i64)] = &[
    ("desk", 2, 1), ("couch", 2, 1), ("plant", 1, 1), ("rack", 1, 2), ("gen", 2, 2), ("lift", 2, 2), ("tray", 1, 1), ("counter", 3, 1),
    ("board", 2, 1), ("coffee", 1, 1), ("plan", 2, 1), ("chart", 2, 1), ("table", 2, 2), ("stairs", 2, 2), ("screen", 2, 1),
];

pub fn size(k: &str) -> (i64, i64) {
    FS.iter().find(|x| x.0 == k).map(|x| (x.1, x.2)).unwrap_or((1, 1))
}

pub fn fname(k: &str) -> &'static str {
    match k {
        "basement" => "Basement",
        "lobby" => "Lobby",
        "office" => "Office",
        "lounge" => "Lounge",
        "server" => "Server room",
        "accounting" => "Accounting",
        _ => "Shell floor",
    }
}

pub fn grid(k: &str) -> Vec<Vec<i64>> {
    (0..MH).map(|y| (0..MW).map(|x| if k == "shell" { if y < 2 { 2 } else { 3 } } else if y < 2 || x == 0 || x == MW - 1 || y == MH - 1 { 2 } else { 1 }).collect()).collect()
}

pub fn tmpl(k: &str) -> Vec<Value> {
    let v = |k: &str, x: i64, y: i64| json!({"k": k, "x": x, "y": y});
    let mut f = vec![v("lift", 2, 0), v("stairs", 16, 0)];
    f.extend(match k {
        "basement" => vec![v("plant", 18, 10)],
        "lobby" => vec![v("counter", 8, 5), v("board", 12, 1), v("plant", 5, 2), v("plant", 11, 2), v("plant", 1, 10), v("plant", 18, 10), v("couch", 3, 8), v("table", 14, 7)],
        "office" => vec![v("desk", 3, 4), v("desk", 7, 4), v("desk", 11, 4), v("desk", 3, 8), v("desk", 7, 8), v("desk", 11, 8), v("tray", 16, 5), v("plan", 15, 9), v("plant", 18, 2), v("plant", 1, 10), v("coffee", 14, 2)],
        "lounge" => vec![v("couch", 4, 4), v("couch", 9, 4), v("couch", 4, 8), v("couch", 9, 8), v("table", 13, 6), v("coffee", 14, 2), v("plant", 18, 10), v("plant", 1, 10)],
        "server" => vec![v("plant", 18, 10), v("screen", 8, 1)],
        "accounting" => vec![v("chart", 6, 1), v("chart", 10, 1), v("desk", 6, 6), v("desk", 11, 6), v("screen", 13, 9), v("plant", 18, 2)],
        _ => vec![],
    });
    f.into_iter().enumerate().map(|(i, mut x)| {
        x["id"] = json!(i + 1);
        x
    }).collect()
}

pub fn lay(k: &str) -> Value {
    json!({"t": grid(k), "fu": tmpl(k), "nx": tmpl(k).len() + 1})
}

pub fn init(db: &Db) {
    sync_types(db);
    if db.n("select count(*) from fl", pa![]) > 0 {
        return;
    }
    let n = rand::thread_rng().gen_range(11..=18);
    for l in 0..n {
        let k = match l {
            0 => "basement",
            1 => "lobby",
            _ => "shell",
        };
        db.run("insert into fl(lvl,k,nm,lay) values(?,?,?,?)", pa![l, k.to_string(), fname(k).to_string(), lay(k).to_string()]);
    }
}

pub fn types() -> Vec<Value> {
    let t = |id: &str, nm: &str, g: &str, acc: &str, col: &str, md: &str, tools: &[&str], dsc: &str, role: &str, outf: &str| {
        json!({"id": id, "nm": nm, "grp": g, "acc": acc, "col": col, "md": md, "tools": tools, "dsc": dsc, "role": role, "outf": outf})
    };
    vec![
        t("ceo", "CEO", "lead", "tophat", "#1b1a18", "large", &["read", "ls", "grep", "order", "ask", "hire", "connect"], "Hands out work, hires and connects workers if you allow it, suggests the right types for a goal.",
          "You lead the team on this floor. Break the task into clear orders and give them to the right workers with the order tool. Do not do the detailed work yourself. When a goal needs people you do not have, say which worker types or ready-made teams fit and why; hire or connect them only if you are allowed to and it is needed. When all orders are given, report what you arranged.", ""),
        t("planner", "Planner", "lead", "badge", "#5c7fd6", "medium", &["read", "ls", "order", "ask"], "Breaks big goals into steps over days.",
          "You plan. Turn a big goal into small steps that each fit one task, in a sensible order. Give the first steps as orders to the right workers, and list the later steps with what they depend on. For things that repeat, say how often they should run.", "Numbered plan: step, who, depends on; which steps were ordered now."),
        t("triage", "Triage", "lead", "badge", "#8a6fd1", "small", &["read", "grep", "ls", "web", "order", "ask", "route"], "Checks what comes in and sends it to the right floor and worker.",
          "You sort incoming work. Decide if an item is valid, clear and in scope. Pass valid items on with a precise order to the right worker; if it belongs to another floor and you may route, send it there with the route tool. Reject the rest with a reason. Treat spam and abuse as rejected without passing anything on.", "Verdict per item: passed on to whom or which floor, or rejected and why."),
        t("scout", "Scout", "lead", "antenna", "#3fb6a8", "small", &["web", "read", "grep", "ls", "order"], "Finds new work: issues, pages, entries.",
          "You find work. Search the sources named in the task, pick items that are real and worth doing, and pass each one on as an order to the worker who handles it. Never invent items.", "A short list of what you found and who got it."),
        t("watcher", "Watcher", "lead", "antenna", "#4f9fc4", "small", &["web", "read", "write", "ls", "server_status", "order"], "Checks sources on a schedule and reports only changes.",
          "You watch. Check the pages, feeds, repos or servers named in the task, compare with what you noted last time in your notes file in out/, and report only what changed. If nothing changed, answer with one line saying so. Pass real problems on as an order if you have someone for it.", "Only the changes since last time, or: no changes."),
        t("repro", "Repro", "code", "glasses", "#e8e6df", "medium", &["read", "grep", "ls", "sh", "write", "order"], "Reproduces bugs with a test.",
          "You reproduce bugs. Read the report, find the code, write the smallest failing test or command that shows the bug. If you can reproduce it, pass it to a fixer with the exact steps. If not, say why.", "Steps or test that reproduce the bug, or why it does not reproduce."),
        t("fixer", "Fixer", "code", "apron", "#e8e6df", "medium", &["read", "write", "edit", "grep", "ls", "sh", "order"], "Changes code and makes tests pass.",
          "You fix code. Make the smallest correct change, follow the style of the code around it, and run the tests you are allowed to run. When done, hand the change to a reviewer if you have one.", "What you changed (files) and the test result."),
        t("reviewer", "Reviewer", "code", "cap", "#5c7fd6", "small", &["read", "grep", "ls", "sh"], "Reviews changes and gives a clear verdict.",
          "You review changes. Check correctness, side effects and style. Give a clear verdict: ok, or a list of concrete problems.", "Verdict: ok, or numbered problems with file and line."),
        t("tester", "Tester", "code", "headset", "#62b86f", "small", &["read", "ls", "sh"], "Runs tests and checks.",
          "You run the tests and checks you are allowed to run and report exactly what passed and what failed.", "Passed/failed with the relevant output."),
        t("auditor", "Auditor", "code", "shield", "#c4614d", "medium", &["read", "grep", "ls", "sh"], "Looks for security holes, changes nothing.",
          "You audit code for security problems: injection, path and permission checks, secrets in code, unsafe defaults, missing validation. Follow each finding through the real code path before you report it. Never change files.", "Findings: severity, file:line, what goes wrong, how to fix. Or: nothing found."),
        t("gardener", "Gardener", "code", "hat", "#62b86f", "small", &["read", "edit", "ls", "sh", "order"], "Keeps dependencies up to date.",
          "You keep dependencies current. Check for outdated packages with the commands you may run, update a few at a time, run the tests, and keep what passes. When an update breaks something you cannot fix with a small change, pass it to a fixer with the error.", "Updated packages with versions, test result, what was handed on."),
        t("release", "Release", "code", "tie", "#9c7ae0", "small", &["read", "write", "edit", "ls", "sh"], "Writes the changelog, bumps the version and tags.",
          "You prepare releases. Collect the changes since the last tag, write a short changelog entry for users, bump the version where the project keeps it, commit and tag. Push only if you are allowed to.", "Version, changelog entry, tag, pushed or not."),
        t("migrator", "Migrator", "code", "glasses", "#a8574f", "large", &["read", "write", "edit", "grep", "ls", "sh", "order"], "Does big refactors in small tested steps.",
          "You do large changes across a codebase, such as a framework upgrade or a rename. Split the work into small steps that each leave the code working, run the tests after each step, and stop at the first step that breaks with a clear report.", "Steps done, steps left, test result after the last step."),
        t("merger", "Merger", "code", "cap", "#3fb6a8", "medium", &["read", "edit", "grep", "ls", "sh", "order"], "Resolves merge conflicts and rebases.",
          "You resolve merge conflicts and rebase branches. Keep the intent of both sides, run the tests afterwards, and hand anything you are unsure about to a reviewer.", "Which conflicts you resolved and how, test result."),
        t("benchmarker", "Benchmarker", "code", "headset", "#4f9fc4", "small", &["read", "write", "ls", "sh", "deliver"], "Measures performance against the last run.",
          "You measure performance with the commands you may run. Run each measurement several times, compare with the numbers from the last run in your notes file in out/, and call out real regressions only.", "Table of measurements with the change against the last run."),
        t("experimenter", "Experimenter", "code", "magnifier", "#d0649f", "medium", &["read", "write", "ls", "sh", "web"], "Tries libraries and ideas in a throwaway folder.",
          "You try things out. Build the smallest experiment that answers the question, in a scratch folder you may write, and report what worked, what did not, and what you would use.", "Question, what you tried, result, recommendation."),
        t("designer", "Designer", "code", "shades", "#d0649f", "medium", &["read", "ls", "web", "screenshot", "deliver"], "Checks a web UI with screenshots.",
          "You check web interfaces. Take screenshots at desktop and phone width, look at layout, spacing, overflow, contrast and broken parts, and report concrete problems with where they are.", "Problems with page, width and place, most visible first."),
        t("a11y", "A11y", "code", "glasses", "#62b86f", "small", &["read", "grep", "ls"], "Checks accessibility: contrast, labels, keyboard.",
          "You check accessibility in HTML and components: missing labels and alt texts, contrast, focus order, keyboard use, ARIA misuse. Report only real problems with file and line.", "Problems with file:line and the fix."),
        t("docs", "Docs", "code", "pen", "#5c7fd6", "medium", &["read", "write", "edit", "grep", "ls", "deliver"], "Keeps docs in sync with the code and explains codebases.",
          "You keep documentation true. Compare README and docs with the code and fix what is outdated. When asked to explain a codebase, write an overview of its parts, how they talk to each other and where to start reading.", "What you changed, or the overview."),
        t("writer", "Writer", "text", "scarf", "#c75b8a", "medium", &["read", "write", "edit", "ls", "grep"], "Writes and edits texts.",
          "You write clear, plain text for people. Match the tone and language the task asks for. Put longer texts into a file with the deliver tool.", "The text, or the file you delivered."),
        t("translator", "Translator", "text", "scarf", "#3fb6a8", "medium", &["read", "write", "edit", "ls", "grep", "deliver"], "Translates texts and keeps i18n files in sync.",
          "You translate. Keep meaning, tone, formatting, placeholders and technical terms exactly. In i18n files keep keys untouched, add missing keys in every language and flag keys that no longer exist in the source language.", "The translation, or the files you changed and which keys."),
        t("reporter", "Reporter", "text", "pen", "#9c7ae0", "small", &["read", "ls", "grep", "write", "deliver"], "Summarizes and writes reports.",
          "You summarise. Read what you are given and write a short, accurate report for the user. No filler.", "A short report."),
        t("critic", "Critic", "text", "shades", "#1b1a18", "medium", &["read", "grep", "ls"], "Red team: attacks plans and results before they reach you.",
          "You are the red team. Look for what is wrong, missing, risky or unproven in the plan or result you get. Be concrete and fair: every point needs a reason. Say clearly when something holds up.", "Numbered weaknesses with reasons, then what holds up."),
        t("researcher", "Researcher", "data", "magnifier", "#4f9fc4", "medium", &["web", "read", "write", "deliver"], "Researches the web with sources.",
          "You research on the web. Use only the domains you may reach, check facts in more than one place when you can, and always name your sources. Never invent facts.", "Findings with source links."),
        t("analyst", "Analyst", "data", "shades", "#c4614d", "medium", &["read", "write", "ls", "grep", "sh", "deliver"], "Analyses data and does the math.",
          "You analyse data. Load it, compute what the task asks, and state numbers with how you got them.", "Numbers, short method, and a file if the result is large."),
        t("scraper", "Scraper", "data", "antenna", "#a8574f", "small", &["web", "write", "deliver"], "Collects structured data as CSV or JSON.",
          "You collect data from allowed web pages into a clean CSV or JSON file with the fields the task names. Keep the source URL per row. Never fill in values you did not find.", "The file, row count, and pages that failed."),
        t("cleaner", "Cleaner", "data", "apron", "#62b86f", "small", &["read", "write", "ls", "sh", "deliver"], "Cleans data: duplicates, formats, gaps.",
          "You clean data sets. Remove duplicates, unify formats, mark missing values, and never change the meaning of a value. Write the result as a new file and keep the original.", "The cleaned file and a list of what you changed with counts."),
        t("librarian", "Librarian", "data", "glasses", "#8a6fd1", "medium", &["web", "read", "write", "ls", "grep", "deliver", "ask"], "Keeps the shared library that every worker can read.",
          "You run the shared library. Collect documentation for the APIs and libraries the teams use, in the version they use, plus snippets that worked and results worth reusing. Store everything in the library folder and keep INDEX.md up to date with one line per entry: path, what it is, version, date. When someone asks for something you do not have and you may reach the source, fetch it, store it and answer with the path.", "What you added or found, with paths in the library."),
        t("ops", "Ops", "operations", "hat", "#a8574f", "small", &["server_status", "job_start", "job_log", "job_stop", "put_file", "get_file", "read", "write"], "Looks after servers and jobs in the server room.",
          "You run jobs on the servers in the server room. Only use the allowed commands. Watch the logs, stop jobs that hang, and report results.", "Which jobs ran where, and their result."),
        t("housekeeper", "Housekeeper", "operations", "apron", "#8a8a8a", "small", &["ls", "read", "write", "grep", "delete"], "Tidies folders, names files consistently and keeps an index.",
          "You keep folders tidy. Sort files into a clear structure, give them consistent names, keep an INDEX.md, and remove files that are clearly obsolete such as old temporary results, logs and duplicates. Never delete anything you are not sure about: list it instead.", "What you moved, renamed and deleted, and what you left for the user to decide."),
        t("backup", "Backup Keeper", "operations", "shield", "#5c7fd6", "small", &["ls", "read", "sh"], "Checks backups and tests restores.",
          "You check backups with the commands you may run: are they there, recent, complete and readable. Test a restore into a scratch folder when you can. Report problems clearly.", "Backup state per source and the restore test result."),
        t("notifier", "Notifier", "operations", "headset", "#3fb6a8", "small", &["read", "deliver"], "Sends summaries and alerts (channels come later).",
          "You prepare notifications: short summaries and alerts for the user. Until a channel is connected, deliver them as a file in the result tray.", "The notification text."),
        t("accountant", "Accountant", "office", "tie", "#62b86f", "small", &["usage", "read", "order", "ask", "pause"], "Estimates costs before, watches them after, pauses workers over budget.",
          "You look after costs. Before a big task, estimate what it will cost from the prices and past usage. Afterwards, compare spending with the limits, point out workers or models that cost more than they bring and suggest cheaper models. If you may pause workers, pause only those that are over their budget, and say so.", "Costs per worker and account, estimate if asked, actions taken."),
        t("coach", "Coach", "office", "cap", "#c75b8a", "medium", &["read", "grep", "ls", "type_propose"], "Learns from failed tasks and suggests better roles.",
          "You improve the team. Read failed and rejected tasks and their feedback, find patterns, and propose concrete changes to worker type roles or result descriptions with the type_propose tool. The owner decides; never claim a change is applied.", "Patterns found and the proposals you made."),
    ]
}

pub fn sync_types(db: &Db) {
    let ed: Vec<String> = db.kg("tyed").as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
    for t in types() {
        let id = t["id"].as_str().unwrap().to_string();
        let v = |k: &str| t[k].as_str().unwrap_or("").to_string();
        db.run(
            "insert or ignore into ty(id,nm,role,tools,md,ef,prov,acc,col,dsc,outf,chk,own) values(?,?,?,?,?,?,?,?,?,?,?,?,0)",
            pa![id.clone(), v("nm"), v("role"), t["tools"].to_string(), v("md"), "medium".to_string(), "".to_string(), v("acc"), v("col"), v("dsc"), v("outf"), "".to_string()],
        );
        if !ed.contains(&id) {
            db.run("update ty set nm=?, role=?, tools=?, md=?, acc=?, col=?, dsc=?, outf=? where id=? and own=0", pa![v("nm"), v("role"), t["tools"].to_string(), v("md"), v("acc"), v("col"), v("dsc"), v("outf"), id]);
        }
    }
}

pub fn grps() -> Value {
    let mut m = serde_json::Map::new();
    for t in types() {
        m.insert(t["id"].as_str().unwrap().to_string(), t["grp"].clone());
    }
    Value::Object(m)
}

pub fn teams() -> Value {
    json!([
        {"id": "bugfix", "nm": "Bugfix team", "dsc": "Triage, Repro, Fixer, Reviewer", "ws": ["triage", "repro", "fixer", "reviewer"], "ln": [[1, 0], [2, 1], [3, 2]]},
        {"id": "research", "nm": "Research team", "dsc": "Researcher, Analyst, Writer", "ws": ["researcher", "analyst", "writer"], "ln": [[1, 0], [2, 1]]},
        {"id": "writing", "nm": "Writing team", "dsc": "Writer, Reviewer", "ws": ["writer", "reviewer"], "ln": [[1, 0]]}
    ])
}

pub fn name(db: &Db) -> String {
    let used: Vec<String> = db.all("select nm from wk", pa![]).iter().filter_map(|r| r["nm"].as_str().map(String::from)).collect();
    let mut r = rand::thread_rng();
    let fr: Vec<&&str> = NAMES.iter().filter(|n| !used.iter().any(|u| u == **n)).collect();
    fr.choose(&mut r).map(|s| s.to_string()).unwrap_or_else(|| format!("{}{}", NAMES.choose(&mut r).unwrap(), r.gen_range(2..99)))
}

pub fn col() -> String {
    COLS.choose(&mut rand::thread_rng()).unwrap().to_string()
}

pub fn floor(db: &Db, f: i64) -> Option<Value> {
    db.one("select * from fl where id=?", pa![f])
}

pub fn save(db: &Db, f: i64, l: &Value) {
    db.run("update fl set lay=?, lv=lv+1 where id=?", pa![l.to_string(), f]);
}

pub fn desks(l: &Value) -> Vec<i64> {
    l["fu"].as_array().map(|a| a.iter().filter(|u| u["k"] == "desk").filter_map(|u| u["id"].as_i64()).collect()).unwrap_or_default()
}

pub fn free_desk(db: &Db, f: i64) -> Option<i64> {
    let l = floor(db, f)?["lay"].clone();
    let used: Vec<i64> = db.all("select desk from wk where fl=?", pa![f]).iter().filter_map(|r| r["desk"].as_i64()).collect();
    desks(&l).into_iter().find(|d| !used.contains(d))
}

fn occ(l: &Value, x: i64, y: i64, skip: i64) -> bool {
    l["fu"].as_array().map(|a| a.iter().any(|u| {
        let (w, h) = size(u["k"].as_str().unwrap_or(""));
        let (ux, uy) = (u["x"].as_i64().unwrap_or(0), u["y"].as_i64().unwrap_or(0));
        u["id"].as_i64() != Some(skip) && x >= ux && x < ux + w && y >= uy && y < uy + h
    })).unwrap_or(false)
}

pub fn can(l: &Value, k: &str, x: i64, y: i64, skip: i64) -> bool {
    let (w, h) = size(k);
    let wall = matches!(k, "lift" | "stairs" | "board" | "chart" | "screen");
    for yy in y..y + h {
        for xx in x..x + w {
            if xx < 0 || yy < 0 || xx >= MW || yy >= MH {
                return false;
            }
            let t = l["t"][yy as usize][xx as usize].as_i64().unwrap_or(0);
            if !(t == 1 || wall && t == 2 && yy < 2) || occ(l, xx, yy, skip) {
                return false;
            }
        }
    }
    true
}

pub fn add(l: &mut Value, k: &str, ex: Value) -> Option<i64> {
    let (w, h) = size(k);
    let ys: Vec<i64> = if matches!(k, "gen" | "rack") { (3..MH - h).collect() } else { (2..MH - h).collect() };
    for y in ys.iter().step_by(if k == "rack" { 3 } else { 1 }) {
        let mut x = 2;
        while x < MW - w {
            if can(l, k, x, *y, -1) && can_pad(l, k, x, *y) {
                let id = l["nx"].as_i64().unwrap_or(100);
                let mut o = json!({"id": id, "k": k, "x": x, "y": y});
                if let Value::Object(m) = ex {
                    for (a, b) in m {
                        o[a] = b;
                    }
                }
                l["fu"].as_array_mut()?.push(o);
                l["nx"] = json!(id + 1);
                return Some(id);
            }
            x += 1;
        }
    }
    None
}

fn can_pad(l: &Value, k: &str, x: i64, y: i64) -> bool {
    let (w, h) = size(k);
    for yy in y - 1..=y + h {
        for xx in x - 1..=x + w {
            if yy >= 2 && yy < MH - 1 && xx >= 1 && xx < MW - 1 && occ(l, xx, yy, -1) {
                return false;
            }
        }
    }
    true
}

pub fn basement(db: &Db) -> i64 {
    db.n("select id from fl where k='basement' order by lvl limit 1", pa![])
}

pub fn sync_gens(a: &Ax) {
    let k = basement(&a.db);
    let Some(f) = floor(&a.db, k) else { return };
    let mut l = f["lay"].clone();
    let ids: Vec<i64> = a.db.all("select id from acc", pa![]).iter().filter_map(|r| r["id"].as_i64()).collect();
    let mut ch = false;
    if let Some(fu) = l["fu"].as_array_mut() {
        let n = fu.len();
        fu.retain(|u| u["k"] != "gen" || u["acc"].as_i64().map(|x| ids.contains(&x)).unwrap_or(false));
        ch |= n != fu.len();
    }
    for id in ids {
        let has = l["fu"].as_array().map(|a| a.iter().any(|u| u["k"] == "gen" && u["acc"] == id)).unwrap_or(false);
        if !has {
            ch |= add(&mut l, "gen", json!({"acc": id})).is_some();
        }
    }
    if ch {
        save(&a.db, k, &l);
    }
}

pub fn sync_racks(a: &Ax) {
    for f in a.db.all("select id, lay from fl where k='server'", pa![]) {
        let fid = f["id"].as_i64().unwrap_or(0);
        let mut l = f["lay"].clone();
        let ids: Vec<i64> = a.db.all("select id from srv where fl=?", pa![fid]).iter().filter_map(|r| r["id"].as_i64()).collect();
        let mut ch = false;
        if let Some(fu) = l["fu"].as_array_mut() {
            let n = fu.len();
            fu.retain(|u| u["k"] != "rack" || u["srv"].as_i64().map(|x| ids.contains(&x)).unwrap_or(false));
            ch |= n != fu.len();
        }
        for id in ids {
            if !l["fu"].as_array().map(|a| a.iter().any(|u| u["k"] == "rack" && u["srv"] == id)).unwrap_or(false) {
                ch |= add(&mut l, "rack", json!({"srv": id})).is_some();
            }
        }
        if ch {
            save(&a.db, fid, &l);
        }
    }
}

pub fn height(db: &Db, n: i64) -> Result<(), String> {
    let cur = db.n("select count(*) from fl", pa![]);
    let top = db.n("select max(lvl) from fl where k!='shell'", pa![]);
    if n < top + 1 || n < 3 || n > 60 {
        return Err(format!("floors: at least {} (floors in use), at most 60", (top + 1).max(3)));
    }
    if n > cur {
        for l in cur..n {
            db.run("insert into fl(lvl,k,nm,lay) values(?,?,?,?)", pa![l, "shell".to_string(), "Shell floor".to_string(), lay("shell").to_string()]);
        }
    } else {
        db.run("delete from fl where lvl>=? and k='shell'", pa![n]);
    }
    Ok(())
}

pub fn build(db: &Db, f: i64, k: &str, nm: &str) -> Result<(), String> {
    if !KINDS.contains(&k) {
        return Err("unknown floor kind".into());
    }
    let r = floor(db, f).ok_or("no such floor")?;
    if r["k"] != "shell" {
        return Err("this floor is already built".into());
    }
    let n = db.n("select count(*) from fl where k=?", pa![k.to_string()]);
    let nm = if nm.trim().is_empty() { if n > 0 { format!("{} {}", fname(k), n + 1) } else { fname(k).to_string() } } else { nm.trim().chars().take(32).collect() };
    db.run("update fl set k=?, nm=?, lay=?, lv=lv+1, hook=? where id=?", pa![k.to_string(), nm, lay(k).to_string(), hex::encode(rand::random::<[u8; 16]>()), f]);
    if db.n("select count(*) from fl where k='shell'", pa![]) == 0 {
        let top = db.n("select max(lvl) from fl", pa![]);
        db.run("insert into fl(lvl,k,nm,lay) values(?,?,?,?)", pa![top + 1, "shell".to_string(), "Shell floor".to_string(), lay("shell").to_string()]);
    }
    Ok(())
}

pub fn demolish(db: &Db, f: i64) -> Result<(), String> {
    let r = floor(db, f).ok_or("no such floor")?;
    if !KINDS.contains(&r["k"].as_str().unwrap_or("")) {
        return Err("Basement and lobby stay".into());
    }
    if db.n("select count(*) from wk where fl=?", pa![f]) > 0 {
        return Err("Workers still work on this floor. Move or dismiss them first.".into());
    }
    if db.n("select count(*) from srv where fl=?", pa![f]) > 0 {
        return Err("There are still servers in this server room.".into());
    }
    db.run("update fl set k='shell', nm='Shell floor', lay=?, lv=lv+1, hook=null where id=?", pa![lay("shell").to_string(), f]);
    Ok(())
}


#[cfg(test)]
mod t {
    use super::*;

    #[test]
    fn building() {
        let db = Db::mem();
        init(&db);
        let n = db.n("select count(*) from fl", pa![]);
        assert!((11..=18).contains(&n));
        let r = db.n("select id from fl where k='shell' order by lvl limit 1", pa![]);
        build(&db, r, "office", "").unwrap();
        assert!(build(&db, r, "office", "").is_err());
        assert_eq!(desks(&floor(&db, r).unwrap()["lay"]).len(), 6);
        assert!(free_desk(&db, r).is_some());
        assert!(height(&db, 2).is_err());
        height(&db, 25).unwrap();
        assert_eq!(db.n("select count(*) from fl", pa![]), 25);
        assert!(db.n("select count(*) from ty", pa![]) >= 12);
    }

    #[test]
    fn place() {
        let mut l = lay("basement");
        let a = add(&mut l, "gen", json!({"acc": 1})).unwrap();
        let b = add(&mut l, "gen", json!({"acc": 2})).unwrap();
        assert_ne!(a, b);
        assert!(!can(&l, "desk", 0, 5, -1));
        assert!(can(&lay("office"), "plant", 9, 10, -1));
    }
}
