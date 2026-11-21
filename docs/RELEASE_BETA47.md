# CL Control 3.5.3-beta.47 — Alexa Unified Media

Base verificata: **v3.5.3-beta.46**. Prerelease per collaudo; la stable \`main\` non viene modificata.

## Cosa cambia
- I dispositivi Echo/Alexa espongono una sola card in **Multimedia**. Un nuovo tasto Alexa apre il pannello comandi dello stesso dispositivo.
- Raggruppamento tramite *device_id* del registro HA, solo per media player della piattaforma Alexa. Non si deduce mai un'associazione da nomi simili.
- I controlli compatibili (switch, light, select, number, button) sono utilizzabili dal pannello; sensori, letture e altre entità mostrano lo stato e permettono di aprire i dettagli Home Assistant.
- Le entità raggruppate non vengono duplicate nei blocchi Interruttori, Modalità, Comandi o fra le card principali di area.
- Mantenuti override installatore, visibilità, aree esplicitamente diverse e trattamento prudente dei dispositivi ambigui; nessun cambio nel registro Home Assistant.
- Samsung, LG webOS, Android/Fire TV e lettori non Alexa mantengono telecomandi e card precedenti.

## Regressioni e limiti
- Test Python: stessa stanza, più dispositivi, separazione per device_id, visibilità, override, giocatori ambigui.
- Test browser: controlli, payload servizi, stato non disponibile, dettagli sensori e larghezze 320/390/768 px.
- Non vengono creati o modificati entity_id né dati delle automazioni. L'associazione funziona solo quando Home Assistant collega media player e comandi allo stesso *device_id*.
- In presenza di due lettori Alexa nello stesso device HA il raggruppamento resta disattivato: è preferibile un comando separato a un'associazione erronea.

**Rollback:** installare nuovamente la versione 3.5.3-beta.46.
