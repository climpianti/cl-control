# CL Control 3.5.3-beta.39 — Area Pro Blue Tech Glass

Base: **v3.5.3-beta.38**. Il ramo stabile `main` non viene modificato.

## Correzione principale
Le card native Home Assistant in modalità `compact` troncano temperatura, umidità, CO₂ e potenza nelle aree su smartphone (segnalazione e verifiche sull'installazione @cohes Home Assistant).

- Nuova `cl-control-area-pro-card` per la **Home del profilo Pro**: una card per riga su smartphone, layout Blue Tech Glass, informazioni distinte e leggibili.
- Valori da stati Home Assistant aggiornati in tempo reale, senza polling e senza inviare comandi: temperatura, umidità, CO₂ e potenza totale dell'area quando presente il sensore aggregato CL Control.
- Il valore misurato di `0 W` resta visibile; `unknown`, `unavailable`, misure senza unità compatibili e dati mancanti vengono omessi. Non vengono inventate potenze o somme di sensori.
- Eventuali allarmi attivi di movimento, occupazione e presenza mostrati come indicatori di stato; la card continua ad aprire la stessa area Home Assistant.
- Mantiene icona e immagine area se configurata. L'aggiornamento dei sensori non ricrea la card.
- **Essential/Standard** continuano con le card area native di Home Assistant.
- Nessuna modifica ad `entity_id`, automazioni, aree, scenari, integrazioni energetiche o dati salvati.

## Test
- `tests/test_area_pro.py`: profili, sorgenti sensori e navigazione.
- `tests/test_area_pro.cjs`: browser su larghezze 320/360/390/768/1024, formato IT, `0 W`, `kW`, sensori non disponibili e navigazione.
- Suite precedenti Python, frontend, Multimedia, Energia, Scenari e ZIP senza regressioni.

## Distribuzione
La prerelease viene pubblicata automaticamente **solo se l'intera suite GitHub Actions supera i test**; la pubblicazione non implica installazione o riavvio dell'impianto di produzione.

Rollback: reinstallare `v3.5.3-beta.38`; nessuna migrazione richiesta.
