const P = {
  github: {
    auth: "https://github.com/login/oauth/authorize", token: "https://github.com/login/oauth/access_token", scope: "read:user",
    user: async (t) => { const u = await j("https://api.github.com/user", t); return { sub: String(u.id), nm: u.login, av: u.avatar_url }; },
  },
  google: {
    auth: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", scope: "openid profile email",
    user: async (t) => { const u = await j("https://openidconnect.googleapis.com/v1/userinfo", t); return { sub: u.sub, nm: u.name || u.email, em: u.email, av: u.picture }; },
  },
  gitlab: {
    auth: "https://gitlab.com/oauth/authorize", token: "https://gitlab.com/oauth/token", scope: "read_user",
    user: async (t) => { const u = await j("https://gitlab.com/api/v4/user", t); return { sub: String(u.id), nm: u.username, av: u.avatar_url }; },
  },
  discord: {
    auth: "https://discord.com/oauth2/authorize", token: "https://discord.com/api/oauth2/token", scope: "identify",
    user: async (t) => { const u = await j("https://discord.com/api/users/@me", t); return { sub: u.id, nm: u.global_name || u.username, av: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png` : "" }; },
  },
};

const j = async (u, t) => {
  const r = await fetch(u, { headers: { authorization: "Bearer " + t, "user-agent": "ApolloOffice-Auth", accept: "application/json" } });
  if (!r.ok) throw new Error("user lookup failed " + r.status);
  return r.json();
};

const enc = new TextEncoder();
const b64u = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const rnd = (n = 32) => b64u(crypto.getRandomValues(new Uint8Array(n)));

const hmac = async (env, s) => {
  const k = await crypto.subtle.importKey("raw", enc.encode(env.STATE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", k, enc.encode(s)));
};
const seal = async (env, o) => { const s = b64u(enc.encode(JSON.stringify(o))); return s + "." + (await hmac(env, s)); };
const open = async (env, v) => {
  const [s, m] = String(v || "").split(".");
  if (!s || !m || (await hmac(env, s)) !== m) return null;
  const o = JSON.parse(new TextDecoder().decode(unb64u(s)));
  return o.exp > Date.now() ? o : null;
};
const sign = async (env, o) => {
  const k = await crypto.subtle.importKey("pkcs8", unb64u(env.SIGN_KEY.replace(/\s/g, "").replace(/\+/g, "-").replace(/\//g, "_")), { name: "Ed25519" }, false, ["sign"]);
  const b = enc.encode(JSON.stringify(o));
  return b64u(b) + "." + b64u(await crypto.subtle.sign({ name: "Ed25519" }, k, b));
};

const loopback = (u) => ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) && u.protocol === "http:";
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const page = (title, body, st = 200, extra = {}) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{margin:0;background:#14161a;color:#e9e7e1;font:14px/1.5 ui-monospace,Menlo,Consolas,monospace;display:flex;justify-content:center;padding:48px 16px}main{max-width:560px;width:100%}h1{font-size:18px;letter-spacing:.08em}a.b,button{display:inline-block;background:#5aa9e6;color:#0d1b26;border:0;border-radius:3px;padding:8px 14px;font:inherit;text-decoration:none;cursor:pointer}a{color:#5aa9e6}code{background:#1c1f25;padding:2px 5px;border-radius:3px}.w{background:#2a1c1c;border:1px solid #5a2f2b;padding:12px;border-radius:4px}</style><main>${body}</main>`, { status: st, headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'", "x-frame-options": "DENY", "referrer-policy": "no-referrer", "cache-control": "no-store", ...extra } });

const PRIVACY = `<h1>ApolloOffice login · privacy</h1>
<p>This service only signs you in to your own ApolloOffice installation. ApolloOffice itself runs on your computer, not here.</p>
<p><b>What happens:</b> you pick GitHub, Google, GitLab or Discord. The provider tells this service your account id, name, avatar and (Google only) e-mail. This service puts them into a short signed token (valid 2 minutes) and sends you back to your installation. Your installation stores the account as its owner.</p>
<p><b>What is stored here:</b> nothing. There is no database. The login state lives in an encrypted cookie for at most 10 minutes. Cloudflare, which runs this service, keeps standard request logs (IP address, time, URL) for a limited time.</p>
<p><b>Your rights:</b> since nothing is stored, there is nothing to delete here. To remove the owner from your installation, run <code>apollo-office reset-owner</code>. Questions: open an issue in the repository.</p>
<p><a href="https://github.com/Silvertree2010/ApolloOffice">Source code</a></p>`;

export default {
  async fetch(q, env) {
    const u = new URL(q.url);
    try {
      if (u.pathname === "/" || u.pathname === "/privacy") return page("Privacy", PRIVACY);
      if (u.pathname === "/start") {
        const p = u.searchParams.get("p"), i = u.searchParams.get("i") || "", n = u.searchParams.get("n") || "", r = u.searchParams.get("r") || "";
        const pv = P[p];
        if (!pv || !env[p.toUpperCase() + "_ID"]) return page("Error", "<h1>Unknown provider</h1>", 400);
        if (!/^[a-f0-9]{24}$/.test(i) || !/^[\w-]{20,64}$/.test(n)) return page("Error", "<h1>Bad request</h1>", 400);
        let ru;
        try { ru = new URL(r); } catch { return page("Error", "<h1>Bad return address</h1>", 400); }
        if (!/^https?:$/.test(ru.protocol) || ru.pathname !== "/auth/back" || ru.search || ru.hash) return page("Error", "<h1>Bad return address</h1>", 400);
        const okv = await hmac(env, "ok:" + i + ":" + n + ":" + ru.href);
        if (!loopback(ru) && u.searchParams.get("ok") !== okv) {
          const again = new URL(u); again.searchParams.set("ok", okv);
          return page("Confirm", `<h1>Sign in to a remote installation?</h1><div class="w"><p>After the login you will be sent to <b>${esc(ru.origin)}</b>.</p><p>Only continue if this is <b>your own</b> ApolloOffice and you started this login there yourself. If someone sent you this link, close this page.</p></div><p><a class="b" href="${esc(again.href)}">Yes, it is mine. Continue</a></p>`);
        }
        const ver = rnd(), st = rnd(16);
        const ch = b64u(await crypto.subtle.digest("SHA-256", enc.encode(ver)));
        const cb = `${u.origin}/cb/${p}`;
        const a = new URL(pv.auth);
        a.searchParams.set("client_id", env[p.toUpperCase() + "_ID"]);
        a.searchParams.set("redirect_uri", cb);
        a.searchParams.set("response_type", "code");
        a.searchParams.set("scope", pv.scope);
        a.searchParams.set("state", st);
        a.searchParams.set("code_challenge", ch);
        a.searchParams.set("code_challenge_method", "S256");
        if (p === "google") a.searchParams.set("prompt", "select_account");
        const c = await seal(env, { p, i, n, r: ru.href, ver, st, exp: Date.now() + 600000 });
        return new Response(null, { status: 302, headers: { location: a.href, "set-cookie": `ao_st=${c}; Path=/cb/${p}; HttpOnly; Secure; SameSite=Lax; Max-Age=600`, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
      }
      const m = u.pathname.match(/^\/cb\/(github|google|gitlab|discord)$/);
      if (m) {
        const p = m[1], pv = P[p];
        const ck = (q.headers.get("cookie") || "").split(/;\s*/).find((x) => x.startsWith("ao_st="));
        const s = await open(env, ck && ck.slice(6));
        if (!s || s.p !== p || s.st !== u.searchParams.get("state")) return page("Error", "<h1>Login expired</h1><p>Please start again from your ApolloOffice.</p>", 400);
        const back = new URL(s.r);
        if (u.searchParams.get("error")) { back.searchParams.set("e", "Login abgebrochen"); return Response.redirect(back.href, 302); }
        const body = new URLSearchParams({ client_id: env[p.toUpperCase() + "_ID"], client_secret: env[p.toUpperCase() + "_SECRET"], code: u.searchParams.get("code") || "", redirect_uri: `${u.origin}/cb/${p}`, grant_type: "authorization_code", code_verifier: s.ver });
        const tr = await fetch(pv.token, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body });
        const tj = await tr.json();
        if (!tj.access_token) return page("Error", "<h1>Login failed</h1><p>The provider did not accept the login.</p>", 400);
        const us = await pv.user(tj.access_token);
        const tok = await sign(env, { p, sub: us.sub, nm: us.nm || "", em: us.em || "", av: us.av || "", i: s.i, n: s.n, aud: back.origin, exp: Math.floor(Date.now() / 1000) + 120 });
        back.searchParams.set("t", tok);
        return new Response(null, { status: 302, headers: { location: back.href, "set-cookie": `ao_st=; Path=/cb/${p}; HttpOnly; Secure; SameSite=Lax; Max-Age=0`, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
      }
      return page("Not found", "<h1>Not found</h1>", 404);
    } catch (e) {
      return page("Error", "<h1>Something went wrong</h1><p>Please try again.</p>", 500);
    }
  },
};
