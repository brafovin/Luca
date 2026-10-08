# Kukirin Shop

Statischer Online-Shop (HTML/CSS/JS, kein Build nötig) für Kukirin E-Scooter & Zubehör.

**Starten:** `kukirin-shop/index.html` im Browser öffnen oder `python3 -m http.server` im Ordner ausführen.

## Enthalten
- Produktübersicht mit Kategorie-Filter und Sortierung
- Produktdetail-Dialog mit technischen Daten
- Warenkorb (bleibt per localStorage erhalten), Gratis-Versand ab 99 €
- Checkout-Formular (Demo: Bestellung wird nur lokal gespeichert, keine Zahlung)
- FAQ, Footer mit Platzhaltern für Impressum, Datenschutz, AGB, Widerruf

## Vor dem Livegang
1. **Produkte/Preise/Specs** in `products.js` mit Herstellerdaten abgleichen (aktuell Beispielwerte).
2. **Produktfotos** statt SVG-Platzhalter einbauen (Bildfeld in `imageFor()` in `app.js`).
3. **Rechtstexte** (Impressum, Datenschutz, AGB, Widerruf) durch echte Texte ersetzen.
4. **Zahlung & Bestellabwicklung** anbinden (z. B. Stripe/PayPal + Backend oder Umzug auf Shopify/WooCommerce).
5. **Zulassung prüfen:** In Deutschland sind auf öffentlichen Straßen nur E-Scooter mit ABE/eKFV-Konformität erlaubt – pro Modell korrekt ausweisen.
