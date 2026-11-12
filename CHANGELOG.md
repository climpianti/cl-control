# Changelog

## In sviluppo — Editor scenari con regolazioni nella bozza

- Creazione in tre passaggi: luci per ambiente, acceso/spento e regolazioni supportate, nome e riepilogo.
- Luminosità, RGB/RGBW/RGBWW con canali bianchi, temperatura Kelvin, HS/XY ed effetti disponibili; nessun comando ai dispositivi durante composizione e salvataggio.
- Bozza indipendente dal realtime, copia esplicita dello stato attuale, validazione delle capacità e conservazione in caso di errore.
- Ritorno all'elenco dopo il salvataggio con indicazione del pulsante Avvia; conferma prima dell'attivazione.
- Nuovo comando autenticato `light_memories/create`, con permessi per tutte le luci e validazione lato server. Archivio versione 1 e API precedenti conservati.

## 3.5.3-beta.15 — Dati Recorder incompleti ed errori di lettura

- I totali di potenza con più sensori restano mancanti quando un campione è incompleto, anziché mostrare il solo subtotale disponibile; il fallback energetico rimane utilizzabile.
- Se tutte le richieste Recorder del grafico 12/24 h falliscono, viene segnalato l'errore senza memorizzare il risultato come una lettura vuota riuscita.
- Regressioni dedicate per dati parziali, zero reale, errore e ripristino delle letture; incluse nella pipeline generale e nella pubblicazione della prerelease.
- Revisione frontend `3.5.3-beta.15-r1`. Rollback: beta.14.

## 3.5.3-beta.14 — Distinzione fra potenza in kW e storico energia in kWh

- I grafici 12 h e 24 h mostrano potenza media ogni 5 minuti in **kW**, con tooltip e asse corretti e titolo "Andamento potenza".
- Le statistiche di potenza vengono lette da Recorder (`mean`, `W`), con dati CL Power Control o Home Assistant Energy; la rete firmata viene separata in prelievo/immissione.
- Se e solo se una media di potenza non e disponibile, il `change` energetico di un intervallo Recorder di 5 minuti viene convertito in potenza media `change_kWh * 12`; valori assenti restano null.
- I grafici 7/30 giorni mantengono le barre in **kWh**, e lo storico dei giorni, dei mesi e degli anni resta in **kWh**. Nessun nuovo contatore o modifica backend.
- Test per sorgenti dirette, conversioni, valori nulli/zero, segno rete, periodi e tooltip. Revisione asset `3.5.3-beta.14-r1`. Rollback: beta.13.


## 3.5.3-beta.13 — Restyling Energia fedele all'anteprima

- Cornice Glass sfumata blu elettrico/viola e bagliori perimetrali, titolo con icona in badge e migliore composizione.
- Legenda con icone SVG (FV, Casa, Prelievo, Immissione), tooltip con puntatore alla selezione e pulsanti periodo in vetro.
- Curve 12/24 h visivamente smussate con filtro triangolare ±20 minuti sui campioni ravvicinati. I valori nei tooltip sono quelli originali; gli zeri rimangono tali e i periodi senza dati non vengono collegati. Le serie orarie rade e i grafici 7/30 giorni restano invariati.
- Carichi con layout a riga, valore, barra relativa, icona e freccia accessibile verso il dettaglio; mantenuti tutti i comandi precedenti.
- Nuovi test visivi/funzionali; asset `3.5.3-beta.13-r1`. Nessuna migrazione o modifica backend. Rollback: beta.12.


## 3.5.3-beta.12 — Energia Blue Tech, grafici morbidi

- Andamento energia 12/24 h: curve SVG monotone (Fritsch-Carlson), senza interpolazioni negative o picchi artificiali. Intervalli senza campioni restano disconnessi; i valori zero rimangono zero. Stesse entità, periodi, unità, statistiche e tooltip aggiornabili.
- Riempimenti sfumati e halo leggero sulle serie FV (ambra), Casa (blu), Prelievo (ghiaccio), Immissione (turchese); tooltip con indicatori cromatici, pannello Glass, legenda e tab più eleganti.
- Dettaglio 24 h dei carichi: curva monotona + area trasparente; i totali 7/30 giorni continuano a barre, con bordi smussati.
- Carichi monitorati con pannelli Blue Tech e metro comparativo derivato dal valore massimo **fra i carichi mostrati**; non è la percentuale della potenza nominale. Quando la misura manca il metro non appare.
- Nuovi test di interpolazione e di valori mancanti, regressioni mobile 320–1920 px e dati simulati. Nessuna modifica a backend, azioni dispositivi, storage, scenari o permessi. Revisione asset `3.5.3-beta.12-r1`.


## 3.5.3-beta.11 — Home senza schede di navigazione in alto

- Home è l'unica vista principale Lovelace, eliminando la fila di icone Home/Energia/Scenari luci nella barra superiore nativa.
- Energia e Scenari luci sono sottoviste native con `subview: true`, `visible: false` e `back_path: home`: i collegamenti restano nelle card della Home e il pulsante Indietro torna alla Home.
- Nessuna modifica a route, controlli, autorizzazioni, scenari personali o dati energetici.
- Test di regressione per la navigazione con e senza sorgente Energia; revisione cache `3.5.3-beta.11-r1`; nessuna migrazione.


## 3.5.3-beta.10 — Contrasto scenari con tema chiaro HA

- Colori di testo espliciti sulla superficie Glass degli scenari per mantenere leggibili titoli, nomi e dettagli anche quando la card nativa HA eredita un tema chiaro.
- Regressione browser riprodotta con testo scuro nativo HA prima della correzione; il percorso guidato conserva le funzioni della beta.9.
- Cache frontend `3.5.3-beta.10-r1`.

## 3.5.3-beta.9 — Scenari guidati e riepiloghi Home

- Scenari salvati in primo piano con ambiente, conteggio delle luci e dettagli espandibili.
- Creazione separata in tre passaggi: luci per ambiente, nome, riepilogo e salvataggio esplicito dello stato attuale, senza comandi ai dispositivi.
- Avviso per uno scenario di sole luci spente; annullamento della bozza senza scritture e conservazione della bozza in caso di errore.
- Disponibilità realtime di selezione, salvataggio e avvio; possibilità di rimuovere una luce selezionata non più raggiungibile.
- Nome, selezione e cursore preservati durante gli aggiornamenti realtime e dell'elenco.
- Eliminata la dicitura di indisponibilità dai riepiloghi Home, conservando icone e grafica esistenti.
- Persistenza personale e API esistenti preservate; nessuna migrazione dell'archivio. Cache frontend `3.5.3-beta.9-r1`.
- Conservato il collegamento CL B&B Manager e le autorizzazioni della beta.8.

## 3.5.3-beta.8 — collegamento CL B&B Manager

- Riconoscimento automatico di CL B&B Manager quando la relativa Config Entry e il pannello `/cl-bb-manager` sono presenti.
- Collegamento in **Sistemi CL** per amministratori e operatori specificamente autorizzati dall’integrazione B&B.
- Link nascosto agli altri utenti; ogni azione e lettura nel pannello B&B è verificata nuovamente dal suo backend.
- Cache dashboard invalidata anche quando cambia l’elenco degli operatori.
- Nessuna variazione ai comandi di varchi, prenotazioni o installatore, e nessuna migrazione dati.
- Test offline di regressione con pipeline dedicata GitHub Actions.

## 3.5.3-beta.7 — Glass e collaudo su altre installazioni

- Stile Glass condiviso tra Home, aree, card native, luci, aperture, multimedia, clima, sicurezza, energia e configurazione; logo CL Impianti conservato.
- Luci compatte con colore e luminosità reali, regolazioni espandibili e preferiti preservati.
- Aperture con Apri/Stop/Chiudi secondo le capacità, icona dinamica, percentuale con +/- e applicazione esplicita delle modifiche.
- Clima Glass con tonalità secondo lo stato operativo e dettagli nativi HA; mantenuta la scheda clima della beta.6 per compatibilità.
- Multimedia con accesso ai dettagli e al telecomando quando supportato; sicurezza con controlli disponibili e autorizzazioni preservate.
- Energia con schema dei flussi, animazioni, grafici e storico coerenti; distinzione tra dati assenti e zero.
- Header, meteo e Assistenza uniformati; visibilità amministrativa preservata.
- Corretti sovrapposizioni Installatore/Discovery/Modbus e ingombro della barra Salva mediante altezza automatica e barra nel flusso della pagina.
- Test offline e browser con API simulate, senza comandi ai dispositivi reali. Guida per installazioni di collaudo e segnalazioni riproducibili.
- Versione minima dichiarata Home Assistant 2026.9.0; runtime reale verificato su 2026.10.4. Cache frontend `3.5.3-beta.7-r1`.

## 3.5.3-beta.6 — Scheda clima CL

- Nuova `cl-control-climate-card` coerente con lo stile Blue Tech Premium di luci e multimedia.
- Temperatura ambiente e target con regolazione `+/-` secondo `target_temp_step`, `min_temp` e `max_temp` reali.
- Modalità HVAC mostrate solo se esposte dall'entità; preset e ventola compaiono solo quando supportati.
- Stato operativo (`heating`, `cooling`, `idle`, `off`) con feedback grafico caldo/freddo e accesso al more-info nativo Home Assistant.
- Nessun comando proprietario: la card usa esclusivamente i servizi `climate.*` e le capacità dichiarate da Home Assistant.
- Cache frontend separata con revisione `3.5.3-beta.6-r1` per evitare asset obsoleti durante il collaudo.

## 3.5.3-beta.3 — Schede luce compatte

- Scheda antracite con lampadina colorata, stato e interruttore integrato.
- Barre luminosità, RGB, bianco W e temperatura mostrate in base alle capacità.
- Preferiti personali raccolti nel pannello apribile dalla stella.
- Canali RGBW preservati quando si modifica solo il colore o solo il bianco.
- Invio del comando al rilascio della barra, senza flussi di comandi durante il trascinamento.
- Archivio scenari/preferiti invariato. Nessuna migrazione.

## 3.5.3-beta.2 — Scenari luci e preferiti dimmer/RGB

- Nuova pagina Scenari luci: selezione esplicita e fotografia dello stato attuale.
- Preferiti luminosità/colore nelle card delle singole luci dimmerabili.
- Salvataggi persistenti per utente tramite Home Assistant Store.
- Attivazione tramite il servizio nativo `scene.apply`, con verifica dei permessi
  su tutte le luci prima dell'invio. Gruppi aggregati non supportati in questa beta.
- Controlli luce nativi HA per dimmer e temperatura colore; colore via more-info.
- Nessuna migrazione dei dati esistenti; archivio salvataggi separato.
- 64 test Python, verifiche DOM e test browser della nuova card su API simulate.

## 3.5.3-beta.1 — Multimedia e anteprima Discovery

- TV e lettori `media_player` nelle aree, nei preferiti e nel sistema Multimedia.
- Controlli nativi HA: capacità e disponibilità gestite dall'integrazione del dispositivo.
- Riepilogo riproduzione e disponibilità, ordinamento installatore delle entità multimedia.
- Include il ramo Discovery con importazione ETS XML e anteprima riservata all'installatore.
- Discovery non applica configurazioni e non scrive sul bus KNX.
- AI cloud/locale, identificazione Modbus, telecomandi proprietari ed effetti/scenari
  avanzati non sono inclusi in questa beta.
- Verifica offline: 33 test; sintassi Python/JS e JSON controllati.
- Distribuzione beta separata. Stable/main invariato.

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
