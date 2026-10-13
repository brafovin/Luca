# Sprungkraft

2D-Jump'n'Run im Browser (Canvas, reines JavaScript, kein Build nötig). Du spielst einen kleinen Fuchs, läufst,
rennst, springst und rollst durch sechs Welten. Am Ende jeder Welt wartet ein Boss in seiner Arena. Ist er
besiegt, öffnet sich das Tor zur Zielflagge – wer sie berührt, rutscht daran herunter, läuft ins Haus und startet
damit das nächste Level.

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
| `↓` / `S` / `C` | Rollen | B / ↓ | Rollen – so lange du hältst (am Boden und in der Luft) |
| `F` / `E` | Feuer | Y / RB / RT | Feuerball (mit Feuerblume) |
| `Esc` / `P` | `II` | Start | Pause |
| `M` | ♪ | – | Ton an/aus |

**Rollen** dauert, solange du die Taste gedrückt hältst (ein kurzer Tipp gibt eine kurze Rolle). Beim Rollen
kannst du lenken, und an Wänden prallt die Kugel ab. Rollen macht dich sehr schnell und klein: Du passt durch Tunnel, die nur eine Kachel hoch sind, und
rollst Schleimis, Käfer, Frösche und Fledermäuse einfach um. Springst du aus der Rolle heraus, gibt es einen
extra weiten Sprung. In der Luft gibt es einmal pro Sprung eine **Luftrolle** mit Schub nach vorn – damit
kommst du über breitere Lücken. Sprungfeder und Draufspringen auf Gegner laden sie wieder auf.

## Welten
| Nr. | Welt | Neu in dieser Welt | Boss |
|---|---|---|---|
| 1 | Sonnige Wiese | Grundlagen, Rolltunnel, Luftrolle, Sprungfeder, Stern | Maulwurf Buddel |
| 2 | Finsterwald | Frösche, Fledermäuse, Bröckelplattformen, Feder (Doppelsprung) | Gräfin Flatter |
| 3 | Glutwüste | Igel, Kanonen, Stacheln, bewegliche Plattformen | Skorpion Skorpi |
| 4 | Frostgipfel | rutschiges Eis, Aufzüge, Schneefall | Yeti Frosti |
| 5 | Lavaburg | Lava, Feuerspringer, Stampfer, Magnet und Turbo-Schuhe | Drache Glutzahn |
| 6 | Wolkenschloss | Wolkenplattformen, alle Gegner | König Matsch |

## Bosse
Beim Betreten der Arena schließt sich hinter dir ein Tor. Jeder Boss braucht **drei Treffer**: draufspringen,
einen getretenen Panzer gegen ihn schießen oder sechs Feuerbälle. Nach jedem Treffer wird er schneller. Vor jeder
Arena steht ein Kontrollpunkt.

| Boss | Angriffe | Tipp |
|---|---|---|
| Maulwurf Buddel | gräbt sich ein, wühlt sich zu dir und springt heraus | weglaufen, wenn die Erde wackelt; draufspringen, wenn er steht |
| Gräfin Flatter | kreist oben und stürzt sich im Bogen herab, ruft später Fledermäuse | nach dem Sturzflug ruht sie tief – draufspringen oder mit der Luftrolle treffen |
| Skorpion Skorpi | schießt Stacheln im Bogen, rammt quer durch die Arena | nach dem Rammen ist er benommen |
| Yeti Frosti | wirft gezielte Schneebälle; nach großen Sprüngen fallen Eiszapfen (Schatten am Boden) | nicht unter den Schatten stehen bleiben |
| Drache Glutzahn | hohes und tiefes Feuer, springt dann auf die andere Seite | hohes Feuer: drunter durchrollen, tiefes: drüberspringen |
| König Matsch | springt dir hinterher und ruft kleine Schleimis | nach der Landung draufspringen |

Auf **Unmöglich** hat jeder Boss zwei zusätzliche Angriffe:

| Boss | Extra 1 | Extra 2 |
|---|---|---|
| Maulwurf Buddel | wirft beim Auftauchen Erdbrocken | Bodenwelle nach beiden Seiten beim Landen |
| Gräfin Flatter | Schallringe, die auf dich zufliegen | Doppel-Sturzflug ohne Pause |
| Skorpion Skorpi | Stacheln hinterlassen Giftpfützen | rammt zweimal hintereinander |
| Yeti Frosti | der Arenaboden friert für 4 s zu | rollt einen Riesen-Schneeball |
| Drache Glutzahn | Glutregen während des Sprungs | Feuersäulen schießen aus dem Boden |
| König Matsch | spuckt Schleimbälle | Mega-Sprung aus dem Bild und Landung auf dir (Schatten warnt), dann Bodenwellen |

In jedem Level gibt es Kontrollpunkte und **drei versteckte Edelsteine**. Freigeschaltete Welten, gefundene
Edelsteine und der Punkterekord werden im Browser gespeichert. Wer die Flagge weiter oben trifft, bekommt mehr
Punkte, schnelle Spieler einen Zeitbonus.

## Schwierigkeit
Im Hauptmenü und in der Levelauswahl wählbar; die Wahl wird gespeichert. Auf jeder Levelkarte steht die
schwerste Stufe, auf der du das Level geschafft hast.

| | Einfach | Normal | Schwer | Unmöglich |
|---|---|---|---|---|
| Leben | 5 | 3 | 3 | 1 |
| Start | großer Fuchs | klein | klein | klein |
| Tempo von Gegnern und Geschossen | 75 % | 100 % | 125 % | 150 % |
| Boss-Treffer | 2 | 3 | 4 | 5 |
| Boss-Angriffe | normal | normal | normal | je 2 zusätzliche |
| Abgrund und Lava | zurück an den Rand (kostet nur das Power-up) | Leben weg | Leben weg | Leben weg |
| Kontrollpunkte | ja | ja | ja | keine |
| Treffer | Pilz schützt, 3 s Schonzeit | Pilz schützt, 2 s | Pilz schützt, 1,2 s | jeder Treffer ist sofort vorbei |
| Punkte | ×0,5 | ×1 | ×1,5 | ×3 |

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
