const FREE_SHIPPING_FROM = 99;
const SHIPPING_FEE = 4.9;
const MAX_QTY = 10;
const CART_KEY = "kukirin-cart-v2";
const ORDERS_KEY = "kukirin-orders-v1";

const $ = (sel) => document.querySelector(sel);
const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const eur0 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

let cart = loadJSON(CART_KEY, {});
let state = { cat: "all", tag: "all", sort: "featured", q: "" };

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage nicht verfügbar */ }
}

const findProduct = (id) => PRODUCTS.find((p) => p.id === id);
const isAbe = (p) => p.tags.includes("abe");
const isScooter = (p) => p.cat === "scooter";
const fmt = (p) => (Number.isInteger(p.price) ? eur0 : eur).format(p.price);

// Warenkorb-Schlüssel: "id|größe|farbe" (Größe/Farbe optional)
const cartKey = (id, size = "", color = "") => [id, size, color].join("|");
function parseKey(key) {
  const [id, size = "", color = ""] = key.split("|");
  return { p: findProduct(id), size, color };
}
const optLabel = ({ size, color }) => [color, size && `Größe ${size}`].filter(Boolean).join(" · ");
const hasOptions = (p) => !!(p.sizes || p.colors);

// ---------- Produktliste ----------
function visibleProducts() {
  const q = state.q.trim().toLowerCase();
  let list = PRODUCTS.filter((p) =>
    (state.cat === "all" || p.cat === state.cat) &&
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
  if (!isScooter(p)) return p.meta.map((v) => `<span>${v}</span>`).join("");
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
        <img class="alt" src="${p.gallery[1] || p.gallery[0]}" alt="" width="450" height="450" loading="lazy" />
      </button>
      <div class="card-body">
        <button class="card-name" data-open="${p.id}">${p.name}</button>
        <div class="card-tag">${p.tagline}</div>
        <div class="meta">${metaChips(p)}</div>
        <div class="card-foot">
          <div class="price">${fmt(p)}</div>
          ${hasOptions(p)
            ? `<button class="add-btn" data-open="${p.id}">Auswählen</button>`
            : `<button class="add-btn" data-add="${p.id}">+ Hinzufügen</button>`}
        </div>
      </div>
    </article>`).join("");
}

function setCat(cat) {
  state.cat = cat;
  state.tag = "all";
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.cat === cat));
  $("#tagChips").hidden = cat !== "scooter";
  document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.tag === "all"));
  renderGrid();
}

function setTag(tag) {
  if (state.cat !== "scooter") setCat("scooter");
  state.tag = tag;
  document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.tag === tag));
  renderGrid();
}

// ---------- Vergleichstabelle ----------
function renderCompare() {
  const rows = PRODUCTS.filter(isScooter).sort((a, b) => a.price - b.price);
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
function addToCart(id, qty = 1, { size = "", color = "" } = {}) {
  const p = findProduct(id);
  if (!p) return;
  const key = cartKey(id, size, color);
  cart[key] = Math.min((cart[key] || 0) + qty, MAX_QTY);
  updateCart();
  const c = $("#cartCount");
  c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump");
  toast(`${p.name} im Warenkorb`);
}

function changeQty(key, delta) {
  cart[key] = Math.min((cart[key] || 0) + delta, MAX_QTY);
  if (cart[key] <= 0) delete cart[key];
  updateCart();
}

function totals() {
  const subtotal = Object.entries(cart).reduce((s, [key, q]) => s + parseKey(key).p.price * q, 0);
  const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE;
  return { subtotal, shipping, total: subtotal + shipping };
}

function updateCart() {
  for (const key of Object.keys(cart)) if (!parseKey(key).p) delete cart[key]; // veraltete Einträge
  saveJSON(CART_KEY, cart);

  const entries = Object.entries(cart);
  const count = entries.reduce((s, [, q]) => s + q, 0);
  const t = totals();

  $("#cartCount").textContent = count;
  $("#cartItems").innerHTML = entries.length
    ? entries.map(([key, q]) => {
        const o = parseKey(key), p = o.p;
        return `<div class="line">
          <div class="thumb"><img src="${p.gallery[color_i(p, o.color)]}" alt="" width="76" height="76" /></div>
          <div>
            <div class="line-name">${p.name}</div>
            ${optLabel(o) ? `<div class="line-opt">${optLabel(o)}</div>` : ""}
            <div class="qty">
              <button data-dec="${key}" aria-label="Weniger">−</button>
              <span>${q}</span>
              <button data-inc="${key}" aria-label="Mehr">+</button>
            </div>
          </div>
          <div>
            <div class="line-price">${eur.format(p.price * q)}</div>
            <button class="remove" data-remove="${key}">Entfernen</button>
          </div>
        </div>`;
      }).join("")
    : `<div class="cart-empty"><p>Dein Warenkorb ist leer.</p><a class="btn btn-primary" href="#shop" data-close-cart>Weiter stöbern</a></div>`;

  $("#cartSubtotal").textContent = eur.format(t.subtotal);
  $("#cartShipping").textContent = entries.length ? (t.shipping ? eur.format(t.shipping) : "Gratis") : "–";
  $("#cartTotal").textContent = eur.format(t.total);
  $("#checkoutBtn").disabled = !entries.length;
}

// Bildindex passend zur gewählten Farbe (sonst erstes Bild)
function color_i(p, color) {
  return p.colors?.find((c) => c.name === color)?.i ?? 0;
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
  const scooter = isScooter(p);
  dlg.dataset.pid = id;
  dlg.dataset.size = "";
  dlg.dataset.color = p.colors ? p.colors[0].name : "";
  dlg.innerHTML = `
    <button class="icon-btn pd-close" data-close aria-label="Schließen">✕</button>
    <div class="pd">
      <div class="pd-gallery">
        <div class="pd-main"><img id="pdMain" src="${p.gallery[0]}" alt="${p.name}" width="900" height="900" /></div>
        ${p.gallery.length > 1 ? `<div class="pd-thumbs">${p.gallery.map((src, i) => `
          <button class="${i === 0 ? "active" : ""}" data-thumb="${src}" aria-label="Bild ${i + 1}"><img src="${src}" alt="" width="62" height="62" loading="lazy" /></button>`).join("")}
        </div>` : ""}
      </div>
      <div class="pd-info">
        <h3>${p.name}</h3>
        <div class="pd-tag">${p.tagline}</div>
        <div class="price">${eur.format(p.price)}</div>
        <div class="small muted">Inkl. MwSt. · ${p.price >= FREE_SHIPPING_FROM ? "Versandkostenfrei" : `zzgl. ${eur.format(SHIPPING_FEE)} Versand (ab ${eur0.format(FREE_SHIPPING_FROM)} gratis)`}</div>
        ${scooter ? `<div class="zone ${isAbe(p) ? "ok" : "warn"}" style="margin-top:14px">
          ${isAbe(p) ? "✓ Mit ABE – für öffentliche Straßen geeignet (max. 20 km/h, Versicherungskennzeichen nötig)" : "⚠️ Keine deutsche ABE – nur für Privatgelände"}
        </div>` : ""}
        <p class="pd-desc">${p.desc}</p>
        ${p.colors ? `<div class="opt-group" id="colorGroup"><span class="opt-label">Farbe: <strong id="colorName">${p.colors[0].name}</strong></span>
          <div class="opts">${p.colors.map((c, k) => `<button type="button" class="swatch ${k === 0 ? "active" : ""}" data-color="${c.name}" data-ci="${c.i}" title="${c.name}" style="--sw:${c.name === "Orange" ? "#ff5f1f" : "#16171c"}" aria-label="${c.name}"></button>`).join("")}</div></div>` : ""}
        ${p.sizes ? `<div class="opt-group" id="sizeGroup"><span class="opt-label">Größe: <strong id="sizeName">bitte wählen</strong></span>
          <div class="opts">${p.sizes.map((z) => `<button type="button" class="opt" data-size="${z}">${z}</button>`).join("")}</div></div>` : ""}
        <ul class="ticks">${p.highlights.map((h) => `<li>${h}</li>`).join("")}</ul>
        <table class="specs">${Object.entries(p.specs).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}</table>
        <button class="btn btn-primary block" data-add-opt="${p.id}">In den Warenkorb</button>
        <p class="pd-note">${p.note ? p.note : scooter ? "Herstellerangaben („bis zu“-Werte). Reichweite hängt von Gewicht, Gelände und Fahrweise ab." : "Lieferzeit 1–3 Werktage Bearbeitung. 14 Tage Widerrufsrecht."}</p>
      </div>
    </div>`;
  dlg.showModal();
  dlg.scrollTop = 0;
  document.title = `${p.name} kaufen – Kukirin Shop`;
  if (location.hash !== `#p-${id}`) history.replaceState(null, "", `#p-${id}`);
}

function addFromDialog(id) {
  const dlg = $("#productDialog");
  const p = findProduct(id);
  if (p.sizes && !dlg.dataset.size) {
    const g = $("#sizeGroup");
    g.classList.remove("invalid"); void g.offsetWidth; g.classList.add("invalid");
    toast("Bitte wähle eine Größe");
    return;
  }
  addToCart(id, 1, { size: dlg.dataset.size, color: dlg.dataset.color });
  dlg.close();
}

const BASE_TITLE = document.title;
$("#productDialog").addEventListener("close", () => {
  document.title = BASE_TITLE;
  if (location.hash.startsWith("#p-")) history.replaceState(null, "", location.pathname + location.search);
});
function openFromHash() {
  const m = location.hash.match(/^#p-(.+)$/);
  if (m && findProduct(m[1]) && !$("#productDialog").open) openProduct(m[1]);
}

// ---------- Rechtstexte ----------
// [title, html, isPlaceholder] – die rechtlichen Texte sind Vorlagen und MÜSSEN vor Livegang ersetzt werden.
const LEGAL = {
  impressum: ["Impressum", `
    <p><strong>Angaben gemäß § 5 DDG</strong></p>
    <p>[Firmenname / Inhaber]<br>[Straße und Hausnummer]<br>[PLZ Ort]</p>
    <p><strong>Vertreten durch:</strong> [Geschäftsführer]<br><strong>Kontakt:</strong> [E-Mail] · [Telefon]<br><strong>Registergericht / Nr.:</strong> [HRB …]<br><strong>USt-IdNr.:</strong> [DE …]</p>
    <p><strong>Verbraucherstreitbeilegung:</strong> Wir sind weder bereit noch verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen. [ggf. anpassen]</p>`, true],
  datenschutz: ["Datenschutzerklärung", `
    <h5>1. Verantwortlicher</h5><p>[Name und Anschrift wie im Impressum]</p>
    <h5>2. Lokaler Speicher im Browser</h5><p>Dieser Shop speichert deinen Warenkorb und deine Cookie-Auswahl im lokalen Speicher deines Browsers. Diese Daten sind technisch notwendig und verlassen dein Gerät nicht.</p>
    <h5>3. Kontaktformular &amp; Bestellung</h5><p>Wenn du uns schreibst oder bestellst, verarbeiten wir deine Angaben zur Bearbeitung deiner Anfrage bzw. zur Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO). [Speicherdauer, Empfänger ergänzen]</p>
    <h5>4. Hosting, Zahlungsanbieter, Versanddienstleister</h5><p>[Anbieter und Rechtsgrundlagen ergänzen]</p>
    <h5>5. Deine Rechte</h5><p>Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Widerspruch und Beschwerde bei einer Aufsichtsbehörde.</p>`, true],
  agb: ["Allgemeine Geschäftsbedingungen", `
    <h5>§ 1 Geltungsbereich</h5><p>[…]</p><h5>§ 2 Vertragsschluss</h5><p>[…]</p><h5>§ 3 Preise und Zahlung</h5><p>[…]</p>
    <h5>§ 4 Lieferung</h5><p>[…]</p><h5>§ 5 Eigentumsvorbehalt</h5><p>[…]</p><h5>§ 6 Gewährleistung</h5><p>[…]</p>
    <h5>§ 7 Nutzungshinweis</h5><p>Scooter ohne ABE dürfen nicht im öffentlichen Straßenverkehr genutzt werden. […]</p>`, true],
  widerruf: ["Widerrufsbelehrung", `
    <h5>Widerrufsrecht</h5><p>Du hast das Recht, binnen 14 Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt 14 Tage ab dem Tag, an dem du oder ein von dir benannter Dritter die Ware in Besitz genommen hast.</p>
    <p>[Vollständige Muster-Widerrufsbelehrung und Muster-Widerrufsformular mit deinen Händlerdaten einfügen]</p>`, true],
  versand: ["Versand & Zahlung", `
    <table class="specs">
      <tr><td>Versand innerhalb Deutschlands</td><td>${eur.format(SHIPPING_FEE)}</td></tr>
      <tr><td>Ab ${eur.format(FREE_SHIPPING_FROM)} Warenwert</td><td>kostenlos</td></tr>
      <tr><td>Bearbeitungszeit</td><td>1–3 Werktage</td></tr>
      <tr><td>Versandart</td><td>Spedition / Paketdienst, versichert</td></tr>
      <tr><td>Zahlungsarten</td><td>Rechnung, PayPal, Kreditkarte, Vorkasse</td></tr>
    </table>
    <p class="small muted">Alle Preise inkl. gesetzlicher MwSt. Lieferung in andere Länder auf Anfrage.</p>`, false],
};

function openLegal(key) {
  const [title, html, placeholder] = LEGAL[key];
  const dlg = $("#infoDialog");
  dlg.innerHTML = `
    <div class="dialog-head"><h3>${title}</h3><button class="icon-btn" data-close aria-label="Schließen">✕</button></div>
    <div class="legal">${html}${placeholder ? '<p class="notice">Vorlage – kein Rechtstext. Vor Livegang durch rechtssichere Texte ersetzen.</p>' : ""}</div>`;
  if (!dlg.open) dlg.showModal();
}

// ---------- Checkout ----------
function openCheckout() {
  if (!Object.keys(cart).length) return;
  setCartOpen(false);
  const needsAck = Object.keys(cart).some((key) => { const p = parseKey(key).p; return isScooter(p) && !isAbe(p); });
  $("#privateGroundCheck").hidden = !needsAck;
  $("#privateGround").required = needsAck;
  const t = totals();
  $("#checkoutSummary").innerHTML = Object.entries(cart).map(([key, q]) => {
    const o = parseKey(key), p = o.p;
    return `<div class="sum-line"><img src="${p.gallery[color_i(p, o.color)]}" alt="" width="44" height="44" /><span>${q}× ${p.name}${optLabel(o) ? ` <small class="muted">(${optLabel(o)})</small>` : ""}</span><strong>${eur.format(p.price * q)}</strong></div>`;
  }).join("") + `<div class="sum-line sum-ship"><span>Versand</span><strong>${t.shipping ? eur.format(t.shipping) : "Gratis"}</strong></div>`;
  $("#checkoutTotal").textContent = eur.format(t.total);
  $("#checkoutDialog").showModal();
}

function submitOrder(form) {
  const data = Object.fromEntries(new FormData(form));
  const order = {
    nr: "KU-" + Date.now().toString(36).toUpperCase(),
    date: new Date().toISOString(),
    items: Object.entries(cart).map(([key, qty]) => {
      const o = parseKey(key);
      return { id: o.p.id, name: o.p.name + (optLabel(o) ? ` (${optLabel(o)})` : ""), qty, price: o.p.price };
    }),
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
  const t = e.target.closest("button, [data-open], [data-close-cart], [data-cat]");
  if (!t) return;
  const d = t.dataset;

  if (d.add) {
    addToCart(d.add);
    if ("closeAfter" in d) t.closest("dialog").close();
  } else if (d.open) {
    const dlg = t.closest("dialog");
    if (dlg) dlg.close();
    openProduct(d.open);
  } else if (d.addOpt) addFromDialog(d.addOpt);
  else if (d.thumb) {
    $("#pdMain").src = d.thumb;
    t.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === t));
  } else if (d.size) {
    $("#productDialog").dataset.size = d.size;
    $("#sizeName").textContent = d.size;
    $("#sizeGroup").classList.remove("invalid");
    t.parentElement.querySelectorAll(".opt").forEach((b) => b.classList.toggle("active", b === t));
  } else if (d.color) {
    $("#productDialog").dataset.color = d.color;
    $("#colorName").textContent = d.color;
    t.parentElement.querySelectorAll(".swatch").forEach((b) => b.classList.toggle("active", b === t));
    const src = findProduct($("#productDialog").dataset.pid).gallery[+d.ci];
    $("#pdMain").src = src;
    document.querySelectorAll(".pd-thumbs button").forEach((b) => b.classList.toggle("active", b.dataset.thumb === src));
  } else if (d.cat) {
    setCat(d.cat);
    if (t.tagName !== "A") {
      if (t.closest(".svc-panel") && typeof svcClose === "function") svcClose();
      $("#shop").scrollIntoView({ behavior: "smooth" });
    }
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
  state.q = ""; $("#searchInput").value = ""; setCat("all");
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
openFromHash();
window.addEventListener("hashchange", openFromHash);
