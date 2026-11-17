Prerelease di collaudo basata sulla CL Control 3.5.3-beta.24.

### Novita
- Supporto alle entita Home Assistant `select.*` e `input_select.*` nelle aree, nella sezione **Modalita**.
- Menu nativo `select-options`: opzioni e comando sono gestiti da Home Assistant.
- I selettori sono disponibili anche nei Preferiti.
- Le partizioni INIM riconosciute da CL Control restano escluse dai controlli generici e continuano a passare dal modulo Sicurezza.
- Il configuratore Installatore include Modalita nell'ordinamento dei dispositivi per area.

### Caso d'uso
L'helper `input_select.pdc_modalita_estate_inverno` assegnato a `sala_ced` comparira in **CL Control > Sala CED > Modalita**. Le automazioni gia presenti traducono Inverno in Shelly ON ed Estate in Shelly OFF. La release non modifica l'helper, le automazioni o il relè.

### Installazione
Richiede Home Assistant 2026.9.0 o successivo. Effettuare un backup completo prima dell'aggiornamento. Installare la prerelease 3.5.3-beta.25 da HACS/Marketplace e riavviare Home Assistant. Dopo il riavvio aggiornare la pagina CL Control o svuotare la cache del browser.

### Collaudo
1. Verificare che Sala CED mostri la sezione Modalita e il selettore Estate/Inverno.
2. Verificare che lo stato iniziale del selettore coincida con il relè.
3. Effettuare il cambio stagione solo quando l'impianto e pronto e verificare la corrispondenza relè.
4. Ripristinare la modalità iniziale e verificare nuovamente la sincronizzazione.

La commutazione fisica non viene eseguita dai test automatizzati. Collaudare su impianto reale con le condizioni idroniche e di sicurezza appropriate.
