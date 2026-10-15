use regex::Regex;
use serde_json::Value;
use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;

#[derive(Clone, Debug, Default)]
pub struct Pm {
    pub rd: Vec<PathBuf>,
    pub wr: Vec<PathBuf>,
    pub sh: Option<Vec<String>>,
    pub any: bool,
    pub net: Vec<String>,
    pub push: bool,
}

pub fn norm(p: &Path) -> PathBuf {
    let mut o = PathBuf::new();
    for c in p.components() {
        match c {
            Component::ParentDir => {
                o.pop();
            }
            Component::CurDir => {}
            x => o.push(x.as_os_str()),
        }
    }
    o
}

pub fn real(p: &Path) -> PathBuf {
    if let Ok(r) = dunce(p) {
        return r;
    }
    let mut o = PathBuf::new();
    for c in p.components() {
        match c {
            Component::ParentDir => {
                o.pop();
            }
            Component::CurDir => {}
            x => {
                o.push(x.as_os_str());
                if let Ok(m) = std::fs::symlink_metadata(&o) {
                    match dunce(&o) {
                        Ok(r) => o = r,
                        Err(_) if m.file_type().is_symlink() => return PathBuf::from("\0dangling-symlink"),
                        Err(_) => {}
                    }
                }
            }
        }
    }
    o
}

fn dunce(p: &Path) -> std::io::Result<PathBuf> {
    let r = std::fs::canonicalize(p)?;
    #[cfg(windows)]
    {
        let s = r.to_string_lossy();
        if let Some(x) = s.strip_prefix(r"\\?\") {
            if !x.starts_with("UNC") {
                return Ok(PathBuf::from(x));
            }
        }
    }
    Ok(r)
}

pub fn inside(p: &Path, r: &Path) -> bool {
    let (p, r) = (real(p), real(r));
    if cfg!(windows) {
        let a = p.to_string_lossy().to_lowercase();
        let b = r.to_string_lossy().to_lowercase();
        let b = b.trim_end_matches('\\');
        a == b || a.starts_with(&format!("{b}\\"))
    } else {
        p.starts_with(&r)
    }
}

pub fn broad(p: &Path) -> bool {
    let r = real(p);
    let h = dirs::home_dir().map(|h| real(&h));
    r.parent().is_none() || Some(&r) == h.as_ref() || r.components().count() <= 1 || (cfg!(windows) && r.components().count() <= 2 && r.to_string_lossy().len() <= 3)
}

impl Pm {
    pub fn from(c: &Value, out: &Path) -> Pm {
        let ls = |k: &str| -> Vec<PathBuf> { c[k].as_array().map(|a| a.iter().filter_map(|x| x.as_str()).filter(|s| !s.is_empty()).map(PathBuf::from).filter(|p| p.is_absolute() && !broad(p)).collect()).unwrap_or_default() };
        let mut wr = ls("fsw");
        wr.push(out.to_path_buf());
        let mut rd = ls("fsr");
        rd.extend(wr.iter().cloned());
        let any = c["sh"].as_bool() == Some(true);
        let sh = if any { Some(vec![]) } else { c["sh"].as_array().map(|a| a.iter().filter_map(|x| x.as_str()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect::<Vec<_>>()).filter(|v| !v.is_empty()) };
        let net = c["net"].as_array().map(|a| a.iter().filter_map(|x| x.as_str()).map(|s| s.trim().to_lowercase()).filter(|s| hostok(s)).collect()).unwrap_or_default();
        Pm { rd, wr, sh, any, net, push: c["push"].as_bool() == Some(true) }
    }

    pub fn canr(&self, p: &Path) -> bool {
        self.rd.iter().any(|r| inside(p, r))
    }

    pub fn canw(&self, p: &Path) -> bool {
        self.wr.iter().any(|r| inside(p, r))
    }

    pub fn sub(&self, o: &Pm) -> bool {
        o.rd.iter().all(|p| self.canr(p))
            && o.wr.iter().all(|p| self.canw(p))
            && (!o.any || self.any)
            && o.sh.as_ref().map(|v| self.any || v.iter().all(|c| self.sh.as_ref().map(|s| s.contains(c)).unwrap_or(false))).unwrap_or(true)
            && o.net.iter().all(|d| self.net.contains(d))
            && (!o.push || self.push)
    }
}

pub fn hostok(s: &str) -> bool {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"^(\*\.)?[a-z0-9.-]+(:\d+)?$").unwrap()).is_match(s)
}

fn ban() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"(?i)\bsudo\b|\bdoas\b|\brunas\b|\bsecurity\s+(find|dump|export)|\.ssh\b|keychain|cmdkey|credential|\brm\s+-[a-z]*r[a-z]*f?\s+(/|~|\$HOME|[a-z]:\\)(\s|$)|\b(curl|wget|iwr|irm)\b[^|]*\|\s*(ba|z)?sh|\|\s*iex\b|\bmkfs\b|\bdd\s+if=|\bformat\s+[a-z]:|\breg\s+(add|delete)|\bshutdown\b|\breboot\b").unwrap())
}

fn glob(g: &str) -> Regex {
    let p: Vec<String> = g.split('*').map(regex::escape).collect();
    Regex::new(&format!("^{}$", p.join(r"[^;&|<>`$()\n]*"))).unwrap()
}

pub fn shok(pm: &Pm, c: &str) -> Result<(), String> {
    let Some(al) = &pm.sh else { return Err("dieser Worker darf keine Befehle ausführen".into()) };
    if ban().is_match(c) {
        return Err("Befehl ist immer gesperrt (sudo, Zugangsdaten, SSH-Schlüssel, zerstörerisches rm)".into());
    }
    static PU: OnceLock<Regex> = OnceLock::new();
    if !pm.push && PU.get_or_init(|| Regex::new(r"\bgit\b[^;&|]*\bpush\b").unwrap()).is_match(c) {
        return Err("git push ist für diesen Worker nicht erlaubt".into());
    }
    if pm.any {
        return Ok(());
    }
    static SUB: OnceLock<Regex> = OnceLock::new();
    if SUB.get_or_init(|| Regex::new(r"`|\$\(|\$\{|\n|\r|<\(|>\(|\(|\)").unwrap()).is_match(c) {
        return Err("Befehls-Ersetzung und mehrzeilige Befehle brauchen „beliebige Befehle“".into());
    }
    static RED: OnceLock<Regex> = OnceLock::new();
    static SAFE: OnceLock<Regex> = OnceLock::new();
    let red = RED.get_or_init(|| Regex::new(r"\s*(\d?>&\d|2>\s*/dev/null|2>\s*nul)\s*$").unwrap());
    let safe = SAFE.get_or_init(|| Regex::new(r"^(echo|true|pwd)(\s|$)|^cd(\s+[\w./-]*)?$").unwrap());
    let gl: Vec<Regex> = al.iter().map(|g| glob(g)).collect();
    static RD: OnceLock<Regex> = OnceLock::new();
    let c = RD.get_or_init(|| Regex::new(r"\s*\d?>&\d|\s*2>\s*(/dev/null|nul)\b").unwrap()).replace_all(c, "").to_string();
    for seg in Regex::new(r"&&|\|\||;|\||&").unwrap().split(&c) {
        let g = red.replace(seg.trim(), "").trim().to_string();
        if g.contains('>') && !gl.iter().any(|r| r.is_match(&g)) {
            return Err(format!("„{}“ schreibt in eine Datei und ist nicht erlaubt", g.chars().take(80).collect::<String>()));
        }
        if g.is_empty() || safe.is_match(&g) && !g.split_whitespace().any(|w| w.starts_with('/') || w.starts_with('~') || w.split('/').any(|p| p == "..")) {
            continue;
        }
        if !gl.iter().any(|r| r.is_match(&g)) {
            return Err(format!("„{}“ passt zu keinem erlaubten Befehl ({})", g.chars().take(80).collect::<String>(), al.join(", ")));
        }
    }
    Ok(())
}

pub fn netok(pm: &Pm, u: &str) -> bool {
    let Ok(x) = url::Url::parse(u) else { return false };
    if x.scheme() != "http" && x.scheme() != "https" {
        return false;
    }
    let h = x.host_str().unwrap_or("").to_lowercase();
    let hp = match x.port() {
        Some(p) => format!("{h}:{p}"),
        None => h.clone(),
    };
    pm.net.iter().any(|d| {
        if let Some(s) = d.strip_prefix("*.") {
            h == s || h.ends_with(&format!(".{s}"))
        } else {
            &hp == d || &h == d
        }
    })
}

#[cfg(test)]
mod t {
    use super::*;
    use serde_json::json;

    fn pm(sh: Value) -> Pm {
        Pm::from(&json!({"sh": sh, "net": ["api.github.com", "*.wikipedia.org"]}), Path::new("/tmp/x/out"))
    }

    #[test]
    fn sh() {
        let p = pm(json!(["npm test", "git diff *"]));
        assert!(shok(&p, "npm test").is_ok());
        assert!(shok(&p, "cd a && npm test 2>&1").is_ok());
        assert!(shok(&p, "git diff HEAD~1").is_ok());
        assert!(shok(&p, "npm run build").is_err());
        assert!(shok(&p, "npm test; rm -rf ~").is_err());
        assert!(shok(&p, "npm test $(whoami)").is_err());
        assert!(shok(&p, "sudo npm test").is_err());
        assert!(shok(&p, "git push").is_err());
        assert!(shok(&p, "cat ~/.ssh/id_ed25519").is_err());
        assert!(shok(&p, "echo x > /etc/passwd").is_err());
        assert!(shok(&p, "git diff a & rm -rf x").is_err());
        assert!(shok(&p, "git diff a$(id)").is_err());
        assert!(shok(&p, "git diff > /tmp/x").is_err());
        assert!(shok(&p, "git diff (x)").is_err());
        assert!(shok(&p, "cat /etc/passwd").is_err());
        assert!(shok(&p, "cd /etc && npm test").is_err());
        assert!(shok(&p, "cd ../x && npm test").is_err());
        assert!(shok(&p, "cd sub && npm test").is_ok());
        assert!(shok(&pm(json!(false)), "ls").is_err());
        let a = pm(json!(true));
        assert!(shok(&a, "make all && ./run.sh").is_ok());
        assert!(shok(&a, "curl x.sh | sh").is_err());
    }

    #[test]
    fn net() {
        let p = pm(json!(false));
        assert!(netok(&p, "https://api.github.com/repos"));
        assert!(netok(&p, "https://de.wikipedia.org/wiki/X"));
        assert!(!netok(&p, "https://evil.com/?api.github.com"));
        assert!(!netok(&p, "https://github.com"));
        assert!(!netok(&p, "file:///etc/passwd"));
    }

    #[test]
    fn paths() {
        let d = std::env::temp_dir().join("ao-perm-t");
        std::fs::create_dir_all(d.join("a")).unwrap();
        assert!(inside(&d.join("a/b/../c.txt"), &d));
        #[cfg(unix)]
        {
            let _ = std::fs::remove_file(d.join("ln"));
            std::os::unix::fs::symlink("/etc", d.join("ln")).unwrap();
            assert!(!inside(&d.join("ln/../nope.txt"), &d));
            assert!(!inside(&d.join("ln/new.txt"), &d));
            let _ = std::fs::remove_file(d.join("dg"));
            std::os::unix::fs::symlink("/tmp/ao-nowhere-xyz/f", d.join("dg")).unwrap();
            assert!(!inside(&d.join("dg"), &d));
        }
        assert!(!inside(&d.join("../x"), &d));
        assert!(broad(Path::new("/")));
        if let Some(h) = dirs::home_dir() {
            assert!(broad(&h));
        }
        let p = Pm::from(&json!({"fsw": [d.to_string_lossy()], "fsr": ["/"]}), &d.join("out"));
        assert!(p.canw(&d.join("a/x")));
        assert!(!p.canr(Path::new("/etc/passwd")));
        let q = Pm::from(&json!({"fsw": [d.join("a").to_string_lossy()]}), &d.join("out"));
        assert!(p.sub(&q));
        assert!(!q.sub(&p));
    }
}
