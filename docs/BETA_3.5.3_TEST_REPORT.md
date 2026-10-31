# CL Control 3.5.3-beta.1 — verifiche software

## Contenuto della beta

- Supporto `media_player` nelle aree, nei preferiti e nel sistema Multimedia.
- Card `media-control` nativa Home Assistant per i controlli supportati dai dispositivi.
- Riepilogo riproduzione/disponibilità e ordinamento installatore.
- Anteprima ETS XML riservata all'installatore; nessuna applicazione automatica.

## Verifiche riproducibili

- `python tests/run_offline.py`: 33 test superati, inclusi 7 test multimedia.
- `node tests/test_discovery_preview.mjs`: 10 controlli superati.
- AST dei 37 moduli Python dell'integrazione: valido.
- `node --check` dei 9 moduli frontend: valido.
- Parsing dei JSON dell'integrazione e `git diff --check`: superati.

Il runner offline carica soltanto moduli puri; non emula Home Assistant.
Questi controlli non costituiscono un collaudo grafico o hardware.

## Limiti della beta

Scenari persistenti da snapshot, preferiti luminosità/colore, effetti Relax,
icona luce dinamica, telecomandi proprietari, provider AI reali e Discovery
Modbus completo non sono inclusi. I controlli multimediali richiedono entità
Home Assistant esistenti e dipendono dalle capacità esposte dai dispositivi.

## Riferimenti

Build software: `73ce17d034ce174f4865916f4ed455b4acb42ccb`.
Il riferimento HACS `3.5.3-beta.1` è un ramo di distribuzione, non un tag o
una release GitHub. Il ramo `beta/3.5.3-beta.1` contiene anche la documentazione.
La versione stabile rimane sul ramo main.
