Prerelease di collaudo basata sulla beta.16.

### Novità

- **⋮ → Modifica** riapre nome, luci e regolazioni salvate. Si possono aggiungere/rimuovere luci e cambiare i valori senza eliminare lo scenario.
- **Salva modifiche** aggiorna lo stesso ID e conserva la data di creazione, senza comandare le luci. Annulla non scrive nulla; errori e conflitti conservano la bozza.
- **Avvia** evidenziato in blu/viola. Modifica ed Elimina nel menu secondario, utilizzabile anche da tastiera; conferma prima di attivare o eliminare.
- Controlli lato server su proprietà, permessi, capacità e revisione. Un'altra scheda non può sovrascrivere silenziosamente modifiche più recenti. Le destinazioni scomparse restano rimovibili dalla selezione.

Archivio versione 1, scenari e preferiti precedenti conservati. Nessuna migrazione; include le funzionalità e correzioni della beta.16.

### Installazione e ripristino

Richiede Home Assistant >= 2026.9.0. Creare un backup prima dell'aggiornamento. In HACS/Marketplace abilitare le prerelease e scegliere **3.5.3-beta.17**, oppure verificare lo ZIP allegato tramite `SHA256SUMS.txt` e sostituire la sola cartella `custom_components/cl_control`.

Riavviare HA per registrare il comando di modifica e ricaricare il browser. Versione **3.5.3-beta.17**, frontend **3.5.3-beta.17-r1**. Per rollback reinstallare beta.16 e riavviare; non modificare `.storage`.

### Verifiche

116 test Python offline; browser con API simulate su Home, luci, scenari ed Energia; regressioni Recorder. Modifica, annullamento, conflitti, persistenza, compatibilità, menu e layout controllati a 320/390/768/1024/1440/1920 px. I test GitHub precedono la creazione della prerelease.

Emulazione responsive desktop, non telefono fisico; le fixture non sostituiscono l'intero runtime HA. Nessun dispositivo reale comandato dai test. Lo ZIP contiene solo l'integrazione, senza configurazione o credenziali della demo. Ramo stabile invariato.

[Guida al collaudo](https://github.com/climpianti/cl-control/blob/v3.5.3-beta.17/docs/BETA_TESTING.md) · [Editor scenari](https://github.com/climpianti/cl-control/blob/v3.5.3-beta.17/docs/SCENE_DRAFT_EDITOR.md)
