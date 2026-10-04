# Changelog

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
