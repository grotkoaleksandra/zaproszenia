// Data layer: Supabase (live) or localStorage (demo). Same API for both.
// Demo mode when: the invite sets demo: true, or it's opened on this computer
// (localhost) for a preview. Add ?live=1 to a local preview to use the real backend.
(() => {
  const cfg = window.INVITE;
  const be = window.INVITE_BACKEND || {};
  const q = new URLSearchParams(location.search);
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const live = !!(be.supabaseUrl && be.supabaseAnonKey && window.supabase) && !cfg.demo && (!local || q.get("live") === "1");
  const sb = live ? window.supabase.createClient(be.supabaseUrl, be.supabaseAnonKey) : null;
  const KEY = `invite-demo-rsvps:${cfg.eventSlug}`;
  const ok = ({ data, error }) => { if (error) throw error; return data; };
  const loadDemo = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const saveDemo = (rows) => { try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch {} };

  window.InviteData = {
    mode: live ? "live" : "demo",

    // guest: the "rsvp" edge function saves the reply and, for a yes with an
    // email, sends the opened invite to the guest.
    async submitRsvp(name, answers, lang) {
      if (live) {
        const { data, error } = await sb.functions.invoke("rsvp", { body: { slug: cfg.eventSlug, name, answers, lang } });
        if (error) throw error;
        return data;
      }
      const rows = loadDemo();
      rows.push({ id: Math.random().toString(36).slice(2), name, answers, created_at: new Date().toISOString() });
      saveDemo(rows);
      return { emailed: false };
    },

    // host: no login. The guest list opens with a private link (admin.html#k=…);
    // the key is checked server-side (host_rsvps).
    async listRsvps(key) {
      if (!live) return loadDemo();
      return ok(await sb.rpc("host_rsvps", { p_slug: cfg.eventSlug, p_key: key }));
    },
    async deleteRsvp(key, row) {
      if (!live) { saveDemo(loadDemo().filter((r) => r.id !== row.id)); return; }
      ok(await sb.rpc("host_delete_rsvp", { p_slug: cfg.eventSlug, p_key: key, p_id: row.id }));
    },
    resetDemo() { try { localStorage.removeItem(KEY); } catch {} },
  };
})();
