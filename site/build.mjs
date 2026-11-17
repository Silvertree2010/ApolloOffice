import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";

const dir = new URL("./public/", import.meta.url).pathname;
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml",
  ".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2", ".mp4": "video/mp4", ".webm": "video/webm",
};
const text = new Set([".html", ".css", ".js", ".svg", ".txt", ".xml"]);
const files = {};
for (const name of readdirSync(dir)) {
  const ext = extname(name);
  if (!types[ext]) continue;
  const buf = readFileSync(join(dir, name));
  const route = "/" + name.replace(/\.html$/, "").replace(/^index$/, "");
  files[route] = [types[ext], text.has(ext) ? 0 : 1, text.has(ext) ? buf.toString("utf8") : buf.toString("base64")];
}
const headers = {};
for (const line of readFileSync(join(dir, "_headers"), "utf8").split("\n")) {
  const m = line.match(/^\s+([A-Za-z-]+):\s*(.+)$/);
  if (m) headers[m[1].toLowerCase()] = m[2].trim();
}
const out = `const F = ${JSON.stringify(files)};
const H = ${JSON.stringify(headers)};
const B = {};
const body = (k) => { const f = F[k]; if (!f[1]) return new TextEncoder().encode(f[2]); return B[k] ||= Uint8Array.from(atob(f[2]), (c) => c.charCodeAt(0)); };
export default {
  async fetch(req) {
    const p = new URL(req.url).pathname.replace(/\\.html$/, "").replace(/\\/+$/, "") || "/";
    const k = p === "/index" ? "/" : p;
    const f = F[k];
    if (!f) return new Response("Not found", { status: 404, headers: { ...H, "content-type": "text/plain" } });
    const b = body(k);
    const h = { ...H, "content-type": f[0], "cache-control": f[1] ? "public, max-age=86400" : "public, max-age=600", "accept-ranges": "bytes" };
    const r = req.headers.get("range")?.match(/^bytes=(\\d*)-(\\d*)$/);
    if (r && (r[1] || r[2])) {
      const s = r[1] ? +r[1] : Math.max(0, b.length - +r[2]), e = r[1] && r[2] ? Math.min(+r[2], b.length - 1) : b.length - 1;
      if (s >= b.length || s > e) return new Response(null, { status: 416, headers: { ...h, "content-range": \`bytes */\${b.length}\` } });
      return new Response(b.slice(s, e + 1), { status: 206, headers: { ...h, "content-range": \`bytes \${s}-\${e}/\${b.length}\` } });
    }
    return new Response(req.method === "HEAD" ? null : b, { headers: h });
  },
};
`;
writeFileSync(new URL("./worker.js", import.meta.url), out);
console.log(`worker.js: ${Object.keys(files).length} files, ${(out.length / 1024).toFixed(0)} KB`);
