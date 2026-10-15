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
    for t in types() {
        db.run(
            "insert or ignore into ty(id,nm,role,tools,md,ef,prov,acc,col,dsc,outf,chk,own) values(?,?,?,?,?,?,?,?,?,?,?,?,0)",
            pa![t["id"].as_str().unwrap().to_string(), t["nm"].as_str().unwrap().to_string(), t["role"].as_str().unwrap().to_string(), t["tools"].to_string(), t["md"].as_str().unwrap().to_string(), "medium".to_string(), "".to_string(), t["acc"].as_str().unwrap().to_string(), t["col"].as_str().unwrap().to_string(), t["dsc"].as_str().unwrap().to_string(), t["outf"].as_str().unwrap_or("").to_string(), "".to_string()],
        );
    }
}

pub fn types() -> Vec<Value> {
    let t = |id: &str, nm: &str, acc: &str, col: &str, md: &str, tools: &[&str], dsc: &str, role: &str, outf: &str| {
        json!({"id": id, "nm": nm, "acc": acc, "col": col, "md": md, "tools": tools, "dsc": dsc, "role": role, "outf": outf})
    };
    vec![
        t("ceo", "CEO", "tophat", "#1b1a18", "large", &["read", "ls", "grep", "order", "ask", "hire", "connect"], "Hands out work, hires and connects workers if you allow it.",
          "You lead the team on this floor. Break the task into clear orders and give them to the right workers with the order tool. Hire or connect workers only if you are allowed to and it is needed. Do not do the detailed work yourself. When all orders are given, report what you arranged.", ""),
        t("scout", "Scout", "antenna", "#3fb6a8", "small", &["web", "read", "grep", "ls", "order"], "Finds new work: issues, pages, entries.",
          "You find work. Search the sources named in the task, pick items that are real and worth doing, and pass each one on as an order to the worker who handles it. Never invent items.", "A short list of what you found and who got it."),
        t("triage", "Triage", "badge", "#8a6fd1", "small", &["read", "grep", "ls", "web", "order"], "Checks and sorts what comes in.",
          "You sort incoming work. Decide if an item is valid, clear and in scope. Pass valid items on to the right worker with a precise order, reject the rest with a reason.", "Verdict per item: passed on to whom, or rejected and why."),
        t("repro", "Repro", "glasses", "#e8e6df", "medium", &["read", "grep", "ls", "sh", "write", "order"], "Reproduces bugs with a test.",
          "You reproduce bugs. Read the report, find the code, write the smallest failing test or command that shows the bug. If you can reproduce it, pass it to a fixer with the exact steps. If not, say why.", "Steps or test that reproduce the bug, or why it does not reproduce."),
        t("fixer", "Fixer", "apron", "#e8e6df", "medium", &["read", "write", "edit", "grep", "ls", "sh", "order"], "Changes code and makes tests pass.",
          "You fix code. Make the smallest correct change, follow the style of the code around it, and run the tests you are allowed to run. When done, hand the change to a reviewer if you have one.", "What you changed (files) and the test result."),
        t("reviewer", "Reviewer", "cap", "#5c7fd6", "small", &["read", "grep", "ls", "sh"], "Reviews changes and gives a clear verdict.",
          "You review changes. Check correctness, side effects and style. Give a clear verdict: ok, or a list of concrete problems.", "Verdict: ok, or numbered problems with file and line."),
        t("tester", "Tester", "headset", "#62b86f", "small", &["read", "ls", "sh"], "Runs tests and checks.",
          "You run the tests and checks you are allowed to run and report exactly what passed and what failed.", "Passed/failed with the relevant output."),
        t("writer", "Writer", "scarf", "#c75b8a", "medium", &["read", "write", "edit", "ls", "grep"], "Writes and edits texts.",
          "You write clear, plain text for people. Match the tone and language the task asks for. Put longer texts into a file with the deliver tool.", "The text, or the file you delivered."),
        t("researcher", "Researcher", "magnifier", "#4f9fc4", "medium", &["web", "read", "write", "deliver"], "Researches the web with sources.",
          "You research on the web. Use only the domains you may reach, check facts in more than one place when you can, and always name your sources. Never invent facts.", "Findings with source links."),
        t("analyst", "Analyst", "shades", "#c4614d", "medium", &["read", "write", "ls", "grep", "sh", "deliver"], "Analyses data and does the math.",
          "You analyse data. Load it, compute what the task asks, and state numbers with how you got them.", "Numbers, short method, and a file if the result is large."),
        t("ops", "Ops", "hat", "#a8574f", "small", &["server_status", "job_start", "job_log", "job_stop", "put_file", "get_file", "read", "write"], "Looks after servers and jobs in the server room.",
          "You run jobs on the servers in the server room. Only use the allowed commands. Watch the logs, stop jobs that hang, and report results.", "Which jobs ran where, and their result."),
        t("reporter", "Reporter", "pen", "#9c7ae0", "small", &["read", "ls", "grep", "write", "deliver"], "Summarizes and writes reports.",
          "You summarise. Read what you are given and write a short, accurate report for the user. No filler.", "A short report."),
    ]
}

pub fn teams() -> Value {
    json!([
        {"id": "bugfix", "nm": "Bugfix-Team", "dsc": "Triage, Repro, Fixer, Reviewer", "ws": ["triage", "repro", "fixer", "reviewer"], "ln": [[1, 0], [2, 1], [3, 2]]},
        {"id": "recherche", "nm": "Recherche-Team", "dsc": "Researcher, Analyst, Writer", "ws": ["researcher", "analyst", "writer"], "ln": [[1, 0], [2, 1]]},
        {"id": "schreib", "nm": "Schreib-Team", "dsc": "Writer, Reviewer", "ws": ["writer", "reviewer"], "ln": [[1, 0]]}
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
