# Refinement Poker ♠

Engelstalige planning-pokerapp voor browser en Microsoft Teams. Start een kamer, deel de link, stem onafhankelijk en onthul samen. Gebouwd voor kleine teams, met maximaal 12 aangesloten deelnemers inclusief meekijkers.

## Gebruik

1. Open de app, vul je naam in en kies **Start een sessie**.
2. Deel via **Uitnodigen** de link met je team.
3. Vul het onderwerp in en kies **Opslaan**. Iedereen kiest een kaart.
4. Kies **Onthul kaarten**, bespreek verschillen en kies de afgesproken inschatting.
5. Kies **Bewaar resultaat** en daarna **Volgende ronde**.
6. Download **CSV** voordat je afsluit. De sessieleider houdt de pagina open.

Bij vernieuwen kan de sessieleider **Sessie hervatten** kiezen. Andere deelnemers kiezen **Opnieuw verbinden**. Er is geen automatische overdracht aan een andere sessieleider.

## Microsoft Teams

Het installatiepakket bevat `manifest.json`, `color.png` en `outline.png` rechtstreeks in de ZIP. De URL's zijn ingesteld op `https://annemiekdehaan.github.io/refinement-poker/`.

Upload de ZIP via **Apps → Je apps beheren → Een app uploaden → Een aangepaste app uploaden**. Menunamen kunnen per Teams-versie verschillen. Voeg de app toe als tabblad aan een chat, kanaal of vergadering en sla de configuratie op. De eerste deelnemer in zo'n tabblad wordt sessieleider. Als de organisatie het uploaden van aangepaste apps heeft uitgeschakeld, moet een Teams-beheerder het pakket beschikbaar maken. De webversie blijft zelfstandig bruikbaar.

De website moet bereikbaar zijn voordat het Teams-pakket bruikbaar is. Het pakket verleent geen toegang tot berichten, bestanden, camera of microfoon. Installatie en gedrag in de eigen Microsoft 365-tenant moeten nog worden gecontroleerd; dit is geen door Microsoft gecertificeerde Store-app.

## Publiceren op GitHub Pages

De root bevat de uitvoerbare website; er is geen server of build bij GitHub nodig. Selecteer in **Settings → Pages**: **Deploy from a branch**, branch **main**, map **/(root)**. De `.nojekyll` schakelt Jekyll-verwerking uit. Bij het huidige gratis GitHub-abonnement moet deze repository publiek zijn voor Pages. Verander de zichtbaarheid uitsluitend met toestemming van de eigenaar.

## Ontwikkelen en testen

Vereist Node.js 24 of nieuwer.

```sh
npm ci
npm test
npm run build
npm start
```

Open `http://127.0.0.1:4173`. De vastgezette runtimebibliotheken zijn lokaal meegeleverd in `vendor/`; gebruikers hoeven niets te installeren. Build en testen gebruiken npm.

```sh
cd teams
zip ../RefinementPoker-teams-app.zip manifest.json color.png outline.png
```

De tests controleren de domeinregels, het afschermen van stemmen, de host/guest-berichtenstroom, verbindingsverlies en herstel, Teams-configuratie en pakketbestanden. DOM-tests gebruiken gesimuleerde PeerJS-verbindingen; zij bewijzen geen WebRTC-werking door alle bedrijfsnetwerken of compatibiliteit met iedere Teams-tenant.

## Architectuur en privacy

Statische HTML/CSS/JavaScript, PeerJS 1.5.5 en TeamsJS 2.59.0. De publieke PeerJS Cloud verzorgt de verbindingsopbouw. WebRTC verzendt de stemgegevens rechtstreeks tussen browsers. De sessieleider beheert de kamer en stuurt deelnemers vóór onthullen alleen hun eigen stemwaarde; overige stemmen worden verborgen. De hostbrowser kent technisch alle stemmen. Geen centrale database, analytics of login. SessionStorage bewaart identiteit en hostkamer zolang het tabblad bestaat. Iedereen met de kamercode kan aansluiten.

Bedrijfsfirewalls, VPN's en bepaalde NAT-configuraties kunnen WebRTC blokkeren. Er is geen eigen TURN-relay. Test de webversie met je team op het gebruikte netwerk. Voor gegarandeerde beschikbaarheid of grotere teams is een beheerde realtime-backend de volgende stap. De app start geen betaalde diensten.

Officiële documentatie: [PeerJS](https://peerjs.com/client/getting-started), [PeerJS verbindingsbeperkingen](https://peerjs.com/client/faq), [Teams tabconfiguratie](https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/tabs/tabs-configuration).

## Licenties

Eigen broncode: MIT, zie LICENSE. Bibliotheken: zie THIRD_PARTY_NOTICES.txt. `vendor/` bevat de officiële distributies zonder bronkaartverwijzingen. Het Teams-pakket bevat alleen manifest en iconen; geen geheime sleutels.

## Versie 1.0.1

De volledige app en Teams-configuratie zijn Engels. Bij starten loopt de timer meteen 2 minuten. De sessieleider kan tijdens stemmen **Restart round** kiezen (zelfde onderwerp, lege stemmen, nieuwe timer) en na onthullen **Next round** (nieuw onderwerp, lege stemmen, nieuwe timer). De timer onthult niet automatisch; de sessieleider gebruikt **Reveal cards**.

## Versie 1.0.2

In een geconfigureerd Teams-tabblad: één Start-knop, geen naamformulier of zichtbare kamercode, automatische weergavenaam uit de Teams-context indien beschikbaar en een grote gezamenlijke timer. Als Teams geen naam levert, gebruikt de app een tijdelijke Participant-naam. Het tabblad bewaart dezelfde sessiekoppeling, ook na verlaten of verversen. De app leest niet de volledige kanaalledenlijst; alleen aangesloten deelnemers verschijnen aan tafel. In de losse webversie is een eigen naam optioneel.
