# KuKirin G4 – City Ride

3D-E-Scooter-Spiel für den Browser. Du fährst einen schwarzen **KuKirin G4** (52 V / 18 Ah) durch eine
endlose, prozedural erzeugte deutsche Stadt – mit Tag-/Nacht-Wechsel, Ampeln, Verkehr, Fußgängern,
Checkpoint-Missionen, Akku-Simulation und Ladesäulen.

## Starten

Es wird **kein Server und keine Installation** benötigt: `index.html` einfach im Browser öffnen
(Chrome, Edge, Firefox, Safari – WebGL 2 nötig). `game.js` ist bereits fertig gebaut und enthält three.js.

Alternativ lokal ausliefern: `npm start` und `http://localhost:8080` öffnen.

## Steuerung

| Taste | Aktion |
|---|---|
| `W` / `↑` | Beschleunigen |
| `S` / `↓` | Bremsen (im Stand: langsam rückwärts) |
| `A` `D` / `←` `→` | Lenken |
| `Shift` | Turbo: **bis 100 km/h** (normal 65 km/h, höherer Akkuverbrauch) |
| Maus | Ins Spiel klicken → Maus links/rechts lenkt, linke Taste Gas, rechte Bremse, Mausrad zoomt (Esc beendet) |
| `Leertaste` | Stark bremsen |
| `C` | Kamera wechseln (hinter dem Roller / Ego-Cockpit mit Display) |
| `R` | Reset – setzt dich auf die nächste Straße |
| `L` / `B` | Licht an/aus · Klingel |
| `T` | Tageszeit um 3 h vorstellen |
| `M` | Ton an/aus |
| `Esc` / `P` | Pause / Menü (Einstellungen: Qualität, Akku-Modus, Tageszeit, nasse Straße …) |
| `F` | FPS-Anzeige |

Auf Touch-Geräten erscheinen Bildschirm-Tasten, Gamepads (Stick + Trigger) funktionieren ebenfalls.

## Spielinhalt

* **Stadt**: endloses Raster aus Straßen mit Asphalt-Textur, Fahrbahnmarkierungen, Zebrastreifen,
  Haltelinien, Bordsteinen, Gehwegen, Kreuzungen mit funktionierenden **Ampeln**, Bushaltestellen,
  Berliner Kissen (Bremsschwellen), Gullydeckeln. Blöcke: Altbau-Blockrand (Putz/Klinker/Platte),
  Einfamilienhäuser mit Zäunen & Hecken, Parks mit Brunnen, Glas-Bürotürme, Supermarkt mit Parkplatz.
  Straßenlaternen, Bäume (auch Herbstlaub), parkende Autos, fahrende Autos & Busse (halten an roten
  Ampeln), Fußgänger (warten am Bordstein) und **andere E-Scooter-Fahrer**, die sich an Ampeln halten.
* **Roller**: Deck mit Griptape, 10"-Räder mit Profil und Bremsscheiben, Federgabel mit roten
  Federn, Heck-Federbein, Kotflügel, Rück-/Bremslicht, LED-Streifen, Scheinwerfer, Lenker mit
  **Live-Display** (Geschwindigkeit, Akku, Trip). Fahrer mit Sturmhaube, Skibrille, Helm und Kurier-Rucksack; der Lenker dreht sich sichtbar,
  der Roller neigt sich physikalisch korrekt in Kurven (`tan φ = a_lat / g`).
* **Physik**: sanfte Beschleunigung (Drehmoment bis ~5 m/s, danach Leistungsgrenze), Höchstgeschwindigkeit
  65 km/h (Turbo 100 km/h, ab ca. 40 km/h Sturz bei hartem Aufprall), Luft-/Rollwiderstand, Rekuperation, geschwindigkeitsabhängiger Bremsweg,
  Lenkwinkel nimmt mit Tempo ab, Querbeschleunigung begrenzt, Federung (Feder-Dämpfer) bei Bordsteinen und
  Bodenschwellen, Nick-Bewegung beim Bremsen, Kollisionen mit Häusern, Autos, Bäumen, Laternen,
  Zäunen, Fußgängern.
* **Gameplay**: Tacho, Kilometerzähler (Fahrt + Gesamt), Akkuanzeige mit Reichweite, Punkte für
  Strecke (schneller = mehr), **Kurierfahrt** mit Checkpoint-Leuchtfeuer, Richtungspfeil, Zeitkonto und
  Tour-Bonus, **Ladesäulen** (⚡ auf Minimap, anhalten zum Laden), Minimap, Pause-/Startmenü, Reset.
* **Grafik**: PBR-Materialien, Echtzeit-Schatten (folgen dem Spieler), Himmel-Shader mit Sonne, Mond,
  Sternen & Wolken, Tag-/Nacht-Zyklus, Umgebungsreflexionen (PMREM aus dem Himmel), spiegelnde
  Fensterscheiben & Autolack, beleuchtete Fenster/Laternen/Lichtkegel bei Nacht, optional Bloom
  (Qualität „Hoch"), nasse Straße mit Reflexionen. Dynamische Auflösung hält die Bildrate stabil.

## Entwickeln

```
npm install
npm run build   # bündelt src/ -> game.js (minifiziert)
npm run dev     # baut + startet lokalen Server
```

Quellcode in `src/` (`world.js` Stadt-Generator, `scooter.js` Modell + Physik, `traffic.js` Verkehr,
`sky.js` Tag/Nacht, `textures.js` prozedurale Texturen, `main.js` Spielschleife/HUD). Es werden keine
externen Assets geladen – alle Texturen und Modelle entstehen prozedural zur Laufzeit.
