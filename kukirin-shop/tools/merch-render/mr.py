"""Mini-Renderer für Produktfotos (Höhenfeld + Beleuchtung). Arbeitet in 1800x1800, Ausgabe 900x900."""
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi

S = 1800          # interne Auflösung
K = S / 900.0     # Skalierung 900er-Koordinaten -> intern
FONT_DIR = '/usr/share/fonts/opentype/inter/'
def font(size, weight='Black'):
    return ImageFont.truetype(f'{FONT_DIR}Inter-{weight}.otf', int(size * K))

rng = np.random.default_rng(7)

# ---------- Geometrie ----------
def bez(p0, p1, p2, p3, n=48):
    t = np.linspace(0, 1, n)[:, None]
    p0, p1, p2, p3 = map(np.array, (p0, p1, p2, p3))
    return (1-t)**3*p0 + 3*(1-t)**2*t*p1 + 3*(1-t)*t**2*p2 + t**3*p3

def chain(start, *segs):
    """segs: ('L',p) oder ('C',c1,c2,p). Liefert Polylinie (900er-Koordinaten)."""
    pts = [np.array([start], float)]
    cur = np.array(start, float)
    for s in segs:
        if s[0] == 'L':
            pts.append(np.array([s[1]], float)); cur = np.array(s[1], float)
        else:
            pts.append(bez(cur, s[1], s[2], s[3])[1:]); cur = np.array(s[3], float)
    return np.vstack(pts)

def mirror(pts, cx=450):
    m = pts.copy(); m[:, 0] = 2*cx - m[:, 0]; return m[::-1]

def jitter(pts, amp=1.6, seed=1):
    r = np.random.default_rng(seed)
    n = len(pts); i = np.arange(n)
    ph = r.uniform(0, 6.28, 4)
    d = amp*(np.sin(i*0.21+ph[0]) + .6*np.sin(i*0.07+ph[1]))
    e = amp*(np.sin(i*0.17+ph[2]) + .6*np.sin(i*0.05+ph[3]))
    return pts + np.stack([d, e], 1)

def raster(pts, blur=0.0):
    im = Image.new('L', (S, S), 0)
    ImageDraw.Draw(im).polygon([tuple(p) for p in (np.asarray(pts)*K)], fill=255)
    a = np.asarray(im, np.float32)/255
    return ndi.gaussian_filter(a, blur) if blur else a

def line_mask(pts, width, closed=False):
    im = Image.new('L', (S, S), 0); d = ImageDraw.Draw(im)
    p = [tuple(q) for q in (np.asarray(pts)*K)]
    if closed: p.append(p[0])
    d.line(p, fill=255, width=max(1, int(width*K)), joint='curve')
    return np.asarray(im, np.float32)/255

def dashed(pts, width, dash=9, gap=7):
    """gestrichelte Linie (Nähte) entlang Polylinie."""
    pts = np.asarray(pts)
    seg = np.hypot(*np.diff(pts, axis=0).T); cum = np.r_[0, np.cumsum(seg)]
    im = Image.new('L', (S, S), 0); d = ImageDraw.Draw(im)
    t = 0.0
    while t < cum[-1]:
        t2 = min(t+dash, cum[-1])
        a = np.interp(t, cum, pts[:, 0]), np.interp(t, cum, pts[:, 1])
        b = np.interp(t2, cum, pts[:, 0]), np.interp(t2, cum, pts[:, 1])
        d.line([(a[0]*K, a[1]*K), (b[0]*K, b[1]*K)], fill=255, width=max(1, int(width*K)))
        t += dash+gap
    return np.asarray(im, np.float32)/255

def grid():
    y, x = np.mgrid[0:S, 0:S].astype(np.float32)
    return x/K, y/K   # 900er-Koordinaten

# ---------- Rauschen ----------
def noise(sigma, seed=None):
    r = np.random.default_rng(seed) if seed is not None else rng
    n = ndi.gaussian_filter(r.standard_normal((S, S)).astype(np.float32), sigma, mode='wrap')
    return n/ (n.std()+1e-6)

def noise_aniso(sy, sx, seed=None):
    r = np.random.default_rng(seed) if seed is not None else rng
    n = ndi.gaussian_filter(r.standard_normal((S, S)).astype(np.float32), (sy*K, sx*K), mode='wrap')
    return n/(n.std()+1e-6)

def smooth(a, s): return ndi.gaussian_filter(a, s*K, mode='nearest')

# ---------- Text/Druck ----------
def text_layer(items, size=(S, S)):
    """items: (text, (cx,cy), fontsize, weight, color, tracking). Liefert RGBA float."""
    im = Image.new('RGBA', size, (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for t, (cx, cy), fs, w, col, tr in items:
        f = font(fs, w)
        widths = [d.textlength(c, font=f) for c in t]
        total = sum(widths) + tr*K*(len(t)-1)
        x = cx*K - total/2
        for c, wd in zip(t, widths):
            d.text((x, cy*K), c, font=f, fill=col, anchor='ls'); x += wd + tr*K
    return np.asarray(im, np.float32)/255

def logo_disc(cx, cy, r, bg=(255, 95, 31), fg=(255, 255, 255)):
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.ellipse([(cx-r)*K, (cy-r)*K, (cx+r)*K, (cy+r)*K], fill=bg+(255,))
    f = font(r*1.15, 'Black')
    d.text((cx*K, (cy+r*0.40)*K), 'K', font=f, fill=fg+(255,), anchor='ms')
    return np.asarray(im, np.float32)/255

def over(base_rgb, layer_rgba, extra_alpha=None):
    a = layer_rgba[..., 3:4]
    if extra_alpha is not None: a = a*extra_alpha[..., None]
    return base_rgb*(1-a) + layer_rgba[..., :3]*a, a[..., 0]

def srgb2lin(c): c = np.asarray(c, np.float32); return np.where(c <= .04045, c/12.92, ((c+.055)/1.055)**2.4)
def lin2srgb(c): c = np.clip(c, 0, 1); return np.where(c <= .0031308, c*12.92, 1.055*c**(1/2.4)-.055)

def warp(layer, h, strength=1.0):
    """Verschiebt Druck-Ebene mit dem Gradienten der Höhe (folgt Falten)."""
    gy, gx = np.gradient(smooth(h, 1.2))
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    out = np.empty_like(layer)
    for c in range(layer.shape[2]):
        out[..., c] = ndi.map_coordinates(layer[..., c], [yy + gy*strength*9, xx + gx*strength*9], order=1, mode='constant')
    return out

# ---------- Beleuchtung ----------
LIGHT1 = np.array([-0.50, -0.62, 0.60]); LIGHT1 /= np.linalg.norm(LIGHT1)
LIGHT2 = np.array([0.70, -0.15, 0.55]);  LIGHT2 /= np.linalg.norm(LIGHT2)

def normals(h, k=1.0):
    gy, gx = np.gradient(h)
    n = np.stack([-gx*k, -gy*k, np.ones_like(h)], -1)
    return n/np.linalg.norm(n, axis=-1, keepdims=True)

def shade(albedo_lin, h, *, amb=0.38, k1=0.95, k2=0.28, nk=1.0, spec=0.0, shin=24, sheen=0.0, sheen_col=(1, 1, 1),
          ao=0.8, shadow=0.55, shadow_len=16):
    n = normals(h, nk)
    d1 = np.clip(n @ LIGHT1, 0, 1)[..., None]
    d2 = np.clip(n @ LIGHT2, 0, 1)[..., None]
    # Hohlraum-Verdunklung
    cav = np.clip(ndi.gaussian_filter(h, 14*K/2) - h, 0, None)
    occ = np.clip(1 - ao*cav/9.0, 0.35, 1)[..., None]
    # Schlagschatten (Licht von links oben)
    sh = ndi.shift(h, (shadow_len*0.8, shadow_len*0.55), order=1, mode='nearest')
    ss = np.clip((sh - h)/10.0, 0, 1)
    ss = ndi.gaussian_filter(ss, 2.5*K/2)[..., None]
    lit = (amb + k1*d1*(1 - shadow*ss) + k2*d2)*occ
    col = albedo_lin*lit
    if spec:
        hv = LIGHT1 + np.array([0, 0, 1.0]); hv /= np.linalg.norm(hv)
        col = col + spec*(np.clip(n @ hv, 0, 1)**shin)[..., None]*(1 - 0.6*ss)
    if sheen:
        rim = (1 - np.clip(n[..., 2], 0, 1))**2.2
        col = col + sheen*rim[..., None]*np.array(sheen_col, np.float32)
    return col

def composite(color_lin, coverage, shadow_specs=((8, 20, 22, .30), (0, 40, 70, .16)), bg=1.0, mask_for_shadow=None):
    """Garment auf weißem Hintergrund mit weichem Kontaktschatten."""
    m = coverage if mask_for_shadow is None else mask_for_shadow
    img = np.full((S, S, 3), bg, np.float32)
    for dx, dy, sg, al in shadow_specs:
        s = ndi.shift(ndi.gaussian_filter(m, sg*K/2), (dy*K, dx*K), order=1)
        img *= (1 - al*s)[..., None]
    out = lin2srgb(img)*(1 - coverage[..., None]) + lin2srgb(color_lin)*coverage[..., None]
    return out

def finish(arr, name, grain=0.012, zoom=1.0, center=(450, 450)):
    arr = np.clip(arr + rng.standard_normal(arr.shape[:2])[..., None]*grain*(1 - 0.0), 0, 1)
    im = Image.fromarray((arr*255 + .5).astype(np.uint8))
    if zoom != 1.0:
        w = S/zoom; x0 = min(max(center[0]*K - w/2, 0), S-w); y0 = min(max(center[1]*K - w/2, 0), S-w)
        im = im.crop((int(x0), int(y0), int(x0+w), int(y0+w)))
    im = im.resize((900, 900), Image.LANCZOS)
    im.save(name, quality=90, optimize=True); return im
