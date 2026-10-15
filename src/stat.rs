use crate::cfg::Ax;
use crate::db::{day, now};
use crate::pa;
use serde_json::{json, Value};

pub fn house(a: &Ax, q: &str) -> Value {
    let d0 = chrono::Local::now().date_naive().and_hms_opt(0, 0, 0).unwrap().and_local_timezone(chrono::Local).unwrap().timestamp_millis();
    match q {
        "done_today" => json!(a.db.n("select count(*) from tk where st='done' and t1>=?", pa![d0])),
        "fail_today" => json!(a.db.n("select count(*) from tk where st in ('fail','rej') and t1>=?", pa![d0])),
        "run" => json!(a.db.n("select count(*) from tk where st='run'", pa![])),
        "wait" => json!(a.db.n("select count(*) from tk where st='wait'", pa![])),
        "workers" => json!(a.db.n("select count(*) from wk", pa![])),
        "usd_today" => json!((crate::prov::spent(a) * 100.0).round() / 100.0),
        "tok_today" => json!(a.db.n("select coalesce(sum(tin+tout),0) from us where day=?", pa![day()])),
        "servers_on" => json!(a.db.all("select st from srv", pa![]).iter().filter(|s| s["st"]["on"] == true).count()),
        "accounts_ok" => json!(crate::prov::list(a).iter().all(|x| x["st"]["s"] == "run" || x["st"]["s"] == "warn")),
        "tasks_per_day" => json!(a.db.all("select date(t1/1000,'unixepoch','localtime') d, count(*) n from tk where st='done' and t1>? group by 1 order by 1", pa![now() - 14 * 86_400_000])),
        "usd_per_day" => json!(a.db.all("select day d, round(sum(usd),2) n from us where day>=? group by day order by day", pa![(chrono::Local::now() - chrono::Duration::days(14)).format("%Y-%m-%d").to_string()])),
        "recent_done" => json!(a.db.all("select ti from tk where st='done' order by t1 desc limit 8", pa![]).iter().map(|r| r["ti"].clone()).collect::<Vec<_>>()),
        _ => Value::Null,
    }
}

fn path(v: &Value, p: &str) -> Value {
    let mut c = v;
    for k in p.split('.').filter(|x| !x.is_empty()) {
        c = if let Ok(i) = k.parse::<usize>() { &c[i] } else { &c[k] };
    }
    c.clone()
}

async fn get(a: &Ax, u: &str) -> Result<(u16, String), String> {
    let pu = url::Url::parse(u).map_err(|_| "Adresse ungültig")?;
    if pu.scheme() != "http" && pu.scheme() != "https" {
        return Err("nur http(s)".into());
    }
    let r = a.hc.get(u).header("user-agent", "ApolloOffice").timeout(std::time::Duration::from_secs(20)).send().await.map_err(|e| e.to_string())?;
    let s = r.status().as_u16();
    let b = r.bytes().await.map_err(|e| e.to_string())?;
    Ok((s, String::from_utf8_lossy(&b[..b.len().min(2_000_000)]).to_string()))
}

pub async fn val(a: &Ax, s: &Value) -> Result<Value, String> {
    let t = s["t"].as_str().unwrap_or("house");
    match t {
        "house" => Ok(house(a, s["q"].as_str().unwrap_or(""))),
        "text" => Ok(s["text"].clone()),
        "http" => {
            let (_, b) = get(a, s["url"].as_str().unwrap_or("")).await?;
            let j: Value = serde_json::from_str(&b).map_err(|_| "keine JSON-Antwort")?;
            Ok(path(&j, s["path"].as_str().unwrap_or("")))
        }
        "uptime" => {
            let t0 = std::time::Instant::now();
            match get(a, s["url"].as_str().unwrap_or("")).await {
                Ok((c, _)) => Ok(json!({"up": c < 400, "code": c, "ms": t0.elapsed().as_millis() as i64})),
                Err(e) => Ok(json!({"up": false, "why": e})),
            }
        }
        "github" => {
            let r = s["repo"].as_str().unwrap_or("").trim();
            if !regex::Regex::new(r"^[\w.-]+/[\w.-]+$").unwrap().is_match(r) {
                return Err("Repo als besitzer/name".into());
            }
            match s["f"].as_str().unwrap_or("stars") {
                "prs" => {
                    let (_, b) = get(a, &format!("https://api.github.com/search/issues?q=repo:{r}+is:pr+is:open&per_page=1")).await?;
                    Ok(serde_json::from_str::<Value>(&b).map(|j| j["total_count"].clone()).unwrap_or(Value::Null))
                }
                "actions" => {
                    let (_, b) = get(a, &format!("https://api.github.com/repos/{r}/actions/runs?per_page=1")).await?;
                    let j: Value = serde_json::from_str(&b).unwrap_or(json!({}));
                    let x = &j["workflow_runs"][0];
                    Ok(json!({"up": x["conclusion"] == "success", "txt": x["conclusion"].as_str().or(x["status"].as_str()).unwrap_or("–"), "nm": x["name"]}))
                }
                f => {
                    let (_, b) = get(a, &format!("https://api.github.com/repos/{r}")).await?;
                    let j: Value = serde_json::from_str(&b).unwrap_or(json!({}));
                    Ok(match f {
                        "issues" => j["open_issues_count"].clone(),
                        _ => j["stargazers_count"].clone(),
                    })
                }
            }
        }
        "rss" => {
            let (_, b) = get(a, s["url"].as_str().unwrap_or("")).await?;
            let re = regex::Regex::new(r"(?s)<(?:item|entry)\b.*?<title[^>]*>(.*?)</title>").unwrap();
            let v: Vec<String> = re.captures_iter(&b).take(8).map(|c| crate::tools::strip(&c[1].replace("<![CDATA[", "").replace("]]>", ""))).collect();
            Ok(json!(v))
        }
        _ => Err("unbekannte Quelle".into()),
    }
}

pub async fn poll(a: &Ax) {
    for w in a.db.all("select id, src, t from wid", pa![]) {
        let ev = w["src"]["every"].as_i64().unwrap_or(300).max(60) * 1000;
        let ext = w["src"]["t"].as_str().map(|t| t != "house" && t != "text").unwrap_or(false);
        if ext && now() - w["t"].as_i64().unwrap_or(0) < ev {
            continue;
        }
        let a2 = a.clone();
        let id = w["id"].as_i64().unwrap_or(0);
        a.db.run("update wid set t=? where id=?", pa![now(), id]);
        tokio::spawn(async move {
            let v = match val(&a2, &w["src"]).await {
                Ok(v) => json!({"v": v}),
                Err(e) => json!({"e": e}),
            };
            a2.db.run("update wid set val=? where id=?", pa![v.to_string(), id]);
        });
    }
}

#[cfg(test)]
mod t {
    #[test]
    fn p() {
        let v = serde_json::json!({"a": {"b": [1, {"c": 5}]}});
        assert_eq!(super::path(&v, "a.b.1.c"), 5);
    }
}
