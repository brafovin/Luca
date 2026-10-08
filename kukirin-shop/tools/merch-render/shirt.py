from mr import *

def shirt(back=False, name='shirt', fabric=(0.026, 0.027, 0.031)):
    X, Y = grid()
    # ---- Umriss (linke Hälfte, gespiegelt) ----
    neck_top = chain((450, 150), ('C', (428, 150), (398, 157), (372, 171)))        # Mitte -> linke Naht
    if back: neck_top = chain((450, 160), ('C', (428, 160), (398, 163), (372, 171)))
    left = chain((372, 171),
                 ('C', (335, 183), (290, 199), (240, 219)),
                 ('C', (205, 252), (165, 279), (128, 306)),
                 ('C', (140, 331), (157, 362), (178, 397)),
                 ('C', (215, 379), (255, 359), (291, 346)),
                 ('C', (283, 440), (292, 580), (294, 722)),
                 ('C', (330, 728), (400, 731), (450, 731)))
    half = np.vstack([neck_top, left[1:]])
    outline = np.vstack([half, mirror(half)[1:]])
    outline = jitter(outline, 1.4, 3)
    M = raster(outline)

    # Körper-Region (rechts/links von den Armlöchern)
    arm_l = chain((240, 219), ('C', (262, 262), (278, 300), (291, 346)))
    body_half = np.vstack([neck_top, chain((372, 171), ('L', (240, 219)))[1:], arm_l[1:], chain((291, 346), ('C', (283, 440), (292, 580), (294, 722)), ('C', (330, 728), (400, 731), (450, 731)))[1:]])
    body = np.vstack([body_half, mirror(body_half)[1:]])
    B = raster(body)

    # Halsausschnitt
    if not back:
        U = chain((372, 171), ('C', (386, 236), (416, 266), (450, 267)))
        hole_half = np.vstack([neck_top, chain((450, 267), ('L', (450, 267)))[1:], U[::-1][1:]])
        T = chain((372, 171), ('C', (398, 157), (428, 150), (450, 150)))
        hole = np.vstack([T, mirror(T)[1:], mirror(U)[::-1][1:], U[::-1][1:]])
        Hh = raster(hole)
    else:
        U = chain((372, 171), ('C', (392, 186), (420, 191), (450, 191)))
        T = chain((372, 171), ('C', (398, 163), (428, 160), (450, 160)))
        hole = np.vstack([T, mirror(T)[1:], mirror(U)[::-1][1:], U[::-1][1:]])
        Hh = raster(hole)
    inner = np.clip(Hh*M, 0, 1)
    front_panel = np.clip(M - inner, 0, 1)

    # ---- Höhenfeld ----
    d = ndi.distance_transform_edt(M > .5).astype(np.float32)/K
    h = np.tanh(d/42)*20.0
    h += smooth(B, 1.5)*4.5
    # Wellen / Falten
    low = noise(110*K/2, 11)
    h += low*6.0
    v = noise_aniso(60, 9, 12); hz = noise_aniso(7, 55, 13)
    ramp = np.clip((Y-380)/260, 0, 1)*B
    h += v*6.5*ramp
    h += hz*4.2*np.clip((Y-620)/90, 0, 1)*B
    for (px, py, sgn) in ((291, 346, -1), (609, 346, 1)):
        r = np.hypot(X-px, Y-py); th = np.arctan2(Y-py, X-px)
        w = np.exp(-r/230)*np.clip((Y-py+30)/80, 0, 1)*B
        h += np.sin(th*10 + 2.6*low)*6.5*w
    # Ärmel: Falten entlang der Ärmelachse
    ax = np.array([-0.55, 0.83])  # Richtung linker Ärmel nach außen/unten (x,y)
    sl = (1-B)*M
    for sgn, cx0 in ((1, 0), (-1, 1)):
        u = (X-450)*(-sgn)*ax[0] + (Y-300)*ax[1]*1.0
        vperp = (X-450)*(-sgn)*ax[1]*-1 + (Y-300)*ax[0]*1.0
    # einfache Variante: schräge Streifen
    vp_l = (X-200)*0.83 + (Y-300)*0.55; vp_r = (X-700)*(-0.83) + (Y-300)*0.55
    vp = np.where(X < 450, vp_l, vp_r)
    h += np.sin(vp/17 + 2.5*low)*3.2*sl
    # Kragenrippe, Innenseite
    collar = np.clip(smooth(Hh, 0.1) , 0, 1)
    ring = np.clip(ndi.binary_dilation(Hh > .5, iterations=int(15*K)).astype(np.float32) - (Hh > .5), 0, 1)*M
    ring = smooth(ring, .6)
    h += ring*7
    h -= inner*18
    # Säume (Rillen)
    seam_arm = line_mask(np.vstack([arm_l, mirror(arm_l)]), 1.8)
    seam_arm2 = line_mask(arm_l, 1.8) + line_mask(mirror(arm_l), 1.8)
    hem_l = chain((294, 700), ('C', (330, 705), (400, 708), (450, 708)))
    hem = np.vstack([hem_l, mirror(hem_l)[1:]])
    cuff_l = chain((141, 296), ('C', (153, 322), (168, 352), (188, 386)))
    cuff_in = cuff_l + np.array([13, -6])
    cuff_r = mirror(cuff_l); cuff_r_in = cuff_r + np.array([-13, -6])
    grooves = np.clip(seam_arm2 + line_mask(hem, 1.5) + line_mask(cuff_in, 1.5) + line_mask(cuff_r_in, 1.5), 0, 1)
    h -= smooth(grooves, 0.9)*3.2
    stitches = np.clip(dashed(hem + np.array([0, 5]), .9) + dashed(cuff_in + np.array([0, 4]), .9) + dashed(cuff_r_in + np.array([0, 4]), .9), 0, 1)

    # ---- Albedo ----
    alb = np.ones((S, S, 3), np.float32)*np.array(fabric, np.float32)
    # Strick-Textur
    tex = (np.sin(X*6.28/3.4 + 1.3*np.sin(Y*6.28/7.0))*0.5 + 0.5)
    fine = noise(0.7*K/2, 5)
    alb *= (1 + 0.10*(tex-0.5) + 0.07*fine)[..., None]
    alb *= (1 - 0.35*inner)[..., None]
    alb *= (1 - 0.18*smooth(grooves, 0.8))[..., None]
    alb = alb + stitches[..., None]*0.020

    # ---- Druck ----
    if not back:
        items = [('KUKIRIN SHOP', (450, 497), 25, 'Bold', (255, 255, 255, 255), 5.2)]
        lay = logo_disc(450, 388, 56)
        lay = np.maximum(lay, text_layer(items))
        lay[..., 3] = np.maximum(logo_disc(450, 388, 56)[..., 3], text_layer(items)[..., 3])
    else:
        items = [('RIDE', (450, 372), 92, 'Black', (255, 255, 255, 255), 6),
                 ('ELECTRIC', (450, 438), 56, 'Black', (255, 95, 31, 255), 4),
                 ('KUKIRIN SHOP', (450, 480), 19, 'SemiBold', (200, 200, 205, 255), 6)]
        lay = text_layer(items)
    lay = warp(lay, h, 1.0)
    crack = 1 - 0.22*np.clip(noise(1.2*K/2, 21), 0, None)
    weave = 1 - 0.30*(1-tex)
    A = lay[..., 3]*crack*weave
    ink = srgb2lin(lay[..., :3]**1.0)
    alb = alb*(1-A[..., None]) + ink*A[..., None]

    col = shade(alb, h, amb=0.30, k1=1.55, k2=0.45, nk=1.5, spec=0.035, shin=7, sheen=0.02, sheen_col=(0.9, 0.95, 1.0), ao=1.0, shadow=0.55)
    # Druck leicht glänzend
    n = normals(h, 1.15); hv = LIGHT1 + np.array([0, 0, 1.0]); hv /= np.linalg.norm(hv)
    col += (0.10*A*np.clip(n @ hv, 0, 1)**18)[..., None]
    img = composite(col, M)
    return finish(img, f'{name}.png' if False else f'{name}.jpg')

if __name__ == '__main__':
    shirt(False, 'out_shirt_front'); shirt(True, 'out_shirt_back')
