use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::AsyncReadExt;
use tokio::process::Command;

const SEC: &[&str] = &[
    "ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_AUTH_TOKEN", "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_CODE_SESSION_ID",
    "CLAUDE_CODE_CHILD_SESSION", "CLAUDE_PID", "CLAUDE_CODE_EXECPATH", "CLAUDE_CODE_SESSION_ATTENDED", "CLAUDE_PLUGIN_ROOT", "CLAUDE_CONFIG_DIR",
    "AWS_SECRET_ACCESS_KEY", "AWS_ACCESS_KEY_ID", "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "CODEX_HOME", "GH_TOKEN", "GITHUB_TOKEN",
    "DEEPSEEK_API_KEY", "MISTRAL_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY", "APOLLO_OFFICE_VAULT",
];

pub fn env(c: &mut Command, x: &HashMap<String, String>) {
    c.env_clear();
    for (k, v) in std::env::vars() {
        if !SEC.contains(&k.as_str()) {
            c.env(k, v);
        }
    }
    for (k, v) in x {
        c.env(k, v);
    }
}

pub fn bash() -> Option<PathBuf> {
    if !cfg!(windows) {
        return Some(PathBuf::from(if Path::new("/bin/bash").exists() { "/bin/bash" } else { "/bin/sh" }));
    }
    if let Ok(p) = std::env::var("CLAUDE_CODE_GIT_BASH_PATH") {
        if Path::new(&p).exists() {
            return Some(p.into());
        }
    }
    for b in [r"C:\Program Files\Git\bin\bash.exe", r"C:\Program Files (x86)\Git\bin\bash.exe"] {
        if Path::new(b).exists() {
            return Some(b.into());
        }
    }
    if let Some(l) = dirs::data_local_dir() {
        let p = l.join(r"Programs\Git\bin\bash.exe");
        if p.exists() {
            return Some(p);
        }
    }
    which("git").and_then(|g| g.parent()?.parent().map(|r| r.join("bin").join("bash.exe"))).filter(|p| p.exists())
}

pub fn which(n: &str) -> Option<PathBuf> {
    let p = std::env::var_os("PATH")?;
    let ex: Vec<String> = if cfg!(windows) { vec![".exe".into(), ".cmd".into(), ".bat".into(), "".into()] } else { vec!["".into()] };
    for d in std::env::split_paths(&p) {
        for e in &ex {
            let f = d.join(format!("{n}{e}"));
            if f.is_file() {
                return Some(f);
            }
        }
    }
    if !cfg!(windows) {
        if let Some(h) = dirs::home_dir() {
            for d in [".local/bin", ".claude/local", ".npm-global/bin", ".bun/bin"] {
                let f = h.join(d).join(n);
                if f.is_file() {
                    return Some(f);
                }
            }
        }
        for d in ["/opt/homebrew/bin", "/usr/local/bin"] {
            let f = Path::new(d).join(n);
            if f.is_file() {
                return Some(f);
            }
        }
    } else if let Some(a) = dirs::data_dir() {
        let f = a.join("npm").join(format!("{n}.cmd"));
        if f.is_file() {
            return Some(f);
        }
    }
    None
}

pub fn grp(c: &mut Command) {
    #[cfg(unix)]
    {
        c.process_group(0);
    }
    #[cfg(windows)]
    {
        c.creation_flags(0x0800_0000 | 0x0000_0200);
    }
}

pub fn kill(pid: u32) {
    #[cfg(unix)]
    {
        let _ = std::process::Command::new("kill").args(["-9", &format!("-{pid}")]).stderr(Stdio::null()).status();
        let _ = std::process::Command::new("kill").args(["-9", &pid.to_string()]).stderr(Stdio::null()).status();
    }
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("taskkill").args(["/T", "/F", "/PID", &pid.to_string()]).stdout(Stdio::null()).stderr(Stdio::null()).status();
    }
}

pub fn age(pid: u32) -> Option<i64> {
    if cfg!(windows) || pid == 0 {
        return None;
    }
    let o = std::process::Command::new("ps").args(["-o", "etime=", "-p", &pid.to_string()]).stderr(Stdio::null()).output().ok()?;
    let t = String::from_utf8_lossy(&o.stdout).trim().to_string();
    if t.is_empty() {
        return None;
    }
    let (d, r) = match t.split_once('-') {
        Some((d, r)) => (d.parse::<i64>().ok()?, r.to_string()),
        None => (0, t),
    };
    let mut s = 0;
    for x in r.split(':') {
        s = s * 60 + x.parse::<i64>().ok()?;
    }
    Some(d * 86_400 + s)
}

pub fn browser() -> Option<(PathBuf, bool)> {
    let mut c: Vec<(PathBuf, bool)> = vec![];
    if cfg!(target_os = "macos") {
        for (p, ff) in [("Google Chrome.app/Contents/MacOS/Google Chrome", false), ("Chromium.app/Contents/MacOS/Chromium", false), ("Microsoft Edge.app/Contents/MacOS/Microsoft Edge", false), ("Brave Browser.app/Contents/MacOS/Brave Browser", false), ("Firefox.app/Contents/MacOS/firefox", true)] {
            c.push((Path::new("/Applications").join(p), ff));
            if let Some(h) = dirs::home_dir() {
                c.push((h.join("Applications").join(p), ff));
            }
        }
    } else if cfg!(windows) {
        let mut roots: Vec<PathBuf> = ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"].iter().filter_map(|v| std::env::var_os(v).map(PathBuf::from)).collect();
        roots.dedup();
        for r in roots {
            for (p, ff) in [(r"Google\Chrome\Application\chrome.exe", false), (r"Microsoft\Edge\Application\msedge.exe", false), (r"BraveSoftware\Brave-Browser\Application\brave.exe", false), (r"Mozilla Firefox\firefox.exe", true)] {
                c.push((r.join(p), ff));
            }
        }
    } else {
        for (n, ff) in [("google-chrome", false), ("google-chrome-stable", false), ("chromium", false), ("chromium-browser", false), ("microsoft-edge", false), ("brave-browser", false), ("firefox", true)] {
            if let Some(p) = which(n) {
                c.push((p, ff));
            }
        }
    }
    c.into_iter().find(|(p, _)| p.is_file())
}

pub async fn shot(u: &str, f: &Path, w: i64, h: i64) -> Result<(), String> {
    let (b, ff) = browser().ok_or("no Chrome, Edge, Brave, Chromium or Firefox found for screenshots")?;
    let pd = std::env::temp_dir().join(format!("ao-shot-{}", hex::encode(rand::random::<[u8; 6]>())));
    let _ = std::fs::create_dir_all(&pd);
    let mut c = Command::new(&b);
    if ff {
        c.args(["--headless", "--no-remote", "--profile"]).arg(&pd).arg(format!("--window-size={w},{h}")).arg("--screenshot").arg(f).arg(u);
    } else {
        c.args(["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "--mute-audio"]).arg(format!("--user-data-dir={}", pd.display())).arg(format!("--window-size={w},{h}")).arg(format!("--screenshot={}", f.display())).arg(u);
    }
    c.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).kill_on_drop(true);
    grp(&mut c);
    let r = match c.spawn() {
        Ok(mut ch) => {
            let id = ch.id().unwrap_or(0);
            let r = tokio::time::timeout(Duration::from_secs(60), ch.wait()).await;
            if r.is_err() {
                kill(id);
            }
            r.map(|_| ()).map_err(|_| "browser took longer than 60 s".to_string())
        }
        Err(e) => Err(format!("{} does not start: {e}", b.display())),
    };
    let _ = std::fs::remove_dir_all(&pd);
    r?;
    if !f.is_file() {
        return Err("the browser made no screenshot".into());
    }
    Ok(())
}

pub struct Out {
    pub c: i32,
    pub o: String,
}

pub async fn sh(cmd: &str, cwd: &Path, min: u64, x: HashMap<String, String>, pid: impl Fn(u32, bool)) -> Out {
    let Some(b) = bash() else { return Out { c: -1, o: "no shell found: install Git for Windows (git-scm.com)".into() } };
    let mut c = Command::new(b);
    c.arg("-c").arg(cmd).current_dir(cwd).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
    env(&mut c, &x);
    grp(&mut c);
    let mut ch = match c.spawn() {
        Ok(c) => c,
        Err(e) => return Out { c: -1, o: e.to_string() },
    };
    let id = ch.id().unwrap_or(0);
    pid(id, true);
    let (mut so, mut se) = (ch.stdout.take().unwrap(), ch.stderr.take().unwrap());
    let rd = async {
        let (mut a, mut b) = (vec![], vec![]);
        let _ = tokio::join!(so.read_to_end(&mut a), se.read_to_end(&mut b));
        a.extend(b);
        a
    };
    let r = tokio::time::timeout(Duration::from_secs(min * 60), async {
        let o = rd.await;
        let s = ch.wait().await.ok().and_then(|s| s.code()).unwrap_or(-1);
        (s, o)
    })
    .await;
    pid(id, false);
    match r {
        Ok((s, o)) => Out { c: s, o: cut(&String::from_utf8_lossy(&o), 30000) },
        Err(_) => {
            kill(id);
            Out { c: -1, o: format!("[timeout after {min} min]") }
        }
    }
}

pub fn cut(s: &str, n: usize) -> String {
    let c = s.chars().count();
    if c <= n {
        s.to_string()
    } else {
        format!("…{}", s.chars().skip(c - n).collect::<String>())
    }
}

pub fn head(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        s.to_string()
    } else {
        format!("{}\n…(cut)", s.chars().take(n).collect::<String>())
    }
}

#[cfg(test)]
mod t {
    #[tokio::test]
    #[ignore]
    async fn shot() {
        let f = std::env::temp_dir().join("ao-shot-t.png");
        let _ = std::fs::remove_file(&f);
        super::shot("https://example.com", &f, 800, 600).await.unwrap();
        assert!(f.is_file());
    }
}
