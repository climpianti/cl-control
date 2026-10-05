# Changelog

## 3.5.1 — Stable

### Installazione
- Registrazione automatica frontend Lovelace.
- Creazione automatica dashboard CL Control.
- Aggiunta automatica alla sidebar.
- Corretto il tipo strategy custom:cl-control.
- Eliminata la necessità di aggiungere manualmente la risorsa Lovelace.

### Compatibilità
- Corrette letture file bloccanti nell'event loop Home Assistant.
- Aggiunta traduzione runtime inglese.

### Dashboard
- Header CL sempre primo nella Home e nelle subview.
- Telemetria e potenza spostate sotto l'header.
- Assistenza CL full-width e unificata.
- Comando generale Accendi/Spegni tutte anche in Sistema Luci per singola area.

### Sicurezza
- Nuova organizzazione per Piano e Area.
- Visibilità configurabile di partizioni e zone.
- Grafica Sicurezza migliorata.
- Controlli INIM separati per ogni partizione.
- Nome partizione INIM ricavato correttamente dall'entità.
- Modalità di inserimento lette direttamente dalle opzioni reali del select INIM.
- Possibilità di mostrare solo le partizioni desiderate.
- Gestione Risco/generica preservata.

## 3.5.0 — Stable

Prima baseline pubblica stabile della nuova CL Control.

### Dashboard
- Nuova dashboard nativa Home Assistant.
- Profili Essential / Standard / Pro.
- Header CL con meteo integrato.
- Potenza totale casa e potenza per area.
- Raggruppamento aree per Piano Home Assistant.
- Ordinamento personalizzato di aree, sistemi e dispositivi.
- Visibilità area e immagine area configurabili.
- Classificazione di prese/interruttori e domini correlati tramite “Mostra come” di Home Assistant.

### Sicurezza
- Vista Sicurezza dedicata.
- Partizioni, zone e bypass.
- Codice Sicurezza CL separato dal PIN Installatore.
- Correzione della chiamata servizi Home Assistant per inserimento/disinserimento.

### Telecamere
- Sistema Telecamere autonomo.
- Raggruppamento per area.
- Riepilogo online/non disponibile.
- Associazione contestuale alla Sicurezza.

### Installatore
- Nuova configurazione Installatore integrata nella dashboard 3.5.
- Ricerca/incolla entity_id.
- Configurazione meteo e potenza.
- Organizzazione dashboard.
- Titolo Home Assistant configurabile.

### Frontend
- Rimossa la vecchia dashboard legacy CL Control.
- Asset frontend serviti da `/cl_control_static`.
- Cache busting versionato.

### Assistenza
- Assistenza CL contestualizzata via WhatsApp.
- Backend predisposto per provider AI/hybrid; chiamate AI reali non abilitate in questa release.
