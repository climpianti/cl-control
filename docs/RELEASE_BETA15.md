Beta di collaudo basata sulla beta.14, con due correzioni nei grafici Energia 12/24 ore.

- Un totale di potenza con più sensori non mostra più il solo subtotale quando manca un campione. Usa il fallback energetico disponibile oppure lascia un intervallo senza dati; gli zeri reali sono conservati.
- Se tutte le richieste Recorder falliscono, viene segnalato l'errore senza memorizzare per cinque minuti una lettura vuota come riuscita. Al ripristino, la richiesta può essere ripetuta.

Conserva navigazione Home, scenari guidati, stile Glass, grafici 12/24 ore in kW e storico 7/30 giorni in kWh. Nessuna migrazione di impostazioni o scenari e nessuna modifica ai comandi dei dispositivi.

Richiede Home Assistant >= 2026.9.0. Prima dell'aggiornamento creare un backup. In HACS/Marketplace abilitare le prerelease e scegliere **3.5.3-beta.15**. In alternativa usare lo ZIP allegato e verificare `SHA256SUMS.txt`; il manifest deve risultare in `custom_components/cl_control/manifest.json`.

Dopo l'installazione riavviare Home Assistant e ricaricare il browser. Versione **3.5.3-beta.15**, revisione frontend **3.5.3-beta.15-r1**. Per tornare indietro reinstallare beta.14 e riavviare; non modificare `.storage`.

Verifiche: 98 test Python offline; regressioni Energia su aggregazioni incomplete, errori, ripristino, fallback, zero/assenza dati, curve e unità; controlli browser con API simulate su Home, luci, scenari ed Energia. Responsive a 320, 390, 768, 1024, 1440 e 1920 px; emulazione desktop, non telefono fisico. Le fixture non riproducono tutto il runtime Home Assistant.

La pubblicazione esegue i test prima di creare la prerelease. Lo ZIP contiene solo l'integrazione, senza configurazione, credenziali o screenshot della demo. Questa pubblicazione non aggiorna la demo né il ramo stabile.

[Guida al collaudo](https://github.com/climpianti/cl-control/blob/v3.5.3-beta.15/docs/BETA_TESTING.md) · [Changelog](https://github.com/climpianti/cl-control/blob/v3.5.3-beta.15/CHANGELOG.md)
