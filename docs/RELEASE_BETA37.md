# CL Control 3.5.3-beta.37 — Potenza istantanea nelle card

- Badge live W/kW sulle card Luci, Prese e Interruttori quando Home Assistant espone un sensore valido.
- Associazione conservativa tramite device registry, source switch_as_x e canale fisico (Shelly 1PM / 2PM); non mostra associazioni ambigue.
- Installatore → Potenza nelle card: Automatico, Manuale, Disattivato, con sensori anche di terze parti, KNX e Modbus.
- Sensori unknown, unavailable o in kWh non vengono visualizzati. Nessun consumo simulato.
- Nessuna modifica alle entità, alle automazioni e agli scenari esistenti.
- Test unitari Python e JavaScript, controlli completi in Actions prima della prerelease.
- Rollback: reinstallare 3.5.3-beta.36.
