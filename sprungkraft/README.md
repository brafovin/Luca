# Sprungkraft

2D-Jump'n'Run im Browser (Canvas, reines JavaScript, kein Build nötig). Du spielst einen kleinen Fuchs, läufst,
rennst, springst und rollst durch sechs Welten. Am Ende jedes Levels steht eine Zielflagge – wer sie berührt,
rutscht daran herunter, läuft ins Haus und startet damit das nächste Level.

Starten: `index.html` im Browser öffnen oder den Ordner statisch ausliefern, z. B.
`cd sprungkraft && python3 -m http.server 8000` → http://localhost:8000.
Grafik und Töne werden komplett im Code erzeugt; nur die Schriftarten kommen aus dem Internet (ohne Internet
greift eine Ersatzschrift).

## Steuerung
| PC | Handy | Gamepad | Aktion |
|---|---|---|---|
| `←` `→` / `A` `D` | ◀ ▶ | Stick / Steuerkreuz | Laufen |
| `Leertaste` / `↑` / `W` | Springen | A | Springen (länger halten = höher) |
| `Shift` / `X` halten | Rennen (an/aus) | X / LB / LT | Rennen |
| `↓` / `S` / `C` | Rollen | B / ↓ | Rollen |
| `F` / `E` | Feuer | Y / RB / RT | Feuerball (mit Feuerblume) |
| `Esc` / `P` | `II` | Start | Pause |
| `M` | ♪ | – | Ton an/aus |

**Rollen** macht dich kurz sehr schnell und klein: Du passt durch Tunnel, die nur eine Kachel hoch sind, und
rollst Schleimis, Käfer, Frösche und Fledermäuse einfach um. Springst du aus der Rolle heraus, gibt es einen
extra weiten Sprung.

## Welten
| Nr. | Welt | Neu in dieser Welt |
|---|---|---|
| 1 | Sonnige Wiese | Grundlagen, Rolltunnel, Sprungfeder, Stern |
| 2 | Finsterwald | Frösche, Fledermäuse, Bröckelplattformen, Feder (Doppelsprung) |
| 3 | Glutwüste | Igel, Kanonen, Stacheln, bewegliche Plattformen |
| 4 | Frostgipfel | rutschiges Eis, Aufzüge, Schneefall |
| 5 | Lavaburg | Lava, Feuerspringer, Stampfer, Magnet und Turbo-Schuhe |
| 6 | Wolkenschloss | Wolkenplattformen, alle Gegner, Endgegner **König Matsch** |

In jedem Level gibt es Kontrollpunkte und **drei versteckte Edelsteine**. Freigeschaltete Welten, gefundene
Edelsteine und der Punkterekord werden im Browser gespeichert. Wer die Flagge weiter oben trifft, bekommt mehr
Punkte, schnelle Spieler einen Zeitbonus.

## Power-ups
| Power-up | Wirkung |
|---|---|
| Pilz | Fuchs wird groß und hält einen Treffer aus |
| Feuerblume | Weißer Feuerfuchs, wirft Feuerbälle |
| Stern | 10 Sekunden unbesiegbar |
| Feder | 25 Sekunden Doppelsprung |
| Magnet | 20 Sekunden Münzmagnet |
| Turbo-Schuhe | 15 Sekunden schneller laufen und rollen |
| Herz | Extraleben (100 Münzen geben auch eins) |

## Gegner
| Gegner | Wie besiegen |
|---|---|
| Schleimi | draufspringen, umrollen, Feuer |
| Panzerkäfer | draufspringen → Panzer wegkicken; der Panzer räumt andere Gegner ab |
| Igel | stachelig – nur Feuer, Stern oder Panzer |
| Fledermaus | fliegt hin und her und stößt herab; draufspringen |
| Frosch | springt dir hinterher; draufspringen oder umrollen |
| Kanone / Kanonenkugel | Kugeln überspringen oder draufspringen |
| Feuerspringer | springt aus der Lava, nicht zu besiegen – ausweichen |
| Stampfer | fällt herunter, wenn du drunter bist; oben drauf kann man mitfahren |
| König Matsch | Endgegner: dreimal auf den Kopf springen |

## Aufbau
- `src/core.js` – Kacheltypen, Kollision mit der Karte, Helfer
- `src/levels.js` – Level-Baukasten und die sechs Welten
- `src/entities.js` – Fuchs (Physik, Rollen, Power-ups), Gegner, Gegenstände, Plattformen
- `src/game.js` – Spielablauf, Wechselwirkungen, Kamera, Zeichnen
- `src/render.js` – alle Grafiken, Hintergründe und Figuren
- `src/audio.js` – Soundeffekte und Musik (Web Audio)
- `src/input.js` – Tastatur, Touch und Gamepad
- `src/ui.js` – Menüs, HUD, Start

Zum Testen kann man mit `index.html?level=3` direkt in eine Welt springen.
