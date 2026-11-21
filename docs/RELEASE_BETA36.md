# CL Control 3.5.3-beta.36 — Nomi Shelly e Home Assistant

- Risolti nomi tecnici in card di area, sistema e scenari: LED Letto, LED Bagno e LED Cameretta.
- Priorita: alias CL Control, nome personalizzato HA, friendly_name risolto da HA, original_name, identificatore tecnico.
- Lo snapshot legge esclusivamente il metadato friendly_name; non memorizza stati dei dispositivi.
- Nessuna modifica a entity_id, automazioni, configurazioni o dispositivi.
- Test di regressione Python e suite browser, JS, Energia prima della prerelease.
- Rollback: v3.5.3-beta.35, nessuna migrazione.
