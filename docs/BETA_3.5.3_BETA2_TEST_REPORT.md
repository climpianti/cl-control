# CL Control 3.5.3-beta.2 — verifiche software

- 64 test Python: modelli, Discovery, multimedia, scenari/preset, isolamento utenti,
  permessi, limiti, errori di persistenza, cambio capacità e recupero dei salvataggi.
- 10 controlli JavaScript della precedente anteprima Discovery superati.
- 16 controlli DOM della nuova card: selezione, salvataggio, richiamo, eliminazione,
  escaping, luce spenta, stato live e capacità dei controlli nativi.
- Chromium: gli stessi flussi su API simulate, nessun errore JavaScript,
  nessuna fuoriuscita orizzontale a 320, 390, 768 e 1200 px.
- Screenshot della fixture ispezionato a 390 px.
- Sintassi di tutti i moduli Python/JavaScript e JSON verificata.

Il test UI usa una API simulata e un segnaposto per la tile nativa: verifica
il codice della nuova card, non il rendering interno di Home Assistant.
Le verifiche offline non provano l'interazione con un dispositivo reale.

## Comandi riproducibili

```
python tests/run_offline.py
node tests/test_discovery_preview.mjs
node tests/test_light_memories_dom.cjs
node tests/test_light_memories_ui.cjs
```

I test DOM richiedono `jsdom`; i test browser richiedono `playwright` e Chromium.
`JSDOM_MODULE` può indicare il modulo jsdom installato esternamente.
`CHROMIUM_MODULE` può indicare l'entry point ESM di `@sparticuz/chromium`.
Nessuna di queste dipendenze di test viene importata dall'integrazione HA.

## Limiti

La beta supporta solo luci individuali; non include effetti RGB ciclici,
sincronizzazione tra utenti, nuovi telecomandi TV o provider AI reali.
Le attivazioni sono richieste al servizio nativo; un guasto durante l'invio
può produrre effetti parziali. La UI non dichiara il successo fisico del comando.
La cancellazione del salvataggio è permanente e richiede conferma nella UI.
