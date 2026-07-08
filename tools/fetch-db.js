/* Rigenera tools/db.json: scarica il database ufficiale MHDB Wilds e lo normalizza
   con la STESSA funzione transform() di index.html (così resta coerente con l'app).
   Poi lancia build.js per aggiornare la versione standalone.

   Uso:  cd tools && node fetch-db.js
*/
const fs = require("fs"), Babel = require("@babel/standalone"), https = require("https"), path = require("path");
const SRC = path.join(__dirname, "..", "index.html");
const OUT = path.join(__dirname, "db.json");

// carica transform() da index.html senza montare l'app React
const html = fs.readFileSync(SRC, "utf8");
const code = html.match(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/)[1];
let js = Babel.transform(code, { presets: [["react", { runtime: "classic" }]] }).code.replace(/ReactDOM\.createRoot[\s\S]*$/, "");
js += "\n;globalThis.__X={transform};";
const noop = () => {};
globalThis.React = { useState: v => [v, noop], useEffect: noop, useMemo: f => f(), useRef: () => ({ current: null }), createElement: () => null, Fragment: "F" };
globalThis.ReactDOM = { createRoot: () => ({ render: noop }) };
globalThis.window = {}; globalThis.localStorage = { getItem: () => null, setItem: noop };
globalThis.document = { getElementById: () => null, addEventListener: noop };
globalThis.setTimeout = noop; globalThis.fetch = noop;
new Function(js)();
const transform = globalThis.__X.transform;

const get = u => new Promise((r, j) => https.get(u, x => { let d = ""; x.on("data", c => d += c); x.on("end", () => r(JSON.parse(d))); }).on("error", j));

(async () => {
  const A = "https://wilds.mhdb.io/it";
  console.log("scarico il database MHDB…");
  const [sk, st, de, ch, we] = await Promise.all([
    get(A + "/skills"), get(A + "/armor/sets"), get(A + "/decorations"), get(A + "/charms"), get(A + "/weapons"),
  ]);
  const d = transform(sk, st, de, ch, we);
  const slim = { skills: d.skills, bonuses: d.bonuses, pieces: d.pieces, decos: d.decos, charms: d.charms, weapons: d.weapons };
  fs.writeFileSync(OUT, JSON.stringify(slim));
  console.log("scritto:", OUT, "|", d.pieces.length, "pezzi,", d.weapons.length - 1, "armi,", d.charms.length - 1, "charm");
  console.log("ora lancia:  node build.js");
})().catch(e => { console.error("ERR", e); process.exit(1); });
