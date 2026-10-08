// Kundenservice-Widget (unten links), FAQ-Wissensbasis, Cookie-Hinweis.
// Läuft nach app.js und nutzt dessen Helfer ($, eur, loadJSON, saveJSON, PRODUCTS …).

// ====== KONFIGURATION – vor Livegang ausfüllen ======
const SERVICE = {
  email: "",                    // z. B. "service@dein-shop.de" → Formular öffnet dann das Mailprogramm
  phone: "",                    // z. B. "+49 30 1234567" (wird nur angezeigt, wenn gesetzt)
  hours: "Mo–Fr 9:00–17:00 Uhr",
  reply: "innerhalb von 1–2 Werktagen",
};
const TICKETS_KEY = "kukirin-tickets-v1";
const CONSENT_KEY = "kukirin-consent-v1";

// ====== Wissensbasis (speist FAQ-Bereich UND Chat-Assistent) ======
// kw: Suchbegriffe in normalisierter Schreibweise (klein, ae/oe/ue/ss)
const KB = [
  {
    id: "versand", faq: true, chip: "Versand & Lieferzeit",
    q: "Wie lange dauert der Versand und was kostet er?",
    kw: ["versand", "liefer", "paket", "spedition", "dauer", "ankunft", "sendung", "wie lange", "versandkosten"],
    a: () => `Lagernde Artikel verlassen unser Lager in der Regel <strong>innerhalb von 1–3 Werktagen</strong>. Der Versand ist ab <strong>${eur.format(FREE_SHIPPING_FROM)}</strong> Warenwert kostenlos, darunter berechnen wir ${eur.format(SHIPPING_FEE)}. Scooter werden versichert per Spedition oder Paketdienst verschickt.`,
  },
  {
    id: "rueckgabe", faq: true, chip: "Rückgabe & Widerruf",
    q: "Kann ich meinen Scooter zurückgeben?",
    kw: ["rueckgabe", "zurueck", "widerruf", "retoure", "umtausch", "stornier", "rueckversand"],
    a: () => `Ja. Du hast ein <strong>14-tägiges Widerrufsrecht</strong> ab Erhalt der Ware. Schreib uns einfach über das Kontaktformular – wir senden dir die Rücksendeinformationen. Die Ware muss dafür vollständig und in unbenutztem Zustand zurückkommen. <button class="inline-link" data-legal="widerruf">Widerrufsbelehrung ansehen</button>`,
  },
  {
    id: "abe", faq: true, chip: "Straßenzulassung (ABE)",
    q: "Darf ich den Scooter auf der Straße fahren?",
    kw: ["abe", "strasse", "zulassung", "legal", "erlaubt", "versicherung", "kennzeichen", "ekfv", "gesetz", "strassenverkehr", "darf ich", "radweg", "polizei"],
    a: () => `Auf öffentlichen Straßen und Radwegen sind in Deutschland nur Scooter mit <strong>ABE</strong>, <strong>Versicherungskennzeichen</strong> und maximal <strong>20 km/h</strong> erlaubt. Im Shop ist das aktuell das <button class="inline-link" data-open="g2-pro-abe">Kukirin G2 Pro ABE</button>. Alle anderen Modelle sind nur für <strong>Privatgelände</strong> gedacht.`,
  },
  {
    id: "zahlung", chip: "Zahlungsarten",
    q: "Welche Zahlungsarten gibt es?",
    kw: ["zahl", "rechnung", "paypal", "kreditkarte", "vorkasse", "bezahl", "visa", "mastercard", "ueberweisung"],
    a: () => `Du kannst per <strong>Rechnung, PayPal, Kreditkarte oder Vorkasse</strong> bezahlen. Alle Preise sind Endpreise inkl. MwSt.`,
  },
  {
    id: "garantie", faq: true, chip: "Garantie & Defekt",
    q: "Was ist bei einem Defekt oder Garantiefall?",
    kw: ["garantie", "gewaehrleistung", "defekt", "kaputt", "reklamation", "mangel", "reparatur", "funktioniert nicht"],
    a: () => `Es gilt die <strong>gesetzliche Gewährleistung</strong>. Bei einem Defekt schreib uns bitte mit Bestellnummer und ein paar Fotos über das Kontaktformular – wir kümmern uns um die Abwicklung.`,
    action: { label: "Nachricht an das Team", run: () => svcShowForm({ topic: "Defekt / Reklamation" }) },
  },
  {
    id: "ersatzteile", faq: true, chip: "Ersatzteile & Zubehör",
    q: "Gibt es Ersatzteile und Zubehör?",
    kw: ["ersatzteil", "zubehoer", "reifen", "ladegeraet", "helm", "schloss", "bremsbelag", "schlauch"],
    a: () => `Zubehör führen wir derzeit nicht im Shop. <strong>Ersatzteile besorgen wir auf Anfrage</strong> – schreib uns einfach das Modell und das gewünschte Teil.`,
    action: { label: "Teil anfragen", run: () => svcShowForm({ topic: "Ersatzteile / Zubehör" }) },
  },
  {
    id: "reichweite", faq: true, chip: "Reichweite",
    q: "Wie sind die Reichweitenangaben zu verstehen?",
    kw: ["reichweite", "wie weit", "akkulaufzeit", "km pro ladung", "akku"],
    a: () => `Die Angaben sind <strong>Herstellerwerte („bis zu“)</strong> unter Idealbedingungen: ebene Strecke, mittleres Fahrergewicht, niedrige Fahrstufe. In der Praxis ist die Reichweite je nach Gewicht, Gelände, Temperatur und Fahrweise geringer. Die Werte siehst du pro Modell im Datenblatt und im <a class="inline-link" href="#vergleich" data-svc-close>Vergleich</a>.`,
  },
  {
    id: "fuehrerschein", faq: true, chip: "Führerschein & Alter",
    q: "Brauche ich einen Führerschein oder ein Mindestalter?",
    kw: ["fuehrerschein", "mindestalter", "jahre alt", "kinder", "ab wieviel", "helmpflicht", "helm pflicht"],
    a: () => `Für ABE-Scooter im Straßenverkehr brauchst du <strong>keinen Führerschein</strong>, aber ein <strong>Mindestalter von 14 Jahren</strong> und das Versicherungskennzeichen. Eine Helmpflicht gibt es nicht, wir empfehlen aber dringend einen Helm. Für Privatgelände gelten die Regeln des Grundstückseigentümers.`,
  },
  {
    id: "beratung", chip: "Welcher Scooter passt?",
    q: "Welcher Scooter passt zu mir?",
    kw: ["welcher", "empfehl", "beratung", "passt", "vergleich", "unterschied", "besser", "anfaenger", "pendeln"],
    a: () => `Im <strong>Scooter-Berater</strong> findest du in vier Fragen das passende Modell, oder du vergleichst alle Modelle in der Tabelle.`,
    action: { label: "Zum Berater", run: () => { svcClose(); location.hash = "#finder"; } },
  },
  {
    id: "preis", chip: null,
    q: "Preise",
    kw: ["preis", "kosten", "guenstig", "rabatt", "gutschein", "angebot", "sale", "teuer"],
    a: () => `Alle Preise im Shop sind <strong>Endpreise inkl. MwSt.</strong> Ab ${eur.format(FREE_SHIPPING_FROM)} liefern wir versandkostenfrei. Die günstigsten Modelle findest du mit dem Filter „Bis 500 €“.`,
    action: { label: "Modelle bis 500 €", run: () => { svcClose(); setTag("budget"); $("#shop").scrollIntoView({ behavior: "smooth" }); } },
  },
  {
    id: "bestellung", chip: "Bestellstatus",
    q: "Bestellstatus",
    kw: ["bestellung", "bestellstatus", "tracking", "sendungsverfolgung", "wo ist mein", "bestellnummer", "status"],
    a: () => `Gib mir bitte deine <strong>Bestellnummer</strong> ein (z. B. <em>KU-ABC123</em>), dann schaue ich nach.`,
    after: () => { svc.awaitOrder = true; },
  },
  {
    id: "kontakt", chip: "Mit dem Team sprechen",
    q: "Kontakt",
    kw: ["kontakt", "mensch", "mitarbeiter", "anrufen", "telefon", "email", "mail", "schreiben", "support", "berater sprechen", "person"],
    a: () => `Gern! Unser Team erreichst du über das Kontaktformular${SERVICE.email ? ` oder per E-Mail an <a class="inline-link" href="mailto:${SERVICE.email}">${SERVICE.email}</a>` : ""}${SERVICE.phone ? `, telefonisch unter <a class="inline-link" href="tel:${SERVICE.phone.replace(/\s/g, "")}">${SERVICE.phone}</a>` : ""}. Erreichbar: ${SERVICE.hours}. Antwort ${SERVICE.reply}.`,
    action: { label: "Nachricht schreiben", run: () => svcShowForm() },
  },
];

const GREET = ["hallo", "hi", "hey", "moin", "servus", "guten tag", "guten morgen", "guten abend"];
const THANKS = ["danke", "dankeschoen", "super", "perfekt", "top"];

function norm(s) {
  return s.toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function matchKB(text) {
  const t = " " + norm(text) + " ";
  let best = null, bestScore = 0;
  for (const e of KB) {
    const score = e.kw.reduce((s, k) => s + (t.includes(k.length <= 3 ? ` ${k} ` : k) ? 1 : 0), 0);
    if (score > bestScore) { best = e; bestScore = score; }
  }
  return best;
}

// ====== FAQ-Bereich aus der Wissensbasis ======
function renderFaq() {
  $("#faqList").innerHTML = KB.filter((e) => e.faq).map((e) => `
    <details><summary>${e.q}</summary><p>${e.a()}</p></details>`).join("") + `
    <p class="faq-more">Deine Frage ist nicht dabei? <button class="link" data-service>Frag unseren Kundenservice</button></p>`;
}

// ====== Widget ======
const svc = { open: false, awaitOrder: false, started: false };

function buildWidget() {
  const contact = [
    SERVICE.email && `<a href="mailto:${SERVICE.email}">${SERVICE.email}</a>`,
    SERVICE.phone && `<a href="tel:${SERVICE.phone.replace(/\s/g, "")}">${SERVICE.phone}</a>`,
  ].filter(Boolean).join(" · ");

  document.body.insertAdjacentHTML("beforeend", `
    <button class="svc-launch" id="svcLaunch" aria-haspopup="dialog" aria-expanded="false" aria-controls="svcPanel">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12Z"/><path d="M9 11h6M9 14h4"/></svg>
      <span>Kundenservice</span>
    </button>
    <section class="svc-panel" id="svcPanel" role="dialog" aria-label="Kundenservice" aria-hidden="true">
      <header class="svc-head">
        <div class="svc-avatar" aria-hidden="true">K</div>
        <div class="svc-title">
          <strong>Kukirin Kundenservice</strong>
          <span>Assistent · Team ${SERVICE.hours}</span>
        </div>
        <button class="svc-x" data-svc-close aria-label="Kundenservice schließen">✕</button>
      </header>
      <div class="svc-body" id="svcChat">
        <div class="svc-log" id="svcLog" role="log" aria-live="polite"></div>
        <form class="svc-foot" id="svcForm" autocomplete="off">
          <input id="svcInput" type="text" placeholder="Frage stellen …" aria-label="Deine Frage" maxlength="200" />
          <button class="svc-send" type="submit" aria-label="Senden">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 14-7-5 14-2-6-7-1Z"/></svg>
          </button>
        </form>
        <button class="svc-team" data-svc-form>✉️ Lieber direkt mit dem Team schreiben</button>
      </div>
      <form class="svc-body svc-contact" id="svcContact" hidden>
        <button type="button" class="svc-back" data-svc-back>← Zurück zum Chat</button>
        <h4>Nachricht an das Team</h4>
        <p class="small muted">Antwort ${SERVICE.reply}.${contact ? ` Oder direkt: ${contact}` : ""}</p>
        <label>Name<input name="name" required autocomplete="name" /></label>
        <label>E-Mail<input name="email" type="email" required autocomplete="email" /></label>
        <label>Thema
          <select name="topic">
            <option>Frage zu einem Produkt</option>
            <option>Bestellung / Lieferung</option>
            <option>Rückgabe / Widerruf</option>
            <option>Defekt / Reklamation</option>
            <option>Ersatzteile / Zubehör</option>
            <option>Sonstiges</option>
          </select>
        </label>
        <label>Bestellnummer (optional)<input name="order" placeholder="KU-…" /></label>
        <label>Nachricht<textarea name="message" rows="3" required maxlength="2000"></textarea></label>
        <label class="check"><input type="checkbox" required /> Ich habe die <button type="button" class="link" data-legal="datenschutz">Datenschutzerklärung</button> gelesen.</label>
        <button class="btn btn-primary block" type="submit">Nachricht senden</button>
      </form>
      <div class="svc-body svc-done" id="svcDone" hidden></div>
    </section>`);
}

function svcLog() { return $("#svcLog"); }
function scrollLog() { const l = svcLog(); l.scrollTop = l.scrollHeight; }

function addUser(text) {
  const el = document.createElement("div");
  el.className = "msg me";
  el.textContent = text;
  svcLog().append(el);
  scrollLog();
}

function addBot(html, { chips, action } = {}) {
  const el = document.createElement("div");
  el.className = "msg bot";
  el.innerHTML = html;
  svcLog().append(el);
  if (action) {
    const b = document.createElement("button");
    b.className = "svc-action";
    b.textContent = action.label + " →";
    b.addEventListener("click", action.run);
    el.append(b);
  }
  if (chips) {
    const wrap = document.createElement("div");
    wrap.className = "svc-chips";
    wrap.innerHTML = chips.map((c) => `<button data-svc-q="${c.id}">${c.chip}</button>`).join("");
    svcLog().append(wrap);
  }
  scrollLog();
}

function botSay(html, opts) {
  const dots = document.createElement("div");
  dots.className = "msg bot typing";
  dots.innerHTML = "<span></span><span></span><span></span>";
  svcLog().append(dots);
  scrollLog();
  return new Promise((resolve) => setTimeout(() => {
    dots.remove();
    addBot(html, opts);
    resolve();
  }, 450 + Math.min(html.length, 400) * 1.2));
}

function topicChips() { return KB.filter((e) => e.chip); }

function svcStart() {
  if (svc.started) return;
  svc.started = true;
  const hour = new Date().getHours();
  const hello = hour < 11 ? "Guten Morgen" : hour < 18 ? "Hallo" : "Guten Abend";
  addBot(`${hello}! 👋 Ich bin der <strong>automatische Assistent</strong> von Kukirin Shop und beantworte dir gern die häufigsten Fragen. Wobei kann ich helfen?`, { chips: topicChips() });
}

async function svcAnswer(entry) {
  svc.awaitOrder = false;
  await botSay(entry.a(), { action: entry.action });
  if (entry.after) entry.after();
}

async function svcHandle(text) {
  addUser(text);
  if (svc.awaitOrder) { svc.awaitOrder = false; return lookupOrder(text); }
  const n = norm(text);
  if (/\bku [a-z0-9]{4,}\b/.test(n)) return lookupOrder(text);
  const entry = matchKB(text);
  if (entry) return svcAnswer(entry);
  if (GREET.some((g) => n === g || n.startsWith(g + " "))) {
    return botSay("Hallo! Schön, dass du da bist. Stell mir einfach deine Frage oder wähle ein Thema:", { chips: topicChips() });
  }
  if (n.split(" ").some((w) => THANKS.includes(w))) return botSay("Sehr gern! Falls noch etwas offen ist, melde dich jederzeit. 🙂");
  return botSay(
    "Dazu habe ich leider keine passende Antwort. Unser Team hilft dir persönlich weiter – oder probier eines dieser Themen:",
    { chips: topicChips().slice(0, 5), action: { label: "Nachricht an das Team", run: () => svcShowForm() } },
  );
}

function lookupOrder(text) {
  const m = norm(text).replace(/ /g, "").match(/ku[a-z0-9]{3,}/);
  const nr = m ? m[0].replace(/^ku/, "KU-").toUpperCase() : "";
  const order = loadJSON(ORDERS_KEY, []).find((o) => o.nr.replace("-", "") === nr.replace("-", ""));
  if (!order) {
    return botSay(`Zu <strong>${nr || "dieser Eingabe"}</strong> finde ich keine Bestellung. Prüf bitte die Nummer aus deiner Bestätigungsmail – oder schreib dem Team, dann schauen wir nach.`,
      { action: { label: "Nachricht an das Team", run: () => svcShowForm({ topic: "Bestellung / Lieferung", order: nr }) } });
  }
  const items = order.items.map((i) => `${i.qty}× ${i.name}`).join(", ");
  const date = new Date(order.date).toLocaleDateString("de-DE");
  return botSay(`<strong>Bestellung ${order.nr}</strong> vom ${date}<br>${items}<br>Gesamt: <strong>${eur.format(order.totals.total)}</strong><br>Status: <strong>Eingegangen</strong> ✓<br><span class="small muted">Demo-Daten: nur diese Bestellungen aus diesem Browser sind auffindbar.</span>`);
}

// ---- Öffnen / Schließen / Formular ----
function svcOpen() {
  svc.open = true;
  $("#svcPanel").classList.add("open");
  $("#svcPanel").setAttribute("aria-hidden", "false");
  $("#svcLaunch").setAttribute("aria-expanded", "true");
  svcStart();
  setTimeout(() => $("#svcInput").focus(), 120);
}
function svcClose() {
  svc.open = false;
  $("#svcPanel").classList.remove("open");
  $("#svcPanel").setAttribute("aria-hidden", "true");
  $("#svcLaunch").setAttribute("aria-expanded", "false");
}
function svcView(view) {
  $("#svcChat").hidden = view !== "chat";
  $("#svcContact").hidden = view !== "form";
  $("#svcDone").hidden = view !== "done";
}
function svcShowForm(pre = {}) {
  if (!svc.open) svcOpen();
  const f = $("#svcContact");
  if (pre.topic) f.topic.value = pre.topic;
  if (pre.order) f.order.value = pre.order;
  svcView("form");
  f.name.focus();
}

function submitTicket(form) {
  const data = Object.fromEntries(new FormData(form));
  const nr = "ST-" + Date.now().toString(36).toUpperCase().slice(-6);
  saveJSON(TICKETS_KEY, [...loadJSON(TICKETS_KEY, []), { nr, date: new Date().toISOString(), ...data }]);

  const done = $("#svcDone");
  done.innerHTML = `
    <div class="svc-ok">✓</div>
    <h4></h4>
    <p>Deine Nachricht ist bei uns eingegangen. Ticket-Nr.: <strong>${nr}</strong><br>Wir antworten ${SERVICE.reply} per E-Mail.</p>
    ${SERVICE.email ? "" : '<p class="notice">Demo-Modus: Es ist noch keine Service-E-Mail hinterlegt, die Nachricht wird nur lokal im Browser gespeichert.</p>'}
    <button class="btn btn-primary block" data-svc-back>Zurück zum Chat</button>`;
  done.querySelector("h4").textContent = `Danke, ${data.name.split(" ")[0]}!`;
  svcView("done");
  form.reset();

  if (SERVICE.email) {
    const body = `${data.message}\n\n— ${data.name} (${data.email})${data.order ? `\nBestellnummer: ${data.order}` : ""}\nTicket: ${nr}`;
    location.href = `mailto:${SERVICE.email}?subject=${encodeURIComponent(`[${nr}] ${data.topic}`)}&body=${encodeURIComponent(body)}`;
  }
}

function initWidget() {
  buildWidget();

  $("#svcLaunch").addEventListener("click", () => (svc.open ? svcClose() : svcOpen()));
  $("#svcForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("#svcInput").value.trim();
    if (!v) return;
    $("#svcInput").value = "";
    svcHandle(v);
  });
  $("#svcContact").addEventListener("submit", (e) => { e.preventDefault(); submitTicket(e.target); });

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-service],[data-svc-close],[data-svc-form],[data-svc-back],[data-svc-q],[data-consent-open]");
    if (!t) return;
    const d = t.dataset;
    if ("service" in d) {
      svcOpen();
      if (d.service) { const entry = KB.find((k) => k.id === d.service); if (entry) { addUser(entry.chip || entry.q); svcAnswer(entry); } }
    } else if ("svcClose" in d) svcClose();
    else if ("svcForm" in d) svcShowForm();
    else if ("svcBack" in d) { svcView("chat"); $("#svcInput").focus(); }
    else if (d.svcQ) {
      const entry = KB.find((k) => k.id === d.svcQ);
      t.closest(".svc-chips")?.remove();
      addUser(entry.chip); svcAnswer(entry);
    } else if ("consentOpen" in d) showConsent();
  });

  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && svc.open && !document.querySelector("dialog[open]")) { svcClose(); $("#svcLaunch").focus(); } });
}

// ====== Cookie-/Speicher-Hinweis ======
// Aktuell nutzt der Shop nur technisch notwendigen lokalen Speicher (Warenkorb).
// Sobald Analyse/Marketing-Tools eingebunden werden, nur nach consent.all === true laden.
function showConsent() {
  $("#consent")?.remove();
  document.body.insertAdjacentHTML("beforeend", `
    <div class="consent" id="consent" role="region" aria-label="Datenschutz-Hinweis">
      <div>
        <strong>Deine Privatsphäre</strong>
        <p>Wir speichern nur, was für den Shop nötig ist (z. B. deinen Warenkorb). Weitere Dienste wie Statistik oder Zahlungsanbieter laden wir nur mit deiner Einwilligung. <button class="link" data-legal="datenschutz">Mehr erfahren</button></p>
      </div>
      <div class="consent-btns">
        <button class="btn btn-ghost" data-consent="necessary">Nur notwendige</button>
        <button class="btn btn-primary" data-consent="all">Alle akzeptieren</button>
      </div>
    </div>`);
  $("#consent").addEventListener("click", (e) => {
    const c = e.target.closest("[data-consent]")?.dataset.consent;
    if (!c) return;
    saveJSON(CONSENT_KEY, { all: c === "all", date: new Date().toISOString() });
    $("#consent").remove();
  });
}

// ====== SEO: Produkt-Strukturdaten (JSON-LD) ======
function injectStructuredData() {
  const abs = (p) => new URL(p, location.href).href;
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Store", name: "Kukirin Shop", url: location.href.split("#")[0] },
      ...PRODUCTS.map((p) => ({
        "@type": "Product",
        name: p.name,
        description: p.desc,
        image: p.gallery.map(abs),
        brand: { "@type": "Brand", name: "Kukirin" },
        offers: { "@type": "Offer", price: p.price.toFixed(2), priceCurrency: "EUR", url: abs(`#p-${p.id}`) },
      })),
    ],
  };
  const s = document.createElement("script");
  s.type = "application/ld+json";
  s.textContent = JSON.stringify(data);
  document.head.append(s);
}

// ====== Init ======
renderFaq();
initWidget();
injectStructuredData();
if (!loadJSON(CONSENT_KEY, null)) setTimeout(showConsent, 900);

// Footer-Kontaktzeile
const fc = $("#footerContact");
if (fc) fc.innerHTML = [
  `Kundenservice: ${SERVICE.hours}`,
  SERVICE.email && `<a href="mailto:${SERVICE.email}">${SERVICE.email}</a>`,
  SERVICE.phone && `<a href="tel:${SERVICE.phone.replace(/\s/g, "")}">${SERVICE.phone}</a>`,
].filter(Boolean).join("<br>");
