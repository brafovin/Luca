from mr import *

def env(Rx, Ry, rough=0.25):
    """Studio-Umgebung: große Softbox links, schmale rechts, Deckenlicht (Ry<0 = oben)."""
    def band(v, c, w, soft): return np.clip(1 - np.abs(v-c)/w, 0, 1)**soft
    box1 = band(Rx, -0.55, 0.22+rough, 1.2)*np.clip(1 - np.abs(Ry+0.05)/0.9, 0, 1)**0.8
    box2 = band(Rx, 0.72, 0.10+rough*0.5, 1.5)*0.35*np.clip(1 - np.abs(Ry)/0.9, 0, 1)
    top = np.clip(-Ry, 0, 1)**2*0.55
    return 0.05 + 1.15*box1 + box2 + top

def bottle(color='black', name='out_bottle_black'):
    X, Y = grid()
    cx = 450
    # ---------- Profil r(y) ----------
    ys = np.array([150, 158, 246, 252, 268, 286, 326, 350, 768, 786, 796], float)
    rs = np.array([48, 64, 66, 50, 48, 64, 94, 100, 100, 92, 74], float)
    def prof(y):
        r = np.interp(y, ys, rs)
        # weiche Schulter
        return r
    Yv = Y[:, 0]
    rrow = np.array([prof(y) for y in Yv[::1]]) if False else np.interp(Yv, ys, rs)
    rrow = ndi.gaussian_filter1d(rrow, 3*K/2)
    inside_y = (Yv > 150) & (Yv < 796)
    rr = np.where(inside_y, rrow, 0)[:, None]
    dx = X - cx
    u = np.clip(dx/np.maximum(rr, 1e-3), -1.0, 1.0)
    cov = (np.abs(dx) < rr).astype(np.float32)*inside_y[:, None]
    cov = ndi.gaussian_filter(cov, 0.8)
    nz = np.sqrt(np.clip(1 - u**2, 0, 1))
    drdy = np.gradient(rrow)/ (1.0/K)   # px pro px (900er-Einheiten ~)
    drdy = ndi.gaussian_filter1d(np.gradient(rrow), 2)[:, None]
    nvec = np.stack([u, -drdy*1.0*np.ones_like(u), nz], -1)
    nvec /= np.linalg.norm(nvec, axis=-1, keepdims=True)

    # ---------- Material je Zone ----------
    cap_zone = ((Y > 150) & (Y < 262)).astype(np.float32)
    body_zone = (Y >= 262).astype(np.float32)
    # Deckel-Rillen
    phi = np.arcsin(np.clip(u, -1, 1))
    groove = np.sin(phi*26)
    nv = nvec.copy()
    nv[..., 0] += cap_zone*0.16*groove
    nv /= np.linalg.norm(nv, axis=-1, keepdims=True)

    if color == 'black':
        base = np.array([0.020, 0.021, 0.024], np.float32); band_col = np.array([0.62, 0.115, 0.018], np.float32)
        txt_fg = (22, 23, 28); txt_acc = (255, 255, 255)
    else:
        base = np.array([0.62, 0.115, 0.018], np.float32); band_col = np.array([0.020, 0.021, 0.024], np.float32)
        txt_fg = (255, 140, 80); txt_acc = (255, 255, 255)

    alb = np.ones((S, S, 3), np.float32)*base
    # Farb-Band
    band_zone = ((Y > 500) & (Y < 580)).astype(np.float32)
    band_zone = ndi.gaussian_filter(band_zone, 0.6)
    alb = alb*(1 - band_zone[..., None]) + band_col*band_zone[..., None]
    # Pulverbeschichtung: feine Körnung
    alb *= (1 + 0.05*noise(0.8*K/2, 81))[..., None]

    # ---------- Aufdruck (abgewickelt auf Zylinder) ----------
    flat = text_layer([
        ('KUKIRIN', (cx, 552), 30, 'Black', txt_fg + (255,), 6),
        ('RIDE', (cx, 664), 46, 'Black', txt_acc + (255,) if color == 'black' else (22, 23, 28, 255), 7),
        ('ELECTRIC', (cx, 698), 19, 'Bold', (150, 152, 160, 255) if color == 'black' else (22, 23, 28, 255), 5),
    ])
    lg = logo_disc(cx, 425, 32, bg=(255, 95, 31) if color == 'black' else (22, 23, 28), fg=(255, 255, 255) if color == 'black' else (255, 140, 80))
    flat = np.maximum(flat, lg); flat[..., 3] = np.maximum(text_layer([('KUKIRIN', (cx, 552), 30, 'Black', (0, 0, 0, 255), 6), ('RIDE', (cx, 664), 46, 'Black', (0, 0, 0, 255), 7), ('ELECTRIC', (cx, 698), 19, 'Bold', (0, 0, 0, 255), 5)])[..., 3], lg[..., 3])
    # Abwicklung: Bildspalte = cx + r*asin(u)*K  (Bogenlänge)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    src_x = cx*K + rr*K*phi
    lay = np.empty_like(flat)
    for c in range(4):
        lay[..., c] = ndi.map_coordinates(flat[..., c], [yy, src_x], order=1, mode='constant')
    crack = 1 - 0.18*np.clip(noise(1.1*K/2, 82), 0, None)
    A = lay[..., 3]*crack*cov
    alb = alb*(1-A[..., None]) + srgb2lin(lay[..., :3])*A[..., None]

    # ---------- Beleuchtung ----------
    V = np.array([0, 0, 1.0], np.float32)
    ndv = nv[..., 2]
    Rx = 2*ndv*nv[..., 0]; Ry = 2*ndv*nv[..., 1]
    diff = np.clip(nv @ LIGHT1, 0, 1)[..., None]*1.3 + 0.30 + np.clip(nv @ LIGHT2, 0, 1)[..., None]*0.35
    fres = 0.04 + 0.96*(1-ndv)**5
    # Pulverlack: breite Reflexion
    e_rough = env(Rx, Ry, 0.30)
    col = alb*diff*(1 - 0.0)
    coat_spec = (0.10 + 0.8*fres)*e_rough*0.9
    col = col + coat_spec[..., None]*(1 - cap_zone[..., None])
    # Edelstahl-Deckel
    e_metal = env(Rx, Ry, 0.10)
    metal = (0.55 + 0.4*fres)*e_metal*0.85 + 0.06*diff[..., 0]
    metal_rgb = metal[..., None]*np.array([0.95, 0.97, 1.0], np.float32)
    col = col*(1 - cap_zone[..., None]) + metal_rgb*cap_zone[..., None]
    # Randdunkelung / Rim
    col = col*(1 - 0.35*np.clip((1-ndv)**2.5, 0, 1)[..., None]*(1 - cap_zone[..., None]*0.5)) + 0.05*(1-ndv)[..., None]**4

    # Schlaufe oben (Torus)
    ring_c = np.array([cx, 108.0]); rx, ry, w = 50, 46, 10
    dxr = (X-ring_c[0])/rx; dyr = (Y-ring_c[1])/ry
    dist = np.sqrt(dxr**2 + dyr**2)
    t = (dist-1)*rx/w
    ring_cov = np.clip(1.2 - np.abs(t), 0, 1)*(Y < 160)
    ring_cov = ndi.gaussian_filter((np.abs(t) < 1).astype(np.float32)*(Y < 160), 0.8)
    rn_z = np.sqrt(np.clip(1 - t**2, 0, 1))
    ang = np.arctan2(dyr, dxr)
    rnx = t*np.cos(ang); rny = t*np.sin(ang)
    rn = np.stack([rnx, rny, rn_z], -1); rn /= np.linalg.norm(rn, axis=-1, keepdims=True)
    rRx = 2*rn[..., 2]*rn[..., 0]; rRy = 2*rn[..., 2]*rn[..., 1]
    ring_col = ((0.5 + 0.4*(1-rn[..., 2])**3)*env(rRx, rRy, 0.12)*0.9 + 0.05)[..., None]*np.array([0.95, 0.97, 1.0], np.float32)

    # Komposition
    total = np.clip(np.maximum(cov, ring_cov), 0, 1)
    full = np.where(ring_cov[..., None] > cov[..., None]*0.5, ring_col, col)
    full = full*(1 - 0.0)
    # Bodenschatten + weicher Reflexionsschatten
    img = np.full((S, S, 3), 1.0, np.float32)
    foot = Image.new('L', (S, S), 0); ImageDraw.Draw(foot).ellipse([(cx-102)*K, (790-18)*K, (cx+102)*K, (790+22)*K], fill=255)
    foot = np.asarray(foot, np.float32)/255
    for dxs, sg, al in ((0, 10, .50), (40, 26, .30), (70, 60, .16)):
        sdw = ndi.shift(ndi.gaussian_filter(foot, sg*K/2), (0, dxs*K*0.5), order=1)
        img *= (1 - al*sdw)[..., None]
    out = lin2srgb(img)*(1 - total[..., None]) + lin2srgb(full)*total[..., None]
    # sanfte Reflexion am Boden
    return finish(out, name + '.jpg', zoom=1.0, center=(450, 450))

if __name__ == '__main__':
    bottle('black', 'out_bottle_black'); bottle('orange', 'out_bottle_orange')
