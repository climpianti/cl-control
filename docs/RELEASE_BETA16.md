Beta di collaudo basata sulla beta.15, con il nuovo editor scenari luci.

### Creazione e attivazione

1. **Scegli le luci** raggruppate per ambiente.
2. **Regola le luci**: acceso/spento, percentuale e soli controlli supportati (RGB, RGBW/RGBWW e bianchi, Kelvin, HS/XY, effetti). **Usa stato attuale** copia le impostazioni nella bozza.
3. **Nome e riepilogo → Salva scenario** memorizza le impostazioni senza azionare le luci.

Dopo il salvataggio si torna a **I tuoi scenari**. Il pulsante **Avvia** richiede conferma prima di applicare le impostazioni ai dispositivi. Gli aggiornamenti realtime non sovrascrivono la bozza; errori di salvataggio la conservano.

Il nuovo salvataggio controlla lato server capacità, disponibilità, permessi e quote per tutte le luci. Archivio versione 1, scenari esistenti, preferiti e API precedenti conservati. Include tutte le correzioni Energia della beta.15.

### Installazione

Richiede Home Assistant >= 2026.9.0. Prima dell'aggiornamento creare un backup. In HACS/Marketplace abilitare le prerelease e scegliere **3.5.3-beta.16**. In alternativa verificare lo ZIP allegato con `SHA256SUMS.txt`, quindi sostituire la sola cartella `custom_components/cl_control`.

Riavviare Home Assistant per registrare il nuovo comando di salvataggio e ricaricare il browser. Versione attesa **3.5.3-beta.16**, revisione frontend **3.5.3-beta.16-r1**. Per il rollback reinstallare beta.15 e riavviare; non modificare `.storage`.

### Verifiche

110 test Python offline; browser con API simulate su Home, luci, scenari ed Energia; regressioni Recorder. Editor verificato a 320, 390, 768, 1024, 1440 e 1920 px: on/off, percentuale, colori e bianchi, copia stato, cambio capacità, indisponibilità, focus/cursore durante realtime, errori, annullamento, salvataggio e Avvia con conferma. Le procedure GitHub eseguono i test prima della pubblicazione.

Le prove responsive sono emulazione desktop, non telefono fisico; le fixture non riproducono l'intero runtime HA. Lo ZIP contiene solo l'integrazione, senza configurazione, credenziali o screenshot della demo. Il ramo stabile resta invariato.

[Guida al collaudo](https://github.com/climpianti/cl-control/blob/v3.5.3-beta.16/docs/BETA_TESTING.md) · [Editor scenari](https://github.com/climpianti/cl-control/blob/v3.5.3-beta.16/docs/SCENE_DRAFT_EDITOR.md)
