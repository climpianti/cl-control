# Collaudo CL Control 3.5.3-beta.17

Prerelease per provare l'interfaccia Glass su altre installazioni. Non è un aggiornamento stabile. Richiede Home Assistant >= 2026.9.0; il collaudo reale precedente alla confezione della release è stato eseguito su 2026.10.4. Non certifica ogni dispositivo o versione di HA.

## Installazione

1. Crea un backup completo Home Assistant e annota la versione CL Control precedente.
2. Usa preferibilmente un'istanza di test. L'integrazione genera una dashboard dalle entità esistenti: i suoi pulsanti possono comandare dispositivi reali.
3. Con HACS aggiungi `https://github.com/climpianti/cl-control` come repository personalizzato di tipo Integration. Abilita la visualizzazione delle prerelease e scegli **3.5.3-beta.17**. Se già installata, scegli questa versione nella procedura di riscaricamento. Su HA 2026.11 usa Marketplace nelle Impostazioni; l'eventuale avviso iniziale deve essere letto e accettato dall'utente.
4. In alternativa scarica `cl-control-3.5.3-beta.17.zip` dalla release. Controlla l'impronta nel file `SHA256SUMS.txt`. Estrai nella directory di configurazione HA: il file deve risultare in `custom_components/cl_control/manifest.json`. Sostituisci la cartella dell'integrazione, senza sovrapporre versioni diverse e senza modificare `.storage`.
5. Riavvia Home Assistant. Alla prima installazione aggiungi **CL Control** da Impostazioni → Dispositivi e servizi. Apri la dashboard generata dalla barra laterale.
6. Ricarica completamente il browser. Verifica versione **3.5.3-beta.17** e revisione degli asset **3.5.3-beta.17-r1**. Non servono risorse Lovelace manuali.

L'archivio contiene soltanto l'integrazione, senza configurazione HA, credenziali, entità o screenshot della demo. Non richiede di eliminare dispositivi. Nessun merge sul ramo stabile è necessario per provare questa prerelease.

## Test collegamento CL B&B Manager

- Installa la versione pilota CL B&B Manager che supporta operatori selezionati.
- Verifica che CL B&B Manager appaia in **Sistemi CL** soltanto quando l’integrazione è configurata e il relativo pannello è disponibile.
- Controlla da un account admin, un operatore assegnato e un altro utente. Il link deve apparire solo ai primi due.
- Cambia l’elenco degli operatori nelle opzioni B&B: la visibilità del collegamento deve adeguarsi al prossimo caricamento della dashboard.
- Il pannello B&B verifica sempre i permessi lato server, indipendentemente dalla visibilità del collegamento.

## Controlli consigliati

- **Modifica beta.17 (entità simulate):** menu ⋮ → Modifica, verificare caricamento degli stati salvati anziché quelli correnti; aggiungere/rimuovere luci, cambiare nome e regolazioni, quindi Salva modifiche. ID e data di creazione devono restare invariati. Annulla non cambia il salvataggio. Simulare un errore del disco e un aggiornamento da un'altra scheda: dati precedenti e bozza devono essere conservati. Verificare menu da tastiera, Escape e clic esterno e la nuova evidenza di Avvia.
- **Recorder beta.15 (entità simulate):** con due sensori di potenza configurati, omettere un campione oppure inviare `mean: null`: non deve apparire il subtotale come misura complessiva. Un secondo sensore con `mean: 0` è invece un campione valido. Verificare il fallback energetico quando la potenza è incompleta.
- **Errore e ripristino beta.15:** simulare il fallimento di tutte le richieste statistiche 12/24 h. Deve comparire l'errore senza memorizzare una lettura vuota riuscita. Ripristinare Recorder e ripetere la lettura; non deve essere necessario attendere la scadenza della cache. Se la potenza fallisce ma l'energia risponde, il fallback resta utilizzabile.

- **Potenza vs Energia beta.14:** su Cohes 12/24 h devono essere **kW** ("Andamento potenza"), con medie Recorder a 5 minuti, asse kW e tooltip kW. Verificare 0 W -> 0,00 kW e 540 W -> 0,54 kW, senza cambiare l'origine dei dati. Prelievo e immissione devono usare la potenza di rete firmata.
- **Fallback corretto:** senza una statistica di potenza, 0,05 kWh in 5 minuti corrispondono a 0,60 kW; se mancano entrambe le statistiche non disegnare zero. Un vero zero resta zero.
- **Storico invariato:** 7/30 giorni continuano a mostrare kWh nelle barre e nel tooltip; riepiloghi giorno/mese/anno continuano in kWh. Nessuna modifica ai comandi carichi o alle sorgenti.

- **Fedeltà al mock beta.13:** verificare bordo sfumato blu/viola, badge del grafico, legenda con quattro icone SVG, tooltip Glass con puntatore, card dei carichi e freccia di dettaglio su Android/desktop. L'anteprima ha dati illustrativi, non valori di un impianto.
- **Fedeltà ai dati:** per 12/24h la linea è solo visivamente smussata; al tocco leggere il campione effettivo. I punti FV a zero devono restare a zero e nessun tratto deve unire intervalli senza dati. Per 7/30 giorni verificare grafici a barre invariati.
- **Funzionalità:** utilizzare i controlli carichi, aprire i dettagli, verificare tooltip e assenza di overflow a 320/390/768/1024. Non comandare dispositivi reali durante i test automatizzati.

- **Energia beta.12:** provare periodi 12h/24h/7 giorni/30 giorni. Le curve dei primi due devono essere morbide ma non superare i campioni e non collegare dati mancanti; 7 e 30 giorni restano a barre. Verificare tooltip allineati, legenda, zero reale/assenza dati, visibilità in tema HA chiaro e scuro, app Android 320/390 px e desktop. Per i carichi, la barra mostra soltanto la misura relativa al massimo tra gli elementi esposti.
- **Regressione:** lo storico individuale dei carichi mantiene la navigazione per giorno, il suo dettaglio a 24h è smussato e il salvataggio degli scenari non cambia.

- **Navigazione beta.11:** nella barra superiore di CL Control devono scomparire le icone Home, Energia e Scenari luci. La Home deve mantenere i collegamenti delle card Energia e Scenari luci; aprirli e usare Indietro per tornare a Home. Ripetere con Energia non configurata: né vista né collegamento devono essere presenti.

- Scenari beta.16: scegliere le luci per ambiente, impostare acceso/spento e percentuale nel secondo passaggio, quindi nome e riepilogo. Le regolazioni non devono azionare dispositivi. Usa stato attuale copia solo nella bozza. Verificare colore/temperatura/canali bianchi secondo le capacità e il caso di sole luci spente. Dopo Salva scenario, tornare a I tuoi scenari con Avvia e conferma. Per i test di salvataggio e attivazione usare entità simulate.
- Scenari realtime: una luce selezionata che perde connessione deve bloccare Salva e poter essere rimossa; Avvia deve adeguarsi senza aggiornare manualmente l'elenco. Per questi test usare entità simulate.
- Home: nessun conteggio di dispositivi non disponibili nei riepiloghi. Senza stati noti il sottotitolo resta vuoto, senza dichiarare falsamente spento o disinserito.
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
node tests/test_energy_curves.cjs
node tests/test_energy_visual_parity.cjs
node tests/test_energy_power_series.cjs
node --test tests/test_energy_recorder_failures.cjs
node tests/test_security_climate_glass.cjs
node tests/test_home_glass.cjs
node tests/test_glass_coverage.cjs
node tests/test_installer_layout.cjs
node tests/test_energy_missing_data.cjs
node tests/test_light_memories_ui.cjs
node tests/test_scenes_guided.cjs
```

I test browser usano API simulate e segnaposto per componenti nativi HA: non collaudano l'intero runtime Home Assistant. Producono screenshot locali sotto `test-artifacts/`, esclusi dal repository. Per usare Chrome installato imposta `CL_TEST_BROWSER_CHANNEL=chrome`; `PLAYWRIGHT_MODULE` consente un percorso alternativo del modulo. `CL_BASELINE_REF` abilita screenshot di confronto dove previsti, solo se il riferimento Git contiene il relativo asset.

Il test DOM opzionale `test_light_memories_dom.cjs` richiede anche jsdom; è distinto dai test browser sopra.

### Verifiche eseguite per questa release

- 116 test Python offline, incluse modifica scenari, conflitti, compatibilità, permessi, quote, navigazione e autorizzazioni B&B: superati.
- Suite browser in Chrome tramite Playwright 1.62.1 con API simulate, incluso il nuovo percorso scenari a sei larghezze: scelta, nome, riepilogo, annullamento, conferma, errore di salvataggio, limite di 32 luci e focus/cursore durante gli aggiornamenti.
- Regressione Node sui dati energia assenti/zero: superata.
- Sintassi di tutti i moduli frontend e test browser: verificata. Archivio ZIP: integrità, versioni, asset richiesti e impronta SHA256 verificati.
- Test DOM aggiuntivo con jsdom non eseguito in questa preparazione perché la dipendenza non era disponibile.

Le verifiche sono emulazione responsive desktop, non test su telefono fisico. I controlli nativi Home Assistant nelle fixture sono sostituiti da segnaposto; il runtime completo e ulteriori installazioni restano oggetto del collaudo della beta. La confezione della release non aggiorna la demo.

## Segnalazioni e ripristino

Apri una Issue indicando versione HA, versione CL Control, browser, pagina, capacità dell'entità interessata, passaggi e risultato atteso/ottenuto. Allega screenshot ritagliati e messaggi di errore privati dei dati sensibili. Non allegare token, PIN, chiavi AI, cookie o archivi `.storage`.

Per tornare indietro, seleziona la precedente versione in HACS oppure ripristina la cartella dell'integrazione dal backup e riavvia HA. Se necessario ripristina il backup completo. La beta non introduce una migrazione intenzionale dell'archivio dei preferiti o delle impostazioni.
