# CL Control

> Prerelease **3.5.3-beta.15**: corregge totali di potenza incompleti ed errori Recorder nascosti. Include scenari guidati, riepiloghi Home essenziali, Glass e il collegamento CL B&B Manager con autorizzazioni admin/operatore.
> Include la base sperimentale AI Studio/Discovery; non è un rilascio stabile.
> Le funzioni AI reali, Modbus completo, telecomandi proprietari generici ed effetti RGB
> ciclici sono ancora da implementare. Destinata a installazioni di collaudo.
> Test offline: `python tests/run_offline.py` (non emula il runtime HA).

La beta.11 nasconde la barra delle tre schede rapide Home/Energia/Scenari: **Energia** e **Scenari luci** rimangono raggiungibili esclusivamente dalle rispettive card nella Home CL Control. Il pulsante Indietro torna a Home; il menu laterale HA resta disponibile.

**Energia Blue Tech beta.12:** curve SVG monotone sui campioni storici a 12/24 ore (senza sovraoscillazione o picchi fittizi), riempimenti sfumati, tooltip Glass con serie colorate, legenda e selezione periodi migliorate. I grafici a barre di 7/30 giorni restano invariati nella logica. I carichi mostrano una barra di confronto relativo rispetto al massimo tra quelli visualizzati, non una percentuale di carico nominale. Il grafico del dettaglio giornaliero dei carichi è altrettanto smussato. Dati, statistica, comandi, nomi entità e API non cambiano. Le interruzioni dei dati non vengono trasformate in zeri.

**Energia Glass beta.13:** cornice sfumata blu/viola, iconografia SVG di FV/Casa/Prelievo/Immissione, selettori periodo e tooltip con puntatore, nuovo layout orizzontale dei carichi con freccia di dettaglio. Solo il **tracciato visualizzato** 12/24h usa un filtro triangolare di circa ±20 minuti per ridurre seghettature: i dati al tocco sono sempre originali. I periodi mancanti restano disconnessi e i campioni a zero non vengono trasformati in produzione. I grafici settimanali e mensili rimangono a barre. Nessuna modifica a dati persistenti, statistiche, calcoli, entità, API o comandi. L'anteprima è illustrativa, non coincide necessariamente con i profili di consumo reali.

**Beta.14: potenza vs energia.** I grafici **12/24 ore** visualizzano la potenza media a campioni di 5 minuti in **kW**, usando Recorder `mean` dei sensori di potenza W (FV, Casa, rete firmata; prelievo positivo/immissione negativa). Solo se una media non e disponibile viene usato il cambiamento `kWh` del medesimo intervallo per stimare la potenza media equivalente (`kWh * 12`); i dati assenti non diventano zeri. I grafici **7/30 giorni** e i riepiloghi giorno/mese/anno restano in **kWh**. Nessuna modifica ai sensori o ai controlli; stesse curve e lo stesso stile Blue Tech Glass. Il grafico 12/24h e uno storico della potenza, non una misura live ad alta frequenza.

Per installazione, aggiornamento e verifiche della beta vedere [Guida al collaudo](docs/BETA_TESTING.md).

**Beta.15: letture Recorder affidabili.** Nei grafici 12/24 ore un totale di potenza richiede un campione valido da ogni sensore configurato: se ne manca uno, viene usato il fallback energetico quando disponibile oppure rimane un intervallo senza dati. Se tutte le richieste statistiche falliscono, viene mostrato un errore senza memorizzare il risultato come una lettura vuota riuscita. Uno zero misurato resta zero. Nessuna migrazione dati; sensori, comandi e stile Glass conservati.

### Scenari luci e preferiti nella beta

**Sistemi → Scenari luci** mostra prima gli scenari personali salvati.
**Crea scenario** apre tre passaggi: selezione delle singole luci per ambiente,
nome e riepilogo. **Salva stato attuale** legge lo stato senza azionare le luci;
il riepilogo evidenzia anche gli scenari che spegneranno tutte le luci selezionate.
**Avvia** richiede conferma e riproduce gli stati
tramite Home Assistant. Il comando può avere effetti parziali se un dispositivo
si scollega durante l'esecuzione: controlla sempre il risultato.

La selezione e i comandi seguono la disponibilità realtime. Una luce selezionata
che perde la connessione può essere rimossa; il salvataggio resta bloccato finché
la selezione non è valida. Nome e cursore restano stabili durante gli aggiornamenti.
Il percorso guidato è incluso dalla prerelease beta.9.

Le schede luce compatte riflettono colore e luminosità; il pulsante dettagli apre le regolazioni. La scheda clima Glass mostra temperatura ambiente/target e apre i controlli nativi HA per modalità HVAC, preset, ventola, oscillazione e umidità, secondo le capacità reali dell'entità. La precedente `cl-control-climate-card` rimane disponibile per le configurazioni manuali.
Il canale **Bianco W** appare solo per RGBW; la temperatura solo se supportata.
La lampadina apre i controlli completi HA. La **stella** apre i preferiti:
**Salva preferito** memorizza la luce accesa, luminosità e colore.
Le luci solo ON/OFF mostrano soltanto intestazione e interruttore.
Scenari e preferiti sono personali, persistenti dopo il riavvio e cancellabili.
La prima beta gestisce luci individuali, fino a 32 per scenario e 64 salvataggi
per utente. Serrature, antifurto, clima e gruppi aggregati sono esclusi.
I salvataggi sono ricette CL Control e non creano entità `scene.*`.


**CL Control 3.5.1** è una custom integration per Home Assistant progettata per generare una dashboard nativa, ordinata e configurabile a partire dalle aree e dalle entità già presenti nell'impianto.

La versione 3.5.1 aggiorna la baseline pubblica stabile della nuova architettura CL Control con installazione frontend e dashboard automatica.

## Funzioni principali

- Dashboard nativa Home Assistant generata automaticamente.
- Profili **Essential**, **Standard** e **Pro**.
- Aree raggruppate automaticamente per **Piano** usando il Floor Registry di Home Assistant.
- Ordinamento personalizzato di aree, sistemi e dispositivi.
- Possibilità di nascondere singole aree e mostrare/nascondere la relativa immagine.
- Classificazione coerente con **Mostra come** di Home Assistant:
  - Luci
  - Prese
  - Interruttori
  - Aperture
  - Ventilatori
  - Serrature
  - Sirene
  - Valvole
- Meteo integrato nell'header, con selezione automatica o manuale dell'entità `weather.*`.
- Potenza totale casa e potenza per area con modalità automatica, manuale o disattivata.
- Ricerca rapida delle entità nel configuratore Installatore.
- Telecamere raggruppate per area con riepilogo online/non disponibile.
- Modulo Sicurezza con partizioni, zone e bypass; supporto per `alarm_control_panel` e logiche specifiche Risco/INIM presenti nella build.
- **Codice Sicurezza CL** separato dal PIN Installatore.
- Accesso **Installatore** protetto da PIN hashato e salato.
- Assistenza CL contestualizzata via WhatsApp.
- Branding CL e titolo Home Assistant configurabile.
- Integrazione con i moduli dell'ecosistema **CL Power Control** e **CL Irrigation** quando presenti.

## Requisiti

- Home Assistant **2026.9.0 o successivo** per questa beta.
- Collaudo reale eseguito su Home Assistant **2026.10.4**; altre versioni e integrazioni richiedono verifica.
- Browser moderno per le card frontend incluse.

> La compatibilità con versioni Home Assistant precedenti non è garantita finché non viene esplicitamente testata.

## Installazione con HACS

HACS installa CL Control come custom integration:

1. Apri **HACS → Integrazioni**.
2. Apri il menu dei repository personalizzati.
3. Aggiungi:
   `https://github.com/climpianti/cl-control`
4. Categoria: **Integration**.
5. Installa **CL Control**.
6. Riavvia Home Assistant.
7. Vai in **Impostazioni → Dispositivi e servizi → Aggiungi integrazione**.
8. Cerca **CL Control** e completa la configurazione guidata.

CL Control registra automaticamente il proprio frontend Lovelace. Dopo la configurazione crea automaticamente la dashboard CL Control e la mostra nella sidebar. Non è necessario aggiungere manualmente risorse Lovelace.

Non sono necessari `panel_custom` legacy, file in `/config/www/cl_control` o configurazioni YAML legacy.

## Installazione manuale

Copia la cartella:

```text
custom_components/cl_control
```

in:

```text
/config/custom_components/cl_control
```

La struttura finale deve contenere, tra gli altri:

```text
/config/custom_components/cl_control/manifest.json
/config/custom_components/cl_control/__init__.py
/config/custom_components/cl_control/frontend/
```

Riavvia Home Assistant e aggiungi l'integrazione dalla UI.

## Prima configurazione

Il Config Flow richiede:

- nome impianto;
- eventuale nome cliente;
- contatto assistenza;
- profilo esperienza;
- impostazioni branding;
- PIN Installatore.

Il PIN Installatore viene memorizzato esclusivamente come hash salato.

## Dashboard e profili

### Essential
Interfaccia essenziale con comandi principali e senza telemetria ambientale/potenza sulle card delle aree.

### Standard
Aggiunge i dati ambientali disponibili, come temperatura, umidità, CO₂ e presenza.

### Pro
Aggiunge anche la potenza istantanea aggregata della casa e delle aree, quando configurata.

## Installatore

La sezione Installatore consente di configurare senza modificare manualmente Lovelace:

- profilo dashboard;
- organizzazione e ordinamento;
- visibilità e immagini delle aree;
- meteo;
- potenza totale e per area;
- telecamere;
- Codice Sicurezza CL;
- nome/titolo dell'impianto;
- assistenza.

## Sicurezza

CL Control utilizza un proprio codice di autorizzazione lato interfaccia, separato dal codice della centrale. Il comando reale viene poi inviato all'entità Home Assistant rispettando il comportamento dell'integrazione sottostante.

I bypass di zona vengono esposti solo quando CL Control riesce ad associarli in modo coerente alla zona/dispositivo supportato.

## Privacy e assistenza

L'assistenza WhatsApp prepara richieste contestualizzate e applica una redazione di base dei dati sensibili prima della composizione del messaggio.

La parte AI è predisposta nell'architettura ma **non effettua chiamate OpenAI reali in questa release stabile**.

## Aggiornamenti

Per installazioni HACS, gli aggiornamenti verranno distribuiti attraverso il repository CL Control.

Prima di aggiornare un impianto di produzione è consigliato effettuare un backup Home Assistant.

## Segnalazioni

Per bug e richieste di miglioramento usa la sezione **Issues** del repository GitHub.

## Versione

**3.5.3-beta.10 — Prerelease**. La precedente baseline stabile rimane 3.5.1.

Vedi [CHANGELOG.md](CHANGELOG.md) per le modifiche principali.
