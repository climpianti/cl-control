# CL Control 3.5.3-beta.1 — verifica del 31 ottobre 2026

## Modifiche pronte

- `media_player` incluso nel modello delle aree, nella pagina Multimedia e nei preferiti.
- Rendering tramite `media-control` nativo: nessun comando proprietario inventato.
- Riepilogo riproduzione/disponibilità e ordinamento installatore.
- Include il ramo esistente Discovery con anteprima ETS XML e controlli di accesso.
- Namespace asset e versione aggiornati a 3.5.3-beta.1.

## Test eseguiti

- `python tests/run_offline.py`: 33/33 superati, inclusi 7 test multimedia.
- `node tests/test_discovery_preview.mjs`: 10/10 controlli superati.
- AST di 37 moduli Python dell'integrazione: valido.
- `node --check` dei 9 moduli frontend: valido.
- Tutti i JSON dell'integrazione: parsing valido.
- `git diff --check`: superato.

I test offline caricano solo i moduli puri evitando l'entry point Home Assistant;
non simulano l'avvio dell'integrazione o l'esecuzione di servizi HA.

## Stato dell'istanza beta

Ambiente autorizzato dall'utente: **192.168.1.2**, HA 2026.10.4.
CL Control 3.5.2-beta.2 risulta caricato; API dashboard operativa con 6 aree.
Configurazione HA valida durante la verifica preliminare. Presenti avvisi branding
e un riavvio richiesto da SENEC. Nessuna entità `media_player` presente.

La nuova build **non è stata installata né collaudata nel runtime HA**.
Nessun dispositivo è stato azionato e nessun riavvio è stato eseguito.

## Distribuzione ancora da eseguire

Ramo locale: `beta/3.5.3-beta.1`, derivato da `feature/cl-discovery-mvp-0.1`.
La revisione automatica ha rifiutato il push su GitHub per assenza di consenso
esplicito alla pubblicazione dei sorgenti. Ricerca successiva sul repository:
il ramo remoto `beta/3.5.3-beta.1` non esiste.

Dopo autorizzazione alla pubblicazione: distribuire il ramo beta tramite HACS,
verificare la versione scaricata, validare la configurazione e riavviare HA.
Quindi rileggere modello/versione, aree, opzioni, risorse e log.
Il rollback dei soli sorgenti è la reinstallazione HACS di `v3.5.2-beta.2`
seguita da riavvio; questa beta non introduce una migrazione dei dati.

Resta da verificare che HACS accetti il ref del ramo tramite il plugin;
se non lo accetta, preparare una prerelease prima della distribuzione.

## Funzioni ancora da sviluppare/collaudare

- Scenari persistenti ottenuti dallo stato attuale e preferiti luminosità/colore.
- Effetti RGB Relax e icona luce dinamica.
- Telecomandi specifici Samsung/LG/Sony oltre ai controlli HA nativi.
- Provider AI reali cloud/locale e Discovery Modbus completo con profili verificati.
- Collaudo grafico su browser e test su TV reali: non eseguiti.
