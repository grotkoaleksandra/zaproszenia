(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const D = window.InviteData;
  let key = null, rows = [], latest = [];

  const fmt = (iso) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  // Someone may reply twice (e.g. changes their answer): keep the newest per name.
  function dedupe(all) {
    const by = new Map();
    for (const r of [...all].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      const k = r.name.trim().toLowerCase().replace(/\s+/g, " ");
      const prev = by.get(k);
      by.set(k, { ...r, replies: (prev?.replies || 0) + 1 });
    }
    return [...by.values()];
  }

  // custom questions from config (e.g. diet, song request), shown under the name
  const BUILTIN = ["name", "attending", "plus_one", "email", "message"];
  const label = (f) => (f.label && (f.label.en || f.label.pl)) || f.id;
  function extras(r) {
    return window.INVITE.rsvpFields.filter((f) => !BUILTIN.includes(f.id) && r.answers?.[f.id])
      .map((f) => {
        const v = r.answers[f.id];
        const opt = f.options && f.options.find((o) => o.v === v);
        return `<span class="msg ex"><b>${esc(label(f))}:</b> ${esc(opt ? opt.en || opt.pl || v : v)}</span>`;
      }).join("");
  }

  function render() {
    latest = dedupe(rows);
    const yes = latest.filter((r) => r.answers?.attending === "yes");
    const no = latest.filter((r) => r.answers?.attending === "no");
    const plus = yes.filter((r) => r.answers?.plus_one === "yes").length;
    const stat = (n, l) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`;
    $("#stats").innerHTML = stat(yes.length + plus, "people coming") + stat(yes.length, "confirmed") + stat(plus, "+1s") + stat(no.length, "can't come");
    $("#c-count").textContent = `${yes.length} + ${plus}`;
    $("#n-count").textContent = no.length;
    const item = (r, i) => `<li>
        <span class="n">${String(i + 1).padStart(2, "0")}</span>
        <span class="nm">${esc(r.name)}</span>
        <span class="plus">${r.answers?.plus_one === "yes" ? "+1" : ""}</span>
        ${extras(r)}
        ${r.answers?.message ? `<span class="msg">${esc(r.answers.message)}</span>` : ""}
        <span class="meta"><span>${fmt(r.created_at)}${r.replies > 1 ? ` · replied ${r.replies}×, showing latest` : ""}</span>
        <button data-del="${esc(r.id)}">remove</button></span></li>`;
    $("#yes").innerHTML = yes.length ? yes.map(item).join("") : '<li class="empty">No one yet.</li>';
    $("#no").innerHTML = no.length ? no.map(item).join("") : '<li class="empty">No one.</li>';
  }

  async function refresh() { rows = await D.listRsvps(key); render(); }

  document.addEventListener("click", async (e) => {
    const d = e.target.closest("[data-del]");
    if (!d) return;
    const r = latest.find((x) => String(x.id) === d.dataset.del);
    if (!r || !confirm(`Remove ${r.name}'s reply? This can't be undone.`)) return;
    // remove every reply from this person
    const k = r.name.trim().toLowerCase().replace(/\s+/g, " ");
    for (const x of rows.filter((x) => x.name.trim().toLowerCase().replace(/\s+/g, " ") === k)) await D.deleteRsvp(key, x);
    refresh();
  });

  $("#copy").addEventListener("click", async (e) => {
    const yes = latest.filter((r) => r.answers?.attending === "yes");
    const text = yes.map((r) => r.name + (r.answers?.plus_one === "yes" ? " +1" : "")).join("\n");
    try { await navigator.clipboard.writeText(text); e.target.textContent = "Copied ✓"; }
    catch { prompt("Copy:", text); }
    setTimeout(() => (e.target.textContent = "Copy confirmed names"), 1500);
  });
  $("#csv").addEventListener("click", () => {
    const fields = window.INVITE.rsvpFields.filter((f) => f.id !== "name" && f.type !== "email").map((f) => f.id);
    const out = [["name", ...fields, "replied_at"], ...latest.map((r) => [r.name, ...fields.map((f) => r.answers?.[f] ?? ""), r.created_at])];
    const csv = out.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    a.download = "guest-list.csv"; a.click();
  });
  $("#refresh").addEventListener("click", refresh);
  $("#reset").addEventListener("click", () => { if (confirm("Clear all test answers in this browser?")) { D.resetDemo(); refresh(); } });
  // The private link carries the key in the #hash (never sent to any server log).
  // Remember it on this device so plain /admin.html works next time.
  const KK = "invite-host-key:" + window.INVITE.eventSlug;
  const fromHash = new URLSearchParams(location.hash.slice(1)).get("k");
  if (fromHash) { try { localStorage.setItem(KK, fromHash); } catch {} history.replaceState(null, "", location.pathname); }
  try { key = fromHash || localStorage.getItem(KK); } catch { key = fromHash; }

  $("#forget").addEventListener("click", () => {
    if (!confirm("Forget the private link on this device? You'll need the link again to open the list.")) return;
    try { localStorage.removeItem(KK); } catch {} location.reload();
  });

  (async () => {
    if (D.mode === "live" && !key) { $("#locked").hidden = false; return; }
    $("#app").hidden = false;
    $("#demo").hidden = D.mode !== "demo";
    $("#forget").hidden = D.mode === "demo";
    try { await refresh(); }
    catch (err) {
      console.error(err);
      $("#app").hidden = true; $("#locked").hidden = false;
      if (/not allowed/.test(err.message)) { try { localStorage.removeItem(KK); } catch {} }
    }
  })();
})();
