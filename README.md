# 🛒 Boodschappenlijstjes PWA

Boodschappenlijstjes is een snelle, moderne en betrouwbare Progressive Web App (PWA), gebouwd om samen boodschappen te doen zonder gedoe. De app combineert het gebruiksgemak van een overzichtelijk digitaal lijstje met de kracht van realtime synchronisatie in de cloud en offline ondersteuning voor onderweg in de supermarkt.

---

## 📖 Het Verhaal & Ontwerp

Het idee achter deze app is eenvoud en snelheid in de dagelijkse praktijk: samen lijstjes delen en direct zien wat de ander afvinkt of toevoegt, zonder loginschermen met ingewikkelde wachtwoorden of trage webpagina's. 

De interface is opgebouwd rondom een rustig, eigentijds minimalistisch ontwerp met minimale witruimte, zodat er zoveel mogelijk producten tegelijk op je scherm passen. Belangrijke acties zijn voorzien van strakke vectoriconen en een duidelijke statusbalk toont in één oogopslag het totaal aantal artikelen, wat er nog gehaald moet worden en wat er al in het mandje ligt.

---

## ✨ Belangrijkste Functies

- **Altijd in Sync:** Aangestuurd door Google Firebase Firestore. Zodra iemand thuis een product toevoegt, verschijnt het direct op het scherm van degene die in de winkel loopt.
- **Meerdere Winkels & Lijstjes:** Eenvoudig switchen tussen verschillende lijstjes (zoals Albert Heijn, Bakker of Bouwmarkt).
- **Volledige Vrijheid in Sortering (Drag & Drop):**
  - Verander de volgorde van je winkels op het hoofdscherm.
  - Sorteer producten op volgorde van de looproute door de winkel.
  - Werkt naadloos op zowel smartphones (lang indrukken en slepen met voelbare haptische feedback) als computers (met de muis).
- **Handige Opmerkingen:** Onder elk lijstje is ruimte voor een notitie, ideaal voor herinneringen zoals het inleveren van statiegeldflessen of het meenemen van een bonuskaart.
- **Slimme Suggesties:** Tijdens het typen geeft een ingebouwde zoekfunctie direct suggesties uit een lokale productendatabase (`products.json`).
- **Installeerbaar & Offline:** Dankzij de Service Worker en Firestore cache werkt de app ook prima op plekken waar het mobiele bereik minder is. Voeg hem direct toe aan het startscherm van iOS of Android om hem te gebruiken als een volwaardige native app.
- **Doordachte Veiligheid:** De app is afgeschermd met een 6-cijferige pincode via Firebase Authentication, Firestore beveiligingsregels en strikt beperkte API-sleutels in Google Cloud. Zo kan de repository gerust openbaar op GitHub Pages draaien zonder enig risico op ongeautoriseerde toegang tot de data.

---

## 🛠️ Technische Basis

- **Frontend:** HTML5, CSS3 (Modern Flexbox, custom form controls, glassmorphism), Vanilla JavaScript (ES Modules).
- **Backend & Cloud Database:** Firebase Firestore met `persistentLocalCache` en meertabblad-ondersteuning.
- **Beveiliging & Toegang:** Firebase Authentication gekoppeld aan strikte Firestore Security Rules.
- **Inzichten:** Google Analytics 4 (`firebase-analytics.js`).
- **Hosting & Distributie:** GitHub Pages & Service Worker PWA.

---

## 📱 Installeren op je Telefoon

1. Open de GitHub Pages-link in de browser (**Chrome** op Android of **Safari** op iOS).
2. Tik op de menuknop en kies voor **Toevoegen aan startscherm** (of **App installeren**).
3. De app opent voortaan schermvullend zonder adresbalk, start razendsnel op en onthoudt je status.
