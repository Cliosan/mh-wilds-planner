/* Genera la versione STANDALONE (mhwilds-standalone.html) da index.html:
   incorpora React, il font Rajdhani (@font-face data-URI) e il database congelato
   (tools/db.json), così la pagina funziona offline e dentro un Artifact claude.ai
   (che blocca CDN e rete). NON include Supabase: la sync non funziona nell'Artifact.

   Uso:  cd tools && npm install && node build.js
   Rigenera db.json (dati aggiornati dall'API MHDB):  node fetch-db.js
*/
const fs = require("fs"), Babel = require("@babel/standalone"), https = require("https"), path = require("path");
const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "index.html");
const OUT = path.join(ROOT, "mhwilds-standalone.html");
const DB = path.join(__dirname, "db.json");

function fetchBuf(url, headers = {}) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36", ...headers } }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return fetchBuf(r.headers.location, headers).then(res, rej);
      const ch = []; r.on("data", c => ch.push(c)); r.on("end", () => res(Buffer.concat(ch)));
    }).on("error", rej);
  });
}
const fetchTxt = (u, h) => fetchBuf(u, h).then(b => b.toString("utf8"));

(async () => {
  const html = fs.readFileSync(SRC, "utf8");
  let appCode = html.match(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/)[1];

  // togli @import font da CDN (lo incorporiamo via @font-face)
  appCode = appCode.replace(/@import url\('https:\/\/fonts\.googleapis[^']*'\);?/, "");

  // usa il DB congelato invece di cache/rete
  const inject = 'if (window.__MHW_DB) { if (alive) setData({ ...window.__MHW_DB, source: "cache" }); return; }\n      // 1) cache locale';
  if (!appCode.includes("// 1) cache locale")) throw new Error("anchor 'cache locale' non trovato in index.html");
  appCode = appCode.replace("// 1) cache locale", inject);

  // JSX -> JS (runtime classico: React.createElement, niente Babel a runtime)
  const appJs = Babel.transform(appCode, { presets: [["react", { runtime: "classic" }]] }).code;

  console.log("scarico React UMD…");
  const [react, reactDom] = await Promise.all([
    fetchTxt("https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js"),
    fetchTxt("https://cdn.jsdelivr.net/npm/react-dom@18/umd/react-dom.production.min.js"),
  ]);

  console.log("scarico e incorporo il font Rajdhani…");
  let fontCss = await fetchTxt("https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&display=swap");
  const urls = [...new Set((fontCss.match(/https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2/g) || []))];
  for (const u of urls) { const b = await fetchBuf(u); fontCss = fontCss.split(u).join("data:font/woff2;base64," + b.toString("base64")); }
  console.log("font woff2 incorporati:", urls.length);

  const db = fs.readFileSync(DB, "utf8");

  const out =
`<title>MH Wilds — Pianificatore di Build</title>
<style>
html,body{margin:0;background:#14100b;} #root{min-height:100vh;}
${fontCss}
</style>
<div id="root"></div>
<script>
(function(){var mem={},ok=false;try{localStorage.setItem('__t','1');localStorage.removeItem('__t');ok=true;}catch(e){}
window.storage={get:function(k){try{if(ok){var v=localStorage.getItem(k);return Promise.resolve(v==null?null:{value:v});}}catch(e){}return Promise.resolve(mem[k]!=null?{value:mem[k]}:null);},
set:function(k,v){try{if(ok){localStorage.setItem(k,v);return Promise.resolve();}}catch(e){}mem[k]=v;return Promise.resolve();}};})();
</script>
<script>${react}</script>
<script>${reactDom}</script>
<script>window.__MHW_DB=${db};</script>
<script>${appJs}</script>`;

  fs.writeFileSync(OUT, out);
  console.log("scritto:", OUT, "|", (out.length / 1024 / 1024).toFixed(2), "MB");
})().catch(e => { console.error("ERR", e); process.exit(1); });
