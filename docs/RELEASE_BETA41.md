# CL Control 3.5.3-beta.41 — consolidamento card Area Pro

Base: `v3.5.3-beta.40`, più le correzioni sul ramo di sviluppo successive al tag. `main` resta alla versione stabile 3.5.1.

## Card Area Pro in due colonne
- Conferma del layout approvato: due card Area affiancate, foto in alto, titolo e quattro metriche (temperatura, umidità, CO₂, potenza) in 2×2.
- **Nessuna misurazione disponibile:** la sezione metriche non viene renderizzata, la card resta compatta. Non compare il messaggio "Nessuna misura disponibile".
- Riduzione dei ritagli su schermi stretti: le misurazioni numeriche lunghe possono andare a capo tra valore e unità, senza troncamenti.
- Formattazione italiana CO₂ con interi, valori W/kW anche 0 W, preferenza per sorgenti temperatura/umidità con maggiore precisione.
- Navigazione garantita da Home sia da `/cl-control` sia da `/cl-control/home`.
- Stessa compatibilità di beta.40: solo profilo Pro; Essential/Standard invariati; zero modifiche alle entità e alle automazioni.

## Collaudo
- Test Python delle card Area e dei profili.
- Browser Playwright su 320/360/390/768/1024 px: due colonne, immagine 16:9, card senza sensori compatta, quattro valori, unità lunghe senza overflow e navigazione.
- Suite completa di regressioni CL Control (Home, Luci, Multimedia, Energia, Scenari, Installer, Core B&B) e validazione ZIP.

Prerelease automatica solo dopo CI verde. Nessun aggiornamento automatico degli impianti Home Assistant.

Rollback: reinstallare `v3.5.3-beta.40`; nessuna migrazione dei dati.
