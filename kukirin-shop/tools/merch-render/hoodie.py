from mr import *

def hoodie(color='black', name='hoodie'):
    X, Y = grid()
    fabric = {'black': (0.021, 0.022, 0.026), 'orange': (0.62, 0.115, 0.018)}[color]
    ink_logo = (255, 95, 31) if color == 'black' else (22, 23, 28)
    ink_fg = (255, 255, 255) if color == 'black' else (255, 140, 80)

    # ---- Körper (Vorderteil + Ärmel in einer Silhouette) ----
    half = chain((372, 205),                                           # Halsansatz links
                 ('C', (335, 215), (290, 228), (248, 246)),            # Schulter
                 ('C', (196, 320), (136, 450), (96, 585)),             # Ärmel außen
                 ('L', (152, 610)),                                    # Manschette
                 ('C', (176, 545), (214, 478), (258, 420)),            # Ärmel innen -> Achsel
                 ('C', (264, 520), (268, 620), (270, 700)),            # Seite
                 ('L', (272, 742)),                                    # Saum links (Bündchen)
                 ('L', (450, 742)))
    outline = np.vstack([half, mirror(half)[1:]]); outline = jitter(outline, 1.4, 5)
    body_M = raster(outline)

    # ---- Kapuze (hinter dem Körper, oberhalb der Schultern) ----
    hood_half = chain((450, 98), ('C', (395, 98), (338, 130), (330, 200)), ('C', (326, 232), (344, 250), (372, 252)))
    hood = np.vstack([hood_half, mirror(hood_half)[1:]]); hood = jitter(hood, 1.6, 8)
    hood_M = raster(hood)
    # Kapuzenöffnung (innen dunkel)
    op_half = chain((450, 142), ('C', (410, 142), (372, 160), (368, 205)), ('C', (366, 232), (400, 262), (450, 266)))
    opening = np.vstack([op_half, mirror(op_half)[1:]])
    open_M = raster(opening)

    M = np.clip(np.maximum(body_M, hood_M), 0, 1)
    # Vorderteil überdeckt den unteren Kapuzenteil: Kapuze nur außerhalb (Oberkante/Seiten) + Öffnung
    front_cover = body_M
    # Halsausschnitt des Körpers: Kapuzenansatz als Kurve
    neck_half = chain((372, 205), ('C', (390, 232), (420, 258), (450, 262)))
    neck = np.vstack([neck_half, mirror(neck_half)[1:], chain((528, 205), ('L', (372, 205)))[1:]])
    neck_M = raster(np.vstack([neck_half, mirror(neck_half)[1:]]) )
    # Bereich innerhalb der Öffnung sichtbar als Kapuzeninnenseite
    inner = np.clip(open_M, 0, 1)

    # Beuteltasche
    pk_half = chain((330, 560), ('L', (318, 700)), ('L', (450, 700)))
    pocket = np.vstack([chain((372, 548), ('L', (318, 706)), ('L', (582, 706)), ('L', (528, 548))), ])
    pocket = np.array([[372, 548], [450, 544], [528, 548], [584, 706], [450, 710], [316, 706]], float)
    pocket = np.vstack([chain((372, 548), ('C', (410, 541), (490, 541), (528, 548)), ('C', (552, 600), (572, 660), (584, 706)),
                              ('C', (520, 712), (380, 712), (316, 706)), ('C', (328, 660), (348, 600), (372, 548)))])
    P = raster(pocket)

    # Bündchen
    hemband = raster(np.array([[272, 704], [628, 704], [630, 744], [270, 744]], float))
    cq = np.array([[96, 585], [152, 610], [169, 588], [114, 563]], float)
    cuffs = np.clip(raster(cq) + raster(cq*np.array([-1, 1]) + np.array([900, 0])), 0, 1)*body_M

    # ---- Höhenfeld ----
    d_body = ndi.distance_transform_edt(body_M > .5).astype(np.float32)/K
    d_hood = ndi.distance_transform_edt(hood_M > .5).astype(np.float32)/K
    h_body = np.tanh(d_body/46)*24
    h_hood = np.tanh(d_hood/40)*22 - 10          # Kapuze tiefer (liegt hinter Körper)
    h = np.where(body_M > .5, h_body + 4, h_hood)
    h = smooth(h, 0.8)
    low = noise(100*K/2, 31)
    h += low*5.0
    v = noise_aniso(60, 9, 32); hz = noise_aniso(7, 55, 33)
    h += v*6.5*np.clip((Y-420)/240, 0, 1)*body_M
    h += hz*3.5*np.clip((Y-640)/80, 0, 1)*body_M
    # Armfalten (Querfalten am Ellbogen) + Achselfalten
    vp_l = (X-200)*0.90 + (Y-300)*0.42; vp_r = (X-700)*(-0.90) + (Y-300)*0.42
    vp = np.where(X < 450, vp_l, vp_r)
    sleeve = np.clip(body_M*(X < 262) + body_M*(X > 638), 0, 1)
    h += (np.sin(vp/14 + 2.2*low)*3.6 + noise_aniso(14, 7, 34)*2.2)*sleeve
    for (px, py) in ((262, 424), (638, 424)):
        r = np.hypot(X-px, Y-py); th = np.arctan2(Y-py, X-px)
        w = np.exp(-r/220)*np.clip((Y-py+30)/80, 0, 1)*body_M
        h += np.sin(th*10 + 2.4*low)*6.0*w
    # Tasche erhaben, Bündchen erhaben
    h += smooth(P, 1.0)*7*body_M
    h += cuffs*5 + hemband*6
    # Kapuze: Falten
    h += noise_aniso(30, 6, 35)*4.5*hood_M*(1-body_M)
    # Öffnung: tief
    h -= inner*38
    h = smooth(h, 0.5)
    # Nähte
    seam_l = chain((248, 246), ('C', (258, 300), (262, 360), (258, 420)))
    grooves = line_mask(seam_l, 1.8) + line_mask(mirror(seam_l), 1.8) + line_mask(pocket, 1.7, True) + line_mask(chain((270, 704), ('L', (630, 704))), 1.5)
    grooves = np.clip(grooves, 0, 1)
    h -= smooth(grooves, 0.9)*3.0
    stitch = np.clip(dashed(np.vstack([chain((372, 556), ('C', (410, 549), (490, 549), (528, 556)))]), .9) + dashed(chain((270, 712), ('L', (630, 712))), .9), 0, 1)

    # ---- Albedo ----
    alb = np.ones((S, S, 3), np.float32)*np.array(fabric, np.float32)
    fleece = noise(0.9*K/2, 41)*0.10 + noise(2.2*K/2, 42)*0.05
    alb *= (1 + fleece)[..., None]
    # Rippbündchen: vertikale Rippen
    rib = (np.sin(X*6.28/4.2)*0.5+0.5)
    alb *= (1 - 0.22*(cuffs + hemband)[..., None]*(1-rib[..., None]))
    alb *= (1 - 0.55*inner)[..., None]
    alb *= (1 - 0.15*smooth(grooves, 0.8))[..., None]
    alb += stitch[..., None]*(0.020 if color == 'black' else 0.04)

    # ---- Kordeln ----
    for sx in (-1, 1):
        cx = 450 + sx*30
        pts = chain((cx, 272), ('C', (cx+sx*3, 330), (cx-sx*2, 390), (cx+sx*4, 450)))
        cord = line_mask(pts, 5.2)
        h += smooth(cord, .7)*9
        alb = alb*(1-cord[..., None]*0.9) + cord[..., None]*0.9*srgb2lin(np.array(ink_logo if color == 'black' else (22, 23, 28))/255)
        tip = Image.new('L', (S, S), 0); dd = ImageDraw.Draw(tip)
        ex, ey = pts[-1]
        dd.rounded_rectangle([(ex-5)*K, (ey-2)*K, (ex+5)*K, (ey+22)*K], radius=4*K, fill=255)
        tip = np.asarray(tip, np.float32)/255
        h += smooth(tip, .6)*10
        alb = alb*(1-tip[..., None]) + tip[..., None]*np.array([.5, .5, .52], np.float32)
    # Ösen
    eyelets = np.zeros((S, S), np.float32)
    for sx in (-1, 1):
        ey = Image.new('L', (S, S), 0); ImageDraw.Draw(ey).ellipse([(450+sx*30-7)*K, (268-7)*K, (450+sx*30+7)*K, (268+7)*K], fill=255)
        eyelets += np.asarray(ey, np.float32)/255
    alb = alb*(1-eyelets[..., None]*0.9) + eyelets[..., None]*0.9*np.array([.45, .45, .47], np.float32)

    # ---- Stickerei (Logo auf der Brust links) ----
    lg = logo_disc(530, 372, 24, bg=ink_logo, fg=(255, 255, 255) if color == 'black' else (255, 140, 80))
    lg = warp(lg, h, 1.0)
    thread = (np.sin((X+Y*0.4)*6.28/2.6)*0.5+0.5)
    A = lg[..., 3]*(0.85 + 0.15*thread)
    alb = alb*(1-A[..., None]) + srgb2lin(lg[..., :3])*A[..., None]
    h += smooth(lg[..., 3], .5)*3.5 + thread*lg[..., 3]*0.6

    sheen_col = (0.9, 0.95, 1.0) if color == 'black' else (1.0, 0.7, 0.45)
    if color == 'black':
        col = shade(alb, h, amb=0.30, k1=1.55, k2=0.45, nk=1.5, spec=0.03, shin=7, sheen=0.025, sheen_col=sheen_col, ao=1.0, shadow=0.55)
    else:
        col = shade(alb, h, amb=0.34, k1=1.30, k2=0.35, nk=1.5, spec=0.02, shin=7, sheen=0.04, sheen_col=sheen_col, ao=1.0, shadow=0.60)
    # Kapuzenhintergrund etwas abdunkeln (liegt hinten)
    back = (hood_M*(1-body_M))[..., None]
    col = col*(1 - 0.18*back)
    img = composite(col, M)
    return finish(img, f'{name}.jpg')

if __name__ == '__main__':
    hoodie('black', 'out_hoodie_black'); hoodie('orange', 'out_hoodie_orange')
