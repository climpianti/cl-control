# CL Energy Data Contract v2

## Baseline runtime

CL Control Energy usa come baseline di riferimento **CL Power Control v0.4.0-beta.5**.
La compatibilità viene determinata soprattutto dalle capability realmente esposte, non da un confronto rigido della stringa versione.

Architettura:

- **CL Power Control** = motore e sorgente realtime autorevole per Power/Energy Control.
- **Home Assistant Energy + Recorder/Long-Term Statistics** = sorgente autorevole per kWh e storico.
- **CL Control** = normalizzazione, diagnostica e interfaccia utente; non replica le logiche di distacco/riattivazione.

## Priorità provider

Realtime:

1. CL Power Control quando espone la metrica.
2. Home Assistant Energy per FV/rete/batteria come fallback.
3. Aggregati o mapping manuali CL Control dove previsto.

Storico energia:

1. Home Assistant Energy / Recorder Statistics.
2. Mapping manuale di statistic ID compatibili.

CL Control non integra automaticamente la potenza W per creare contatori kWh permanenti.

## Convenzioni realtime

| Metrica | Semantica |
| --- | --- |
| FV | positiva = produzione |
| Casa | positiva = consumo |
| Rete | positiva = prelievo, negativa = immissione |
| Batteria | positiva = scarica, negativa = carica |
| Surplus | potenza istantanea normalizzata immessa in rete |
| Margine rete | capacità residua rispetto al limite rete |
| Headroom | margine usato dal motore Power Control rispetto alla potenza di controllo |
| Limite dinamico | limite equivalente dell'abitazione con contributo della produzione locale |

## Entità realtime beta.5 usate da CL Control

CL Control individua le entità tramite gli unique_id pubblici di CL Power Control:

- `current_power`
- `control_power`
- `headroom`
- `limit`
- `warning`
- `restore`
- `effective_limit`
- `energy_status`
- `energy_grid_power`
- `energy_pv_power`
- `energy_home_power`
- `energy_import_power`
- `energy_export_power`
- `energy_surplus_power`
- `energy_battery_power`
- `energy_battery_charge_power`
- `energy_battery_discharge_power`
- `energy_battery_soc`
- `energy_grid_margin`
- `energy_flexible_available`
- `suspended_power`
- `suspended_count`
- `last_event`
- `intervention_history`
- switch `enabled`

I sensori di potenza devono essere `device_class: power`, `state_class: measurement`.
Il SOC usa percentuale / battery measurement.

## Grid-aware Power Control beta.5

La beta.5 aggiunge la modalità Power Control consapevole della rete/FV.
Quando attiva, la **potenza di controllo** segue lo scambio rete normalizzato e il backend espone anche il **limite dinamico equivalente**.
CL Control visualizza questi valori così come forniti dal backend e non li ricostruisce.

## Carichi

Per ogni carico, CL Control può usare:

- potenza istantanea;
- priorità;
- stato sospeso;
- stato comando;
- modalità energia;
- azione energia;
- auto-riattivazione;
- mai distaccabile.

Le modalità **Flessibile** e **Solo surplus** restano presentate come classificazione/diagnostica finché il backend non esegue realmente l'attuazione automatica prevista.

## Storico interventi

Lo storico persistente di CL Power Control resta il riferimento per gli interventi tecnici di distacco/riattivazione. CL Control lo visualizza senza duplicarlo.

## Long-Term Statistics

Per i riepiloghi e i grafici CL Control usa gli statistic ID configurati in Home Assistant Energy:

- produzione FV;
- import rete;
- export rete;
- carica batteria;
- scarica batteria;
- eventuale contatore consumo casa.

CL Control verifica l'esistenza degli statistic ID tramite Recorder.

### Consumo casa giornaliero

Se esiste un contatore energia casa autorevole viene usato direttamente.
In assenza di tale contatore, CL Control può derivare **solo a fini di presentazione** il consumo per intervallo dal bilancio:

`Casa = FV + Import rete + Scarica batteria - Export rete - Carica batteria`

### KPI di presentazione

- Autoconsumo: `(FV - Export) / FV`
- Autosufficienza: `(Casa - Import) / Casa`

Sono KPI grafici di CL Control e non modificano il comportamento del motore.

## Utenze monitorate da CL Control

CL Control può configurare utenze energetiche indipendenti da CL Power Control.
Queste utenze sono esclusivamente di presentazione/monitoraggio e **non** entrano in priorità, distacchi, riattivazioni o logiche surplus del motore Power Control.

Per ogni utenza possono essere configurati:

- nome;
- area;
- sensore potenza W opzionale;
- sensore energia kWh opzionale compatibile con Long-Term Statistics;
- entità comando manuale opzionale (`switch` / `light`);
- icona;
- visibilità nella pagina Energia;
- inclusione nella classifica.

Il sensore potenza alimenta la classifica realtime. Il sensore energia, quando Recorder espone una statistica valida, consente di mostrare il consumo del giorno senza creare contatori duplicati in CL Control. L'eventuale comando manuale non rende l'utenza gestita da CL Power Control.

La pagina cliente unifica quindi due origini:

- **Power Control** = carichi gestiti dal motore;
- **Monitorato** = utenze aggiunte nell'Installatore CL Control.

## Energy UI v1

La prima vista cliente Energia comprende:

- flusso realtime FV / Casa / Batteria / Rete;
- produzione e consumo istantanei;
- riepilogo energia di oggi;
- autoconsumo e autosufficienza;
- stato Power Control;
- potenza di controllo;
- limite rete;
- limite dinamico equivalente;
- headroom e margine rete;
- surplus e disponibilità carichi flessibili;
- carichi sospesi;
- grafici 24h / 7 giorni / 30 giorni;
- classifica realtime dei carichi monitorati;
- storico interventi Power Control.

La vista compare solo quando il contratto rileva almeno una capability Energia utilizzabile.


## CL Control Energy UI v2.2
- Storico riepilogo navigabile per giorno, mese e anno.
- Dettaglio carichi/utenze dal badge Monitorato/Power Control con grafico 24 h, 7 giorni e 30 giorni.
- Il dettaglio usa Recorder statistics del sensore di potenza e, quando disponibile, il sensore energia kWh associato.
- Corretto allineamento grafico del flusso FV verso Casa.
