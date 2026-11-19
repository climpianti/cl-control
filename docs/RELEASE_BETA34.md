# CL Control 3.5.3-beta.34 — Telecomandi per piattaforma (collaudo)

Base: `v3.5.3-beta.33`. La branch beta.34 non modifica `main`.

- Conserva l'associazione automatica dei remote appartenenti al medesimo dispositivo e la priorità dell'associazione manuale.
- Inoltra alla card anche la piattaforma effettiva dell'entità `remote.*` (non solo quella di `media_player.*`).
- Mappa i pulsanti Samsung Smart TV su `KEY_*`; Fire TV con integrazione Android Debug Bridge (`androidtv`) su `HOME`, `UP`, `CENTER`, ecc.; Android TV Remote (`androidtv_remote`) su `DPAD_*`.
- Rispetta per singolo pulsante i comandi personalizzati dall'installatore.
- Non invia comandi non conosciuti: i tasti senza profilo e senza mappatura sono disabilitati.
- L'associazione manuale di `remote.*` ha precedenza sul telecomando LG automatico; in assenza di override LG webOS non cambia.
- La lista di suggerimenti della pagina Installatore segue le stesse piattaforme supportate dalla generazione dashboard.
- Test Python per mapping e precedenza manuale; test browser simulati per le tre famiglie di telecomandi.

## Limiti del collaudo

I test browser simulano i servizi HA, non certificano che ogni tasto venga accettato dalla TV reale. Prima della pubblicazione eseguire test offline Python/JS e collaudo manuale su Samsung Camera da letto, Fire TV Cucina e LG Salotto, senza comandi automatici di accensione. Verificare particolarmente che la Fire TV con piattaforma `androidtv` usi i codici Android ADB e non i codici `DPAD_*` dell'integrazione diversa `androidtv_remote`.

Documentazione Home Assistant: `samsungtv`, `androidtv`, `androidtv_remote` e `remote.send_command`.
