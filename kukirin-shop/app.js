const FREE_SHIPPING_FROM = 99;
const SHIPPING_FEE = 4.9;
const CART_KEY = "kukirin-cart-v1";
const ORDERS_KEY = "kukirin-orders-v1";

const $ = (sel) => document.querySelector(sel);
const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

let cart = loadJSON(CART_KEY, {});
let state = { cat: "all", sort: "featured" };

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage nicht verfügbar */ }
}

// ---------- Produktbild (SVG-Platzhalter) ----------
function scooterSVG(color, accessory = false) {
  if (accessory) {
    return `<svg viewBox="0 0 320 200" role="img" aria-hidden="true">
      <circle cx="160" cy="100" r="62" fill="${color}" opacity=".18"/>
      <rect x="112" y="64" width="96" height="72" rx="18" fill="none" stroke="${color}" stroke-width="8"/>
      <circle cx="160" cy="100" r="12" fill="${color}"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 320 200" role="img" aria-hidden="true">
    <ellipse cx="160" cy="182" rx="120" ry="8" fill="#000" opacity=".35"/>
    <circle cx="68" cy="146" r="30" fill="#0c0e14" stroke="#3a4066" stroke-width="6"/>
    <circle cx="68" cy="146" r="10" fill="${color}"/>
    <circle cx="252" cy="146" r="30" fill="#0c0e14" stroke="#3a4066" stroke-width="6"/>
    <circle cx="252" cy="146" r="10" fill="${color}"/>
    <path d="M68 146 H236 L248 132 H92 Z" fill="#2a3050"/>
    <rect x="86" y="122" width="150" height="14" rx="7" fill="${color}"/>
    <path d="M238 128 L214 34" stroke="#cfd3e6" stroke-width="9" stroke-linecap="round"/>
    <path d="M196 30 H238" stroke="#cfd3e6" stroke-width="9" stroke-linecap="round"/>
    <circle cx="198" cy="30" r="6" fill="${color}"/>
    <path d="M252 146 L240 130" stroke="#8d94b3" stroke-width="6" stroke-linecap="round"/>
  </svg>`;
}
const imageFor = (p) => scooterSVG(p.color, p.cat === "zubehoer");

// ---------- Produktliste ----------
function visibleProducts() {
  let list = PRODUCTS.filter((p) => state.cat === "all" || p.cat === state.cat);
  const sorters = {
    "price-asc": (a, b) => a.price - b.price,
    "price-desc": (a, b) => b.price - a.price,
    name: (a, b) => a.name.localeCompare(b.name, "de"),
  };
  if (sorters[state.sort]) list = [...list].sort(sorters[state.sort]);
  return list;
}

function renderGrid() {
  $("#grid").innerHTML = visibleProducts().map((p) => `
    <article class="card">
      <button class="card-img" data-open="${p.id}" aria-label="${p.name} ansehen">
        ${p.badge ? `<span class="badge">${p.badge}</span>` : ""}
        ${imageFor(p)}
      </button>
      <div class="card-body">
        <div class="card-name" data-open="${p.id}">${p.name}</div>
        <div class="card-tag">${p.tagline}</div>
        <div class="card-foot">
          <div class="price">${eur.format(p.price)}${p.oldPrice ? `<s>${eur.format(p.oldPrice)}</s>` : ""}</div>
          <button class="add-btn" data-add="${p.id}">In den Warenkorb</button>
        </div>
      </div>
    </article>`).join("");
}

// ---------- Warenkorb ----------
const findProduct = (id) => PRODUCTS.find((p) => p.id === id);

function addToCart(id, qty = 1) {
  if (!findProduct(id)) return;
  cart[id] = Math.min((cart[id] || 0) + qty, 10);
  updateCart();
  const c = $("#cartCount");
  c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump");
  toast(`${findProduct(id).name} hinzugefügt`);
}

function changeQty(id, delta) {
  cart[id] = Math.min((cart[id] || 0) + delta, 10);
  if (cart[id] <= 0) delete cart[id];
  updateCart();
}

function totals() {
  const subtotal = Object.entries(cart).reduce((s, [id, q]) => s + findProduct(id).price * q, 0);
  const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE;
  return { subtotal, shipping, total: subtotal + shipping };
}

function updateCart() {
  // Unbekannte IDs (z. B. alter Katalog) aus dem Speicher entfernen
  for (const id of Object.keys(cart)) if (!findProduct(id)) delete cart[id];
  saveJSON(CART_KEY, cart);

  const entries = Object.entries(cart);
  const count = entries.reduce((s, [, q]) => s + q, 0);
  const t = totals();

  $("#cartCount").textContent = count;
  $("#cartItems").innerHTML = entries.length
    ? entries.map(([id, q]) => {
        const p = findProduct(id);
        return `<div class="line">
          <div class="thumb">${imageFor(p)}</div>
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
    : `<p class="cart-empty">Dein Warenkorb ist leer.</p>`;

  $("#cartSubtotal").textContent = eur.format(t.subtotal);
  $("#cartShipping").textContent = entries.length ? (t.shipping ? eur.format(t.shipping) : "Gratis") : "–";
  $("#cartTotal").textContent = eur.format(t.total);
  $("#shipHint").textContent = entries.length && t.shipping
    ? `Noch ${eur.format(FREE_SHIPPING_FROM - t.subtotal)} bis zum Gratis-Versand.`
    : "";
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
      <div class="pd-img">${imageFor(p)}</div>
      <div>
        <h3>${p.name}</h3>
        <div class="price">${eur.format(p.price)}${p.oldPrice ? `<s>${eur.format(p.oldPrice)}</s>` : ""}</div>
        <p>${p.desc}</p>
        <table class="specs">${Object.entries(p.specs).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}</table>
        <button class="btn btn-primary block" data-add="${p.id}" data-close-after>In den Warenkorb</button>
        <p class="small" style="margin-top:10px">Inkl. MwSt. · Lieferzeit 1–3 Werktage</p>
      </div>
    </div>`;
  dlg.showModal();
}

// ---------- Rechtstexte (Platzhalter) ----------
const LEGAL = {
  impressum: ["Impressum", "Angaben gemäß § 5 DDG: [Firmenname, Anschrift, Vertretungsberechtigte, Kontakt, USt-IdNr.] – bitte vor Livegang ergänzen."],
  datenschutz: ["Datenschutzerklärung", "Hier gehört deine Datenschutzerklärung nach DSGVO hin (verantwortliche Stelle, Verarbeitungszwecke, Hosting, Zahlungsanbieter, Betroffenenrechte). Diese Demo speichert Warenkorb und Testbestellungen nur lokal im Browser."],
  agb: ["Allgemeine Geschäftsbedingungen", "Platzhalter: Vertragsschluss, Preise, Zahlung, Lieferung, Eigentumsvorbehalt, Gewährleistung. Bitte durch rechtssichere AGB ersetzen (z. B. Händlerbund, IT-Recht-Kanzlei)."],
  widerruf: ["Widerrufsbelehrung", "Platzhalter: Du hast das Recht, binnen 14 Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Muster-Widerrufsbelehrung und -formular bitte mit deinen Händlerdaten einfügen."],
  versand: ["Versand & Zahlung", `Versand innerhalb Deutschlands: ${eur.format(SHIPPING_FEE)}, ab ${eur.format(FREE_SHIPPING_FROM)} Warenwert gratis. Lieferzeit 1–3 Werktage (Platzhalter). Zahlungsarten: Rechnung, PayPal, Kreditkarte, Vorkasse (Demo).`],
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
  const t = e.target.closest("button, [data-open]");
  if (!t) return;
  const d = t.dataset;

  if (d.add) {
    addToCart(d.add);
    if ("closeAfter" in d) t.closest("dialog").close();
  } else if (d.open) openProduct(d.open);
  else if (d.inc) changeQty(d.inc, 1);
  else if (d.dec) changeQty(d.dec, -1);
  else if (d.remove) { delete cart[d.remove]; updateCart(); }
  else if (d.legal) openLegal(d.legal);
  else if ("close" in d) t.closest("dialog").close();
  else if (d.cat) {
    state.cat = d.cat;
    document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === t));
    renderGrid();
  }
});

// Klick auf den Dialog-Hintergrund schließt ihn
document.querySelectorAll("dialog").forEach((dlg) =>
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); }));

$("#cartToggle").addEventListener("click", () => setCartOpen(true));
$("#closeCart").addEventListener("click", () => setCartOpen(false));
$("#cartOverlay").addEventListener("click", () => setCartOpen(false));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") setCartOpen(false); });
$("#checkoutBtn").addEventListener("click", openCheckout);
$("#sortSelect").addEventListener("change", (e) => { state.sort = e.target.value; renderGrid(); });
$("#checkoutForm").addEventListener("submit", (e) => { e.preventDefault(); submitOrder(e.target); });

// ---------- Init ----------
$("#heroVisual").innerHTML = scooterSVG("#ff6b35");
$("#year").textContent = new Date().getFullYear();
renderGrid();
updateCart();
