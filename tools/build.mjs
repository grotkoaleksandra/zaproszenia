#!/usr/bin/env node
// Builds one client invite from its single source file.
//   node tools/build.mjs <slug>
// Reads  <slug>/invite.json
// Writes <slug>/index.html, admin.html, config.js, event.json
// Never edit the written files by hand: change invite.json and rebuild.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_BASE = "https://zaproszenie.cotoaleksandra.com";
const slug = process.argv[2];
const die = (m) => { console.error("✗ " + m); process.exit(1); };
if (!slug) die("usage: node tools/build.mjs <slug>");
if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) die(`slug "${slug}": use 3–40 lowercase letters, digits and dashes`);
const dir = path.join(ROOT, slug);
const src = path.join(dir, "invite.json");
if (!fs.existsSync(src)) die(`${slug}/invite.json not found (copy templates/invite.example.json)`);

let J;
try { J = JSON.parse(fs.readFileSync(src, "utf8")); } catch (e) { die(`invite.json is not valid JSON: ${e.message}`); }

// ── validate ──
const problems = [];
const langs = Array.isArray(J.languages) && J.languages.length ? J.languages : ["pl", "en"];
if (!langs.every((l) => l === "pl" || l === "en")) problems.push('languages: only "pl" and "en"');
const need = (k, v) => { if (v === undefined || v === null || String(v).trim() === "") problems.push(`missing: ${k}`); };
// text can be "same in all languages" or { pl, en }
const loc = (k, v, required = true) => {
  if (v == null || v === "") { if (required) problems.push(`missing: ${k}`); return { pl: "", en: "" }; }
  if (typeof v === "string") return { pl: v, en: v };
  for (const l of langs) if (!v[l]) problems.push(`missing: ${k}.${l}`);
  const first = v[langs[0]] ?? v.pl ?? v.en ?? "";
  return { pl: v.pl || first, en: v.en || first };
};
need("host", J.host);
need("date (YYYY-MM-DD)", J.date);
if (J.date && !/^\d{4}-\d{2}-\d{2}$/.test(J.date)) problems.push("date must be YYYY-MM-DD");
need("time (HH:MM)", J.time);
if (J.time && !/^\d{2}:\d{2}$/.test(J.time)) problems.push("time must be HH:MM");
need("place", J.place);
const title = loc("title", J.title);
const scriptName = loc("scriptName", J.scriptName);
const heavyTitle = loc("heavyTitle", J.heavyTitle);
const address = loc("address", J.address);
const note = loc("note", J.note);
const card = J.card || {};
need("card.number", card.number);
need("card.titleHeavy", card.titleHeavy);
need("card.titleScript", card.titleScript);
if (card.photo && !fs.existsSync(path.join(dir, card.photo))) problems.push(`card.photo: ${slug}/${card.photo} not found`);
const seal = J.seal || {};
need("seal.initials", seal.initials);
const wax = seal.wax || "#6e1018";
if (!/^#[0-9a-fA-F]{6}$/.test(wax)) problems.push("seal.wax must be a colour like #6e1018");
const voice = J.voice || "f";
if (!["f", "m", "we"].includes(voice)) problems.push('voice: "f" (she), "m" (he) or "we" (couple/group)');
if (problems.length) die("invite.json needs fixing:\n  - " + problems.join("\n  - "));

// ── derived ──
const [y, m, d] = J.date.split("-");
const dateDots = `${d}.${m}.${y}`;
// Warsaw offset for that date (winter +01:00, summer +02:00)
const tz = J.tz || (() => {
  const s = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", timeZoneName: "longOffset" })
    .formatToParts(new Date(`${J.date}T12:00:00Z`)).find((p) => p.type === "timeZoneName").value; // "GMT+01:00"
  return s.replace("GMT", "") || "+00:00";
})();
const site = `${SITE_BASE}/${slug}`;
const footer = J.footer || title[langs[0]].toLowerCase();
const rsvp = J.rsvp || {};

// ── RSVP questions ──
const lab = (pl, en) => ({ pl, en });
const yesNo = [{ v: "yes", pl: "Tak", en: "Yes" }, { v: "no", pl: "Nie", en: "No" }];
const fields = [
  { id: "name", type: "text", required: true, max: 80, label: lab("Imię i nazwisko", "Your name") },
  { id: "attending", type: "choice", required: true, label: lab("Będziesz?", "Will you come?"), options: yesNo },
];
if (rsvp.plusOne !== false) fields.push({ id: "plus_one", type: "choice", showIf: { attending: "yes" },
  label: lab("Czy przyjdziesz z osobą towarzyszącą (+1)?", "Are you bringing a +1?"), options: yesNo });
fields.push({ id: "email", type: "email", required: true, max: 200, showIf: { attending: "yes" }, // only a "yes" gets the details by email
  label: lab("Twój email", "Your email"),
  hint: lab("Dostaniesz potwierdzenie i wszystkie szczegóły. Email służy tylko do tego, nic więcej.",
            "You'll get a confirmation with all the details. Your email is only used for this, nothing else.") });
const RESERVED = ["name", "attending", "plus_one", "email", "message", "website"];
for (const [i, f] of (rsvp.extra || []).entries()) {
  if (!f.id || !/^[a-z][a-z0-9_]{0,29}$/.test(f.id) || RESERVED.includes(f.id)) die(`rsvp.extra[${i}].id must be short lowercase (e.g. "diet") and not ${RESERVED.join("/")}`);
  if (!["text", "choice", "textarea"].includes(f.type || "text")) die(`rsvp.extra[${i}].type: text, choice or textarea`);
  const out = { id: f.id, type: f.type || "text", max: 300, label: loc(`rsvp.extra[${i}].label`, f.label) };
  if (f.required) out.required = true;
  if (f.onlyIfYes !== false) out.showIf = { attending: "yes" };
  if (out.type === "choice") {
    if (!Array.isArray(f.options) || f.options.length < 2) die(`rsvp.extra[${i}].options: give at least 2`);
    out.options = f.options.map((o, k) => {
      const t = loc(`rsvp.extra[${i}].options[${k}]`, o.label ?? o);
      return { v: o.v || `o${k + 1}`, pl: t.pl, en: t.en };
    });
  }
  fields.push(out);
}
if (rsvp.message !== false) fields.push({ id: "message", type: "textarea", max: 1000,
  label: lab("Wiadomość lub pytanie (opcjonalnie)", "Message or question (optional)") });
if (problems.length) die("invite.json needs fixing:\n  - " + problems.join("\n  - "));

// ── write ──
const event = {
  host: J.host, voice, languages: langs, title, scriptName, heavyTitle,
  date: J.date, time: J.time, tz, durationHours: J.durationHours || 6,
  place: J.place, address, mapUrl: J.mapUrl || "", note,
  card: { number: card.number, titleHeavy: card.titleHeavy, titleScript: card.titleScript },
};
const config = {
  eventSlug: slug, demo: !!J.demo, site, languages: langs, voice,
  seal: { initials: seal.initials, wax },
  card: { number: card.number, photo: card.photo || "", titleHeavy: card.titleHeavy, titleScript: card.titleScript },
  og: { date: dateDots, line: J.ogLine || (langs.length === 1 && langs[0] === "pl" ? footer : `${langs.includes("pl") ? "zaproszenie" : "invitation"} · ${footer}`) },
  rsvpFields: fields,
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ogTitle = langs.length === 1 && langs[0] === "pl" ? "Masz zaproszenie" : langs.includes("pl") ? "You've been invited · Zaproszenie" : "You've been invited";
// version stamp for the shared kit + this client's config, so browsers never mix old and new files
const ver = crypto.createHash("sha1").update(fs.readdirSync(path.join(ROOT, "kit")).sort().map((f) => fs.readFileSync(path.join(ROOT, "kit", f))).join("") + JSON.stringify(config)).digest("hex").slice(0, 8);
const vars = {
  ver,
  lang: langs[0], ogTitle, ogDesc: `${title[langs[0]]} · ${dateDots}`, site, dateDots,
  cornerLeft: card.cornerLeft || `no. ${String(card.number).padStart(2, "0")}`, cornerRight: card.cornerRight || y,
  number: card.number, wax, footer, titleEn: title.en || title.pl,
};
const fill = (tpl) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => { if (!(k in vars)) die(`template uses unknown {{${k}}}`); return esc(vars[k]); });
const banner = "// Built by tools/build.mjs from invite.json. Edit invite.json and rebuild; changes here are overwritten.\n";
fs.writeFileSync(path.join(dir, "index.html"), fill(fs.readFileSync(path.join(ROOT, "templates/index.html"), "utf8")));
fs.writeFileSync(path.join(dir, "admin.html"), fill(fs.readFileSync(path.join(ROOT, "templates/admin.html"), "utf8")));
fs.writeFileSync(path.join(dir, "config.js"), banner + "window.INVITE = " + JSON.stringify(config, null, 2) + ";\n");
fs.writeFileSync(path.join(dir, "event.json"), JSON.stringify(event, null, 2) + "\n");
console.log(`✓ built ${slug}/ (${langs.join("+")}, ${fields.length} questions, ${J.demo ? "DEMO" : "live"}) → ${site}/`);
