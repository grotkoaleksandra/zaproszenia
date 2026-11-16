# zaproszenia

Done-for-you envelope invites by cotoaleksandra, served at `https://zaproszenie.cotoaleksandra.com/<client>/`.

- Guests tap the wax seal, the envelope opens, and a tarot-style card rises and flips.
- They RSVP with no account. A "yes" gets an email with the details and a calendar file.
- The host sees replies at a private link.

## How a client invite is made
In Claude, run **`/nowe-zaproszenie`** with the client's filled-in form. For changes, run **`/zmien-zaproszenie`**.
The full steps live in those skills, at `~/.claude/skills/nowe-zaproszenie/SKILL.md`.

By hand:
1. Run `mkdir <slug> && cp templates/invite.example.json <slug>/invite.json`, then edit it and set `"demo": false`.
2. Photo: `swift tools/photo.swift originals/<file>.jpg <slug>/photo.jpg`, and set `card.photo` to `"photo.jpg"`.
3. Run `node tools/build.mjs <slug>`, then preview at `http://localhost:8860/<slug>/` (local previews are always demo mode).
4. Run `tools/capture.sh <slug>` to make the share and email images.
5. Run `node tools/register.mjs <slug>`, then run `.private/<slug>.sql` in the Supabase SQL editor.
6. Run `git add <slug> && git commit && git push`.
7. Hand over the two links in `.private/<slug>.txt`.

## Layout
- `kit/`: the shared invite code, used by every client
- `templates/`: the page templates and the example `invite.json`
- `<slug>/invite.json`: **the only file edited per client**; the rest of the folder is generated
- `demo/`: a public sample invite (demo mode, replies stay in the browser)
- `supabase/events.sql`: the one-time database setup on top of the birthday invite's schema
- `supabase/functions/rsvp/`: the email function, one for all events
- `.private/` and `originals/`: private links and client originals; **never committed**

## Privacy
- Guests give an email only when they say yes, and it's used only to send the details. It's never shown on the guest list.
- Replies are deleted 30 days after the event by a nightly job (`purge_old_rsvps`).
