# CL Control

**CL Control 3.5.0** è una custom integration per Home Assistant progettata per generare una dashboard nativa, ordinata e configurabile a partire dalle aree e dalle entità già presenti nell'impianto.

La versione 3.5.0 è la prima baseline pubblica stabile della nuova architettura CL Control.

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
- Modulo Sicurezza con partizioni, zone e bypass.
- **Codice Sicurezza CL** separato dal PIN Installatore.
- Accesso **Installatore** protetto da PIN hashato e salato.
- Assistenza CL contestualizzata via WhatsApp.
- Branding CL e titolo Home Assistant configurabile.
- Integrazione con **CL Power Control** e **CL Irrigation** quando presenti.

## Installazione con HACS

Quando questo repository è pubblico:

1. Apri **HACS → Integrazioni**.
2. Apri i repository personalizzati.
3. Aggiungi `https://github.com/climpianti/cl-control`.
4. Categoria: **Integration**.
5. Installa **CL Control**.
6. Riavvia Home Assistant.
7. Vai in **Impostazioni → Dispositivi e servizi → Aggiungi integrazione**.
8. Cerca **CL Control** e completa la configurazione guidata.

Non sono necessari `panel_custom`, file in `/config/www/cl_control` o configurazioni YAML legacy.

## Installazione manuale

Copia `custom_components/cl_control` in `/config/custom_components/cl_control`, riavvia Home Assistant e aggiungi l'integrazione dalla UI.

## Profili

### Essential
Comandi principali senza telemetria ambientale/potenza sulle card delle aree.

### Standard
Aggiunge temperatura, umidità, CO₂ e presenza quando disponibili.

### Pro
Aggiunge anche la potenza istantanea aggregata della casa e delle aree quando configurata.

## Installatore

La sezione Installatore permette di configurare senza modificare manualmente Lovelace:

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

Il Codice Sicurezza CL autorizza l'azione nell'interfaccia CL Control; il comando reale viene poi inviato all'entità Home Assistant rispettando il comportamento dell'integrazione sottostante.

## Privacy e assistenza

L'assistenza WhatsApp prepara richieste contestualizzate e applica una redazione di base dei dati sensibili prima della composizione del messaggio.

La parte AI è predisposta nell'architettura ma **non effettua chiamate OpenAI reali in questa release stabile**.

## Compatibilità

CL Control 3.5.0 è stato validato sugli ambienti Home Assistant recenti utilizzati durante lo sviluppo. La compatibilità con versioni precedenti non è garantita finché non viene esplicitamente testata.

## Segnalazioni

Per bug e richieste di miglioramento usa la sezione **Issues** del repository.

## Versione

**3.5.0 — Stable**

Vedi [CHANGELOG.md](CHANGELOG.md).
