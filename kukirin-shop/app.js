const FREE_SHIPPING_FROM = 99;
const SHIPPING_FEE = 4.9;
const MAX_QTY = 5;
const CART_KEY = "kukirin-cart-v2";
const ORDERS_KEY = "kukirin-orders-v1";

const $ = (sel) => document.querySelector(sel);
const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const eur0 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

let cart = loadJSON(CART_KEY, {});
let state = { tag: "all", sort: "featured", q: "" };

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage nicht verfügbar */ }
}

const findProduct = (id) => PRODUCTS.find((p) => p.id === id);
const isAbe = (p) => p.tags.includes("abe");

// ---------- Produktliste ----------
function visibleProducts() {
  const q = state.q.trim().toLowerCase();
  let list = PRODUCTS.filter((p) =>
    (state.tag === "all" || p.tags.includes(state.tag)) &&
    (!q || `${p.name} ${p.tagline}`.toLowerCase().includes(q)));
  const sorters = {
    "price-asc": (a, b) => a.price - b.price,
    "price-desc": (a, b) => b.price - a.price,
    name: (a, b) => a.name.localeCompare(b.name, "de"),
    featured: (a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0),
  };
  return [...list].sort(sorters[state.sort]);
}

function metaChips(p) {
  const c = p.cmp;
  return [c.motor, c.speed, c.range].filter((v) => v && v !== "–").slice(0, 3)
    .map((v) => `<span>${v}</span>`).join("");
}

function renderGrid() {
  const list = visibleProducts();
  $("#empty").hidden = list.length > 0;
  $("#grid").innerHTML = list.map((p, i) => `
    <article class="card">
      <button class="card-img" data-open="${p.id}" aria-label="${p.name} ansehen">
        ${p.badge ? `<span class="badge ${isAbe(p) ? "abe" : ""}">${p.badge}</span>` : ""}
        <img src="${p.gallery[0]}" alt="${p.name}" width="450" height="450" ${i > 2 ? 'loading="lazy"' : ""} />
        <img class="alt" src="${p.gallery[1]}" alt="" width="450" height="450" loading="lazy" />
      </button>
      <div class="card-body">
        <button class="card-name" data-open="${p.id}">${p.name}</button>
        <div class="card-tag">${p.tagline}</div>
        <div class="meta">${metaChips(p)}</div>
        <div class="card-foot">
          <div class="price">${eur0.format(p.price)}</div>
          <button class="add-btn" data-add="${p.id}">+ Hinzufügen</button>
        </div>
      </div>
    </article>`).join("");
}

function setTag(tag) {
  state.tag = tag;
  document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.tag === tag));
  renderGrid();
}

// ---------- Vergleichstabelle ----------
function renderCompare() {
  const rows = [...PRODUCTS].sort((a, b) => a.price - b.price);
  $("#cmpTable").innerHTML = `
    <thead><tr>
      <th>Modell</th><th>Preis</th><th>Motor</th><th>Akku</th><th>Speed</th><th>Reichweite</th><th>Reifen</th><th>Straße (ABE)</th>
    </tr></thead>
    <tbody>${rows.map((p) => `
      <tr>
        <td><button class="model" data-open="${p.id}"><img src="${p.gallery[0]}" alt="" width="52" height="52" loading="lazy" />${p.name.replace("Kukirin ", "")}</button></td>
        <td><strong>${eur0.format(p.price)}</strong></td>
        <td>${p.cmp.motor}</td><td>${p.cmp.akku}</td><td>${p.cmp.speed}</td><td>${p.cmp.range}</td><td>${p.cmp.tire}</td>
        <td>${isAbe(p) ? '<span class="yes">✓ Ja</span>' : '<span class="no">Nur Privatgelände</span>'}</td>
      </tr>`).join("")}
    </tbody>`;
}

// ---------- Warenkorb ----------
function addToCart(id, qty = 1) {
  if (!findProduct(id)) return;
  cart[id] = Math.min((cart[id] || 0) + qty, MAX_QTY);
  updateCart();
  const c = $("#cartCount");
  c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump");
  toast(`${findProduct(id).name} im Warenkorb`);
}

function changeQty(id, delta) {
  cart[id] = Math.min((cart[id] || 0) + delta, MAX_QTY);
  if (cart[id] <= 0) delete cart[id];
  updateCart();
}

function totals() {
  const subtotal = Object.entries(cart).reduce((s, [id, q]) => s + findProduct(id).price * q, 0);
  const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE;
  return { subtotal, shipping, total: subtotal + shipping };
}

function updateCart() {
  for (const id of Object.keys(cart)) if (!findProduct(id)) delete cart[id]; // veraltete Einträge
  saveJSON(CART_KEY, cart);

  const entries = Object.entries(cart);
  const count = entries.reduce((s, [, q]) => s + q, 0);
  const t = totals();

  $("#cartCount").textContent = count;
  $("#cartItems").innerHTML = entries.length
    ? entries.map(([id, q]) => {
        const p = findProduct(id);
        return `<div class="line">
          <div class="thumb"><img src="${p.gallery[0]}" alt="" width="76" height="76" /></div>
          <div>
            <div class="line-name">${p.name}</div>
            <div class="qty">
              <button data-dec="${id}" aria-label="Weniger">−</button>
              <span>${q}</span>
              <button data-inc="${id}" aria-label="Mehr">+</button>
            </div>
          </div>
          <div>
            <div class="line-price">${eur.format(p.price * q)}</div>
            <button class="remove" data-remove="${id}">Entfernen</button>
          </div>
        </div>`;
      }).join("")
    : `<div class="cart-empty"><p>Dein Warenkorb ist leer.</p><a class="btn btn-primary" href="#shop" data-close-cart>Scooter ansehen</a></div>`;

  $("#cartSubtotal").textContent = eur.format(t.subtotal);
  $("#cartShipping").textContent = entries.length ? (t.shipping ? eur.format(t.shipping) : "Gratis") : "–";
  $("#cartTotal").textContent = eur.format(t.total);
  $("#checkoutBtn").disabled = !entries.length;
}

function setCartOpen(open) {
  $("#cart").classList.toggle("open", open);
  $("#cartOverlay").classList.toggle("open", open);
  $("#cart").setAttribute("aria-hidden", String(!open));
  document.body.style.overflow = open ? "hidden" : "";
}

// ---------- Produktdialog ----------
function openProduct(id) {
  const p = findProduct(id);
  if (!p) return;
  const dlg = $("#productDialog");
  dlg.innerHTML = `
    <button class="icon-btn pd-close" data-close aria-label="Schließen">✕</button>
    <div class="pd">
      <div class="pd-gallery">
        <div class="pd-main"><img id="pdMain" src="${p.gallery[0]}" alt="${p.name}" width="900" height="900" /></div>
        <div class="pd-thumbs">${p.gallery.map((src, i) => `
          <button class="${i === 0 ? "active" : ""}" data-thumb="${src}" aria-label="Bild ${i + 1}"><img src="${src}" alt="" width="62" height="62" loading="lazy" /></button>`).join("")}
        </div>
      </div>
      <div class="pd-info">
        <h3>${p.name}</h3>
        <div class="pd-tag">${p.tagline}</div>
        <div class="price">${eur.format(p.price)}</div>
        <div class="small muted">Inkl. MwSt. · ${p.price >= FREE_SHIPPING_FROM ? "Versandkostenfrei" : "zzgl. Versand"}</div>
        <div class="zone ${isAbe(p) ? "ok" : "warn"}" style="margin-top:14px">
          ${isAbe(p) ? "✓ Mit ABE – für öffentliche Straßen geeignet (max. 20 km/h, Versicherungskennzeichen nötig)" : "⚠️ Keine deutsche ABE – nur für Privatgelände"}
        </div>
        <p class="pd-desc">${p.desc}</p>
        <ul class="ticks">${p.highlights.map((h) => `<li>${h}</li>`).join("")}</ul>
        <table class="specs">${Object.entries(p.specs).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}</table>
        <button class="btn btn-primary block" data-add="${p.id}" data-close-after>In den Warenkorb</button>
        <p class="pd-note">Herstellerangaben („bis zu“-Werte). Reichweite hängt von Gewicht, Gelände und Fahrweise ab.</p>
      </div>
    </div>`;
  dlg.showModal();
  dlg.scrollTop = 0;
}

// ---------- Rechtstexte (Platzhalter) ----------
const LEGAL = {
  impressum: ["Impressum", "Angaben gemäß § 5 DDG: [Firmenname, Anschrift, Vertretungsberechtigte, Kontakt, USt-IdNr.] – bitte vor Livegang ergänzen."],
  datenschutz: ["Datenschutzerklärung", "Hier gehört deine Datenschutzerklärung nach DSGVO hin (verantwortliche Stelle, Verarbeitungszwecke, Hosting, Zahlungsanbieter, Betroffenenrechte). Diese Demo speichert Warenkorb und Testbestellungen nur lokal im Browser."],
  agb: ["Allgemeine Geschäftsbedingungen", "Platzhalter: Vertragsschluss, Preise, Zahlung, Lieferung, Eigentumsvorbehalt, Gewährleistung. Bitte durch rechtssichere AGB ersetzen (z. B. Händlerbund, IT-Recht-Kanzlei)."],
  widerruf: ["Widerrufsbelehrung", "Platzhalter: Du hast das Recht, binnen 14 Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Muster-Widerrufsbelehrung und -formular bitte mit deinen Händlerdaten einfügen."],
  versand: ["Versand & Zahlung", `Versand innerhalb Deutschlands: ${eur.format(SHIPPING_FEE)}, ab ${eur.format(FREE_SHIPPING_FROM)} Warenwert gratis. Lieferzeit 1–3 Werktage Bearbeitung (Platzhalter). Zahlungsarten: Rechnung, PayPal, Kreditkarte, Vorkasse (Demo).`],
};

function openLegal(key) {
  const [title, text] = LEGAL[key];
  const dlg = $("#infoDialog");
  dlg.innerHTML = `
    <div class="dialog-head"><h3>${title}</h3><button class="icon-btn" data-close aria-label="Schließen">✕</button></div>
    <div class="legal"><p>${text}</p><p class="notice">Platzhaltertext – kein Rechtstext.</p></div>`;
  if (!dlg.open) dlg.showModal();
}

// ---------- Checkout ----------
function openCheckout() {
  if (!Object.keys(cart).length) return;
  setCartOpen(false);
  const needsAck = Object.keys(cart).some((id) => !isAbe(findProduct(id)));
  $("#privateGroundCheck").hidden = !needsAck;
  $("#privateGround").required = needsAck;
  $("#checkoutTotal").textContent = eur.format(totals().total);
  $("#checkoutDialog").showModal();
}

function submitOrder(form) {
  const data = Object.fromEntries(new FormData(form));
  const order = {
    nr: "KU-" + Date.now().toString(36).toUpperCase(),
    date: new Date().toISOString(),
    items: Object.entries(cart).map(([id, qty]) => ({ id, name: findProduct(id).name, qty, price: findProduct(id).price })),
    totals: totals(),
    customer: data,
  };
  saveJSON(ORDERS_KEY, [...loadJSON(ORDERS_KEY, []), order]);
  cart = {};
  updateCart();
  form.reset();
  $("#checkoutDialog").close();

  const dlg = $("#infoDialog");
  dlg.innerHTML = `
    <div class="dialog-head"><h3>Danke für deine Bestellung! ✓</h3><button class="icon-btn" data-close aria-label="Schließen">✕</button></div>
    <div class="legal"><p></p><p class="notice">Demo-Modus: Es wurde nichts bezahlt und nichts versendet.</p></div>`;
  dlg.querySelector("p").textContent = `Bestellnummer ${order.nr}. Eine Bestätigung geht an ${data.email}.`;
  dlg.showModal();
}

// ---------- Toast ----------
let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

// ---------- Events ----------
document.addEventListener("click", (e) => {
  const t = e.target.closest("button, [data-open], [data-close-cart]");
  if (!t) return;
  const d = t.dataset;

  if (d.add) {
    addToCart(d.add);
    if ("closeAfter" in d) t.closest("dialog").close();
  } else if (d.open) {
    const dlg = t.closest("dialog");
    if (dlg) dlg.close();
    openProduct(d.open);
  } else if (d.thumb) {
    $("#pdMain").src = d.thumb;
    t.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === t));
  } else if (d.inc) changeQty(d.inc, 1);
  else if (d.dec) changeQty(d.dec, -1);
  else if (d.remove) { delete cart[d.remove]; updateCart(); }
  else if (d.legal) openLegal(d.legal);
  else if (d.tag) setTag(d.tag);
  else if (d.pick) {
    setTag(d.pick);
    $("#shop").scrollIntoView({ behavior: "smooth" });
  } else if ("closeCart" in d) setCartOpen(false);
  else if ("close" in d) t.closest("dialog").close();
});

// Hero-Tag ist ein <button data-open>, Tabellen-/Karten-Namen ebenso
document.querySelectorAll("dialog").forEach((dlg) =>
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); }));

$("#cartToggle").addEventListener("click", () => setCartOpen(true));
$("#closeCart").addEventListener("click", () => setCartOpen(false));
$("#cartOverlay").addEventListener("click", () => setCartOpen(false));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") setCartOpen(false); });
$("#checkoutBtn").addEventListener("click", openCheckout);
$("#sortSelect").addEventListener("change", (e) => { state.sort = e.target.value; renderGrid(); });
$("#searchInput").addEventListener("input", (e) => { state.q = e.target.value; renderGrid(); });
$("#resetFilters").addEventListener("click", () => {
  state.q = ""; $("#searchInput").value = ""; setTag("all");
});
$("#checkoutForm").addEventListener("submit", (e) => { e.preventDefault(); submitOrder(e.target); });

// Sticky-CTA (mobil) nur zwischen Hero und Shop zeigen
if ("IntersectionObserver" in window) {
  const watch = (sel, cls) => new IntersectionObserver(([e]) => document.body.classList.toggle(cls, e.isIntersecting), { threshold: 0.05 }).observe($(sel));
  watch("#shop", "in-shop");
  watch(".hero", "in-hero");
}

// ---------- Init ----------
$("#year").textContent = new Date().getFullYear();
renderGrid();
renderCompare();
updateCart();
