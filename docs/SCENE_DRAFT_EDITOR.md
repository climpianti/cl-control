# Editor scenari — beta.17

Branch: `beta/3.5.3-beta.17`. Revisione frontend: `3.5.3-beta.17-r1`.
L'installazione richiede il riavvio di Home Assistant per registrare il nuovo comando di salvataggio e il ricaricamento del browser per i nuovi controlli.

## Percorso cliente

1. Home → Scenari luci → Crea scenario. Selezionare singole luci, raggruppate per ambiente.
2. Regola le luci: acceso/spento, luminosità e soli controlli supportati dal dispositivo. Per una luce inizialmente spenta si può impostare Accesa al 52% senza accenderla fisicamente. Usa stato attuale copia lo stato corrente nella bozza; le modifiche realtime non la sovrascrivono.
3. Nome e riepilogo → Salva scenario. Il salvataggio memorizza soltanto la bozza. Torna a I tuoi scenari, dove Avvia richiede conferma prima di applicare gli stati.

Annulla non salva. Se una luce diventa indisponibile o cambia capacità, la bozza resta conservata ma il salvataggio non è consentito finché non viene corretta la selezione o la regolazione. Le luci non incluse non vengono coinvolte.

## Contratto e compatibilità

### Modifica e azioni — beta.17

Branch `beta/3.5.3-beta.17`, revisione frontend `3.5.3-beta.17-r1`. Il menu ⋮ espone Modifica ed Elimina; il pulsante Avvia resta visibile con gradiente blu/viola. Il menu si chiude con Escape, un secondo clic o un clic esterno, senza alterare gli scenari.

Modifica carica una copia del nome e degli stati salvati, non i valori correnti dei dispositivi. Si possono aggiungere e togliere luci, cambiare regolazioni e nome; Salva modifiche conserva ID e created_at. Annulla lascia intatto il salvataggio precedente. Una destinazione non più presente resta nella selezione per poterla rimuovere.

Il nuovo comando autenticato `cl_control/light_memories/update` riceve item_id, name, states ed expected_revision. La revisione è un'impronta del nome e degli stati correnti, restituita dalla lettura senza cambiare il formato dell'archivio. Sotto lo stesso lock vengono verificati proprietà, revisione, permessi e capacità delle destinazioni, poi viene scritto l'aggiornamento completo. Un conflitto o un errore del disco non sostituisce i dati precedenti; la bozza del browser resta disponibile. L'aggiornamento è consentito anche a quota piena, perché non crea un nuovo elemento.

Verifiche aggiuntive: 116 test Python, più browser per caricamento dei valori salvati, aggiunta/rimozione luci, rinomina, annullamento, errore/conflitto, rimozione di destinazioni scomparse, menu e chiusura da tastiera/clic esterno, gerarchia grafica e sei larghezze. I test automatici usano API simulate, senza dispositivi reali.

Il nuovo comando WebSocket `cl_control/light_memories/create` riceve `name` e `states`, una mappa limitata a 32 luci. Lato server vengono validati nomi, dominio light, stato on/off, campi consentiti, capacità attuali, intervalli, permessi di lettura e controllo, disponibilità, proprietà e quote. Nessun servizio viene invocato dal salvataggio.

Il formato persistente resta `schema_version: 1`; non c'è migrazione. I comandi capture/list/apply/delete e i preferiti delle singole luci restano disponibili. L'attivazione conserva `scene.apply`, controllando di nuovo tutte le destinazioni prima dell'invio. Effetti parziali restano possibili se un dispositivo si scollega durante un'attivazione reale.

## Verifica

- Esito locale: 110 test Python superati, suite browser scenari e regressione preferiti superate, sintassi Python/JavaScript e controllo del diff superati.
- Suite Python: creazione esplicita senza comandi, persistenza e convivenza con snapshot precedenti, proprietà, permessi, quote concorrenti, dati malformati, gruppi, limiti Kelvin, effetti e rollback in caso di errore del disco.
- Browser `tests/test_scenes_guided.cjs`: sei larghezze 320/390/768/1024/1440/1920; tutti i controlli colore, canali bianchi, on/off, 52%, copia dello stato, cambio capacità, indisponibilità, nome/cursore/focus con realtime, errori, annullamento, salvataggio esplicito e Avvia con conferma.
- Browser `tests/test_light_memories_ui.cjs`: regressione dei controlli delle singole luci e dei preferiti.

Le API sono simulate. Nessun dispositivo reale è collegato ai test. Screenshot in `test-artifacts/scenes-guided/`, esclusi da Git. L'emulazione desktop non sostituisce il collaudo sul telefono o nel runtime Home Assistant completo.
