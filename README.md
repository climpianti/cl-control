# CL Control

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

- Home Assistant con supporto alle API frontend/registry utilizzate dalla versione corrente.
- È consigliata una versione Home Assistant recente sul ramo 2026.9/2026.10 utilizzato durante lo sviluppo.
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

**3.5.1 — Stable**

Vedi [CHANGELOG.md](CHANGELOG.md) per le modifiche principali.
