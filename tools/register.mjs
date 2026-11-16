#!/usr/bin/env node
// Prepares a client invite to go live.
//   node tools/register.mjs <slug> [--new-key]
// - makes the private guest-list key once (kept in .private/, never committed)
// - writes .private/<slug>.txt  : the two links to hand over
// - writes .private/<slug>.sql  : one statement to run in Supabase → SQL editor
//   (it holds only the key's sha256, never the key itself)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_BASE = "https://zaproszenie.cotoaleksandra.com";
const slug = process.argv[2];
const fresh = process.argv.includes("--new-key");
const die = (m) => { console.error("✗ " + m); process.exit(1); };
if (!slug || !/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) die("usage: node tools/register.mjs <slug> [--new-key]");
const J = JSON.parse(fs.readFileSync(path.join(ROOT, slug, "invite.json"), "utf8"));
if (J.demo) die(`${slug} is a demo invite ("demo": true). Set it to false first.`);

const priv = path.join(ROOT, ".private");
fs.mkdirSync(priv, { recursive: true });
const keyFile = path.join(priv, `${slug}.key`);
let key = !fresh && fs.existsSync(keyFile) ? fs.readFileSync(keyFile, "utf8").trim() : "";
const newKey = !key;
if (newKey) { key = crypto.randomBytes(18).toString("base64url"); fs.writeFileSync(keyFile, key + "\n", { mode: 0o600 }); }
const hash = crypto.createHash("sha256").update(key).digest("hex");

const site = `${SITE_BASE}/${slug}`;
const sender = String(J.sender || J.host).replace(/[<>"\r\n]/g, "").slice(0, 60).trim();
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sql = `-- ${slug}: run in Supabase → SQL editor (safe to run again)
insert into public.events (slug, owner_id, admin_key_hash, site, sender, event_date)
values (${q(slug)}, null, ${q(hash)}, ${q(site)}, ${q(sender)}, ${q(J.date)})
on conflict (slug) do update set
  site = excluded.site, sender = excluded.sender, event_date = excluded.event_date${newKey ? ",\n  admin_key_hash = excluded.admin_key_hash" : ""};
select slug, site, sender, event_date, admin_key_hash is not null as has_key from public.events where slug = ${q(slug)};
`;
fs.writeFileSync(path.join(priv, `${slug}.sql`), sql);
fs.writeFileSync(path.join(priv, `${slug}.txt`), `${J.title?.pl || J.title?.en || J.title || slug}

Guest link (send to everyone):
${site}/

Private guest list (only for the host, don't share):
${site}/admin.html#k=${key}

Guests' replies and emails are deleted 30 days after the event (${J.date}).
`, { mode: 0o600 });
console.log(`✓ ${newKey ? "new" : "kept existing"} private key · .private/${slug}.sql and .private/${slug}.txt written`);
