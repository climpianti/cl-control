# CL Control 3.5.3-beta.40 — card Area Pro affiancate con fotografie

Base: **beta/3.5.3-beta.39** (comprende le correzioni di navigazione e priorità del sensore con maggiore precisione). `main` resta invariato.

## Grafica Pro — ritorno alle due colonne
- Due card Area per riga anche su smartphone (griglia Home a 6/12 colonne).
- Fotografìa dell'area in alto quando configurata; in assenza di foto, titolo e icona compatti.
- Contenuto in stile Blue Tech Glass: titolo, icona, freccia e fino a quattro letture (temperatura, umidità, CO₂ e potenza) in una griglia interna 2×2.
- Etichette abbreviate su card strette, valori numerici leggibili senza taglio; card adattive su dispositivi da 320 a 1024 px.
- **Senza misurazioni:** nessun testo "Nessuna misura disponibile", nessuna riga vuota, card compatta con sola foto (se configurata) e intestazione.
- Le misure sconosciute/non disponibili sono omesse e lo zero reale `0 W` resta visibile.
- Mantiene icona, immagine, navigazione e dati in tempo reale da Home Assistant; nessun comando sui dispositivi.
- Solo per esperienza Pro; profili Essential e Standard mantengono le card native.

## Collaudo
- Test Python: la griglia Pro è a 6 colonne e i profili precedenti non cambiano.
- Test browser dedicato: due card affiancate, foto 16:9, card vuota compatta, aggiornamento W/kW, 5 larghezze (320/360/390/768/1024).
- Suite completa: Python, JS, Home, scenari, multimedia, Energia, ZIP.
- È un rilascio prerelease dopo CI verde, non un aggiornamento automatico degli impianti.

Rollback: `v3.5.3-beta.39`. Nessuna migrazione di configurazioni richiesta.
