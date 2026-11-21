# CL Control 3.5.3-beta.38 — uniformità potenza Blue Tech Glass

Base: **v3.5.3-beta.37**, già collaudata su impianti reali. `main` invariato.

## Modifiche
- Unico stile riutilizzabile per il valore di potenza istantanea nelle card Luci, Prese e Interruttori. Spaziatura, dimensione testo, icona ⚡, accessibilità e interruzione riga coerenti anche su smartphone.
- Le card Luci aggiornano il badge senza ricreare la card; interruttori e prese usano lo stesso componente grafico.
- Valore reale di **0 W** visibile; dati sconosciuti o indisponibili nascosti; supporto W e kW invariato.
- Installatore → Potenza nelle card: anteprima della potenza letta dal sensore associato, oppure stato "non associato", "non disponibile" o "disattivato".
- L'anteprima viene aggiornata quando cambiano selezione automatica/manuale/off e stati HA senza inviare comandi.
- Il selettore Installatore propone soltanto veri sensori di potenza, con `device_class=power` e unità `W` o `kW`, allineandosi al resolver backend.
- Nessun cambiamento al riconoscimento automatico dei sensori Shelly multicanale, Switch-as-X, KNX o Modbus e nessuna migrazione delle impostazioni salvate.

## Verifica
- Test Python già presenti per discovery/mappature dei canali.
- Test JavaScript di formattazione, 0 W e dati mancanti.
- Test browser card Luci con aggiornamento dinamico del badge.
- Nuovo test browser Prese/Interruttori (W, kW, zero, `unavailable` e 4 viewport).
- Test browser Installatore, anteprima automatica/manuale/off, anche con 0 W.
- Suite regressione completa Home, Luci, Scenari, Multimedia, Energia, creazione ZIP senza rilascio.

## Stato e rilascio
Sviluppo su `beta/3.5.3-beta.38`; `main` stabile invariato. Suite GitHub Actions già superata nel dry-run (run #44909703311), comprensiva di Python, JavaScript, browser, Energia e creazione ZIP.
La pubblicazione come prerelease è gestita dal workflow `release-beta38.yml` e richiede il superamento dei test prima della creazione del tag e dell'asset ZIP. L'installazione sulla demo è un passaggio separato, da verificare dopo la pubblicazione.
Rollback: reinstallare `v3.5.3-beta.37` e riavviare Home Assistant se necessario. Nessuna migrazione dati richiesta.