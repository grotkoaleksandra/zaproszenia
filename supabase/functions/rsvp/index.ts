// rsvp: saves a guest's reply and, for a "yes" with an email, sends them the
// opened invite (card images + details + .ics).
// One function for every invite: each event's site and sender name live in
// the events table (see supabase/events.sql), so a new client needs no redeploy.
// The email content comes only from the event's own site (event.json), never
// from the request, so this can't be used to send arbitrary mail.
//
// If the event has notify = true, the host also gets a short email for every
// reply (name + answers, never the guest's email), sent to the event's
// notify_to, or CONTACT_NOTIFY_TO when that's empty.
//
// Secrets used: RESEND_API_KEY, CONTACT_NOTIFY_TO (reply-to), plus the
// built-in SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const FROM_ADDRESS = "zaproszenie@cotoaleksandra.com";
const ALLOWED_ORIGINS = ["https://urodziny.cotoaleksandra.com", "https://zaproszenie.cotoaleksandra.com", "http://localhost:8830", "http://localhost:8860"];
// only sites we host can be an event's site (event.json is fetched from there)
const SITE_RE = /^https:\/\/(urodziny|zaproszenie)\.cotoaleksandra\.com(\/[a-z0-9-]+)?$/;

const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type L10n = { pl: string; en: string };
type EventContent = {
  host: string; title: L10n; date: string; time: string; tz: string; durationHours?: number;
  place: string; address: L10n; mapUrl?: string; note: L10n;
  voice?: "f" | "m" | "we"; languages?: ("pl" | "en")[]; card?: { number?: string; titleHeavy?: string; titleScript?: string };
};
type Cfg = { slug: string; site: string; from: string };

Deno.serve(async (req) => {
  const headers = cors(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const slug = String(body?.slug ?? "");
  if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) return json({ error: "unknown event" }, 404);
  const name = String(body?.name ?? "").trim().slice(0, 80);
  if (!name) return json({ error: "name" }, 400);
  const lang: "pl" | "en" = body?.lang === "en" ? "en" : "pl";
  const a = body?.answers ?? {};
  const answers: Record<string, string> = {};
  if (["yes", "maybe", "no"].includes(a.attending)) answers.attending = a.attending;
  else return json({ error: "attending" }, 400);
  if (answers.attending === "yes" && (a.plus_one === "yes" || a.plus_one === "no")) answers.plus_one = a.plus_one;
  const email = String(a.email ?? "").trim().toLowerCase().slice(0, 200);
  if (email && answers.attending === "yes") {  // only a "yes" gets an email
    if (!EMAIL_RE.test(email)) return json({ error: "email" }, 400);
    answers.email = email;
  }
  if (a.message) answers.message = String(a.message).trim().slice(0, 1000);
  // the host's own questions (e.g. diet): short text only, at most 10
  let extra = 0;
  for (const [k, v] of Object.entries(a)) {
    if (k in answers || ["email", "plus_one", "website"].includes(k) || !/^[a-z][a-z0-9_]{0,29}$/.test(k)) continue;
    if (typeof v !== "string" || !v.trim() || ++extra > 10) continue;
    answers[k] = v.trim().slice(0, 300);
  }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: ev, error: evErr } = await sb.from("events").select("id, site, sender, notify, notify_to").eq("slug", slug).maybeSingle();
  if (evErr || !ev) return json({ error: "unknown event" }, 404);
  if (!ev.site || !SITE_RE.test(ev.site)) return json({ error: "event not set up" }, 404);
  const sender = String(ev.sender || "cotoaleksandra").replace(/[<>"\r\n]/g, "").slice(0, 60).trim();
  const cfg: Cfg = { slug, site: ev.site, from: `${sender} <${FROM_ADDRESS}>` };

  const hourAgo = new Date(Date.now() - 3600e3).toISOString();
  const { count } = await sb.from("rsvps").select("id", { count: "exact", head: true }).eq("event_id", ev.id).gte("created_at", hourAgo);
  if ((count ?? 0) > 300) return json({ error: "slow down" }, 429);

  const { error: insErr } = await sb.from("rsvps").insert({ event_id: ev.id, name, answers });
  if (insErr) { console.error(insErr); return json({ error: "save failed" }, 500); }

  // email the opened invite
  let emailed = false;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (answers.email && resendKey) {
    try {
      // at most 2 emails to the same address per 10 minutes
      const tenAgo = new Date(Date.now() - 600e3).toISOString();
      const { count: recent } = await sb.from("rsvps").select("id", { count: "exact", head: true })
        .eq("event_id", ev.id).eq("answers->>email", answers.email).gte("created_at", tenAgo);
      if ((recent ?? 0) <= 2) {
        const content: EventContent = await (await fetch(`${cfg.site}/event.json`, { cache: "no-store" })).json();
        const mail = answers.attending === "yes"
          ? buildEmail(content, cfg, lang, name, answers.plus_one === "yes")
          : buildDeclineEmail(content, cfg.site, lang, name);
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: cfg.from,
            to: [answers.email],
            reply_to: Deno.env.get("CONTACT_NOTIFY_TO") || undefined,
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
            attachments: mail.ics ? [{ filename: `${slug}.ics`, content: encodeBase64(new TextEncoder().encode(mail.ics)) }] : undefined,
          }),
        });
        if (res.ok) emailed = true;
        else console.error("Resend failed:", res.status, await res.text());
      }
    } catch (e) { console.error("email error:", e); }
  }
  // tell the host
  if (ev.notify && resendKey) {
    const to = String(ev.notify_to || Deno.env.get("CONTACT_NOTIFY_TO") || "").trim();
    if (EMAIL_RE.test(to)) {
      try {
        const { data: rows } = await sb.from("rsvps").select("name, answers, created_at").eq("event_id", ev.id).order("created_at");
        const last = new Map<string, any>();  // latest reply per name counts
        for (const r of rows ?? []) last.set(String(r.name).trim().toLowerCase(), r.answers ?? {});
        let yes = 0, maybe = 0, no = 0, plus = 0;
        for (const x of last.values()) { if (x.attending === "yes") { yes++; if (x.plus_one === "yes") plus++; } else if (x.attending === "maybe") maybe++; else no++; }
        const content: EventContent | null = await fetch(`${cfg.site}/event.json`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
        const mail = buildHostEmail(content, cfg.site, name, answers, { yes, maybe, no, plus });
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: `cotoaleksandra <${FROM_ADDRESS}>`, to: [to], subject: mail.subject, html: mail.html, text: mail.text }),
        });
        if (!res.ok) console.error("host notify failed:", res.status, await res.text());
      } catch (e) { console.error("host notify error:", e); }
    }
  }
  return json({ ok: true, emailed });
});

// short note to the host: who replied and what, plus the running count.
// Never includes the guest's email address.
function buildHostEmail(c: EventContent | null, site: string, name: string, a: Record<string, string>, n: { yes: number; maybe: number; no: number; plus: number }) {
  const yes = a.attending === "yes", maybe = a.attending === "maybe";
  const short = yes ? "tak ✓" : maybe ? "może" : "nie";
  const title = c?.title?.pl || "zaproszenie";
  const lines: [string, string][] = [["Odpowiedź", yes ? "Tak, będzie" : maybe ? "Może" : "Nie da rady"]];
  if (yes && a.plus_one) lines.push(["+1", a.plus_one === "yes" ? "Tak" : "Nie"]);
  for (const [k, v] of Object.entries(a)) if (!["attending", "plus_one", "email", "message"].includes(k)) lines.push([k, v]);
  if (a.message) lines.push(["Wiadomość", a.message]);
  const total = `Na razie: ${n.yes} na tak${n.plus ? ` (+${n.plus} os. towarzyszących)` : ""}, ${n.maybe} może, ${n.no} na nie.`;
  const ink = "#2a2926", font = "'Inter Tight','Helvetica Neue',Helvetica,Arial,sans-serif";
  const html = `<!doctype html><html><body style="margin:0;background:#e9e8e4"><div style="max-width:480px;margin:0 auto;padding:28px 18px;font:15px/1.5 ${font};color:${ink}">
<div style="font:800 26px/1.1 ${font};text-transform:uppercase;letter-spacing:-1px">${esc(name)}: ${short}</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:18px 0">${lines.map(([k, v]) =>
  `<tr><td style="padding:8px 0;border-top:1px solid #b9b7b1;font:800 12px ${font};text-transform:uppercase;vertical-align:top;width:110px">${esc(k)}</td><td style="padding:8px 0;border-top:1px solid #b9b7b1">${esc(v)}</td></tr>`).join("")}</table>
<p style="margin:0 0 18px">${esc(total)}</p>
<p style="margin:0;font-size:13px;color:#6a6863">Pełna lista: ${esc(site)}/admin.html (otwórz na urządzeniu, na którym już ją otwierałaś).</p>
</div></body></html>`;
  const text = `${name}: ${short}\n\n${lines.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${total}\n\nPełna lista: ${site}/admin.html`;
  return { subject: `${name}: ${short} · ${title}`.replace(/[\r\n]+/g, " "), html, text };
}

// "made by" line at the bottom of every email: it's how new hosts find you
const credit = (lang: "pl" | "en", font: string) =>
  `<tr><td colspan="2" align="center" style="padding:34px 0 0;font:500 11px ${font};text-transform:uppercase;color:#6a6863">${lang === "pl" ? "zaproszenie" : "invitation"} by <a href="https://cotoaleksandra.com" style="color:#6a6863">cotoaleksandra</a></td></tr>`;

function buildEmail(c: EventContent, cfg: Cfg, lang: "pl" | "en", name: string, plusOne: boolean) {
  const site = cfg.site;
  const T = lang === "pl"
    ? { subject: `Twoje zaproszenie: ${c.title.pl} · ${dd(c.date)}`, hi: `Cześć ${name},`, list: "Jesteś na liście",
        sub: "Oto Twoje zaproszenie, już otwarte.", date: "Kiedy", time: "Godzina", place: "Gdzie", map: "mapa",
        plus: "Będziesz z osobą towarzyszącą.", open: "Otwórz zaproszenie", cal: "W załączniku plik do kalendarza.",
        change: "Coś się zmieniło? Po prostu odpisz na tego maila." }
    : { subject: `Your invitation: ${c.title.en} · ${dd(c.date)}`, hi: `Hi ${name},`, list: "You're on the list",
        sub: "Here's your invitation, already opened.", date: "Date", time: "Time", place: "Place", map: "map",
        plus: "You're bringing a +1.", open: "Open the invitation", cal: "A calendar file is attached.",
        change: "Plans changed? Just reply to this email." };
  const start = new Date(`${c.date}T${c.time}:00${c.tz}`);
  const end = new Date(start.getTime() + (c.durationHours ?? 6) * 3600e3);
  const dateLong = start.toLocaleDateString(lang === "pl" ? "pl-PL" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Warsaw" });
  const map = c.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.place)}`;
  const address = c.address[lang];
  const note = c.note[lang];
  const ink = "#2a2926", paper = "#e9e8e4", font = "'Inter Tight','Helvetica Neue',Helvetica,Arial,sans-serif";
  const row = (k: string, v: string) =>
    `<tr><td style="padding:10px 0;border-top:1px solid #b9b7b1;font:800 12px ${font};text-transform:uppercase;letter-spacing:-.2px;color:${ink}">${k}</td>
     <td align="right" style="padding:10px 0;border-top:1px solid #b9b7b1;font:italic 15px ${font};color:${ink}">${v}</td></tr>`;
  const html = `<!doctype html><html><body style="margin:0;background:${paper}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${paper}"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
  <tr><td style="font:600 11px ${font};text-transform:uppercase;color:${ink}">cotoaleksandra</td>
      <td align="right" style="font:600 11px ${font};text-transform:uppercase;color:${ink}">${esc(dd(c.date))}</td></tr>
  <tr><td colspan="2" align="center" style="padding:34px 0 6px;font:italic 17px Georgia,serif;color:${ink}">${esc(T.hi)}</td></tr>
  <tr><td colspan="2" align="center" style="font:800 38px/1 ${font};letter-spacing:-2.5px;text-transform:uppercase;color:${ink}">${esc(T.list)}</td></tr>
  <tr><td colspan="2" align="center" style="padding:10px 0 26px;font:15px ${font};color:#6a6863">${esc(T.sub)}</td></tr>
  <tr><td colspan="2" align="center">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding:0 6px"><a href="${site}/?open=1&lang=${lang}"><img src="${site}/img/card-front.jpg" width="264" alt="${esc(c.card?.titleHeavy ? `${c.card.titleHeavy} ${c.card.titleScript ?? ""}, ${c.card.number ?? ""}` : c.title[lang])}" style="display:block;width:264px;max-width:100%;height:auto;border:0"></a></td>
      <td style="padding:0 6px"><a href="${site}/?open=1&lang=${lang}"><img src="${site}/img/card-back-${lang}.jpg" width="264" alt="${esc(c.title[lang])}" style="display:block;width:264px;max-width:100%;height:auto;border:0"></a></td>
    </tr></table></td></tr>
  <tr><td colspan="2" style="padding-top:30px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${row(T.date, esc(dateLong))}
    ${row(T.time, esc(c.time))}
    ${row(T.place, `${esc(c.place)}<br>${esc(address)} · <a href="${esc(map)}" style="color:${ink}">${T.map} ↗</a>`)}
    <tr><td colspan="2" style="border-top:1px solid #b9b7b1"></td></tr></table></td></tr>
  <tr><td colspan="2" style="padding:22px 0 0;font:15px/1.5 ${font};color:${ink}">${esc(note)}</td></tr>
  ${plusOne ? `<tr><td colspan="2" style="padding:12px 0 0;font:600 13px ${font};text-transform:uppercase;color:${ink}">${esc(T.plus)}</td></tr>` : ""}
  <tr><td colspan="2" align="center" style="padding:30px 0 10px">
    <a href="${site}/?open=1&lang=${lang}" style="display:block;background:${ink};color:${paper};text-decoration:none;padding:17px;font:800 14px ${font};text-transform:uppercase;letter-spacing:-.3px">${esc(T.open)} →</a></td></tr>
  <tr><td colspan="2" align="center" style="padding:6px 0 0;font:12px ${font};color:#6a6863">${esc(T.cal)} ${esc(T.change)}</td></tr>
  <tr><td colspan="2" align="right" style="padding:26px 0 0;font:italic 30px Georgia,serif;color:${ink}">${esc(c.host)}</td></tr>
  ${credit(lang, font)}
</table></td></tr></table></body></html>`;
  const text = `${T.hi}\n\n${T.list}. ${T.sub}\n\n${T.date}: ${dateLong}\n${T.time}: ${c.time}\n${T.place}: ${c.place}, ${address}\n${map}\n\n${note}\n\n${plusOne ? T.plus + "\n\n" : ""}${T.open}: ${site}/?open=1&lang=${lang}\n\n${T.change}\n\n${c.host}`;
  const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const icsEsc = (s: string) => s.replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//cotoaleksandra//invite//EN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:${cfg.slug === "ola-urodziny-2026" ? "septem-of-swords" : cfg.slug}-${c.date}@cotoaleksandra.com`, `DTSTAMP:${utc(new Date())}`, `DTSTART:${utc(start)}`, `DTEND:${utc(end)}`,
    `SUMMARY:${icsEsc(c.title[lang])}`, `LOCATION:${icsEsc(`${c.place}, ${address}`)}`, `URL:${site}/?open=1`,
    `DESCRIPTION:${icsEsc(note)}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  return { subject: T.subject, html, text, ics };
}
function buildDeclineEmail(c: EventContent, site: string, lang: "pl" | "en", name: string) {
  const we = c.voice === "we", got = we ? "Dostaliśmy" : c.voice === "m" ? "Dostałem" : "Dostałam";
  const T = lang === "pl"
    ? { subject: `${we ? "Dziękujemy" : "Dziękuję"} za odpowiedź · ${c.title.pl}`, hi: `Cześć ${name},`, head: we ? "Będziemy tęsknić" : "Będę tęsknić",
        body: `${got} Twoją odpowiedź: tym razem nie dasz rady. ${we ? "Dziękujemy" : "Dziękuję"}, że dałeś/aś znać!`,
        change: "Jeśli plany się zmienią, otwórz zaproszenie i odpowiedz jeszcze raz albo po prostu odpisz na tego maila.", open: "Otwórz zaproszenie" }
    : { subject: `Thanks for letting ${we ? "us" : "me"} know · ${c.title.en}`, hi: `Hi ${name},`, head: "You'll be missed",
        body: `Got your reply: you can't make it this time. Thank you for letting ${we ? "us" : "me"} know!`,
        change: "If plans change, open the invite and reply again, or just reply to this email.", open: "Open the invitation" };
  const ink = "#2a2926", paper = "#e9e8e4", font = "'Inter Tight','Helvetica Neue',Helvetica,Arial,sans-serif";
  const link = `${site}/?open=1&lang=${lang}`;
  const html = `<!doctype html><html><body style="margin:0;background:${paper}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${paper}"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px">
  <tr><td style="font:600 11px ${font};text-transform:uppercase;color:${ink}">cotoaleksandra</td>
      <td align="right" style="font:600 11px ${font};text-transform:uppercase;color:${ink}">${esc(dd(c.date))}</td></tr>
  <tr><td colspan="2" align="center" style="padding:34px 0 6px;font:italic 17px Georgia,serif;color:${ink}">${esc(T.hi)}</td></tr>
  <tr><td colspan="2" align="center" style="font:800 34px/1 ${font};letter-spacing:-2px;text-transform:uppercase;color:${ink}">${esc(T.head)}</td></tr>
  <tr><td colspan="2" align="center" style="padding:18px 0 0;font:15px/1.5 ${font};color:${ink}">${esc(T.body)}</td></tr>
  <tr><td colspan="2" align="center" style="padding:10px 0 0;font:13px/1.5 ${font};color:#6a6863">${esc(T.change)}</td></tr>
  <tr><td colspan="2" align="center" style="padding:26px 0 0"><a href="${link}" style="display:inline-block;border:1px solid ${ink};border-radius:999px;color:${ink};text-decoration:none;padding:10px 22px;font:600 12px ${font};text-transform:uppercase">( ${esc(T.open)} )</a></td></tr>
  <tr><td colspan="2" align="right" style="padding:26px 0 0;font:italic 30px Georgia,serif;color:${ink}">${esc(c.host)}</td></tr>
  ${credit(lang, font)}
</table></td></tr></table></body></html>`;
  const text = `${T.hi}\n\n${T.head}. ${T.body}\n\n${T.change}\n${link}\n\n${c.host}`;
  return { subject: T.subject, html, text, ics: "" };
}
function dd(iso: string) { const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; }
