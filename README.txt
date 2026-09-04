CL CONTROL 3.3.0-dev - Home Assistant 2026.8+
==========================================

SVILUPPO UI 3.3 (baseline stabile: 3.2.3)
Questo branch include backend modulare, Customer UI 3.3.0-dev, livelli esperienza,
design system, Assistance opzionale e strumenti Installer protetti.

NOTE DI MIGRAZIONE DALLA V2
La v2 introduce un backend nativo CL Control sotto /config/custom_components/cl_control.
La configurazione della dashboard non viene piu spezzata in tanti input_text: viene
salvata in modo persistente nello storage Home Assistant. Questo elimina il limite
"Ordine entita troppo lungo" e permette di gestire molte piu entita, alias, preferiti,
classificazioni e ordinamenti.

FUNZIONI PRINCIPALI
- Auto-discovery Luci, Switch, Valve, Cover, Climate, Energia, Sicurezza e Telecamere.
- Sicurezza INIM + supporto alarm_control_panel generico/Risco.
- Luci RGB/dimmer e feedback grafico acceso.
- Switch classificati automaticamente: interruttore/presa; valve mostrate come valvole.
- In Installatore puoi forzare il tipo: interruttore, presa, luce, valvola, pompa,
  ventilazione, elettrodomestico, comando, tecnico.
- Alias locali CL Control senza rinominare l'entita Home Assistant.
- Drag & drop persistente di luci e switch senza limite dei vecchi helper.
- Ordine aree persistente.
- Per ogni area puoi decidere se il comando generale include anche switch/valvole.
- Preferiti con pulsante stella sulle luci e sui comandi.
- Home intelligente: tocco su "Luci accese" apre Luci gia filtrate su SOLO ACCESE;
  "Tapparelle aperte" apre solo quelle aperte; "Clima attivo" apre solo i climate attivi.
- Ordine dei moduli Home configurabile da Installatore.
- Energia con mappatura manuale persistente FV/Casa/Rete/Batteria.
- Temi CL Blue, Titanium, Aurora, Light, Sky, Mint, Sand, Carbon.
- Assistenza: WhatsApp, telefono, informazioni impianto.
- Area Assistente AI gia predisposta nel frontend (non attiva in questa versione).
- Nome impianto e nome cliente configurabili dalla modalita Installatore.

INSTALLAZIONE NUOVA
1. Copia la cartella custom_components/cl_control del pacchetto in:
   /config/custom_components/cl_control/

2. Copia in /config/www/cl_control/:
   cl-control-panel.js
   logo.png

3. In /config/secrets.yaml aggiungi:
   cl_control_installer_pin: "2468"
   Sostituisci 2468 con il PIN installatore desiderato.

4. In configuration.yaml aggiungi:

   cl_control:
     installer_pin: !secret cl_control_installer_pin

   panel_custom:
     - name: cl-control-panel
       url_path: cl-control
       sidebar_title: CL Control
       sidebar_icon: local:cl-impianti
       module_url: /local/cl_control/cl-control-panel.js?v=3.3.0-dev
       require_admin: false

5. Riavvia Home Assistant. Il riavvio e necessario per caricare il custom component.

6. Se usi hass-custom-icons, copia custom_icons/cl-impianti.svg in:
   /config/custom_icons/cl-impianti.svg
   e ricarica la collezione Local.
   Se non usi custom-icons, puoi temporaneamente mettere:
   sidebar_icon: mdi:home-assistant

SICUREZZA INIM
Il backend universale CL Control e separato dal backend PIN INIM.
Se l'impianto usa INIM, copia anche cl_security_backend.yaml in /config/packages/
e configura il secret cl_security_pin richiesto dal file.
Negli impianti Risco/generici questo file non serve.

ASSISTENZA
Da Installatore puoi impostare:
- Nome impianto
- Cliente
- Numero WhatsApp
- Numero telefono
La pagina Assistenza apre direttamente WhatsApp con un messaggio precompilato.
Il chatbot AI e visualizzato come funzione futura ma non invia dati a servizi esterni.

LAYOUT DASHBOARD 3.3
L'area Installatore offre un editor visuale per Home e Luci. Ogni modifica resta in
bozza fino a Salva; Annulla non scrive nello storage. Gli override Base, Smartphone,
Tablet e Wall panel ereditano dal layout generato. Le altre viste sono gia previste
dallo schema versionato e verranno collegate senza creare dashboard duplicate.
Solo un amministratore con sessione Installatore attiva puo salvare o ripristinare.

GESTURE ANALOGICHE 3.3
Gli slider condividono una soglia intenzionale configurabile in config/frontend.yaml.
Un tap o uno scroll verticale non invia comandi; il valore viene regolato solo dopo
un drag orizzontale e viene inviato una volta al rilascio. Questa regola vale anche
per i futuri controlli percentuali aggiunti al pannello.

AMBIENTE / QUALITA ARIA
La vista Clima riconosce solo sensori ambientali con metadata attendibili o override
Installer. I casi dubbi restano nella coda Da configurare e non sono mostrati al
cliente. Le soglie di temperatura, umidita, CO2, VOC, particolato, AQI, radon,
formaldeide e CO sono centralizzate in config/customer_ui.yaml; eventuali attributi
warning_threshold/critical_threshold affidabili dell'entita hanno precedenza.

NOTA
La configurazione v2 e memorizzata localmente da Home Assistant tramite helpers.storage
nello storage interno di HA. Non vengono usati token manuali e il pannello continua a
ricevere l'oggetto hass nativo dal frontend Home Assistant.
