from mr import *

def rr_mask(x0, y0, x1, y1, rad):
    im = Image.new('L', (S, S), 0); ImageDraw.Draw(im).rounded_rectangle([x0*K, y0*K, x1*K, y1*K], radius=rad*K, fill=255)
    return np.asarray(im, np.float32)/255
def disc_mask(cx, cy, r):
    im = Image.new('L', (S, S), 0); ImageDraw.Draw(im).ellipse([(cx-r)*K, (cy-r)*K, (cx+r)*K, (cy+r)*K], fill=255)
    return np.asarray(im, np.float32)/255
def rgba(mask, color): 
    out = np.zeros((S, S, 4), np.float32); out[..., :3] = np.array(color, np.float32)/255; out[..., 3] = mask; return out
def paste(base, layer):  # base RGB float, layer RGBA
    a = layer[..., 3:4]; return base*(1-a) + layer[..., :3]*a
def bolt(cx, cy, s):
    pts = np.array([[0.15, -1.0], [-0.55, 0.12], [-0.05, 0.12], [-0.2, 1.0], [0.55, -0.20], [0.05, -0.20]])*s + np.array([cx, cy])
    return raster(pts)

def border_of(mask, px):
    d = ndi.distance_transform_edt(mask < .5).astype(np.float32)/K
    b = (d < px).astype(np.float32)
    return ndi.gaussian_filter(b, 0.7)

def sheet():
    X, Y = grid()
    # --- Motive ---
    s1 = disc_mask(300, 352, 108)
    s2 = rr_mask(436, 268, 704, 384, 30)
    s3 = disc_mask(298, 574, 92)
    s4 = rr_mask(432, 498, 704, 592, 46)
    designs = []   # (mask, rgb-colored full-sticker image)
    img = np.ones((S, S, 3), np.float32)
    stick_total = np.zeros((S, S), np.float32)
    art = np.ones((S, S, 3), np.float32)
    white = np.array([246, 246, 244], np.float32)/255
    borders = []
    for m in (s1, s2, s3, s4):
        borders.append(border_of(m, 13))
    allb = np.clip(sum(borders), 0, 1)
    allm = np.clip(s1 + s2 + s3 + s4, 0, 1)
    # Motiv zeichnen
    art = np.tile(white, (S, S, 1)).astype(np.float32)
    art = paste(art, rgba(s1, (255, 95, 31)))
    ring = disc_mask(300, 352, 92) - disc_mask(300, 352, 86)
    art = paste(art, rgba(np.clip(ring, 0, 1), (255, 255, 255)))
    kl = text_layer([('K', (300, 352+54), 150, 'Black', (255, 255, 255, 255), 0)]); art = paste(art, kl)
    art = paste(art, rgba(s2, (20, 21, 26)))
    art = paste(art, text_layer([('KUKIRIN', (570, 342), 44, 'Black', (255, 255, 255, 255), 8)]))
    art = paste(art, rgba(rr_mask(520, 356, 620, 362, 3), (255, 95, 31)))
    art = paste(art, rgba(s3, (20, 21, 26)))
    art = paste(art, rgba(bolt(298, 574, 56), (255, 95, 31)))
    art = paste(art, rgba(s4, (255, 95, 31)))
    art = paste(art, text_layer([('RIDE ELECTRIC', (568, 556), 27, 'Black', (20, 21, 26, 255), 3)]))

    # --- Trägerbogen ---
    sheet_m = rr_mask(140, 170, 760, 730, 14)
    # --- alles um -5° drehen ---
    def rot(a, order=1):
        return ndi.rotate(a, -5, reshape=False, order=order, mode='constant', cval=0.0 if a.ndim == 2 else 0.0)
    sheet_m = rot(sheet_m); allb = rot(allb); allm = rot(allm)
    art = np.stack([rot(art[..., c]) for c in range(3)], -1)
    # Hintergrund-Farbe des Bogens (Kraftpapier-hell)
    paper = np.ones((S, S, 3), np.float32)*np.array([0.63, 0.58, 0.50], np.float32)  # linear-ish später
    pn = noise(0.8*K/2, 91)*0.04 + noise(60*K/2, 92)*0.03
    paper = paper*(1 + pn)[..., None]
    albedo = srgb2lin(np.clip(art, 0, 1))
    stick_alpha = np.clip(allb, 0, 1)[..., None]
    alb = paper*(1 - stick_alpha) + albedo*stick_alpha
    # --- Höhenfeld: Bogen 0, Sticker +4 ---
    h = smooth(allb, 0.8)*5.0 + sheet_m*0
    h += noise(50*K/2, 93)*0.8
    col = shade(alb, h, amb=0.32, k1=0.90, k2=0.20, nk=2.2, spec=0.10, shin=40, ao=0.6, shadow=0.7, shadow_len=8)
    # Gloss-Streifen über den Stickern
    g = np.exp(-(((X*0.55 + Y*0.83) - 640)/110)**2)
    col += (0.10*g*allb)[..., None]
    # Sticker-Schlagschatten auf Bogen
    sh = ndi.shift(ndi.gaussian_filter(allb, 3*K/2), (4*K, 3*K), order=1)
    col = col*(1 - 0.35*sh*(1 - allb))[..., None]
    img = composite(col, sheet_m, shadow_specs=((6, 14, 18, .32), (0, 34, 60, .16)))
    return finish(img, 'out_sticker_sheet.jpg')

def laptop():
    X, Y = grid()
    # gebürstetes Aluminium (Space Grau)
    streak = noise_aniso(0.4, 120, 101)*0.030 + noise_aniso(0.2, 30, 102)*0.020
    base = 0.115 + streak
    grad = 0.07*np.exp(-(((X*0.6 + Y*0.8) - 360)/420)**2)       # weicher Lichtfleck
    bg = (base + grad)[..., None]*np.array([1.0, 1.02, 1.07], np.float32)
    # --- Sticker (rund) ---
    cx, cy, R = 440, 430, 262
    disc = disc_mask(cx, cy, R)
    bord = border_of(disc, 16)
    design = np.zeros((S, S, 3), np.float32)+np.array([246, 246, 244], np.float32)/255
    design = paste(design, rgba(disc, (22, 23, 28)))
    ring = disc_mask(cx, cy, R-22) - disc_mask(cx, cy, R-36)
    design = paste(design, rgba(np.clip(ring, 0, 1), (255, 95, 31)))
    design = paste(design, rgba(disc_mask(cx, cy-46, 108), (255, 95, 31)))
    design = paste(design, text_layer([('K', (cx, cy-46+0.40*108*1.0+14), 125, 'Black', (255, 255, 255, 255), 0)]))
    design = paste(design, text_layer([('KUKIRIN SHOP', (cx, cy+142), 40, 'Black', (255, 255, 255, 255), 9),
                                        ('RIDE ELECTRIC', (cx, cy+190), 24, 'Bold', (255, 95, 31, 255), 6)]))
    # --- Abgelöste Ecke (unten rechts) ---
    n = np.array([1, 1])/np.sqrt(2.0)
    s_ = ((X-cx)*n[0] + (Y-cy)*n[1])
    d0 = 168.0
    removed = (s_ > d0).astype(np.float32)
    removed = ndi.gaussian_filter(removed, 0.8)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    # Spiegelung der abgelösten Fläche über die Faltlinie
    refl_x = xx + 2*(d0 - s_*1.0)*n[0]*K
    refl_y = yy + 2*(d0 - s_*1.0)*n[1]*K
    flap = ndi.map_coordinates(bord*removed, [refl_y, refl_x], order=1, mode='constant')*(s_ < d0)
    flap = ndi.gaussian_filter(flap, 0.8)
    stick_vis = bord*(1 - removed)
    # Rückseite (weiß/grau) mit Verlauf: heller an der Faltlinie, dunkler zur Spitze
    t = np.clip((d0 - s_)/110.0, 0, 1)
    back = (0.80 - 0.22*t)[..., None]*np.array([1.0, 1.0, 1.02], np.float32)
    # Albedo/Licht
    alb = srgb2lin(np.clip(design, 0, 1))
    h = smooth(stick_vis, 0.8)*5 + noise(30*K/2, 103)*0.5
    col_st = shade(alb, h, amb=0.26, k1=0.72, k2=0.14, nk=2.0, spec=0.10, shin=30, ao=0.5, shadow=0.5, shadow_len=7)
    col_st += (0.10*np.exp(-(((X*0.55 + Y*0.83) - 560)/130)**2)*stick_vis)[..., None]
    # Komposition in sRGB-Linear
    out = bg.copy()
    # Schlagschatten des Stickers auf Laptop
    sh = ndi.shift(ndi.gaussian_filter(stick_vis, 4*K/2), (3*K, 2*K), order=1)
    out *= (1 - 0.45*sh*(1 - stick_vis))[..., None]
    out = out*(1 - stick_vis[..., None]) + col_st*stick_vis[..., None]
    # Schatten der Lasche auf Sticker
    fsh = ndi.shift(ndi.gaussian_filter(flap, 7*K/2), (10*K, 8*K), order=1)
    out *= (1 - 0.45*fsh*(1 - flap))[..., None]
    # Lasche (Rückseite) zeichnen
    out = out*(1 - flap[..., None]) + back*flap[..., None]
    # dunkle Faltlinie
    foldline = np.exp(-((s_ - d0)/2.0)**2)*np.clip(flap + stick_vis, 0, 1)
    out *= (1 - 0.18*foldline)[..., None]
    out = out*(1 - 0.0)
    vign = 1 - 0.22*(((X-450)/700)**2 + ((Y-450)/700)**2)
    return finish(lin2srgb(out*vign[..., None]), 'out_sticker_laptop.jpg', grain=0.014)

if __name__ == '__main__':
    sheet(); laptop()
