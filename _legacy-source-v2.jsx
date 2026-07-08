import React, { useState, useEffect, useMemo, useRef } from "react";

/* ==========================================================================
   MONSTER HUNTER WILDS — PIANIFICATORE DI BUILD
   --------------------------------------------------------------------------
   Dati: scaricati dall'API ufficiale MHDB Wilds (https://wilds.mhdb.io, in
   italiano) e MEMORIZZATI IN LOCALE (window.storage). Dalla seconda apertura
   l'app funziona offline con l'intero database: tutte le armature, tutte le
   armi, tutti i gioielli e i charm, con nomi e descrizioni ufficiali.
   Se non c'è né cache né rete, si usa il piccolo campione di riserva (SAMPLE).
   Le build salvate persistono tra le sessioni.
   ========================================================================== */

const API = "https://wilds.mhdb.io/it";
const DB_KEY = "mhw_db_v2";
const BUILDS_KEY = "mhw_builds_v2";

const ELEM = [["f","Fuoco","#d1603a"],["w","Acqua","#4a90c9"],["t","Tuono","#e0b83c"],["i","Ghiaccio","#6bb8c9"],["d","Drago","#9a6fc9"]];
const SLOTS = ["head","chest","arms","waist","legs"];
const SLOT_LABEL = { weapon:"Arma", head:"Testa", chest:"Busto", arms:"Braccia", waist:"Vita", legs:"Gambe" };
const ICONS = { head:"⛑", chest:"🛡", arms:"🥊", waist:"⛓", legs:"👢" };
const RESMAP = { fire:"f", water:"w", thunder:"t", ice:"i", dragon:"d" };
const WKINDS = { "great-sword":"Spadone","long-sword":"Katana","sword-shield":"Spada e scudo","dual-blades":"Doppie lame",
  "hammer":"Martello","hunting-horn":"Corno da caccia","lance":"Lancia","gunlance":"Lanciacannone","switch-axe":"Spadascia",
  "charge-blade":"Spada caricata","insect-glaive":"Falcione insetto","bow":"Arco","light-bowgun":"Balestra leggera","heavy-bowgun":"Balestra pesante" };

/* ---- riserva minima (se manca sia cache che rete) ------------------------ */
const SAMPLE = {
  source:"sample",
  skills:{ 57:{name:"Sfrutta Debolezza",cat:"off",max:5,desc:"Aumenta l'affinità sui punti deboli e sulle ferite."},
    22:{name:"Potenzia Critico",cat:"off",max:5,desc:"Aumenta il danno dei colpi critici."},
    144:{name:"Provocatore",cat:"off",max:5,desc:"Aumenta attacco e affinità quando il mostro è infuriato."},
    122:{name:"Benedizione Divina",cat:"def",max:3,desc:"Ha una probabilità di ridurre i danni subiti."},
    14:{name:"Costituzione",cat:"util",max:5,desc:"Riduce il consumo di stamina."} },
  bonuses:{ 106:{name:"Tirannia di Gore Magala",kind:"set",thresholds:[{pieces:2,desc:"Eclissi Nera I"},{pieces:4,desc:"Eclissi Nera II"}]},
    131:{name:"Anima del Signore",kind:"group",thresholds:[{pieces:3,desc:"Tenacia: sopravvivi a un colpo letale."}]} },
  pieces:[
    {id:"s_h",set:1,setName:"Esempio",slot:"head",rank:"high",def:60,res:{f:0,w:0,t:0,i:0,d:0},slots:[3,1],skills:[[57,2]],bonuses:[]},
    {id:"s_c",set:1,setName:"Esempio",slot:"chest",rank:"high",def:60,res:{f:0,w:0,t:0,i:0,d:0},slots:[3],skills:[[22,2]],bonuses:[]},
    {id:"s_a",set:1,setName:"Esempio",slot:"arms",rank:"high",def:60,res:{f:0,w:0,t:0,i:0,d:0},slots:[2,1],skills:[[144,2]],bonuses:[]},
    {id:"s_w",set:1,setName:"Esempio",slot:"waist",rank:"high",def:60,res:{f:0,w:0,t:0,i:0,d:0},slots:[2],skills:[[14,2]],bonuses:[]},
    {id:"s_l",set:1,setName:"Esempio",slot:"legs",rank:"high",def:60,res:{f:0,w:0,t:0,i:0,d:0},slots:[2,1],skills:[[122,1]],bonuses:[]},
  ],
  decos:[{id:"d1",name:"Gioiello Debolezza [1]",size:1,kind:"armor",skills:[[57,1]]},
    {id:"d2",name:"Gioiello Critico [1]",size:1,kind:"armor",skills:[[22,1]]}],
  charms:[{id:"c0",name:"— Nessun charm —",skills:[]},{id:"c1",name:"Charm Debolezza III",skills:[[57,3]]}],
  weapons:[{id:"w0",kind:"great-sword",name:"— Nessuna arma —",slots:[],skills:[],raw:0,aff:0,el:null,st:null}],
};

/* ---- trasformazione API -> formato interno ------------------------------- */
function transform(skillsRaw, setsRaw, decosRaw, charmsRaw, weaponsRaw) {
  const skills = {}, bonuses = {};
  const catOf = (k) => k === "offense" || k === "attack" || k === "affinity" || k === "element" || k === "ranged" || k === "handicraft" ? "off"
    : k === "defense" || k === "health" ? "def" : "util";
  for (const s of skillsRaw) {
    const isBonus = s.kind === "set" || s.kind === "group" || s.kind === "series" || (s.ranks || []).some(r => r.setPiecesRequired != null);
    if (isBonus) {
      bonuses[s.id] = { name: s.name, kind: s.kind === "group" ? "group" : "set",
        thresholds: (s.ranks || []).filter(r => r.setPiecesRequired != null)
          .map(r => ({ pieces: r.setPiecesRequired, desc: r.name ? `${r.name} — ${r.description || ""}` : (r.description || "") })) };
    } else {
      skills[s.id] = { name: s.name, cat: catOf(s.icon?.kind), max: Math.max(1, ...(s.ranks || [{ level: 1 }]).map(r => r.level || 1)), desc: s.description || "" };
    }
  }
  const pieces = [];
  for (const set of setsRaw || []) {
    for (const p of set.pieces || []) {
      const res = { f:0,w:0,t:0,i:0,d:0 };
      if (p.resistances) for (const [k,v] of Object.entries(p.resistances)) if (RESMAP[k]) res[RESMAP[k]] = v;
      const psk = [], pbn = [];
      for (const ps of p.skills || []) {
        const sid = ps.skill?.id; if (sid == null) continue;
        if (ps.setPiecesRequired != null || ["group","set","series"].includes(ps.skill?.kind)) pbn.push(sid);
        else psk.push([sid, ps.level || 1]);
      }
      pieces.push({ id: "p" + p.id, set: set.id, setName: set.name, slot: p.kind, rank: p.rank,
        def: p.defense?.base ?? 0, res, slots: (p.slots || []).slice(), skills: psk, bonuses: pbn });
    }
  }
  const decos = (decosRaw || []).map(d => ({ id: "d" + d.id, name: d.name, size: d.slot,
    kind: d.kind === "weapon" ? "weapon" : "armor",
    skills: (d.skills || []).map(s => [s.skill?.id, s.level || 1]).filter(x => x[0] != null) })).filter(d => d.skills.length);
  const charms = [{ id: "c0", name: "— Nessun charm —", skills: [] }];
  for (const c of charmsRaw || []) for (const r of c.ranks || [])
    charms.push({ id: "c" + c.id + "_" + r.level, name: r.name, skills: (r.skills || []).map(s => [s.skill?.id, s.level || 1]).filter(x => x[0] != null) });
  const weapons = [{ id: "w0", kind: "great-sword", name: "— Nessuna arma —", slots: [], skills: [], raw: 0, aff: 0, el: null, st: null }];
  for (const w of weaponsRaw || []) {
    let el = null, st = null;
    for (const sp of w.specials || []) {
      if (sp.kind === "element" && sp.element) el = [sp.element, sp.damage?.display ?? sp.damage?.raw ?? 0];
      else if (sp.kind === "status" && sp.status) st = [sp.status, sp.damage?.display ?? sp.damage?.raw ?? 0];
    }
    weapons.push({ id: "w" + w.kind + "_" + w.id, kind: w.kind, name: w.name, slots: (w.slots || []).slice(),
      skills: (w.skills || []).map(s => [s.skill?.id, s.level || 1]).filter(x => x[0] != null),
      raw: w.damage?.raw ?? 0, aff: w.affinity ?? 0, el, st });
  }
  return { source: "live", skills, bonuses, pieces, decos, charms, weapons };
}

/* ========================================================================== */
export default function App() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("Controllo la cache locale…");

  useEffect(() => {
    let alive = true;
    (async () => {
      // 1) cache locale
      try {
        const c = await window.storage.get(DB_KEY);
        if (c && c.value) { const d = JSON.parse(c.value); if (alive) { setData({ ...d, source: "cache" }); return; } }
      } catch (e) {}
      // 2) rete
      setStatus("Scarico il database ufficiale (armature, armi, gioielli, charm, abilità)…");
      try {
        const j = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(u); return r.json(); };
        const [sk, st, de, ch, we] = await Promise.all([
          j(`${API}/skills`), j(`${API}/armor/sets`), j(`${API}/decorations`), j(`${API}/charms`), j(`${API}/weapons`),
        ]);
        if (!alive) return;
        const d = transform(sk, st, de, ch, we);
        setData(d);
        try { await window.storage.set(DB_KEY, JSON.stringify({ skills:d.skills, bonuses:d.bonuses, pieces:d.pieces, decos:d.decos, charms:d.charms, weapons:d.weapons })); } catch (e) {}
      } catch (e) {
        if (alive) setData(SAMPLE);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!data) return <Loading status={status} />;
  return <Shell data={data} />;
}

function Loading({ status }) {
  return (
    <div className="mh-root"><style>{CSS}</style>
      <div className="mh-loading"><div className="mh-crest big">◆</div>
        <p>Registro del cacciatore</p><span className="mh-loading-sub">{status}</span></div>
    </div>
  );
}

function Shell({ data }) {
  const [tab, setTab] = useState("build");
  const srcLabel = data.source === "cache" ? `${data.pieces.length} pezzi · ${data.weapons.length - 1} armi · offline`
    : data.source === "live" ? `${data.pieces.length} pezzi · ${data.weapons.length - 1} armi · live`
    : "dati di esempio";
  return (
    <div className="mh-root"><style>{CSS}</style>
      <header className="mh-header">
        <div className="mh-crest">◆</div>
        <div className="mh-titlewrap"><h1>Pianificatore Build</h1><p className="mh-sub">Monster Hunter Wilds</p></div>
        <span className={"mh-badge " + (data.source === "sample" ? "offline" : "live")}>{srcLabel}</span>
      </header>
      <nav className="mh-tabs">
        <button className={tab === "build" ? "on" : ""} onClick={() => setTab("build")}>Costruttore</button>
        <button className={tab === "compare" ? "on" : ""} onClick={() => setTab("compare")}>Confronto</button>
      </nav>
      <Planner data={data} tab={tab} setTab={setTab} />
      {data.source === "sample" && <p className="mh-footer">Non è stato possibile scaricare il database né trovarne una copia locale. Stai usando un piccolo campione. Riapri l'app dove la rete è consentita per scaricare (una volta sola) l'intero database.</p>}
    </div>
  );
}

/* ---------------------------- planner ------------------------------------- */
function emptyLoadout() { return { weapon: "w0", pieces: { head:"", chest:"", arms:"", waist:"", legs:"" }, charm: "c0", decos: {} }; }

function Planner({ data, tab, setTab }) {
  const [lo, setLo] = useState(emptyLoadout);
  const [builds, setBuilds] = useState([]);
  const [name, setName] = useState("");

  useEffect(() => { (async () => { try { const r = await window.storage.get(BUILDS_KEY); if (r && r.value) setBuilds(JSON.parse(r.value)); } catch (e) {} })(); }, []);
  const persist = async (next) => { setBuilds(next); try { await window.storage.set(BUILDS_KEY, JSON.stringify(next)); } catch (e) {} };

  const pieceById = useMemo(() => Object.fromEntries(data.pieces.map(p => [p.id, p])), [data]);
  const decoById  = useMemo(() => Object.fromEntries(data.decos.map(d => [d.id, d])), [data]);
  const charmById = useMemo(() => Object.fromEntries(data.charms.map(c => [c.id, c])), [data]);
  const weaponById= useMemo(() => Object.fromEntries(data.weapons.map(w => [w.id, w])), [data]);
  const piecesBySlot = useMemo(() => {
    const m = { head:[], chest:[], arms:[], waist:[], legs:[] };
    for (const p of data.pieces) if (m[p.slot]) m[p.slot].push(p);
    for (const k in m) m[k].sort((a,b) => a.setName.localeCompare(b.setName)); return m;
  }, [data]);

  const result = useMemo(() => compute(lo, { pieceById, decoById, charmById, weaponById, skills: data.skills, bonuses: data.bonuses }), [lo, data, pieceById, decoById, charmById, weaponById]);

  const setPiece = (slot, id) => setLo(l => { const decos = {}; Object.keys(l.decos).forEach(k => { if (!k.startsWith(slot + "#")) decos[k] = l.decos[k]; }); return { ...l, pieces: { ...l.pieces, [slot]: id }, decos }; });
  const setWeapon = (id) => setLo(l => { const decos = {}; Object.keys(l.decos).forEach(k => { if (!k.startsWith("weapon#")) decos[k] = l.decos[k]; }); return { ...l, weapon: id, decos }; });
  const setDeco = (key, id) => setLo(l => ({ ...l, decos: { ...l.decos, [key]: id } }));
  const reset = () => setLo(emptyLoadout());

  const save = () => {
    const w = weaponById[lo.weapon];
    persist([...builds, { id: "b" + Date.now(), name: name.trim() || `Build ${builds.length + 1}`,
      weapon: w && w.id !== "w0" ? w.name : null, def: result.def, res: result.res,
      atk: result.atk, aff: result.aff,
      skills: result.skills.map(s => ({ name: s.name, level: s.level, cat: s.cat })),
      bonuses: result.activeBonuses.map(b => `${b.name} (${b.have} pz)`) }]);
    setName("");
  };
  const del = (id) => persist(builds.filter(b => b.id !== id));

  if (tab === "compare") return <Compare builds={builds} del={del} goBuild={() => setTab("build")} />;

  const weapon = weaponById[lo.weapon];
  const slotSources = [];
  if (weapon && weapon.slots.length) slotSources.push({ owner:"weapon", label:"Arma", slots:weapon.slots, kind:"weapon" });
  for (const s of SLOTS) { const p = pieceById[lo.pieces[s]]; if (p) slotSources.push({ owner:s, label:SLOT_LABEL[s], slots:p.slots, kind:"armor" }); }

  return (
    <div className="mh-grid">
      <section className="mh-builder">
        <div className="mh-eyebrow">Equipaggiamento <button className="mh-reset" onClick={reset}>azzera</button></div>

        <div className="mh-slotcard">
          <div className="mh-slotcard-h"><span className="mh-slot-icon">⚔</span><span className="mh-slot-label">Arma</span>
            {weapon && weapon.id !== "w0" && <span className="mh-rank">{WKINDS[weapon.kind] || weapon.kind}</span>}</div>
          <WeaponPicker weapons={data.weapons} value={lo.weapon} onChange={setWeapon} data={data} />
          {weapon && weapon.id !== "w0" && <WeaponInfo w={weapon} data={data} />}
        </div>

        {SLOTS.map(slot => {
          const p = pieceById[lo.pieces[slot]];
          return (
            <div className="mh-slotcard" key={slot}>
              <div className="mh-slotcard-h"><span className="mh-slot-icon">{ICONS[slot]}</span><span className="mh-slot-label">{SLOT_LABEL[slot]}</span>
                {p && <span className="mh-rank">{rankLabel(p.rank)}</span>}</div>
              <PiecePicker options={piecesBySlot[slot]} value={lo.pieces[slot]} onChange={id => setPiece(slot, id)} data={data} />
              {p && <PieceSkills piece={p} data={data} />}
            </div>
          );
        })}

        <div className="mh-slotcard">
          <div className="mh-slotcard-h"><span className="mh-slot-icon">✦</span><span className="mh-slot-label">Charm</span></div>
          <select className="mh-select" value={lo.charm} onChange={e => setLo(l => ({ ...l, charm: e.target.value }))}>
            {data.charms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="mh-eyebrow" style={{ marginTop: 20 }}>Gioielli</div>
        {slotSources.length === 0 && <p className="mh-empty">Equipaggia arma o armatura con slot per inserire gioielli.</p>}
        {slotSources.map(src => (
          <div className="mh-decogroup" key={src.owner}>
            <div className="mh-decogroup-h">{src.label}</div>
            {src.slots.map((size, i) => {
              const key = src.owner + "#" + i;
              const opts = data.decos.filter(d => d.size <= size && d.kind === src.kind);
              return (
                <div className="mh-decoslot" key={key}>
                  <span className="mh-slotpip" data-size={size}>{size}</span>
                  <select className="mh-select mh-select-sm" value={lo.decos[key] || ""} onChange={e => setDeco(key, e.target.value)}>
                    <option value="">— slot [{size}] vuoto —</option>
                    {opts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        ))}
      </section>

      <aside className="mh-summary">
        <Summary result={result} equipped={Object.values(lo.pieces).filter(Boolean).length} data={data} hasWeapon={weapon && weapon.id !== "w0"} />
        <div className="mh-save">
          <input className="mh-input" placeholder="Nome build…" value={name} onChange={e => setName(e.target.value)} />
          <button className="mh-btn" onClick={save}>Salva</button>
        </div>
        {builds.length > 0 && (
          <div className="mh-saved">
            {builds.map(b => <span className="mh-chip" key={b.id}>{b.name}<button onClick={() => del(b.id)}>×</button></span>)}
            <button className="mh-link" onClick={() => setTab("compare")}>Confronta ({builds.length}) →</button>
          </div>
        )}
      </aside>
    </div>
  );
}

/* ------------------------- calcolo aggregato ------------------------------ */
function compute(lo, ctx) {
  const { pieceById, decoById, charmById, weaponById, skills, bonuses } = ctx;
  const raw = {}; const add = (sid, l) => { raw[sid] = (raw[sid] || 0) + l; };
  let def = 0; const res = { f:0,w:0,t:0,i:0,d:0 }; const bonusCount = {};

  for (const s of SLOTS) { const p = pieceById[lo.pieces[s]]; if (!p) continue;
    def += p.def; ELEM.forEach(([k]) => res[k] += p.res[k]);
    p.skills.forEach(([sid, l]) => add(sid, l));
    p.bonuses.forEach(bid => { bonusCount[bid] = (bonusCount[bid] || 0) + 1; });
  }
  const w = weaponById[lo.weapon];
  if (w) w.skills.forEach(([sid, l]) => add(sid, l));
  const ch = charmById[lo.charm]; if (ch) ch.skills.forEach(([sid, l]) => add(sid, l));
  Object.values(lo.decos).forEach(id => { const d = decoById[id]; if (d) d.skills.forEach(([sid, l]) => add(sid, l)); });

  const activeBonuses = [];
  for (const [bid, have] of Object.entries(bonusCount)) {
    const meta = bonuses[bid]; if (!meta) continue;
    const reached = (meta.thresholds || []).filter(t => have >= t.pieces);
    if (reached.length) { const top = reached[reached.length - 1]; activeBonuses.push({ id: bid, name: meta.name, kind: meta.kind, have, desc: top.desc, at: top.pieces }); }
  }
  activeBonuses.sort((a, b) => a.kind === b.kind ? 0 : a.kind === "group" ? -1 : 1);

  const skillList = Object.entries(raw).map(([sid, r]) => {
    const m = skills[sid] || { name: sid, max: r, cat: "util", desc: "" };
    return { id: sid, name: m.name, cat: m.cat, desc: m.desc, level: Math.min(r, m.max), max: m.max, over: Math.max(0, r - m.max) };
  }).sort((a, b) => a.cat === b.cat ? b.level - a.level : ord(a.cat) - ord(b.cat));

  return { def, res, skills: skillList, activeBonuses, atk: w ? w.raw : 0, aff: w ? w.aff : 0, el: w ? w.el : null, st: w ? w.st : null };
}
const ord = (c) => ({ off:0, util:1, def:2 }[c] ?? 3);
const rankLabel = (r) => r === "low" ? "LR" : r === "high" ? "HR" : r === "master" ? "MR" : (r || "").toUpperCase();

/* ------------------------- riepilogo -------------------------------------- */
function Summary({ result, equipped, data, hasWeapon }) {
  const [open, setOpen] = useState(null);
  return (
    <>
      <div className="mh-stats">
        <div className="mh-stat"><div className="mh-stat-n">{result.def}</div><div className="mh-stat-l">Difesa</div></div>
        <div className="mh-stat"><div className="mh-stat-n">{equipped}<span className="mh-stat-sub">/5</span></div><div className="mh-stat-l">Pezzi</div></div>
        <div className="mh-stat"><div className="mh-stat-n">{result.skills.length}</div><div className="mh-stat-l">Abilità</div></div>
      </div>
      {hasWeapon && (
        <div className="mh-wstats">
          <span>Attacco <b>{result.atk}</b></span>
          <span>Affinità <b style={{ color: result.aff < 0 ? "#d1603a" : result.aff > 0 ? "#5fae7f" : "#ece1cb" }}>{result.aff > 0 ? "+" : ""}{result.aff}%</b></span>
          {result.el && <span>Elem. <b style={{ color:"#e0b83c" }}>{result.el[0]} {result.el[1]}</b></span>}
          {result.st && <span>Stato <b style={{ color:"#9a6fc9" }}>{result.st[0]} {result.st[1]}</b></span>}
        </div>
      )}
      <div className="mh-res">
        {ELEM.map(([k,label,color]) => (
          <div className="mh-res-cell" key={k}><span className="mh-res-dot" style={{ background: color }} />
            <span className="mh-res-l">{label}</span>
            <span className="mh-res-v" style={{ color: result.res[k] < 0 ? "#d1603a" : result.res[k] > 0 ? "#5fae7f" : "#a2957b" }}>{result.res[k] > 0 ? "+" : ""}{result.res[k]}</span></div>
        ))}
      </div>
      {result.activeBonuses.length > 0 && (
        <div className="mh-bonuses"><div className="mh-eyebrow">Bonus attivi</div>
          {result.activeBonuses.map(b => (
            <div className={"mh-bonus" + (b.kind === "group" ? " mh-bonus-gold" : "")} key={b.id}>
              <b>{b.name}</b> <span className="mh-bonus-src">{b.kind === "group" ? "gruppo" : "set"} · {b.have} pz</span>
              {b.desc && <><br/><span className="mh-bonus-d">{b.desc}</span></>}</div>
          ))}
        </div>
      )}
      <div className="mh-eyebrow" style={{ marginTop: 4 }}>Abilità <span className="mh-hint">(tocca per la descrizione)</span></div>
      {result.skills.length === 0 && <p className="mh-empty">Nessuna abilità. Scegli l'equipaggiamento.</p>}
      <div className="mh-skilllist">
        {result.skills.map(s => (
          <div className="mh-skill" key={s.id} onClick={() => setOpen(open === s.id ? null : s.id)}>
            <div className="mh-skill-top">
              <span className={"mh-skill-name" + (s.level >= s.max ? " capped" : "")}>{s.name}</span>
              <span className="mh-skill-lv">{s.level}<span className="mh-skill-max">/{s.max}</span>
                {s.over > 0 && <span className="mh-over">+{s.over} sprecati</span>}</span>
            </div>
            <div className="mh-pips" data-cat={s.cat}>
              {Array.from({ length: s.max }).map((_, i) => <span key={i} className={"mh-pip" + (i < s.level ? " on" : "") + (s.level >= s.max ? " full" : "")} />)}
            </div>
            {open === s.id && s.desc && <div className="mh-skill-desc">{s.desc}</div>}
          </div>
        ))}
      </div>
    </>
  );
}

/* ------------------------- confronto -------------------------------------- */
function Compare({ builds, del, goBuild }) {
  if (builds.length === 0)
    return <div className="mh-compare"><p className="mh-empty big">Nessuna build salvata. Creane una nel <button className="mh-link" onClick={goBuild}>Costruttore</button> e premi Salva.</p></div>;
  const names = []; const seen = new Set();
  builds.forEach(b => b.skills.forEach(s => { if (!seen.has(s.name)) { seen.add(s.name); names.push({ name: s.name, cat: s.cat }); } }));
  names.sort((a, b) => a.cat === b.cat ? a.name.localeCompare(b.name) : ord(a.cat) - ord(b.cat));
  const lvl = (b, n) => { const s = b.skills.find(x => x.name === n); return s ? s.level : 0; };
  const mx = (n) => Math.max(...builds.map(b => lvl(b, n)));
  const maxDef = Math.max(...builds.map(b => b.def));
  return (
    <div className="mh-compare">
      <div className="mh-ctablewrap"><table className="mh-ctable">
        <thead><tr><th className="mh-ccorner">Confronto</th>
          {builds.map(b => <th key={b.id}><div className="mh-cbuild">{b.name}<button onClick={() => del(b.id)}>×</button></div></th>)}</tr></thead>
        <tbody>
          <tr className="mh-crow-stat"><td>Difesa</td>{builds.map(b => <td key={b.id} className={b.def === maxDef ? "best" : ""}>{b.def}</td>)}</tr>
          <tr><td>Attacco</td>{builds.map(b => <td key={b.id}>{b.atk || "–"}</td>)}</tr>
          <tr><td>Affinità</td>{builds.map(b => <td key={b.id} style={{ color: (b.aff||0) < 0 ? "#d1603a" : (b.aff||0) > 0 ? "#5fae7f" : "#a2957b" }}>{b.aff ? (b.aff>0?"+":"")+b.aff+"%" : "–"}</td>)}</tr>
          {ELEM.map(([k, label]) => (
            <tr className="mh-crow-res" key={k}><td>{label}</td>
              {builds.map(b => { const v = b.res?.[k] ?? 0; return <td key={b.id} style={{ color: v < 0 ? "#d1603a" : v > 0 ? "#5fae7f" : "#a2957b" }}>{v > 0 ? "+" : ""}{v}</td>; })}</tr>
          ))}
          <tr className="mh-csection"><td colSpan={builds.length + 1}>Abilità</td></tr>
          {names.map(sn => { const top = mx(sn.name); return (
            <tr key={sn.name}><td className="mh-cskill">{sn.name}</td>
              {builds.map(b => { const v = lvl(b, sn.name); return <td key={b.id} className={v > 0 && v === top ? "best" : v === 0 ? "zero" : ""}>{v || "–"}</td>; })}</tr>
          ); })}
        </tbody>
      </table></div>
      <button className="mh-link" onClick={goBuild}>← Torna al costruttore</button>
    </div>
  );
}

/* ------------------------- picker ----------------------------------------- */
function PiecePicker({ options, value, onChange, data }) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(""); const ref = useRef(null);
  useEffect(() => { const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const sel = options.find(o => o.id === value); const ql = q.toLowerCase();
  const filtered = ql ? options.filter(o => (o.setName + " " + skillsText(o, data)).toLowerCase().includes(ql)) : options;
  return (
    <div className="mh-picker" ref={ref}>
      <button className="mh-select mh-pickbtn" onClick={() => setOpen(o => !o)}>{sel ? sel.setName : <span className="mh-ph">— vuoto —</span>}<span className="mh-caret">▾</span></button>
      {open && (
        <div className="mh-pickpop">
          <input autoFocus className="mh-input mh-picksearch" placeholder="Cerca set o abilità…" value={q} onChange={e => setQ(e.target.value)} />
          <div className="mh-picklist">
            <button className="mh-pickitem" onClick={() => { onChange(""); setOpen(false); setQ(""); }}>— vuoto —</button>
            {filtered.slice(0, 200).map(o => (
              <button key={o.id} className={"mh-pickitem" + (o.id === value ? " sel" : "")} onClick={() => { onChange(o.id); setOpen(false); setQ(""); }}>
                <span className="mh-pickname">{o.setName} <em>{rankLabel(o.rank)}</em></span>
                <span className="mh-picksk">{skillsText(o, data)}</span></button>
            ))}
            {filtered.length === 0 && <div className="mh-empty" style={{ padding: "8px 10px" }}>Nessun risultato.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
function WeaponPicker({ weapons, value, onChange, data }) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(""); const [kind, setKind] = useState(""); const ref = useRef(null);
  useEffect(() => { const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const sel = weapons.find(w => w.id === value); const ql = q.toLowerCase();
  const kinds = useMemo(() => Array.from(new Set(weapons.filter(w => w.id !== "w0").map(w => w.kind))), [weapons]);
  const filtered = weapons.filter(w => w.id !== "w0" && (!kind || w.kind === kind) && (!ql || w.name.toLowerCase().includes(ql)));
  return (
    <div className="mh-picker" ref={ref}>
      <button className="mh-select mh-pickbtn" onClick={() => setOpen(o => !o)}>{sel && sel.id !== "w0" ? sel.name : <span className="mh-ph">— nessuna arma —</span>}<span className="mh-caret">▾</span></button>
      {open && (
        <div className="mh-pickpop">
          <div className="mh-pickrow">
            <select className="mh-select mh-select-sm" value={kind} onChange={e => setKind(e.target.value)}>
              <option value="">Tutte</option>
              {kinds.map(k => <option key={k} value={k}>{WKINDS[k] || k}</option>)}
            </select>
            <input autoFocus className="mh-input mh-picksearch" placeholder="Cerca arma…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div className="mh-picklist">
            <button className="mh-pickitem" onClick={() => { onChange("w0"); setOpen(false); setQ(""); }}>— nessuna arma —</button>
            {filtered.slice(0, 200).map(w => (
              <button key={w.id} className={"mh-pickitem" + (w.id === value ? " sel" : "")} onClick={() => { onChange(w.id); setOpen(false); setQ(""); }}>
                <span className="mh-pickname">{w.name} <em>{WKINDS[w.kind] || w.kind}</em></span>
                <span className="mh-picksk">Att {w.raw} · Aff {w.aff}%{w.slots.length ? " · slot " + w.slots.join("/") : ""}</span></button>
            ))}
            {filtered.length === 0 && <div className="mh-empty" style={{ padding: "8px 10px" }}>Nessun risultato.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
function skillsText(p, data) { return p.skills.map(([sid, l]) => (data.skills[sid]?.name || "") + " " + l).join(" · "); }

function PieceSkills({ piece, data }) {
  return (
    <div className="mh-pieceskills">
      {piece.skills.map(([sid, l]) => <span className="mh-tag" key={sid}>{data.skills[sid]?.name || sid} <b>{l}</b></span>)}
      {piece.slots.map((s, i) => <span className="mh-tag mh-tag-slot" key={"s" + i}>[{s}]</span>)}
      <span className="mh-tag mh-tag-def">DEF {piece.def}</span>
    </div>
  );
}
function WeaponInfo({ w, data }) {
  return (
    <div className="mh-pieceskills">
      <span className="mh-tag mh-tag-def">Att {w.raw}</span>
      <span className="mh-tag mh-tag-def">Aff {w.aff}%</span>
      {w.el && <span className="mh-tag">{w.el[0]} {w.el[1]}</span>}
      {w.skills.map(([sid, l]) => <span className="mh-tag" key={sid}>{data.skills[sid]?.name || sid} <b>{l}</b></span>)}
      {w.slots.map((s, i) => <span className="mh-tag mh-tag-slot" key={"s" + i}>[{s}]</span>)}
    </div>
  );
}

/* =============================== stile ==================================== */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&display=swap');
.mh-root{--bg:#14100b;--panel:#1e1810;--line:#3a2f1e;--bone:#ece1cb;--muted:#a2957b;--gold:#f0b03e;--gold-dim:#b5832b;--ember:#d1603a;--jade:#5fae7f;
  background:radial-gradient(120% 80% at 50% -10%,#241a0f 0%,var(--bg) 55%);color:var(--bone);min-height:100vh;padding-bottom:36px;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;}
.mh-root *{box-sizing:border-box;}
.mh-header{display:flex;align-items:center;gap:13px;padding:18px 18px 14px;max-width:1140px;margin:0 auto;border-bottom:1px solid var(--line);}
.mh-crest{font-size:24px;color:var(--gold);filter:drop-shadow(0 0 10px rgba(240,176,62,.4));}
.mh-crest.big{font-size:44px;animation:pulse 1.6s ease-in-out infinite;}
@keyframes pulse{0%,100%{opacity:.5;}50%{opacity:1;}}
.mh-titlewrap{flex:1;}
.mh-header h1{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:24px;letter-spacing:.06em;text-transform:uppercase;margin:0;line-height:1;}
.mh-sub{margin:2px 0 0;font-size:11px;color:var(--muted);letter-spacing:.16em;text-transform:uppercase;}
.mh-badge{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:5px 10px;border-radius:20px;border:1px solid var(--line);text-align:center;}
.mh-badge.live{color:var(--jade);border-color:#33513f;} .mh-badge.offline{color:var(--ember);border-color:#5a3226;}
.mh-tabs{max-width:1140px;margin:0 auto;padding:14px 18px 0;display:flex;gap:8px;}
.mh-tabs button{background:transparent;border:1px solid var(--line);color:var(--muted);font-family:'Rajdhani',sans-serif;font-weight:600;font-size:13px;letter-spacing:.1em;text-transform:uppercase;padding:8px 16px;border-radius:8px 8px 0 0;cursor:pointer;}
.mh-tabs button.on{color:var(--gold);border-color:var(--gold-dim);border-bottom-color:var(--bg);background:var(--panel);}
.mh-grid{max-width:1140px;margin:0 auto;padding:18px;display:grid;grid-template-columns:1fr;gap:20px;}
@media(min-width:880px){.mh-grid{grid-template-columns:1.12fr .88fr;align-items:start;}}
.mh-eyebrow{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold-dim);margin:0 0 11px;display:flex;align-items:center;gap:10px;}
.mh-eyebrow::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,var(--line),transparent);}
.mh-hint{font-size:10px;letter-spacing:.04em;color:var(--muted);text-transform:none;font-weight:500;}
.mh-reset{margin-left:auto;background:transparent;border:1px solid var(--line);color:var(--muted);border-radius:5px;padding:3px 9px;font-family:'Rajdhani',sans-serif;font-weight:600;font-size:10px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;}
.mh-reset:hover{color:var(--ember);border-color:var(--ember);}
.mh-slotcard{background:linear-gradient(180deg,var(--panel),#1a140d);border:1px solid var(--line);border-radius:10px;padding:11px 13px;margin-bottom:9px;}
.mh-slotcard-h{display:flex;align-items:center;gap:9px;margin-bottom:8px;}
.mh-slot-icon{font-size:14px;} .mh-slot-label{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:12.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);}
.mh-rank{margin-left:auto;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:11px;color:var(--gold);border:1px solid var(--gold-dim);border-radius:4px;padding:1px 6px;}
.mh-select{width:100%;background:#0f0b07;color:var(--bone);border:1px solid var(--line);border-radius:7px;padding:9px 10px;font-size:14px;font-family:inherit;cursor:pointer;appearance:none;}
.mh-select:focus{outline:2px solid var(--gold);border-color:var(--gold);}
.mh-select-sm{padding:6px 9px;font-size:12.5px;}
.mh-picker{position:relative;}
.mh-pickbtn{display:flex;align-items:center;justify-content:space-between;text-align:left;gap:8px;}
.mh-ph{color:var(--muted);} .mh-caret{color:var(--gold-dim);font-size:11px;}
.mh-pickpop{position:absolute;z-index:30;left:0;right:0;top:calc(100% + 4px);background:#120d08;border:1px solid var(--gold-dim);border-radius:9px;box-shadow:0 12px 30px rgba(0,0,0,.6);overflow:hidden;}
.mh-pickrow{display:flex;gap:6px;padding:8px 8px 0;} .mh-pickrow .mh-select{flex:0 0 42%;} .mh-pickrow .mh-picksearch{flex:1;margin:0;}
.mh-picksearch{margin:8px;width:calc(100% - 16px);}
.mh-picklist{max-height:280px;overflow-y:auto;}
.mh-pickitem{display:block;width:100%;text-align:left;background:transparent;border:none;border-top:1px solid #241c11;color:var(--bone);padding:8px 11px;cursor:pointer;}
.mh-pickitem:hover{background:#1d1610;} .mh-pickitem.sel{background:#241a0e;}
.mh-pickname{display:block;font-size:13.5px;} .mh-pickname em{color:var(--gold);font-style:normal;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:11px;margin-left:5px;}
.mh-picksk{display:block;font-size:11px;color:var(--muted);margin-top:1px;}
.mh-pieceskills{display:flex;flex-wrap:wrap;gap:5px;margin-top:9px;}
.mh-tag{font-size:11.5px;background:#0f0b07;border:1px solid var(--line);color:var(--muted);padding:2px 8px;border-radius:20px;}
.mh-tag b{color:var(--gold);} .mh-tag-def{color:#8fae9c;} .mh-tag-slot{color:var(--gold-dim);}
.mh-decogroup{margin-bottom:11px;} .mh-decogroup-h{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:12px;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px;}
.mh-decoslot{display:flex;align-items:center;gap:8px;margin-bottom:6px;} .mh-decoslot .mh-select{flex:1;}
.mh-slotpip{flex:none;width:22px;height:22px;border-radius:5px;display:grid;place-items:center;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:12px;border:1px solid var(--gold-dim);color:var(--gold);background:#0f0b07;}
.mh-slotpip[data-size="3"]{border-color:var(--gold);box-shadow:inset 0 0 6px rgba(240,176,62,.25);}
.mh-empty{font-size:13px;color:var(--muted);font-style:italic;margin:2px 0 10px;} .mh-empty.big{padding:40px 10px;text-align:center;font-size:15px;}
.mh-summary{background:linear-gradient(180deg,#1c160e,#161009);border:1px solid var(--line);border-radius:12px;padding:17px 15px;}
@media(min-width:880px){.mh-summary{position:sticky;top:14px;}}
.mh-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:11px;}
.mh-stat{background:#0f0b07;border:1px solid var(--line);border-radius:9px;padding:11px 6px;text-align:center;}
.mh-stat-n{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:28px;line-height:1;color:var(--gold);} .mh-stat-sub{font-size:14px;color:var(--muted);}
.mh-stat-l{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:5px;}
.mh-wstats{display:flex;flex-wrap:wrap;gap:12px;background:#0f0b07;border:1px solid var(--line);border-radius:8px;padding:8px 11px;margin-bottom:12px;font-size:12.5px;color:var(--muted);}
.mh-wstats b{color:var(--bone);font-family:'Rajdhani',sans-serif;font-weight:700;font-size:14px;margin-left:3px;}
.mh-res{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-bottom:15px;}
.mh-res-cell{text-align:center;background:#0f0b07;border:1px solid var(--line);border-radius:7px;padding:6px 2px;}
.mh-res-dot{display:inline-block;width:7px;height:7px;border-radius:50%;}
.mh-res-l{display:block;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin:3px 0 1px;}
.mh-res-v{display:block;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:14px;}
.mh-bonuses{margin-bottom:15px;}
.mh-bonus{background:#0f0b07;border:1px solid var(--line);border-left:3px solid var(--jade);border-radius:6px;padding:7px 10px;margin-bottom:6px;font-size:12.5px;line-height:1.4;}
.mh-bonus b{color:var(--bone);} .mh-bonus-src{color:var(--muted);font-size:11px;} .mh-bonus-d{color:var(--muted);}
.mh-bonus-gold{border-left-color:var(--gold);} .mh-bonus-gold b{color:var(--gold);}
.mh-skilllist{display:flex;flex-direction:column;gap:8px;}
.mh-skill{cursor:pointer;}
.mh-skill-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;}
.mh-skill-name{font-size:13.5px;} .mh-skill-name.capped{color:var(--gold);text-shadow:0 0 8px rgba(240,176,62,.25);}
.mh-skill-lv{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:14px;} .mh-skill-max{color:var(--muted);font-weight:600;}
.mh-over{color:var(--ember);font-size:10px;font-weight:600;margin-left:7px;}
.mh-pips{display:flex;gap:3px;} .mh-pip{flex:1;height:7px;border-radius:2px;background:#2a2114;border:1px solid #342810;}
.mh-pip.on{background:var(--gold-dim);border-color:var(--gold-dim);}
.mh-pip.on.full{background:var(--gold);border-color:var(--gold);box-shadow:0 0 6px rgba(240,176,62,.5);}
.mh-pips[data-cat="def"] .mh-pip.on{background:#4d7d8a;border-color:#4d7d8a;} .mh-pips[data-cat="def"] .mh-pip.on.full{background:#6bb8c9;border-color:#6bb8c9;box-shadow:0 0 6px rgba(107,184,201,.5);}
.mh-pips[data-cat="util"] .mh-pip.on{background:#7a8a4d;border-color:#7a8a4d;} .mh-pips[data-cat="util"] .mh-pip.on.full{background:#a7c96b;border-color:#a7c96b;box-shadow:0 0 6px rgba(167,201,107,.5);}
.mh-skill-desc{margin-top:6px;font-size:12px;color:var(--muted);line-height:1.5;background:#0f0b07;border:1px solid var(--line);border-radius:6px;padding:7px 9px;}
.mh-save{display:flex;gap:7px;margin-top:16px;}
.mh-input{flex:1;background:#0f0b07;border:1px solid var(--line);border-radius:7px;color:var(--bone);padding:8px 10px;font-size:13px;font-family:inherit;}
.mh-input:focus{outline:2px solid var(--gold);border-color:var(--gold);}
.mh-btn{background:var(--gold);color:#1a1207;border:none;border-radius:7px;padding:8px 15px;font-family:'Rajdhani',sans-serif;font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:12.5px;cursor:pointer;}
.mh-btn:hover{background:#ffc24d;}
.mh-saved{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:11px;}
.mh-chip{display:inline-flex;align-items:center;gap:6px;background:#0f0b07;border:1px solid var(--line);color:var(--bone);font-size:12px;padding:3px 5px 3px 10px;border-radius:16px;}
.mh-chip button{background:transparent;border:none;color:var(--muted);cursor:pointer;font-size:15px;line-height:1;} .mh-chip button:hover{color:var(--ember);}
.mh-link{background:transparent;border:none;color:var(--gold);font-family:'Rajdhani',sans-serif;font-weight:600;letter-spacing:.06em;text-transform:uppercase;font-size:12px;cursor:pointer;padding:3px 4px;}
.mh-compare{max-width:1140px;margin:0 auto;padding:18px;}
.mh-ctablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px;}
.mh-ctable{border-collapse:collapse;width:100%;min-width:420px;}
.mh-ctable th,.mh-ctable td{padding:8px 12px;text-align:center;border-bottom:1px solid #241c11;font-size:13px;}
.mh-ctable thead th{background:#0f0b07;position:sticky;top:0;}
.mh-ccorner{text-align:left!important;font-family:'Rajdhani',sans-serif;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--gold-dim);font-size:11px;}
.mh-cbuild{display:flex;align-items:center;justify-content:center;gap:6px;font-family:'Rajdhani',sans-serif;font-weight:700;color:var(--bone);}
.mh-cbuild button{background:transparent;border:none;color:var(--muted);cursor:pointer;font-size:15px;} .mh-cbuild button:hover{color:var(--ember);}
.mh-ctable td:first-child,.mh-cskill{text-align:left!important;color:var(--muted);}
.mh-crow-stat td{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:15px;color:var(--bone);}
.mh-csection td{background:#0f0b07;text-align:left;font-family:'Rajdhani',sans-serif;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-dim);font-size:11px;}
.mh-ctable td.best{color:var(--gold);font-weight:700;background:rgba(240,176,62,.08);} .mh-ctable td.zero{color:#4a4030;}
.mh-loading{min-height:70vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:var(--muted);text-align:center;padding:0 20px;}
.mh-loading p{font-family:'Rajdhani',sans-serif;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--bone);margin:0;}
.mh-loading-sub{font-size:12px;max-width:340px;}
.mh-footer{max-width:1140px;margin:6px auto 0;padding:14px 18px 0;font-size:11.5px;color:var(--muted);line-height:1.6;border-top:1px solid var(--line);}
`;
