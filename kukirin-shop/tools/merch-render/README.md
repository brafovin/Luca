# Merch-Renderer

Erzeugt die Merch-Produktbilder (`img/merch-*.jpg`) als fotorealistische Mockups:
Stoff mit Falten, Nähten und Webstruktur, Druck/Stickerei, weiche Schatten.
Reines Python (numpy, scipy, Pillow), Schrift: Inter (`FONT_DIR` in `mr.py`).

```bash
pip install numpy scipy pillow
python3 shirt.py      # out_shirt_front.jpg / out_shirt_back.jpg
python3 hoodie.py     # out_hoodie_black.jpg / out_hoodie_orange.jpg
python3 cap.py        # out_cap_front.jpg / out_cap_detail.jpg
python3 bottle.py     # out_bottle_black.jpg / out_bottle_orange.jpg
python3 sticker.py    # out_sticker_sheet.jpg / out_sticker_laptop.jpg
```

Logo, Texte und Farben stehen jeweils in der Funktion des Produkts (`logo_disc(...)`, `text_layer(...)`, `fabric=`).
Ausgabe nach `../../img/merch-<produkt>-<n>.jpg` kopieren; die Weißpunkt-Anpassung (Hintergrund = 255) ist
für `mix-blend-mode: multiply` im Shop nötig: Werte `v * 255 / 248` begrenzen.
**Hinweis:** Das sind Renderings, keine Fotos echter Ware. Ersetze sie durch Lieferantenfotos, sobald vorhanden.
