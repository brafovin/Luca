# Mampf Royale

3D-Fressspiel im Browser (Three.js über CDN, kein Build nötig). Du läufst durch eine Stadt, sammelst das Essen von
der Straße ins Inventar, isst es und wirst immer fetter – bis du so groß bist wie die ganze Map.

Starten: `index.html` im Browser öffnen oder den Ordner statisch ausliefern, z. B.
`cd mampf-royale && python3 -m http.server 8000` → http://localhost:8000 (Internet nötig für three.js und die Schrift).

## Regeln
| Essen | Punkte | |
|---|---|---|
| 🍕 Pizza | 5.000 | |
| 🥙 Döner | 2.000 | |
| 🦖 Dino | 5.000 | selten: nur 26 laufen durch die Stadt, sie rennen weg, wenn du nah kommst |

- **200.000 Punkte = 1 Level.** Level 10 (1.800.000 Punkte) ist das Ziel.
- Das Essen liegt auf allen Straßen. Drüberlaufen → es fliegt ins **Inventar**. Gegessen wird nur aus dem Inventar.
- Aufgegessenes Essen wächst nach ca. 1,5 Minuten an derselben Stelle nach.

## Level
| Level | Was passiert |
|---|---|
| 1–2 | Laufen (ab 2 watschelt man) |
| 3–4 | So rund, dass man **rollt** |
| 5–9 | **Rollstuhl**; ab Level 6 zerquetscht man Häuser, ab Level 7 ist man größer als ein Hochhaus |
| 10 | Der Körper liegt über der **ganzen Map** |

Die Figur wächst bei jedem Bissen ein Stück (nicht nur beim Level-Aufstieg). Oben links steht das aktuelle Gewicht.

## Map
32 × 32 Häuserblöcke im 76-m-Raster → ca. 2,4 km × 2,4 km, also ungefähr so groß wie eine Fortnite-Map, mit Strand und
Meer drumherum. Orte: Fett City (Hochhäuser in der Mitte), Pizza Plaza (viel Pizza), Döner Docks und Kebab-Kreuzung
(viel Döner), Dino-Park, Salami-Siedlung, Soßen-Sumpf, Mampf Mall.

## Steuerung
| Handy | PC | Aktion |
|---|---|---|
| Finger aufs Bild legen und ziehen | `W A S D` / Pfeiltasten | Laufen |
| Essen im Inventar antippen (halten = weiter essen) | `1` `2` `3` | Pizza / Döner / Dino essen |
| „Alles essen“ | `Leertaste` | Ganzes Inventar essen |
| Minikarte antippen | `M` | Große Karte |
| `II` | `Esc` / `P` | Pause und Regeln |

Der Spielstand wird automatisch im Browser gespeichert.
