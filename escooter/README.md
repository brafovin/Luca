# KuKirin G4 – City Ride

3D-E-Scooter-Spiel für den Browser. Du fährst einen schwarzen **KuKirin G4** (52 V / 18 Ah) durch eine
endlose, prozedural erzeugte deutsche Stadt – mit Tag-/Nacht-Wechsel, Ampeln, Verkehr, Fußgängern,
Checkpoint-Missionen, Akku-Simulation und Ladesäulen.

## Starten

**Solo:** Kein Server und keine Installation nötig – `index.html` einfach im Browser öffnen
(Chrome, Edge, Firefox, Safari – WebGL 2 nötig). `game.js` ist bereits fertig gebaut und enthält three.js.

**Multiplayer:** `npm install && npm start` (Node ≥ 18) und `http://localhost:8080` öffnen.
Mitspieler im selben WLAN öffnen `http://<deine-IP>:8080`; für das Internet den Server auf einem Host
deployen (Render, Fly.io, eigener VPS …) oder einen Tunnel nutzen (`cloudflared tunnel --url http://localhost:8080`, ngrok).
Wer die Seite über den Server öffnet, wird automatisch mit dem Raum „stadt“ verbunden (Name, Raum, Farbe im Menü einstellbar,
`Enter` = Chat). Die Stadt ist deterministisch, alle sehen dieselben Straßen; Spieler-Positionen werden mit 15 Hz synchronisiert.
Ampeln, Verkehr und NPCs laufen lokal auf jedem Client.

## Steuerung

| Taste | Aktion |
|---|---|
| `W` / `↑` | Beschleunigen |
| `S` / `↓` | Bremsen (im Stand: langsam rückwärts) |
| `A` `D` / `←` `→` | Lenken |
| `Shift` | Turbo: **bis 100 km/h** (normal 65 km/h, höherer Akkuverbrauch) – mit VESC bis 150 km/h |
| `F` | Vom Roller **absteigen** / wieder aufsteigen (zu Fuß: `WASD`, Shift rennen, Maus dreht) |
| `E` (halten) | **Wheelie**: ab 1,5 s auf dem Hinterrad gibt es beim Absetzen **100 €** (nur ab ~7 km/h; Bremsen bricht ab). In der Nähe des VESC-Shops 🛒 kauft `E` den Umbau (500 €) |
| `Enter` | Chat (Multiplayer) |
| Maus | Ins Spiel klicken → Maus links/rechts lenkt, linke Taste Gas, rechte Bremse, Mausrad zoomt (Esc beendet) |
| `Leertaste` | Stark bremsen |
| `C` | Kamera wechseln (hinter dem Roller / Ego-Cockpit mit Display) |
| `R` | Reset – setzt dich auf die nächste Straße |
| `L` / `B` | Licht an/aus · Klingel |
| `T` | Tageszeit um 3 h vorstellen |
| `M` | Ton an/aus |
| `Esc` / `P` | Pause / Menü (Einstellungen: Qualität, Akku-Modus, Tageszeit, nasse Straße …) |
| `G` | FPS-Anzeige |

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
* **Gameplay**: Tacho, Kilometerzähler (Fahrt + Gesamt), Akkuanzeige (Akku ist standardmäßig **unendlich**, im Menü umstellbar), Punkte für
  Strecke (schneller = mehr), **Kurierfahrt** mit Checkpoint-Leuchtfeuer, Richtungspfeil, Zeitkonto und
  Tour-Bonus, **Ladesäulen** (⚡ auf Minimap, anhalten zum Laden), Minimap, Pause-/Startmenü, Reset.
* **Grafik**: PBR-Materialien, Echtzeit-Schatten (folgen dem Spieler), Himmel-Shader mit Sonne, Mond,
  Sternen & Wolken, Tag-/Nacht-Zyklus, Umgebungsreflexionen (PMREM aus dem Himmel), spiegelnde
  Fensterscheiben & Autolack, beleuchtete Fenster/Laternen/Lichtkegel bei Nacht, optional Bloom
  (Qualität „Hoch"), nasse Straße mit Reflexionen. Dynamische Auflösung hält die Bildrate stabil.

## Zwei Roller: KuKirin G4 (full black) & Dualtron Thunder 3

* **KuKirin G4** – komplett schwarz, mit sichtbaren Federn (Gabel + Heck-Coil-Over), Faltgelenk mit Verriegelung, Bremsleitungen,
  geschlitzten Scheiben, Reifenprofil, Batterie-Seitenverkleidung, Deck-LED, Kennzeichen. Normal 65 km/h, Turbo 100 km/h.
* **Dualtron Thunder 3** (im VESC-Shop für **1000 €**, Taste `Q`): breites Deck, Doppel-Hydraulikgabel mit roten Federn,
  zwei Heck-Federbeine, Dual-Motor-Naben mit Kühlrippen, Vierkolben-Bremsen, Doppel-Scheinwerfer, großes Display.
  Normal 110 km/h, Turbo **170 km/h**. Mit dem VESC (500 €, gilt für beide Roller): G4 150 km/h, Dualtron **235 km/h**.
* `X` wechselt zwischen den gekauften Rollern (im Stand).

## Neu: Shop, zu Fuß, Oma & Opa, Multiplayer

* **VESC-Shop** (orange markiert auf Minimap und per Leuchtfeuer, ein Block östlich vom Start): Geld verdienst du mit
  Checkpoints (+ Zeitbonus), Touren (+300 €) und Strecke. Für **500 €** baut der Laden einen VESC-Controller ein:
  Turbo bis **150 km/h** (normal bis 90 km/h), blaue Controller-Box, Cyan-Unterbodenlicht und leuchtende Felgenringe.
* **Absteigen & laufen** (`F`): Der Roller bleibt mit Seitenständer stehen, du läufst/rennst in 3rd- oder 1st-Person
  (`C`), kannst in den Shop und wieder aufsteigen.
* **Oma & Opa**: schlendern mit Rollator, Handtasche oder Gehstock über die Gehwege. Fährst/stehst du länger neben ihnen
  (schneller = nerviger, Klingel `B` zusätzlich), steigt ihr Ärger-Balken (😠 → 😡). Bei 100 % rennen sie dir mit
  **10 km/h hinterher** (🤬) – erwischen sie dich, gibt es Prügel mit Handtasche/Stock (−25 €). Fährst du sie um: −100 Punkte.
* **Multiplayer**: andere Spieler fahren/laufen mit Namensschild, Farbe und VESC-Anzeige, kollidieren mit dir und
  chatten mit dir.
* **Grafik**: Wetter (klar/bewölkt/Regen mit Streifen-Regen und nasser Straße), Fassaden mit Bump-Relief,
  eingebackene Bodenabschattung, SSAO + Bloom auf „Hoch“.

## Entwickeln

```
npm install
npm run build   # bündelt src/ -> game.js (minifiziert)
npm run dev     # baut + startet den Multiplayer-Server (server.js)
```

Quellcode in `src/` (`world.js` Stadt-Generator, `scooter.js` Modell + Physik, `traffic.js` Verkehr,
`sky.js` Tag/Nacht, `textures.js` prozedurale Texturen, `main.js` Spielschleife/HUD). Es werden keine
externen Assets geladen – alle Texturen und Modelle entstehen prozedural zur Laufzeit.
