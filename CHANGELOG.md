# Changelog

## 3.5.3-beta.1 — Multimedia e anteprima Discovery

- TV e lettori `media_player` nelle aree, nei preferiti e nel sistema Multimedia.
- Controlli nativi HA: capacità e disponibilità gestite dall'integrazione del dispositivo.
- Riepilogo riproduzione e disponibilità, ordinamento installatore delle entità multimedia.
- Include il ramo Discovery con importazione ETS XML e anteprima riservata all'installatore.
- Discovery non applica configurazioni e non scrive sul bus KNX.
- AI cloud/locale, identificazione Modbus, telecomandi proprietari ed effetti/scenari
  avanzati non sono inclusi in questa beta.
- Verifica offline: 33 test; sintassi Python/JS e JSON controllati.
- Ambiente di collaudo autorizzato: 192.168.1.2. Stable/main invariato.

## 3.5.2-beta.2 — Beta

La beta.2 è la beta di test consigliata della serie 3.5.2.
La beta.1 resta disponibile solo per tracciabilità e non viene modificata.
La stable consigliata rimane CL Control 3.5.1.

### Home
- Benvenuto personalizzato con utente Home Assistant.
- Preferiti / comandi rapidi.
- Ordinamento sezioni Home configurabile.
- Default: Sistemi → Aree → Sistemi CL.

### Installatore
- Nuova Installer UI2.
- Configurazioni suddivise in sezioni.
- Gestione semplificata di Energia, Sicurezza, Telecamere, Meteo e Aree.
- Ricerca e selezione entità migliorate.

### Energia
- Nuova sezione Energia app-like.
- Compatibilità realtime con CL Power Control 0.4.0-beta.5 e versioni compatibili.
- Flusso FV / Casa / Batteria / Rete.
- Direzione animazioni basata sul flusso reale.
- Stato Power Control, surplus disponibile e limite rete.
- Limite dinamico equivalente, margine disponibile e carichi sospesi.
- Statistiche da Home Assistant Energy / Recorder.
- Storico Giorno / Mese / Anno.
- Grafici 12h e 24h con risoluzione fino a 5 minuti.
- Tooltip touch persistente.
- Grafici 7 e 30 giorni a barre.
- Utenze monitorate direttamente da CL Control.
- Dettaglio storico dei singoli carichi.
- Storico interventi CL Power Control.

### Sicurezza
- Card indipendenti per partizioni INIM.
- Modalità di inserimento ricavate dalle opzioni reali.
- Raggruppamento per Piano e Area.
- Visibilità configurabile.

### Branding
- Nuovo logo CL Impianti.
- favicon.ico multi-risoluzione e favicon browser 32x32.
- Apple touch icon 180x180.
- PWA 192x192 e 512x512.
- Maskable icon 512x512.
- Gestione favicon stabilizzata.

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
