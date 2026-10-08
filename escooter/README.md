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
| `E` (halten) | **Wheelie**: ab 1,5 s auf dem Hinterrad gibt es beim Absetzen **100 €** (nur ab ~7 km/h; Bremsen bricht ab). |
| `V` | **Rennstrecke** ↔ Stadt (auch Menü-Button „🏁 Zur Rennstrecke teleportieren“ bzw. HUD-Button unter der Minimap) |
| `K` | **Polizei** an/aus (auch per Button unter der Minimap oder im Menü) |
| `X` | Roller wechseln (auch im Pausenmenü → „Roller“) |
| `Enter` | Chat (Multiplayer) |
| Maus | Ins Spiel klicken → Maus links/rechts lenkt, linke Taste Gas, rechte Bremse, Mausrad zoomt (Esc beendet) |
| `Leertaste` | Stark bremsen |
| `C` | Kamera wechseln (hinter dem Roller / Ego-Cockpit mit Display) |
| `R` | **Eine Hand** vom Lenker nehmen (Einhand-Wheelie = **250 €** statt 100 €) – nochmal `R` = wieder beide Hände |
| `Backspace` | Reset – setzt dich auf die nächste Straße / Strecke |
| `H` | **Wheelie-Bar** an/aus (begrenzt den Wheelie auf ca. 32°, sicherer; im Menü ebenfalls) |
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

## Jugendliche 🧑‍🤝‍🧑

* **In jedem Park** hängen Jugendlichen-Gruppen auf den Bänken ab. **Halbstarke** (dunkle Hoodies, Caps): rauchen (Zigarette im Mund, Rauchwolken), pöbeln dich an
  („Was glotzt du so?!“, „Gib mal Kohle rüber!“ – Sprechblase), und wenn du ihnen länger zu nah kommst, stehen sie auf, **laufen dir hinterher und schubsen dich** (−30 €, stoppt dich).
  Hau ab (mit Roller oder rennend) oder box sie nieder (`E`); schlägst du einen, werden alle seiner Gruppe sauer.
* **Nette Jugendliche** (bunte Hoodies) sitzen auf der anderen Bank, quatschen, winken dir zu und rufen „Moin!“ – auf einem Moped „Geile Simme!“.
* Im Verkehr fahren **nette Jugendliche auf Simson-Mopeds** (mit Helm und Gesicht); sie winken dir zu, wenn du vorbeifährst.

## Simson-Laden 🛵

* Zweiter, begehbarer Laden **einen Block westlich vom Start** (blaue Markierung auf Minimap/Leuchtfeuer, Schild „SIMSON S51“). Drei Tische (mit `F`):
  **Simson-Händler** – drei Mopeds: **S51** (800 €), **SR50** (950 €, orange) und **Schwalbe KR51** (1100 €, grün, mit Verkleidung); alle 50-cm³-Zweitakter, **~60 km/h**, sitzender Fahrer, Zweitakt-Sound, **Auspuff qualmt** (mehr bei Gas). **Kein VESC** (Moped!).
  **Tuning** – **MTX10-Motor** (600 €, passt auf alle Mopeds): großer Zylinder, roter Resonanzauspuff, **150 km/h**, brutale Beschleunigung, mehr Qualm; **PZ-Tuning-Lenker** (250 €): breiter Rennlenker mit Querstrebe, mehr Kurvengrip.
  **Kiosk** – **Zigaretten** (20 Stück, 8 €): `Z` zündet eine an – sie steckt dann im Mund (auch in der **Ego-Perspektive** siehst du sie unten im Bild). Nochmal `Z` = **ziehen**: die Glut leuchtet auf, der Kopf lehnt sich zurück, dann bläst du eine Rauchwolke aus; ab und zu zieht dein Fahrer von selbst. `Y` drückt sie aus. Jede Zigarette hält ~60 s. Die Simson lässt sich auch beim VESC-Shop lackieren.

## Kinder, Spielplätze, Messer & Krankenwagen

* **Kinder** laufen mit Mama/Papa an der Hand über die Gehwege. In jedem **Park** gibt es einen **Spielplatz** (Gummiboden, Zaun, Schaukeln, Rutsche, Sandkasten, Wippe, Bänke):
  Kinder schaukeln, rutschen, buddeln im Sand und rennen herum, Eltern stehen am Rand und winken. **Kinder und ihre Eltern sind tabu** – sie können nicht geschlagen oder gestochen werden.
* **Messer** (`N` zu Fuß ziehen/wegstecken): `E`/`J` = Stich. Zwei Stiche und Passanten, Oma oder Opa liegen **blutend am Boden** (Blutspritzer + wachsende Blutlache, −250 Punkte).
  Dann kommt ein **Krankenwagen** (Blaulicht, Sirene), die Sanitäter versorgen die Person, tragen sie auf der Trage hinein und fahren weg. Blut lässt sich im Menü abschalten („Blut anzeigen“).

## Boxen 🥊

* Zu Fuß (`F` zum Absteigen): **`E` oder `J` halten = Schläge** (abwechselnd links/rechts, Kampfhaltung mit Deckung, in Ego-Sicht sieht man die roten Handschuhe).
  Fußgänger, Oma und Opa in Reichweite (~1,4 m, vor dir) nehmen Schaden, taumeln, rufen „Aua!“. Nach etwa 5–7 Treffern ist die Person **K.O. und liegt ~12 s am Boden**
  (−120 Punkte), steht dann wütend wieder auf. Boxen macht Senioren schnell sauer (sie verfolgen dich wieder).

## Autos & Menschen mit Gesichtern

* Realistischere Autos: Karosserie mit abfallender Motorhaube/Heck, Kühlergrill, Stoßfänger, Nebelscheinwerfer, Außenspiegel, Auspuff, Räder mit Reifen, Felgen, Speichen, Bremsscheibe.

* Autos sind innen **hohl mit Glasscheiben**: Armaturenbrett, Sitze (Vorder-/Rückbank), Lenkrad, Mittelkonsole, Innenspiegel. Busse haben Fahrerkabine, Sitzreihen und Haltestangen.
* **Fahrende** Autos, Busse und Polizeiwagen haben **Fahrer (und teils Beifahrer/Fahrgäste)** mit Gesicht (Augen, Brauen, Nase, Mund, Ohren, Haare, manche mit Brille/Bart), beide Hände am Lenkrad.
  **Geparkte Autos sind leer.**
* Fußgänger, Oma & Opa haben Gesichter (Augen, Brauen, Nase, Mund, teils Brille); wütende Senioren schauen böse mit Zähnen. Roller-Fahrer (KI) und dein Fahrer haben Augen/Nase/Mund
  (Sturmhaube = nur Augen), Skibrille sitzt auf dem Helm.

## Fahrer & Details

* Fahrer mit geformten Armen/Beinen (Muskel-Kontur), Jacke mit Reißverschluss, Brust-/Hüfttaschen, Schulterpolstern, Kapuzenrolle, Gürtelschnalle,
  Hose mit Beintaschen und Knieschonern, Sneaker mit Schnürung/Profilsohle, Helm mit Seitenpolstern und Kinnriemen, Ohren/Nase unter der Sturmhaube.
* Handschuhe: Lederhandfläche, Textilrücken, TPU-Knöchelschutz mit orangem Streifen, Klett-Manschette, 4 Finger mit Gelenken + Daumen mit 3 Gliedern;
  der Zeigefinger liegt auf dem Bremshebel und zieht beim Bremsen an.
* Lebendiger Körper: Atmen, Oberkörper dreht/lehnt mit Lenker & Kurven, Kopf schaut in die Kurve, Gewichtsverlagerung beim Beschleunigen/Wheelie.
* Vögel kreisen über der Stadt (tagsüber, nicht bei Regen/Nacht); Fußgänger-Figur mit Fingern und Knöchelschutz.

## Fünf Roller

* **ZT3 Pro** (Shop, **150 €**): 40 km/h, mit VESC 70 km/h. · **Kukirin G2** (Shop, **300 €**): 55 km/h, mit VESC 70 km/h.
* Alle Roller haben jetzt **Wheelie-Bar** (Stützrad hinten, `H`) und **Lenkerend-Spiegel**. Der Fahrer ist ~17 % größer, mit neuen Handschuhen
  (einzelne Finger, Daumen, Knöchel-Polster, Manschette); bei „Eine Hand“ winkt die linke Hand offen in die Luft.


* **KuKirin G4** – komplett schwarz, mit sichtbaren Federn (Gabel + Heck-Coil-Over), Faltgelenk mit Verriegelung, Bremsleitungen,
  geschlitzten Scheiben, Reifenprofil, Batterie-Seitenverkleidung, Deck-LED, Kennzeichen. Normal 65 km/h, Turbo 100 km/h.
* **Dualtron Thunder 3** (im VESC-Shop für **1000 €**): breites Deck, Doppel-Hydraulikgabel mit roten Federn,
  zwei Heck-Federbeine, Dual-Motor-Naben mit Kühlrippen, Vierkolben-Bremsen, Doppel-Scheinwerfer, großes Display.
  LED-Leiste am Rohr, Blinker, Gabelbrücke, Ausgleichsbehälter, Lüftungsschlitze, Rücklicht mit Reflektoren u. v. m.
  Normal 110 km/h, Turbo **170 km/h**. Mit dem VESC (500 €, gilt für beide Roller): G4 150 km/h, Dualtron **235 km/h**.
* **Weped Sonic** (im VESC-Shop für **1500 €**): Hyper-Scooter in Mattschwarz mit Lime-Akzenten, 11-Zoll-Rädern, langen
  Lime-Federbeinen, Akku-Pods, Heckflügel und Turbinen-Düse. Normal 200 km/h, Turbo 300 km/h. **Mit VESC 350 km/h normal und 500 km/h Turbo.**
  (Bei dem Tempo lädt die Stadt weiter voraus; Hindernisse bei 500 km/h = Sturz.)
* `X` oder das Menü (Pause → „Roller“) wechselt zwischen den gekauften Rollern.

## Rennstrecke 🏁

* Rundkurs mit **~30,7 km** (6 km lange Start-/Zielgerade, zwei große Kurven, S-Kurven auf der Gegengeraden), **32 m breit**, Curbs,
  Auslaufzonen, Zielportal mit Zielflagge und Tribüne, Kilometer-Tafeln. **Kein Verkehr, keine Fußgänger, keine Polizei, keine Hindernisse.**
* `V` oder Menü-Button teleportiert dich vor die Ziellinie (und wieder zurück in die Stadt). Zeit startet beim Überfahren der Ziellinie;
  Abkürzen macht die Runde ungültig. Pro Runde **+300 €** (Bestzeit **+600 €**), Bestzeit wird gespeichert. `Backspace` setzt dich auf die Strecke.
* **HYPER-Modus:** Nur hier fährt der Weped Sonic mit `Shift` bis **5000 km/h** (in ca. 7 s von 0 – absurde Beschleunigung, extra starke
  Bremsen, Lenkung bleibt auch bei Überschall steuerbar). In der Stadt gilt wieder das normale Limit (500 km/h mit VESC).
  Vor den Kurven musst du rechtzeitig abbremsen – bei 5000 km/h fliegst du sonst geradeaus auf die Wiese (`Backspace` setzt dich zurück).

## Polizei 🚓

* Streifenwagen fahren (mit Abbiegen und Ampeln) durch die Stadt – sie interessieren sich **nur für Wheelies**:
  Sobald du auf dem Hinterrad fährst, bist du 25 s „gesucht“; **Blaulicht + Sirene**, Punkte auf der Minimap, Anzeige oben.
* Während der Verfolgung fahren sie **maximal 100 km/h** (Streife ca. 40–50 km/h). Hänge sie ab (+300 Punkte) – oder bleib stehen und
  bekomm eine Strafe von 250 € (danach 25 s Ruhe).
* Mit `K`, dem Button unter der Minimap oder im Menü lässt sich die Polizei komplett **deaktivieren** (wird gespeichert).

## VESC-Shop zum Reinlaufen 🛒

* Der Laden hat einen offenen Eingang – du kannst **zu Fuß oder mit dem Roller hinein**. Drinnen: Regale, Orange-Teppich zu den Tischen, Sofa, Pflanze.
* **Drei Tische** (mit `F` öffnest du das Kauf-Fenster, wenn du davor stehst): **VESC & Umbauten** (VESC 500 €), **Roller** (ZT3 Pro, G2, Dualtron, Sonic kaufen/fahren),
  **Lackierung** (Rahmen und Akzente je 100 € in 12 Farben; pro Roller gespeichert). Nur noch dort wird gekauft – die alten Tasten Q/U/O/I/E im Shop gibt es nicht mehr.
* **Ego-Perspektive:** Beim Weped Sonic (und Dualtron) sitzt die Kamera höher, damit du **über das Display** schauen kannst.
* Der Fahrer trägt keinen Rucksack mehr.

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
