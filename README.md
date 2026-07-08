# MH Wilds — Pianificatore di Build

App a **file singolo** (React + Babel in-browser) per pianificare build di Monster Hunter Wilds.
I dati vengono dall'API ufficiale **MHDB Wilds** (`https://wilds.mhdb.io/it`) e sono messi in cache
in `localStorage`: dalla seconda apertura funziona offline. Design "registro del cacciatore"
(oro/ossa su fondo scuro, display Rajdhani). **Local-first**: funziona senza account; con login
Supabase i dati si sincronizzano tra dispositivi.

## File in questa cartella

| File | Cos'è |
|------|-------|
| **`index.html`** | ⭐ L'app vera e propria, sorgente canonica su cui si lavora. Versione "live" (carica React/Babel/Supabase da CDN, scarica i dati dall'API). È il file da **pubblicare** per avere la sincronizzazione. |
| `mhwilds-standalone.html` | Versione **standalone/"fantasma"** generata: React + font + intero database incorporati, zero rete. È quella pubblicata come Artifact per provarla da tablet. **Non** ha la sync (l'Artifact blocca la rete). Rigenerabile con `tools/`. |
| `_legacy-source-v2.jsx` | Vecchio sorgente (DB v2), **superato**. Tenuto solo per storico; non usarlo. |
| `tools/build.js` | Genera `mhwilds-standalone.html` da `index.html` + `tools/db.json`. |
| `tools/fetch-db.js` | Riscarica e normalizza il database dall'API in `tools/db.json`. |
| `tools/db.json` | Snapshot del database congelato usato dalla standalone. |

## Come usarla / modificarla

- **Provarla in locale:** apri `index.html` nel browser (doppio clic). Serve rete alla prima apertura per scaricare il DB; poi va offline.
- **Modificare:** tutto il codice (JS + CSS) è dentro `index.html`, nel blocco `<script type="text/babel">` e nella costante `CSS`.
- **Rigenerare la versione standalone** (dopo modifiche a `index.html`):
  ```
  cd tools
  npm install        # una volta sola (scarica @babel/standalone, jsdom)
  node fetch-db.js   # opzionale: aggiorna db.json coi dati più recenti
  node build.js      # riscrive ../mhwilds-standalone.html
  ```
- **Artifact online (versione fantasma) attuale:**
  https://claude.ai/code/artifact/1b405429-e08b-4218-9f19-e4e6801ae4f4
  (privato). Per aggiornarlo: rigenera la standalone e ripubblicala con lo stesso URL.

## Funzionalità implementate (in ordine cronologico)

1. **Tracker risorse** (scheda "Risorse"): somma tutti i materiali della build — arma (intero
   albero di potenziamento) + ogni pezzo d'armatura + charm (costo cumulativo dei ranghi).
   Checklist del posseduto (contatore +/−), quanto manca, zenny totale, % completamento.
   Inventario salvato (`localStorage` `mhw_mats_owned_v1`). I **gioielli sono esclusi** (drop casuali).
2. **Rimosso il Low Rank**: armature con `rank:"low"` scartate; armi solo rarità ≥ 5 (High Rank).
3. **Scoring ridisegnato**: 3 assi — Offesa (ancorata all'**EFR reale**), Sopravvivenza, Comfort
   (qualità di vita). Voto = 58% off + 27% sopr + 15% comfort; gradi S≥86 / A≥72 / B≥56 / C≥40 / D.
4. **Filtri + ordinamento nei selettori**: armi → filtro tipo, filtro elemento/stato, ordina per
   Attacco/Affinità/Rarità/Slot/Nome; armature → ordina per Nome/Difesa/Slot. (La ricerca testuale
   c'era già.)
5. **Bonus di set visibili anche se bloccati**: con anche 1 solo pezzo si vedono le abilità del set,
   con ogni soglia marcata ✓ sbloccata (verde) o 🔒 bloccata (grigio). I bonus bloccati **non**
   contano nel punteggio.
6. **Sincronizzazione account (Supabase)**: vedi sotto. Local-first, con pannello per incollare le
   chiavi del proprio progetto, login email/password **e Google (OAuth)**, pull+merge al login, push automatico.

### Chiavi localStorage usate
`mhw_db_v5` (cache DB) · `mhw_builds_v2` (build salvate) · `mhw_mats_owned_v1` (materiali posseduti)
· `mhw_sync_cfg_v1` (URL + anon key Supabase).

---

## ⏳ IN SOSPESO: attivare la sincronizzazione (deploy + Supabase)

Il codice della sync è **già dentro `index.html` e testato**. Mancano i passaggi lato utente
(account cloud + pubblicazione), che richiedono login interattivi personali. Guida completa:

### 1. Progetto Supabase
supabase.com → New project (nome es. `mh-wilds`, salva la password del DB, regione EU).

### 2. Tabella + sicurezza per-utente (SQL Editor → Run)
```sql
create table if not exists public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  builds jsonb default '[]'::jsonb,
  owned  jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);
alter table public.user_data enable row level security;
create policy "leggi i propri dati"     on public.user_data for select using (auth.uid() = user_id);
create policy "inserisci i propri dati" on public.user_data for insert with check (auth.uid() = user_id);
create policy "aggiorna i propri dati"  on public.user_data for update using (auth.uid() = user_id);
```

### 3. Login senza conferma email (comodo per uso personale)
Authentication → Sign In / Providers → Email → disattiva **"Confirm email"** → Save.

### 4. Copia le chiavi
Project Settings → API → **Project URL** e **anon public** key.
(La anon key è pubblica: sicura nel client, la protezione la fanno le policy del punto 2.
La chiave *service_role* NON va mai nell'app.)

### 5. Pubblica l'app
Trascina `index.html` su **app.netlify.com/drop** (o altro host statico) → ottieni un URL pubblico.
In alternativa via CLI: `npm i -g netlify-cli`, poi `netlify login` (interattivo) e `netlify deploy --prod`.

### 6. Collega
Apri l'URL → "Accedi" → incolla URL + anon key → Salva → Registrati/Accedi.
Sugli altri dispositivi: stesso URL, stesse chiavi, stesso account.

### Possibili estensioni future
- Sync in **tempo reale** (Supabase Realtime): un dispositivo aggiornato all'istante mentre l'altro è aperto.
- Alternativa senza account: **esporta/importa** (file di backup o codice), funziona anche nell'Artifact.

## Note tecniche
- L'app compila il JSX nel browser con Babel standalone (comodo per un file singolo; leggero ritardo all'avvio, ok per uso personale).
- La versione standalone pre-compila il JSX e incorpora tutto (niente CDN/rete), per girare dentro l'Artifact.
- Verifiche fatte in sviluppo con jsdom + un client Supabase simulato: mount senza errori, flusso login→pull→merge(senza perdite)→push corretto.
