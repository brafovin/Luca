# Seefest-Feuerwerk · 3D-Map

Interaktive 3D-Nachtmap im Browser (Three.js, lokal in `vendor/`, kein Build nötig).

Starten: Ordner statisch ausliefern, z. B. `cd feuerwerk-map && python3 -m http.server 8000` → http://localhost:8000

## Steuerung
- Maus ziehen / Finger wischen: umschauen · `W A S D` laufen (`Shift` schneller) · `Q`/`E` Höhe
- Klick auf den Boden: gewähltes Feuerwerk aufstellen und zünden
- `B`: Inventar (Rakete, Batterie, Fontäne, Vulkan, Römische Kerze, Böller, Böllerkette, Kugelbombe, Wunderkerze) · `1`–`9` Schnellwahl
- `Leertaste`: große Show vom Lastkahn (~110 s)
- Ansichten: Marktplatz, Feuerwerkswiese, Seeufer, Steg im See (Wasserspiegelung), Von oben

## Realismus
Luftwiderstand + Schwerkraft pro Stern, Schweife, Farbwechsel/Glut, Blinker, Crackle, Kreuzer, Palmen, Weiden, Ringe, Saturn, Herz;
farbige Blitze beleuchten Szene und Rauch, Wind treibt den Rauch, Spiegelung im See, Schall mit Laufzeit (Entfernung / 343 m/s).
