# MH Wilds — Pianificatore di Build

Pianificatore di build per **Monster Hunter Wilds**, in italiano. App a file singolo (`index.html`): React caricato da CDN, nessun processo di build.

## Funzionalità
- **Costruttore**: arma + 5 pezzi d'armatura + charm + gioielli, con ricerca per nome o per abilità.
- **Calcolo automatico**: abilità (con effetto per ogni livello), bonus set/gruppo, difesa, resistenze, attacco e affinità.
- **Valutazione build**: rank S–D con punteggi di Offesa (EFR) e Sopravvivenza, basati sul meta.
- **Salvataggio e confronto**: salva le build, richiamale per modificarle, confrontale in tabella.

## Dati
Scaricati dall'API ufficiale [MHDB Wilds](https://wilds.mhdb.io) al primo avvio e memorizzati in `localStorage`: dalle volte successive l'app funziona offline. Le build salvate restano nel browser.

## Uso in locale
Basta aprire `index.html` in un browser. Serve una connessione solo al primo avvio (per scaricare il database).
