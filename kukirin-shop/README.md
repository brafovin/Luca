# Kukirin Shop

Statischer Online-Shop (HTML/CSS/JS, kein Build nötig) für Kukirin E-Scooter.

**Starten:** `index.html` im Browser öffnen oder `python3 -m http.server` im Ordner ausführen.

## Enthalten
- 9 Modelle mit Herstellerfotos (`img/`) und Herstellerdaten (`products.js`)
- Filter (ABE / Sitz / Power / Budget), Suche, Sortierung, Hover-Bildwechsel
- Produktdialog mit Bildgalerie, Highlights und Datenblatt
- Scooter-Berater, Vergleichstabelle, Info zur Straßenzulassung (eKFV/ABE), FAQ
- Warenkorb (localStorage), Checkout-Demo mit Pflichthinweis „nur Privatgelände“ für Nicht-ABE-Modelle
- **Kundenservice-Widget (unten links):** Chat-Assistent mit Wissensbasis (Versand, Rückgabe, ABE, Zahlung, Garantie …), Bestellstatus-Abfrage, Kontaktformular mit Ticket-Nr. Der Assistent ist als „automatisch“ gekennzeichnet (kein vorgetäuschter Live-Chat). Die FAQ-Sektion nutzt dieselbe Wissensbasis (`KB` in `service.js`).
- Cookie-/Speicher-Hinweis, Deep-Links zu Produkten (`#p-g4`), Produkt-Strukturdaten (JSON-LD), Favicon, Skip-Link, Checkout-Zusammenfassung, ausgebauter Footer
- Mobil optimiert

## Vor dem Livegang
0. **Service konfigurieren:** In `service.js` oben `SERVICE` ausfüllen (E-Mail, Telefon, Zeiten, Antwortzeit). Ohne E-Mail läuft das Kontaktformular im Demo-Modus (nur lokal gespeichert, mit sichtbarem Hinweis). Mit E-Mail öffnet es das Mailprogramm; für echten Versand ein Backend/Formular-Dienst anbinden.
1. **Bildrechte klären:** Die Fotos stammen von der Herstellerseite kukirin.it.com. Nutzung nur mit Erlaubnis des Rechteinhabers (Händlervertrag / schriftliche Freigabe) oder durch eigene Fotos ersetzen.
2. **Preise & Daten prüfen:** In `products.js` stehen die aktuellen Preise der Herstellerseite (EU-Shop) und Herstellerangaben. Eigene Einkaufs-/Verkaufspreise eintragen; Zulassungsstatus (ABE) pro Modell beim Lieferanten bestätigen lassen.
3. **Rechtstexte** (Impressum, Datenschutz, AGB, Widerruf) durch echte Texte ersetzen.
4. **Zahlung & Bestellabwicklung** anbinden (Stripe/PayPal + Backend oder Umzug auf Shopify/WooCommerce).
