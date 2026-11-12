# Editor scenari — sviluppo dopo beta.15

Branch: `feat/scenes-draft-editor`. Revisione frontend: `3.5.3-beta.15-scenes-editor-r1`.
Questa modifica non è ancora pubblicata o installata sulla demo.

## Percorso cliente

1. Home → Scenari luci → Crea scenario. Selezionare singole luci, raggruppate per ambiente.
2. Regola le luci: acceso/spento, luminosità e soli controlli supportati dal dispositivo. Per una luce inizialmente spenta si può impostare Accesa al 52% senza accenderla fisicamente. Usa stato attuale copia lo stato corrente nella bozza; le modifiche realtime non la sovrascrivono.
3. Nome e riepilogo → Salva scenario. Il salvataggio memorizza soltanto la bozza. Torna a I tuoi scenari, dove Avvia richiede conferma prima di applicare gli stati.

Annulla non salva. Se una luce diventa indisponibile o cambia capacità, la bozza resta conservata ma il salvataggio non è consentito finché non viene corretta la selezione o la regolazione. Le luci non incluse non vengono coinvolte.

## Contratto e compatibilità

Il nuovo comando WebSocket `cl_control/light_memories/create` riceve `name` e `states`, una mappa limitata a 32 luci. Lato server vengono validati nomi, dominio light, stato on/off, campi consentiti, capacità attuali, intervalli, permessi di lettura e controllo, disponibilità, proprietà e quote. Nessun servizio viene invocato dal salvataggio.

Il formato persistente resta `schema_version: 1`; non c'è migrazione. I comandi capture/list/apply/delete e i preferiti delle singole luci restano disponibili. L'attivazione conserva `scene.apply`, controllando di nuovo tutte le destinazioni prima dell'invio. Effetti parziali restano possibili se un dispositivo si scollega durante un'attivazione reale.

## Verifica

- Esito locale: 110 test Python superati, suite browser scenari e regressione preferiti superate, sintassi Python/JavaScript e controllo del diff superati.
- Suite Python: creazione esplicita senza comandi, persistenza e convivenza con snapshot precedenti, proprietà, permessi, quote concorrenti, dati malformati, gruppi, limiti Kelvin, effetti e rollback in caso di errore del disco.
- Browser `tests/test_scenes_guided.cjs`: sei larghezze 320/390/768/1024/1440/1920; tutti i controlli colore, canali bianchi, on/off, 52%, copia dello stato, cambio capacità, indisponibilità, nome/cursore/focus con realtime, errori, annullamento, salvataggio esplicito e Avvia con conferma.
- Browser `tests/test_light_memories_ui.cjs`: regressione dei controlli delle singole luci e dei preferiti.

Le API sono simulate. Nessun dispositivo reale è collegato ai test. Screenshot in `test-artifacts/scenes-guided/`, esclusi da Git. L'emulazione desktop non sostituisce il collaudo sul telefono o nel runtime Home Assistant completo.
