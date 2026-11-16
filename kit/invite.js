(() => {
  const C = window.INVITE;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  const params = new URLSearchParams(location.search);
  const browserLang = (navigator.language || "").toLowerCase().startsWith("pl") ? "pl" : "en";
  const LANGS = C.languages && C.languages.length ? C.languages : ["pl", "en"];
  let lang = ["pl", "en"].includes(params.get("lang")) ? params.get("lang") : store.get("inv-lang") || browserLang;
  if (!LANGS.includes(lang)) lang = LANGS[0];
  const WE = C.voice === "we"; // a couple or a group hosting: "we" instead of "I"
  const L = (o) => (o && typeof o === "object" ? o[lang] ?? o.en ?? "" : o ?? "");
  const SENT_KEY = `rsvp-sent:${C.eventSlug}`;

  const T = {
    pl: {
      tapSeal: "( dotknij pieczęci )", tapCard: "( dotknij karty, by ją odwrócić )", toRsvp: "( odpowiedz ↓ )",
      date: "kiedy", time: "godzina", place: "gdzie", map: "mapa ↗",
      kindly: "prosimy o", send: "Wyślij odpowiedź", sending: "Wysyłanie…",
      required: "Uzupełnij: ", failed: "Nie udało się wysłać. Spróbuj jeszcze raz.",
      thanks: WE ? "Dziękujemy" : "Dziękuję", seeYou: "Do zobaczenia", missYou: WE ? "Będziemy tęsknić" : "Będę tęsknić",
      yesLine: (p) => (p ? "będziesz z osobą towarzyszącą." : "będziesz."),
      noLine: "szkoda, że Cię nie będzie.",
      change: "zmień odpowiedź", badEmail: "Sprawdź adres email.", emailed: (e) => `Potwierdzenie wysłane na ${e}.`, photoSoon: "( zdjęcie wkrótce )", footer: "zaproszenie",
    },
    en: {
      tapSeal: "( tap the seal )", tapCard: "( tap the card to turn it over )", toRsvp: "( reply ↓ )",
      date: "date", time: "time", place: "place", map: "map ↗",
      kindly: "kindly", send: "Send reply", sending: "Sending…",
      required: "Please fill in: ", failed: "Couldn't send. Please try again.",
      thanks: "Thank you", seeYou: "See you there", missYou: "You'll be missed",
      yesLine: (p) => (p ? "you're coming with a +1." : "you're coming."),
      noLine: "sorry you can't make it.",
      change: "change my reply", badEmail: "Please check the email address.", emailed: (e) => `Confirmation sent to ${e}.`, photoSoon: "( photo coming soon )", footer: "an invitation",
    },
  };
  const t = (k, ...a) => { const v = T[lang][k]; return typeof v === "function" ? v(...a) : v; };

  const stage = $("#stage"), card = $("#card");
  let phase = "closed"; // closed → opening → open
  let photoSrc = null;

  // ───────── text ─────────
  function fmtDate() {
    const d = new Date(C.content.date + "T12:00");
    return d.toLocaleDateString(lang === "pl" ? "pl-PL" : "en-GB", { weekday: "long", day: "numeric", month: "long" });
  }
  function renderText() {
    document.documentElement.lang = lang;
    $("#lang").style.visibility = LANGS.length < 2 ? "hidden" : "";
    $("#lang").innerHTML = lang === "pl" ? "<b>PL</b> <i>/ EN</i>" : "<i>PL /</i> <b>EN</b>";
    $("#c-num").textContent = C.card.number;
    $("#c-heavy").textContent = C.card.titleHeavy;
    $("#c-script").textContent = C.card.titleScript;
    $("#c-placeholder").textContent = t("photoSoon");
    const [y, m, d] = C.content.date.split("-");
    $("#b-date").textContent = `${d}.${m}.${y}`;
    $("#b-time").textContent = C.content.time;
    $("#b-script").textContent = L(C.content.scriptName);
    $("#b-heavy").textContent = L(C.content.heavyTitle);
    const map = C.content.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(C.content.place)}`;
    $("#b-list").innerHTML = `
      <li><span>${t("date")}</span><i>${esc(fmtDate())}</i></li>
      <li><span>${t("time")}</span><i>${esc(C.content.time)}</i></li>
      <li><span>${t("place")}</span><i>${esc(C.content.place)}<br>${esc(L(C.content.address))} · <a href="${esc(map)}" target="_blank" rel="noopener">${t("map")}</a></i></li>`;
    $("#b-note").textContent = L(C.content.note);
    $("#b-sign").textContent = C.content.host;
    const hl = C.content.host.length; // long names (couples) get a smaller signature
    $("#b-sign").classList.toggle("long", hl > 7 && hl <= 12);
    $("#b-sign").classList.toggle("longer", hl > 12);
    $("#r-script").textContent = t("kindly");
    $("#send").textContent = t("send");
    $("#to-rsvp").textContent = t("toRsvp");
    $("#f-left").textContent = t("footer");
    $("#hint").textContent = phase === "closed" ? t("tapSeal") : phase === "open" ? t("tapCard") : "";
    $("#seal-txt").textContent = $("#seal-txt2").textContent = C.seal.initials;
    const sl = [...C.seal.initials].length; // 1 letter big, "A&T" smaller so it stays inside the seal
    [$("#seal-txt"), $("#seal-txt2")].forEach((el, i) => { el.setAttribute("font-size", sl <= 1 ? 54 : sl === 2 ? 42 : 27); el.setAttribute("y", (sl <= 1 ? 76 : sl === 2 ? 73 : 69) - i); });
    // the wax: highlight and shadow mixed from the chosen colour
    const mix = (hex, to, t) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - t) + to * t).toString(16).padStart(2, "0")).join("");
    const stops = document.querySelectorAll("#wax stop");
    stops[0].setAttribute("stop-color", mix(C.seal.wax, 255, .35));
    stops[1].setAttribute("stop-color", C.seal.wax);
    stops[2].setAttribute("stop-color", mix(C.seal.wax, 0, .6));
    renderFields();
    if (!$("#thanks").hidden) showThanks(JSON.parse(store.get(SENT_KEY) || "null"));
  }

  // ───────── card art ─────────
  function drawCard() {
    const cv = $("#halftone");
    Halftone.render(cv, photoSrc, { cell: Math.max(3.2, cv.clientWidth / 66) });
  }
  function loadPhoto() {
    $("#c-placeholder").hidden = true; // no photo = the seven-swords art on purpose
    if (!C.card.photo) { photoSrc = Halftone.standIn(); drawCard(); return; }
    const img = new Image();
    img.onload = () => { photoSrc = img; drawCard(); };
    img.onerror = () => { photoSrc = Halftone.standIn(); drawCard(); };
    img.src = C.card.photo;
  }
  let rT; addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => photoSrc && drawCard(), 150); });

  // ───────── opening sequence ─────────
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function open() {
    if (phase !== "closed") return;
    phase = "opening"; $("#hint").textContent = "";
    if (navigator.vibrate) navigator.vibrate(18);
    stage.classList.add("cracked");
    await wait(450);
    stage.classList.add("open");
    await wait(380);
    stage.classList.add("flap-behind");
    await wait(300);
    stage.classList.add("rising");
    await wait(1150);
    stage.classList.add("dropped");
    card.setAttribute("tabindex", "0");
    await wait(900);
    stage.classList.add("gone");
    phase = "open";
    document.body.classList.add("opened");
    $("#hint").textContent = t("tapCard");
    $("#rsvp").hidden = false;
    $("#to-rsvp").hidden = false;
    store.set(`opened:${C.eventSlug}`, "1");
  }
  function flip() {
    if (phase !== "open") return;
    card.classList.toggle("flipped");
  }
  $("#seal").addEventListener("click", open);
  card.addEventListener("click", flip);
  card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } });
  $("#lang").addEventListener("click", () => { if (LANGS.length < 2) return; lang = lang === "pl" ? "en" : "pl"; store.set("inv-lang", lang); renderText(); });

  // ───────── RSVP (fields come from config) ─────────
  const values = {};
  function visible(f) { return !f.showIf || Object.entries(f.showIf).every(([k, v]) => values[k] === v); }
  function renderFields() {
    $("#fields").innerHTML = C.rsvpFields.map((f) => {
      if (!visible(f)) return "";
      const v = values[f.id] ?? "";
      const id = `f-${f.id}`;
      if (f.type === "choice") {
        return `<div class="f" role="radiogroup" aria-labelledby="${id}"><span class="lbl" id="${id}">${esc(L(f.label))}</span><div class="opts">${
          f.options.map((o) => `<label class="opt"><input type="radio" name="${f.id}" value="${esc(o.v)}" ${v === o.v ? "checked" : ""}><span>${esc(o[lang] || o.v)}</span></label>`).join("")}</div></div>`;
      }
      if (f.type === "textarea") {
        return `<div class="f"><label for="${id}">${esc(L(f.label))}</label><textarea id="${id}" name="${f.id}" maxlength="${f.max || 1000}" rows="4">${esc(v)}</textarea></div>`;
      }
      if (f.type === "email") {
        return `<div class="f"><label for="${id}">${esc(L(f.label))}</label><input type="text" inputmode="email" autocomplete="email" spellcheck="false" id="${id}" name="${f.id}" maxlength="${f.max || 200}" value="${esc(v)}" ${f.hint ? `aria-describedby="${id}-hint"` : ""}>${f.hint ? `<p class="hint-small" id="${id}-hint">${esc(L(f.hint))}</p>` : ""}</div>`;
      }
      return `<div class="f"><label for="${id}">${esc(L(f.label))}</label><input type="text" id="${id}" name="${f.id}" maxlength="${f.max || 200}" value="${esc(v)}" ${f.id === "name" ? 'autocomplete="name"' : ""}></div>`;
    }).join("");
  }
  $("#fields").addEventListener("input", (e) => { if (e.target.name) values[e.target.name] = e.target.value; });
  $("#fields").addEventListener("change", (e) => {
    if (e.target.type !== "radio") return;
    values[e.target.name] = e.target.value;
    // re-render only if a dependent field's visibility changed
    if (C.rsvpFields.some((f) => f.showIf && e.target.name in f.showIf)) {
      const focusName = e.target.name, focusVal = e.target.value;
      renderFields();
      const el = document.querySelector(`input[name="${focusName}"][value="${focusVal}"]`); el && el.focus();
    }
  });

  $("#rsvp-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#err");
    err.hidden = true;
    if (e.target.website.value) return; // bot
    const missing = C.rsvpFields.filter((f) => f.required && visible(f) && !String(values[f.id] || "").trim());
    if (missing.length) { err.textContent = t("required") + missing.map((f) => L(f.label)).join(", "); err.hidden = false; return; }
    const badEmail = C.rsvpFields.find((f) => f.type === "email" && visible(f) && values[f.id] && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(values[f.id]).trim()));
    if (badEmail) { err.textContent = t("badEmail"); err.hidden = false; return; }
    const answers = {};
    for (const f of C.rsvpFields) if (f.id !== "name" && visible(f) && values[f.id] != null && values[f.id] !== "") answers[f.id] = String(values[f.id]).trim();
    const name = String(values.name).trim();
    const btn = $("#send"); btn.disabled = true; btn.textContent = t("sending");
    try {
      const res = await InviteData.submitRsvp(name, answers, lang);
      const sent = { name, answers, emailed: !!(res && res.emailed) };
      store.set(SENT_KEY, JSON.stringify(sent));
      showThanks(sent);
    } catch (ex) {
      console.error(ex);
      err.textContent = t("failed"); err.hidden = false;
    } finally { btn.disabled = false; btn.textContent = t("send"); }
  });

  function showThanks(sent) {
    if (!sent) return;
    const yes = sent.answers.attending === "yes";
    $("#rsvp-form").hidden = true;
    const th = $("#thanks");
    th.hidden = false;
    th.innerHTML = `<span class="script">${t("thanks")}</span><span class="heavy">${yes ? t("seeYou") : t("missYou")}</span>
      <p>${esc(sent.name)} · ${yes ? t("yesLine", sent.answers.plus_one === "yes") : t("noLine")}</p>
      ${sent.emailed && sent.answers.email ? `<p>${esc(t("emailed", sent.answers.email))}</p>` : ""}
      <button type="button" id="change">${t("change")}</button>`;
    $("#change").onclick = () => {
      Object.assign(values, { name: sent.name }, sent.answers);
      th.hidden = true; $("#rsvp-form").hidden = false; renderFields();
    };
  }

  // ───────── init ─────────
  function showOpened() {
    // skip the envelope (link from the email: ?open=1)
    stage.style.animation = "none";
    stage.classList.add("cracked", "open", "flap-behind", "rising", "dropped", "gone", "instant");
    phase = "open";
    card.setAttribute("tabindex", "0");
    document.body.classList.add("opened");
    $("#rsvp").hidden = false; $("#to-rsvp").hidden = false;
  }
  async function init() {
    try {
      const r = await fetch("event.json", { cache: "no-cache" });
      C.content = await r.json();
    } catch (e) { console.error("event.json", e); }
    const capture = params.get("capture"); // front | back | og (for generating images)
    if (capture) document.body.classList.add("capture", "capture-" + capture);
    if (capture === "og") {
      document.body.insertAdjacentHTML("beforeend", `
        <div class="og-furn top"><span>cotoaleksandra</span><span>${esc(C.og.date)}</span></div>
        <div class="og-text"><span class="script"${LANGS[0] === "pl" && LANGS.length === 1 ? ' style="margin-bottom:-24px"' : ""}>${LANGS[0] === "pl" && LANGS.length === 1 ? "masz" : "you've been"}</span><span class="heavy"${LANGS[0] === "pl" && LANGS.length === 1 ? ' style="font-size:96px"' : ""}>${LANGS[0] === "pl" && LANGS.length === 1 ? "ZAPROSZENIE" : "INVITED"}</span>
          <p>( ${esc(C.og.line)} )</p></div>
        <div class="og-furn bottom"><span>${LANGS.includes("en") ? "an invitation" : "zaproszenie"}</span><span>no. ${esc(C.card.number)}</span></div>`);
    }
    if (capture === "front" || capture === "back" || params.get("open") === "1") showOpened();
    if (capture === "back") card.classList.add("flipped");
    renderText();
    if (capture) $("#hint").textContent = "";
    loadPhoto();
    const prev = JSON.parse(store.get(SENT_KEY) || "null");
    if (prev && !capture) showThanks(prev);
    // fonts change the card's text metrics; redraw after they load
    document.fonts && document.fonts.ready.then(() => { photoSrc && drawCard(); document.body.classList.add("ready"); });
  }
  init();
})();
