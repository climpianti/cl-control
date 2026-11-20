# CL Control 3.5.3-beta.35 — telecomando Blue Tech Glass (sviluppo)

Base: beta.34 collaudata su Samsung, Fire TV/Android TV e LG webOS.

## Nuova interfaccia

- Finestra telecomando responsive in stile Blue Tech Glass, con layout dedicato a smartphone, tablet e desktop.
- Pad direzionale (su, giù, sinistra, destra, OK), comandi rapidi (Home, Menu, Indietro, Esci), volume (−, Muto, +) e canali (−, Guida, +).
- Testi, pulsanti e descrizioni accessibili; focus iniziale su OK; chiusura con pulsante o Escape; ritorno del focus alla card.
- Indicatore di disponibilità del servizio e della TV; tasti non supportati disabilitati automaticamente e aggiornamento realtime.
- Stato di invio, conferma ed errore del comando senza introdurre comandi automatici all'apertura.

## Compatibilità

Inalterate mappature remote.send_command della beta.34 e supporto LG webostv.button. Restano attive le mappature manuali dell'installatore. Nessuna modifica ai dati salvati, ai dispositivi, agli scenari o alla plancia Energia.

## Verifiche

Eseguire test Python offline, controlli JS, regressioni browser Home/luci/scenari/multimedia/Energia. Il test media include ora i gruppi del telecomando, i 15 tasti, la navigazione da tastiera, la disabilitazione offline e viewport da 320 a 1024 px.

**Non è una release:** branch dedicata e pull request in bozza. Pubblicare come prerelease e installare in HA demo soltanto dopo esito positivo dei test.
