use crate::app::{sl, Ax, X, R};
use crate::db::now;
use crate::sh::{gh, ho, hosts, hraw};
use std::sync::atomic::{AtomicI64, Ordering};

const HW: &str = r#"o=$(uname -s); echo "os $o"
if [ "$o" = Darwin ]; then echo "cpu $(sysctl -n hw.ncpu)"; echo "load $(sysctl -n vm.loadavg | awk '{print $2}')"; p=$(pagesize); echo "mem $(($(sysctl -n hw.memsize)/1048576)) $(vm_stat | awk -v p=$p '/Pages (free|inactive|speculative)/{gsub(/[.]/,"",$NF);s+=$NF} END{print int(s*p/1048576)}')"
else echo "cpu $(nproc)"; echo "load $(cut -d' ' -f1 /proc/loadavg)"; echo "mem $(awk '/MemTotal/{t=$2}/MemAvailable/{a=$2}END{print int(t/1024), int(a/1024)}' /proc/meminfo)"; t=$(cat /sys/class/thermal/thermal_zone*/temp | sort -n | tail -1); [ -n "$t" ] && echo "temp $((t/1000))"; fi
echo "disk $(df -Pk "$HOME" | awk 'NR==2{print int($2/1048576), int($4/1048576)}')"
echo "up $(uptime | sed 's/.*up *//; s/, *[0-9]* user.*//')""#;

fn hw(o: &str) -> serde_json::Value {
    let mut v = serde_json::json!({"t": now()});
    for l in o.lines() {
        let (k, x) = l.split_once(' ').unwrap_or((l, ""));
        let ns: Vec<f64> = x.split_whitespace().filter_map(|n| n.parse().ok()).collect();
        match k {
            "os" | "up" => v[k] = serde_json::json!(x.trim()),
            "cpu" | "load" | "temp" if !ns.is_empty() => v[k] = serde_json::json!(ns[0]),
            "mem" | "disk" if ns.len() == 2 => v[k] = serde_json::json!(ns),
            _ => {}
        }
    }
    v
}

static LAST: AtomicI64 = AtomicI64::new(0);
static FAIL: std::sync::LazyLock<std::sync::Mutex<std::collections::HashMap<String, u32>>> = std::sync::LazyLock::new(Default::default);

async fn ck(a: &Ax, k: &str) -> bool {
    match k {
        "gh" => gh(&["api", "rate_limit", "--jq", ".rate.remaining"], 30).await.is_ok(),
        "an" if crate::routing::enabled(a) => true,
        "an" => a.hc.get("https://api.anthropic.com/").timeout(std::time::Duration::from_secs(15)).send().await.is_ok(),
        h => match ho(a, h) {
            Some(x) => {
                let o = hraw(&x, &format!("{{ {HW}; }} 2>/dev/null; {}", if x.dk { "docker inspect -f '{{.State.Running}}' apollo-office | grep -q true" } else { "true" }), 45).await;
                if o.c == 0 {
                    a.lv.lock().unwrap().hst.insert(h.to_string(), hw(&o.o));
                }
                o.c == 0
            }
            None => false,
        },
    }
}

pub async fn probe(a: &Ax, ks: &[String]) {
    let v = futures::future::join_all(ks.iter().map(|k| ck(a, k))).await;
    let mut l = a.lv.lock().unwrap();
    let mut f = FAIL.lock().unwrap();
    for (k, ok) in ks.iter().zip(v) {
        let n = if ok { 0 } else { f.get(k).copied().unwrap_or(0) + 1 };
        f.insert(k.clone(), n);
        l.o.net.insert(k.clone(), n < 2);
    }
    l.o.off = !*l.o.net.get("gh").unwrap_or(&true) || !*l.o.net.get("an").unwrap_or(&true);
    LAST.store(now(), Ordering::Relaxed);
}

pub async fn all(a: &Ax) {
    let mut ks: Vec<String> = vec!["gh".into(), "an".into()];
    ks.extend(hosts(a).into_iter().filter(|h| h.on).map(|h| h.id));
    probe(a, &ks).await;
}

pub async fn need(a: &Ax, w: &str, ks: &[&str]) -> R<()> {
    let mut b = 30_000u64;
    let ks: Vec<String> = ks.iter().filter(|k| !k.is_empty()).map(|k| k.to_string()).collect();
    loop {
        if now() - LAST.load(Ordering::Relaxed) > 20_000 || ks.iter().any(|k| !a.net(k)) {
            probe(a, &ks).await;
        }
        let miss: Vec<String> = ks.iter().filter(|k| !a.net(k)).cloned().collect();
        if miss.is_empty() {
            return Ok(());
        }
        for k in &miss {
            if k != "gh" && k != "an" && crate::sh::ho(a, k).map(|h| !h.on).unwrap_or(true) {
                return Err(X::Back(format!("{k} left the office")));
            }
        }
        a.say(w, &format!("offline: {} unreachable, retry in {} s", miss.join(", "), b / 1000), None);
        sl(b).await;
        b = (b * 2).min(300_000);
    }
}

pub async fn watch(a: Ax) {
    loop {
        all(&a).await;
        sl(60_000).await;
    }
}
