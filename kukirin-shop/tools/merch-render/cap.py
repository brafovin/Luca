from mr import *

ORANGE_LIN = np.array([0.62, 0.115, 0.018], np.float32)

def cap(name_main='out_cap_front', name_detail='out_cap_detail'):
    X, Y = grid()
    cx, cy, a, b = 450, 505, 236, 262
    u = (X-cx)/a; v = (cy-Y)/b
    top_arc = np.where(np.abs(X-cx) < a, cy + 42*(1-((X-cx)/a)**2), cy+2)
    N = 2.7
    crown_M = ((np.abs(u)**N + np.abs(np.clip(v, 0, None))**N <= 1) & (Y < top_arc) & (Y < cy+60)).astype(np.float32)
    ou = (X-cx)/288; ov = (Y-(cy+4))/122
    brim_M = ((ou**2 + ov**2 <= 1) & (Y >= top_arc) & (Y > cy-10)).astype(np.float32)
    crown_M = ndi.gaussian_filter(crown_M, 0.9); brim_M = ndi.gaussian_filter(brim_M, 0.9)
    M = np.clip(crown_M + brim_M, 0, 1)

    # ---- Höhenfeld ----
    z_crown = 175*np.sqrt(np.clip(1 - np.abs(u)**N - np.abs(np.clip(v, 0, None))**N, 0, 1))
    z_brim = 0.50*(Y-cy) - 0.0013*(X-cx)**2 + 100
    h = np.where(brim_M > 0.5, z_brim, z_crown)
    # Kante des Schirms: Kante nach unten runden
    edge_d = ndi.distance_transform_edt(brim_M > .5).astype(np.float32)/K
    h = np.where(brim_M > 0.5, h - 10*np.exp(-edge_d/6), h)
    h = smooth(h, 0.7)
    # Twill/Faltenrauschen
    h += noise(40*K/2, 61)*1.8*M
    # Nähte der Kappe
    seams = np.zeros((S, S), np.float32)
    seam_pts = []
    for alpha in (0.0, np.deg2rad(60), -np.deg2rad(60)):
        th = np.linspace(0.02, np.pi/2, 80)
        pts = np.stack([cx + a*np.sin(th)*np.sin(alpha), cy - b*np.cos(th)], 1)
        seam_pts.append(pts)
        seams += line_mask(pts, 2.2)
    seams = np.clip(seams*crown_M, 0, 1)
    h -= smooth(seams, 0.9)*4.5
    # Steppnähte auf dem Schirm (parallel zum Rand)
    rows = np.zeros((S, S), np.float32)
    for k in range(1, 8):
        s_ = 1 - (k*9)/288.0
        t = np.linspace(0, np.pi, 90)
        pts = np.stack([cx + 288*s_*np.cos(t), (cy+4) + 122*s_*np.sin(t)], 1)
        rows += dashed(pts, 0.8, 4, 2.5)
    rows = np.clip(rows*brim_M, 0, 1)
    h -= smooth(rows, 0.6)*1.2
    # Knopf & Ösen
    btn = raster(np.array([[cx+18*np.cos(t), 252+10*np.sin(t)*1.0] for t in np.linspace(0, 6.28, 40)], float))
    h += smooth(btn, 1)*14
    eyelets = np.zeros((S, S), np.float32)
    for alpha in (np.deg2rad(32), -np.deg2rad(32)):
        th = 0.95
        ex, ey = cx + a*np.sin(th)*np.sin(alpha), cy - b*np.cos(th)
        im = Image.new('L', (S, S), 0); ImageDraw.Draw(im).ellipse([(ex-6)*K, (ey-6)*K, (ex+6)*K, (ey+6)*K], fill=255)
        eyelets += np.asarray(im, np.float32)/255
    h -= smooth(eyelets, .5)*5

    # ---- Albedo ----
    alb = np.ones((S, S, 3), np.float32)*np.where(brim_M[..., None] > .5, ORANGE_LIN, np.array([0.020, 0.021, 0.025], np.float32))
    tw = (np.sin((X+Y)*6.28/3.6)*0.5 + 0.5)
    alb *= (1 + 0.10*(tw-0.5) + 0.07*noise(0.7*K/2, 62))[..., None]
    alb *= (1 - 0.25*smooth(seams, 0.8) - 0.25*smooth(rows, 0.6))[..., None]
    alb *= (1 - 0.8*eyelets)[..., None]
    alb += (btn*0.0)[..., None]
    # Logo-Patch (gestickt) auf Vorderseite
    lg = logo_disc(cx, 372, 58, bg=(255, 95, 31), fg=(255, 255, 255))
    ring = Image.new('RGBA', (S, S), (0, 0, 0, 0)); ImageDraw.Draw(ring).ellipse([(cx-64)*K, (372-64)*K, (cx+64)*K, (372+64)*K], outline=(255, 255, 255, 255), width=int(3*K))
    ring = np.asarray(ring, np.float32)/255
    lay = np.maximum(lg, ring); lay[..., 3] = np.maximum(lg[..., 3], ring[..., 3])
    lay = warp(lay, h, 1.0)
    thread = (np.sin((X*0.8 + Y*0.6)*6.28/2.2)*0.5 + 0.5)
    A = lay[..., 3]*(0.82 + 0.18*thread)*crown_M
    alb = alb*(1-A[..., None]) + srgb2lin(lay[..., :3])*A[..., None]
    h += smooth(lay[..., 3], .6)*4 + thread*lay[..., 3]*0.7

    col = shade(alb, h, amb=0.30, k1=1.45, k2=0.40, nk=1.0, spec=0.03, shin=9, sheen=0.03, sheen_col=(0.9, 0.95, 1.0), ao=1.0, shadow=0.55, shadow_len=18)
    # Schirm-Oberseite etwas heller, Kante dunkel
    col = col*(1 + 0.15*brim_M[..., None]*(1-np.clip(edge_d/10, 0, 1))[..., None]*-1)
    # Kontaktschatten stärker unter dem Schirm
    img = composite(col, M, shadow_specs=((0, 30, 26, .34), (10, 60, 70, .20)))
    finish(img, name_main + '.jpg', zoom=1.3, center=(450, 470))
    if name_detail is None: return

    # ================= Detailaufnahme: Stickerei =================
    cxd, cyd = 450, 450
    r = np.hypot(X-cxd, Y-cyd); ang = np.arctan2(Y-cyd, X-cxd)
    fabric_h = np.zeros((S, S), np.float32)
    fabric_h += noise(90*K/2, 71)*3.0
    patch = (r < 300).astype(np.float32); patch = ndi.gaussian_filter(patch, 1.2)
    border = ((r > 262) & (r < 300)).astype(np.float32)
    # Satinstich: parallele Linien im Winkel
    def stitch_dir(deg, period):
        t = np.deg2rad(deg); return (X*np.cos(t) + Y*np.sin(t))
    s1 = stitch_dir(32, 1)
    stitch = (np.sin(s1*6.28/5.2)*0.5 + 0.5)
    border_stitch = (np.sin(ang*180)*0.5 + 0.5)
    # K-Maske
    kim = Image.new('L', (S, S), 0); dk = ImageDraw.Draw(kim)
    fk = font(330, 'Black'); dk.text((cxd*K, (cyd+130)*K), 'K', font=fk, fill=255, anchor='ms')
    Kmask = ndi.gaussian_filter(np.asarray(kim, np.float32)/255, 1.0)
    s2 = stitch_dir(-38, 1); stitch2 = (np.sin(s2*6.28/4.6)*0.5 + 0.5)
    hd = fabric_h + patch*10 + border*6 + Kmask*8
    hd += patch*(1-Kmask)*(1-border)*stitch*2.2 + Kmask*stitch2*2.2 + border*border_stitch*2.0
    hd = smooth(hd, 0.5)
    alb_d = np.ones((S, S, 3), np.float32)*np.array([0.020, 0.021, 0.025], np.float32)
    twd = (np.sin((X+Y)*6.28/9)*0.5+0.5)
    alb_d *= (1 + 0.14*(twd-0.5) + 0.08*noise(1.2*K/2, 72))[..., None]
    orange = srgb2lin(np.array([255, 95, 31])/255.0).astype(np.float32); white = srgb2lin(np.array([245, 245, 245])/255.0).astype(np.float32)
    p3 = patch[..., None]
    alb_d = alb_d*(1-p3) + orange*p3*(0.78 + 0.22*stitch[..., None])
    alb_d = alb_d*(1-border[..., None]) + white*border[..., None]*(0.75 + 0.25*border_stitch[..., None])
    alb_d = alb_d*(1-Kmask[..., None]) + white*Kmask[..., None]*(0.78 + 0.22*stitch2[..., None])
    cold = shade(alb_d, hd, amb=0.34, k1=1.25, k2=0.30, nk=0.75, spec=0.0, sheen=0.0, ao=0.8, shadow=0.5, shadow_len=7)
    # Fadenglanz: anisotrop genähert
    sheen_a = (np.clip(np.sin(s1*6.28/5.2), 0, 1)**3*patch*(1-Kmask)*(1-border) + np.clip(np.sin(s2*6.28/4.6), 0, 1)**3*Kmask)*0.10
    cold += sheen_a[..., None]*np.array([1, .8, .7], np.float32)
    vign = 1 - 0.28*((r/700.0)**2)
    out = lin2srgb(cold*vign[..., None])
    finish(out, name_detail + '.jpg', grain=0.014)

if __name__ == '__main__':
    cap()
