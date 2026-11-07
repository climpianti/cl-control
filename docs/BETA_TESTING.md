# Collaudo CL Control 3.5.3-beta.7

Prerelease per provare l'interfaccia Glass su altre installazioni. Non è un aggiornamento stabile. Richiede Home Assistant >= 2026.9.0; il collaudo reale precedente alla confezione della release è stato eseguito su 2026.10.4. Non certifica ogni dispositivo o versione di HA.

## Installazione

1. Crea un backup completo Home Assistant e annota la versione CL Control precedente.
2. Usa preferibilmente un'istanza di test. L'integrazione genera una dashboard dalle entità esistenti: i suoi pulsanti possono comandare dispositivi reali.
3. Con HACS aggiungi `https://github.com/climpianti/cl-control` come repository personalizzato di tipo Integration. Abilita la visualizzazione delle prerelease e scegli **3.5.3-beta.7**. Se già installata, scegli questa versione nella procedura di riscaricamento.
4. In alternativa scarica `cl-control-3.5.3-beta.7.zip` dalla release. Controlla l'impronta nel file `SHA256SUMS.txt`. Estrai nella directory di configurazione HA: il file deve risultare in `custom_components/cl_control/manifest.json`. Sostituisci la cartella dell'integrazione, senza sovrapporre versioni diverse e senza modificare `.storage`.
5. Riavvia Home Assistant. Alla prima installazione aggiungi **CL Control** da Impostazioni → Dispositivi e servizi. Apri la dashboard generata dalla barra laterale.
6. Ricarica completamente il browser. Verifica versione **3.5.3-beta.7** e revisione degli asset **3.5.3-beta.7-r1**. Non servono risorse Lovelace manuali.

L'archivio contiene soltanto l'integrazione, senza configurazione HA, credenziali, entità o screenshot della demo. Non richiede di eliminare dispositivi. Nessun merge sul ramo stabile è necessario per provare questa prerelease.

## Controlli consigliati

- Home e aree: intestazioni, meteo, Assistenza, nomi lunghi, card native e collegamenti Installatore visibili solo agli utenti autorizzati.
- Luci: riepilogo compatto, colore/intensità, dettagli e preferiti coerenti con le capacità dell'entità.
- Aperture: pulsanti disponibili, icona e percentuale aggiornate; una modifica alla percentuale deve restare una bozza fino ad Applica.
- Clima: stato caldo/freddo/off e dettagli coerenti con HVAC, ventola, preset, oscillazione e umidità effettivamente supportati.
- Multimedia e sicurezza: dettagli, telecomando quando disponibile, stato offline e autorizzazioni.
- Energia: flussi, dati assenti rispetto a zero, grafici e storico, ridimensionamento delle finestre.
- Installatore, Discovery e Modbus: nessuna sovrapposizione, barra Salva leggibile, annullamento senza salvataggi accidentali. KNX rimane fuori dal menu cliente.
- Layout alle larghezze 320, 390, 768, 1024, 1440 e 1920 px, focus, scorrimento e aggiornamenti realtime. L'emulazione responsive non sostituisce un test su telefono fisico.

Il primo collaudo può limitarsi a navigazione e apertura dei dettagli. Esegui test di comando soltanto su entità simulate o su dispositivi esplicitamente destinati al collaudo.

## Verifiche riproducibili per sviluppatori

Esegui dalla radice del repository:

```text
python tests/run_offline.py
npm install --no-save playwright@1.62.1
npx playwright install chromium
node tests/test_media_glass.cjs
node tests/test_cover_glass.cjs
node tests/test_energy_schematic.cjs
node tests/test_security_climate_glass.cjs
node tests/test_home_glass.cjs
node tests/test_glass_coverage.cjs
node tests/test_installer_layout.cjs
node tests/test_energy_missing_data.cjs
node tests/test_light_memories_ui.cjs
```

I test browser usano API simulate e segnaposto per componenti nativi HA: non collaudano l'intero runtime Home Assistant. Producono screenshot locali sotto `test-artifacts/`, esclusi dal repository. Per usare Chrome installato imposta `CL_TEST_BROWSER_CHANNEL=chrome`; `PLAYWRIGHT_MODULE` consente un percorso alternativo del modulo. `CL_BASELINE_REF` abilita screenshot di confronto dove previsti, solo se il riferimento Git contiene il relativo asset.

Il test DOM opzionale `test_light_memories_dom.cjs` richiede anche jsdom; è distinto dai test browser sopra.

### Verifiche eseguite per questa release

- 89 test Python offline: superati.
- Otto suite in Chrome tramite Playwright 1.62.1 con API simulate: multimedia, aperture, energia, sicurezza/clima, Home/header/Assistenza, copertura Glass, sovrapposizioni Installatore e luci/preferiti. Superate; layout responsive verificato alle sei larghezze indicate.
- Regressione Node sui dati energia assenti/zero: superata.
- Sintassi di tutti i moduli frontend e test browser: verificata. Archivio ZIP: integrità, versioni, asset richiesti e impronta SHA256 verificati.
- Test DOM aggiuntivo con jsdom non eseguito in questa preparazione perché la dipendenza non era disponibile.

Le verifiche sono emulazione responsive desktop, non test su telefono fisico. I controlli nativi Home Assistant nelle fixture sono sostituiti da segnaposto; il runtime completo e ulteriori installazioni restano oggetto del collaudo della beta. La confezione della release non aggiorna la demo.

## Segnalazioni e ripristino

Apri una Issue indicando versione HA, versione CL Control, browser, pagina, capacità dell'entità interessata, passaggi e risultato atteso/ottenuto. Allega screenshot ritagliati e messaggi di errore privati dei dati sensibili. Non allegare token, PIN, chiavi AI, cookie o archivi `.storage`.

Per tornare indietro, seleziona la precedente versione in HACS oppure ripristina la cartella dell'integrazione dal backup e riavvia HA. Se necessario ripristina il backup completo. La beta non introduce una migrazione intenzionale dell'archivio dei preferiti o delle impostazioni.
