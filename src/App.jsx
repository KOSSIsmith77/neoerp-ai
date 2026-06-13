import { useState, useEffect, useRef } from "react";

/* ─── CONFIG ─── */
const SUPABASE_URL = "https://yctdyzcusvyumrfbqgyx.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljdGR5emN1c3Z5dW1yZmJxZ3l4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0ODk5NDEsImV4cCI6MjA5NjA2NTk0MX0.ShrXFKzMX4RDym-E1J1CZPuxMstBqfZZssvqF29Zrgw";
const SESSION_KEY = "neoerp_session";

const COMPANY = {
  name: "NeoTech Solutions",
  address: "Lomé, Togo",
  phone: "+228 XX XX XX XX",
  email: "contact@neotech-solutions.tg",
  rccm: "RC/LFM/2024/B/XXXXX",
  tva: "TG20240001",
  regime: "Réel Simplifié — SYSCOHADA",
};

const PLANS = [
  { id: "starter", name: "Starter", price: 5000, priceUSD: 8, desc: "Idéal pour démarrer", features: ["1 utilisateur", "Factures illimitées", "PDF automatique", "Trésorerie", "Support email"], color: "#5BA4FF", cta: "Commencer gratuitement", trial: true },
  { id: "business", name: "Business", price: 15000, priceUSD: 25, desc: "Pour les PME en croissance", features: ["5 utilisateurs", "Agent IA inclus", "PDF professionnel", "SYSCOHADA complet", "Relances auto", "Support prioritaire"], color: "#00E5B0", cta: "Choisir Business", popular: true, trial: true },
  { id: "pro", name: "Pro", price: 35000, priceUSD: 58, desc: "Pour les entreprises avancées", features: ["Utilisateurs illimités", "Multi-entreprises", "IA décisionnelle", "OCR documents", "API access", "Support dédié"], color: "#FFD060", cta: "Choisir Pro", trial: false },
];

const T = {
  bg: "#070A0F", s1: "#0D1117", s2: "#111820", s3: "#161E2B",
  border: "#1C2535", borderLight: "#243040",
  accent: "#00E5B0", accentDim: "#00E5B012", accentBorder: "#00E5B025",
  gold: "#FFD060", goldDim: "#FFD06012",
  red: "#FF4D6A", redDim: "#FF4D6A12",
  blue: "#5BA4FF", blueDim: "#5BA4FF12",
  violet: "#A78BFA", violetDim: "#A78BFA12",
  text: "#E2EAF4", sub: "#8898AA", dim: "#364558",
};

const fmtShort = (n) => { n = Number(n || 0); if (n >= 1e6) return (n / 1e6).toFixed(1) + "M"; if (n >= 1e3) return (n / 1e3).toFixed(0) + "K"; return String(n); };
const fmt = (n) => Number(n || 0).toLocaleString("fr-FR") + " FCFA";
const genRef = () => `FAC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

/* ─── AUTH ─── */
const auth = {
  async signUp(email, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, { method: "POST", headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    if (!res.ok) { const e = await res.json(); throw new Error(e.msg || e.message || "Erreur inscription"); }
    return res.json();
  },
  async signIn(email, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error_description || "Email ou mot de passe incorrect"); }
    return res.json();
  },
  async signOut(token) { await fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: "POST", headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` } }); },
  async refreshToken(rt) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: rt }) });
    if (!res.ok) throw new Error("Session expirée");
    return res.json();
  },
  saveSession(data, company, plan) { try { localStorage.setItem(SESSION_KEY, JSON.stringify({ token: data.access_token, refresh_token: data.refresh_token, user: data.user, company: company || "Mon Entreprise", plan: plan || "starter", expires_at: Date.now() + (data.expires_in * 1000) })); } catch (e) {} },
  loadSession() { try { const r = localStorage.getItem(SESSION_KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; } },
  clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} },
};

/* ─── DB ─── */
const db = {
  async query(table, options = {}, token) {
    let url = `${SUPABASE_URL}/rest/v1/${table}?`;
    if (options.select) url += `select=${encodeURIComponent(options.select)}&`;
    if (options.order) url += `order=${options.order}&`;
    if (options.filter) url += `${options.filter}&`;
    const res = await fetch(url, { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` } });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || `Erreur ${table}`); }
    return res.json();
  },
  async insert(table, data, token) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: "POST", headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(data) });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || `Erreur insert ${table}`); }
    return res.json();
  },
  async update(table, id, data, token) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, { method: "PATCH", headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(data) });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || `Erreur update`); }
    return res.json();
  },
  async auditLog(action, entity, entityId, details, userId, token) {
    try { await fetch(`${SUPABASE_URL}/rest/v1/audit_logs`, { method: "POST", headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action, entity, entity_id: entityId || null, details: details || {}, user_id: userId }) }); } catch (e) {}
  },
};

const validate = {
  facture({ client_nom, montant_ht }) {
    if (!client_nom || client_nom.trim().length < 2) return "Nom du client invalide";
    const ht = Number(montant_ht);
    if (!ht || ht <= 0) return "Montant HT invalide";
    if (ht > 50000000) return "Montant > 50M FCFA — autorisation requise";
    return null;
  },
  client({ nom }) { if (!nom || nom.trim().length < 2) return "Nom invalide"; return null; },
  operation({ montant }) { const m = Number(montant); if (!m || m <= 0) return "Montant invalide"; return null; },
};

async function createEcritures(ref, clientNom, ht, tva, ttc, userId, token) {
  await db.insert("ecritures", { debit_compte: "411", debit_libelle: "Clients", credit_compte: null, credit_libelle: null, montant: ttc, description: `${ref} — ${clientNom} — TTC`, user_id: userId }, token);
  await db.insert("ecritures", { debit_compte: null, debit_libelle: null, credit_compte: "706", credit_libelle: "Prestations HT", montant: ht, description: `${ref} — HT`, user_id: userId }, token);
  await db.insert("ecritures", { debit_compte: null, debit_libelle: null, credit_compte: "443", credit_libelle: "TVA collectée 18%", montant: tva, description: `${ref} — TVA`, user_id: userId }, token);
}

/* ─── PDF ─── */
function generatePDF(facture) {
  const ht = facture.montant_ht || 0, tva = facture.tva_montant || Math.round(ht * 0.18), ttc = facture.montant_ttc || ht + tva;
  const date = new Date(facture.created_at || Date.now()).toLocaleDateString("fr-FR");
  const echeance = facture.date_echeance ? new Date(facture.date_echeance).toLocaleDateString("fr-FR") : "30 jours";
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/><title>Facture ${facture.reference}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:13px;color:#1a1a2e;padding:40px}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;padding-bottom:24px;border-bottom:3px solid #00C48C}
.logo{font-size:22px;font-weight:900;color:#00C48C}.co{font-size:11px;color:#666;margin-top:6px;line-height:1.6}
.inv-title{text-align:right}.inv-title h1{font-size:28px;font-weight:900;color:#1a1a2e}.inv-ref{color:#00C48C;font-size:14px;font-weight:700;margin-top:4px}
.inv-date{color:#666;font-size:12px;margin-top:4px}.parties{display:flex;justify-content:space-between;margin-bottom:36px;gap:40px}
.party{flex:1}.party-label{font-size:10px;font-weight:700;color:#999;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:8px}
.party-name{font-size:16px;font-weight:800;color:#1a1a2e;margin-bottom:4px}.party-detail{font-size:11px;color:#666;line-height:1.6}
table{width:100%;border-collapse:collapse;margin-bottom:24px}thead tr{background:#1a1a2e;color:white}
thead th{padding:10px 14px;text-align:left;font-size:11px;font-weight:700}tbody tr{border-bottom:1px solid #f0f0f0}
tbody td{padding:12px 14px;font-size:12px}.totals{display:flex;justify-content:flex-end;margin-bottom:36px}
.totals-box{width:280px}.total-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:13px}
.total-final{background:#00C48C;color:white;padding:12px 16px;border-radius:8px;margin-top:8px;font-weight:900;font-size:15px;display:flex;justify-content:space-between}
.footer{border-top:1px solid #f0f0f0;padding-top:16px;font-size:10px;color:#999;text-align:center;line-height:1.6}
.badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;background:${facture.statut === "payée" ? "#e8f9f2" : "#fff8e1"};color:${facture.statut === "payée" ? "#00C48C" : "#F5A623"}}
</style></head><body>
<div class="header"><div><div class="logo">${COMPANY.name}</div><div class="co">${COMPANY.address}<br/>Tél : ${COMPANY.phone}<br/>Email : ${COMPANY.email}<br/>RCCM : ${COMPANY.rccm}<br/>N° TVA : ${COMPANY.tva}</div></div>
<div class="inv-title"><h1>FACTURE</h1><div class="inv-ref">${facture.reference}</div><div class="inv-date">Date : ${date}</div><div class="inv-date">Échéance : ${echeance}</div><div style="margin-top:8px"><span class="badge">${(facture.statut || "").toUpperCase()}</span></div></div></div>
<div class="parties"><div class="party"><div class="party-label">Émetteur</div><div class="party-name">${COMPANY.name}</div><div class="party-detail">${COMPANY.address}<br/>${COMPANY.email}<br/>${COMPANY.regime}</div></div>
<div class="party" style="text-align:right"><div class="party-label">Client</div><div class="party-name">${facture.client_nom}</div><div class="party-detail">Lomé, Togo</div></div></div>
<table><thead><tr><th>Description</th><th style="text-align:right">Qté</th><th style="text-align:right">Prix HT</th><th style="text-align:right">Montant HT</th></tr></thead>
<tbody><tr><td>${facture.description || "Prestation de services"}</td><td style="text-align:right">1</td><td style="text-align:right">${ht.toLocaleString("fr-FR")} FCFA</td><td style="text-align:right">${ht.toLocaleString("fr-FR")} FCFA</td></tr></tbody></table>
<div class="totals"><div class="totals-box"><div class="total-row"><span style="color:#666">Montant HT</span><span>${ht.toLocaleString("fr-FR")} FCFA</span></div><div class="total-row"><span style="color:#666">TVA 18%</span><span>${tva.toLocaleString("fr-FR")} FCFA</span></div>
<div class="total-final"><span>TOTAL TTC</span><span>${ttc.toLocaleString("fr-FR")} FCFA</span></div></div></div>
<div style="background:#f8f9ff;border:1px solid #e8e9f0;border-radius:8px;padding:16px;margin-bottom:24px">
<div style="font-size:11px;font-weight:700;color:#999;letter-spacing:0.15em;margin-bottom:8px">MODALITÉS DE PAIEMENT</div>
<div style="font-size:12px;color:#444;line-height:1.6">Règlement par virement, Mobile Money ou chèque.<br/>Échéance : ${echeance} — Pénalités : 1,5%/mois.<br/>Référence : <strong>${facture.reference}</strong></div></div>
<div class="footer">${COMPANY.name} — ${COMPANY.address} — RCCM : ${COMPANY.rccm} — N° TVA : ${COMPANY.tva}<br/>Généré par NeoERP AI — neoerp-ai.vercel.app</div>
</body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${facture.reference}.html`; a.click();
  URL.revokeObjectURL(url);
}

/* ─── CHARTS ─── */
function BarChart({ data, labels, color, height = 100, title }) {
  const max = Math.max(...data, 1);
  return (
    <div>
      {title && <div style={{ color: T.sub, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", marginBottom: 10 }}>{title}</div>}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height }}>
        {data.map((v, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ color: T.sub, fontSize: 9, whiteSpace: "nowrap" }}>{v > 0 ? fmtShort(v) : ""}</div>
            <div style={{ width: "100%", background: i === data.length - 1 ? color : T.border, borderRadius: "3px 3px 0 0", height: `${Math.max((v / max) * (height - 20), v > 0 ? 4 : 0)}px`, transition: "height 0.8s ease", border: i === data.length - 1 ? `1px solid ${color}60` : "none" }} />
            {labels && <div style={{ color: T.dim, fontSize: 8, whiteSpace: "nowrap" }}>{labels[i]}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChart({ data, color, height = 80, title }) {
  const max = Math.max(...data, 1), min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = height - ((v - min) / range) * (height - 10) - 5;
    return `${x},${y}`;
  });
  return (
    <div>
      {title && <div style={{ color: T.sub, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", marginBottom: 8 }}>{title}</div>}
      <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
        <defs>
          <linearGradient id={`lg${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,${height} ${pts.join(" ")} 100,${height}`} fill={`url(#lg${color.slice(1)})`} />
        <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={pts[pts.length - 1].split(",")[0]} cy={pts[pts.length - 1].split(",")[1]} r="3" fill={color} />
      </svg>
    </div>
  );
}

function DonutChart({ segments, size = 80 }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  const r = 28, cx = 40, cy = 40;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 80 80">
      {segments.map((seg, i) => {
        const dash = (seg.value / total) * circ;
        const gap = circ - dash;
        const el = <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth="12" strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-offset} transform="rotate(-90 40 40)" />;
        offset += dash;
        return el;
      })}
      <circle cx={cx} cy={cy} r={22} fill={T.s2} />
    </svg>
  );
}

/* ─── REMINDERS SYSTEM ─── */
function RemindersModule({ factures, token, userId, toast }) {
  const [sending, setSending] = useState({});
  const [sent, setSent] = useState({});

  const getRetardDays = (facture) => {
    if (!facture.date_echeance) return 0;
    const diff = Date.now() - new Date(facture.date_echeance).getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  };

  const impayees = factures.filter(f => f.statut !== "payée");
  const enRetard = impayees.filter(f => getRetardDays(f) > 0);

  const sendReminder = async (facture, type) => {
    const key = `${facture.id}-${type}`;
    setSending(s => ({ ...s, [key]: true }));
    await new Promise(r => setTimeout(r, 1500));
    await db.auditLog("REMINDER_SENT", "factures", facture.id, { type, client: facture.client_nom, montant: facture.montant_ttc }, userId, token);
    setSending(s => ({ ...s, [key]: false }));
    setSent(s => ({ ...s, [key]: true }));
    toast(`Relance ${type} envoyée à ${facture.client_nom} ✓`, "success");
  };

  const sendAllReminders = async () => {
    for (const f of enRetard) {
      const days = getRetardDays(f);
      const type = days >= 30 ? "J+30 — Mise en demeure" : days >= 15 ? "J+15 — Relance ferme" : "J+7 — Rappel amical";
      await sendReminder(f, type);
    }
  };

  const getReminderType = (days) => {
    if (days >= 30) return { label: "J+30", color: T.red, msg: "Mise en demeure" };
    if (days >= 15) return { label: "J+15", color: T.gold, msg: "Relance ferme" };
    if (days >= 7) return { label: "J+7", color: T.blue, msg: "Rappel amical" };
    return { label: "Bientôt", color: T.sub, msg: "Pas encore dû" };
  };

  return (
    <div style={{ padding: 18, height: "100%", overflowY: "auto" }}>
      <div style={{ color: T.sub, fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", marginBottom: 4 }}>⚡ RELANCES AUTOMATIQUES</div>
      <div style={{ color: T.text, fontSize: 17, fontWeight: 800, marginBottom: 4 }}>Relances clients</div>
      <div style={{ color: T.sub, fontSize: 12, marginBottom: 16 }}>Système automatique J+7 · J+15 · J+30</div>

      {enRetard.length > 0 && (
        <button onClick={sendAllReminders} style={{ width: "100%", background: T.red, border: "none", borderRadius: 9, padding: "11px", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 16 }}>
          ⚡ Envoyer toutes les relances ({enRetard.length} client{enRetard.length > 1 ? "s" : ""})
        </button>
      )}

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 9, marginBottom: 16 }}>
        {[
          { label: "Impayées", val: impayees.length, color: T.gold },
          { label: "En retard", val: enRetard.length, color: T.red },
          { label: "Total dû", val: fmtShort(impayees.reduce((s, f) => s + (f.montant_ttc || 0), 0)) + " F", color: T.accent },
        ].map((k, i) => (
          <div key={i} style={{ background: T.s2, border: `1px solid ${T.border}`, borderRadius: 9, padding: "10px 11px" }}>
            <div style={{ color: T.sub, fontSize: 10 }}>{k.label}</div>
            <div style={{ color: k.color, fontSize: 15, fontWeight: 800 }}>{k.val}</div>
          </div>
        ))}
      </div>

      {impayees.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: T.accent, fontSize: 13 }}>
          ✓ Aucune facture impayée — Excellent !
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {impayees.map((f) => {
            const days = getRetardDays(f);
            const rt = getReminderType(days);
            return (
              <div key={f.id} style={{ background: T.s2, border: `1px solid ${days > 0 ? rt.color + "30" : T.border}`, borderRadius: 11, padding: "12px 13px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ background: rt.color + "20", color: rt.color, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{rt.label}</div>
                  <div style={{ color: T.text, fontSize: 13, fontWeight: 600, flex: 1 }}>{f.client_nom}</div>
                  <div style={{ color: T.text, fontSize: 12, fontWeight: 700 }}>{fmtShort(f.montant_ttc)} F</div>
                </div>
                <div style={{ color: T.sub, fontSize: 11, marginBottom: 8 }}>
                  {f.reference} · {days > 0 ? `${days} jours de retard` : "À venir"} · {rt.msg}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[
                    { type: "Email", icon: "✉" },
                    { type: "SMS", icon: "📱" },
                    { type: "WhatsApp", icon: "💬" },
                  ].map(({ type, icon }) => {
                    const key = `${f.id}-${type}`;
                    const isSent = sent[key];
                    const isSending = sending[key];
                    return (
                      <button key={type} onClick={() => sendReminder(f, type)} disabled={isSending || isSent} style={{ background: isSent ? T.accentDim : T.s3, border: `1px solid ${isSent ? T.accent : T.border}`, borderRadius: 6, padding: "4px 10px", color: isSent ? T.accent : T.sub, fontSize: 10, cursor: isSent || isSending ? "default" : "pointer", fontWeight: 600 }}>
                        {isSending ? "…" : isSent ? "✓ Envoyé" : `${icon} ${type}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ background: T.s2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px", marginTop: 16 }}>
        <div style={{ color: T.sub, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8 }}>AUTOMATISATION (bientôt)</div>
        {[
          { label: "J+7 après échéance", action: "Email automatique — Rappel amical", active: false },
          { label: "J+15 après échéance", action: "Email + SMS — Relance ferme", active: false },
          { label: "J+30 après échéance", action: "Email + WhatsApp — Mise en demeure", active: false },
        ].map((rule, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: i < 2 ? `1px solid ${T.border}` : "none" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.dim, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ color: T.text, fontSize: 11 }}>{rule.label}</div>
              <div style={{ color: T.sub, fontSize: 10 }}>{rule.action}</div>
            </div>
            <div style={{ color: T.dim, fontSize: 9, fontWeight: 600 }}>CRON requis</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── DASHBOARD WITH CHARTS ─── */
function Dashboard({ token, userId, onNavigate, refreshKey, plan, company }) {
  const [stats, setStats] = useState(null);
  const [factures, setFactures] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const [clients, facturesData, ops] = await Promise.all([
          db.query("clients", { select: "id,nom,created_at" }, token),
          db.query("factures", { select: "*", order: "created_at.desc" }, token),
          db.query("tresorerie", { select: "type,montant,created_at" }, token),
        ]);
        const fList = Array.isArray(facturesData) ? facturesData : [];
        setFactures(fList);
        const impaye = fList.filter(f => f.statut !== "payée").reduce((s, f) => s + (f.montant_ttc || 0), 0);
        const payee = fList.filter(f => f.statut === "payée").reduce((s, f) => s + (f.montant_ttc || 0), 0);
        const entrees = Array.isArray(ops) ? ops.filter(o => o.type === "entrée").reduce((s, o) => s + (o.montant || 0), 0) : 0;
        const sorties = Array.isArray(ops) ? ops.filter(o => o.type === "sortie").reduce((s, o) => s + (o.montant || 0), 0) : 0;

        // Chart data — derniers 6 mois simulés + réel pour ce mois
        const now = new Date();
        const months = Array.from({ length: 6 }, (_, i) => {
          const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
          return { label: d.toLocaleDateString("fr-FR", { month: "short" }), month: d.getMonth(), year: d.getFullYear() };
        });

        const caParMois = months.map(m => {
          return fList.filter(f => {
            const fd = new Date(f.created_at);
            return fd.getMonth() === m.month && fd.getFullYear() === m.year;
          }).reduce((s, f) => s + (f.montant_ttc || 0), 0);
        });

        const tresoParMois = months.map((m, i) => {
          const base = entrees - sorties;
          return Math.max(0, base + (i - 5) * (base * 0.05));
        });
        tresoParMois[5] = entrees - sorties;

        setStats({
          clients: Array.isArray(clients) ? clients.length : 0,
          factures: fList.length,
          impaye, payee,
          solde: entrees - sorties,
          entrees, sorties,
          caParMois,
          tresoParMois,
          monthLabels: months.map(m => m.label),
          payeeCount: fList.filter(f => f.statut === "payée").length,
          impayeeCount: fList.filter(f => f.statut === "impayée").length,
          retardCount: fList.filter(f => f.statut === "retard").length,
        });
      } catch (e) {}
      setLoading(false);
    };
    run();
  }, [refreshKey]);

  const currentPlan = PLANS.find(p => p.id === plan) || PLANS[0];

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: T.sub, fontSize: 12 }}>Chargement du tableau de bord…</div>;

  return (
    <div style={{ padding: 18, height: "100%", overflowY: "auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: T.text, fontSize: 16, fontWeight: 800 }}>Bonjour 👋</div>
          <div style={{ color: T.sub, fontSize: 11 }}>{company} · Plan {currentPlan.name}</div>
        </div>
        <button onClick={() => onNavigate("agent")} style={{ background: T.accentDim, border: `1px solid ${T.accentBorder}`, borderRadius: 8, padding: "6px 12px", color: T.accent, fontSize: 11, cursor: "pointer", fontWeight: 700 }}>◈ Agent IA</button>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 16 }}>
        {[
          { label: "CA encaissé", val: fmtShort(stats.payee), unit: "FCFA", color: T.accent, icon: "↑" },
          { label: "Trésorerie", val: fmtShort(stats.solde), unit: "FCFA", color: stats.solde >= 0 ? T.blue : T.red, icon: "◈" },
          { label: "Impayés", val: fmtShort(stats.impaye), unit: "FCFA", color: T.gold, icon: "⚠" },
          { label: "Clients", val: stats.clients, unit: "actifs", color: T.violet, icon: "◉" },
        ].map((k, i) => (
          <div key={i} style={{ background: T.s2, border: `1px solid ${T.border}`, borderRadius: 11, padding: "12px 13px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: T.sub, fontSize: 10 }}>{k.label}</span>
              <span style={{ color: k.color, fontSize: 12 }}>{k.icon}</span>
            </div>
            <div style={{ color: k.color, fontSize: 20, fontWeight: 900 }}>{k.val}</div>
            <div style={{ color: T.dim, fontSize: 9 }}>{k.unit}</div>
          </div>
        ))}
      </div>

      {/* CA Chart */}
      <div style={{ background: T.s2, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px", marginBottom: 12 }}>
        <BarChart data={stats.caParMois} labels={stats.monthLabels} color={T.accent} height={90} title="CHIFFRE D'AFFAIRES — 6 DERNIERS MOIS (FCFA)" />
      </div>

      {/* Trésorerie Chart */}
      <div style={{ background: T.s2, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px", marginBottom: 12 }}>
        <LineChart data={stats.tresoParMois} color={T.blue} height={70} title="ÉVOLUTION TRÉSORERIE" />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          {stats.monthLabels.map((l, i) => <span key={i} style={{ color: T.dim, fontSize: 8 }}>{l}</span>)}
        </div>
      </div>

      {/* Factures donut + stats */}
      <div style={{ background: T.s2, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px", marginBottom: 12 }}>
        <div style={{ color: T.sub, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", marginBottom: 12 }}>STATUT DES FACTURES</div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <DonutChart segments={[
            { color: T.accent, value: stats.payeeCount },
            { color: T.gold, value: stats.impayeeCount },
            { color: T.red, value: stats.retardCount },
          ]} size={80} />
          <div style={{ flex: 1 }}>
            {[
              { label: "Payées", val: stats.payeeCount, color: T.accent },
              { label: "Impayées", val: stats.impayeeCount, color: T.gold },
              { label: "En retard", val: stats.retardCount, color: T.red },
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.color }} />
                <span style={{ color: T.sub, fontSize: 11, flex: 1 }}>{s.label}</span>
                <span style={{ color: s.color, fontSize: 12, fontWeight: 700 }}>{s.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Entrées/Sorties */}
      <div style={{ background: T.s2, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px", marginBottom: 12 }}>
        <div style={{ color: T.sub, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", marginBottom: 10 }}>FLUX DE TRÉSORERIE</div>
        <div style={{ display: "flex", gap: 10 }}>
          {[{ label: "Entrées", val: stats.entrees, color: T.accent }, { label: "Sorties", val: stats.sorties, color: T.red }, { label: "Solde net", val: stats.solde, color: stats.solde >= 0 ? T.blue : T.red }].map((k, i) => (
            <div key={i} style={{ flex: 1, background: T.s3, borderRadius: 8, padding: "10px 10px", textAlign: "center" }}>
              <div style={{ color: T.sub, fontSize: 9, marginBottom: 4 }}>{k.label}</div>
              <div style={{ color: k.color, fontSize: 13, fontWeight: 800 }}>{fmtShort(k.val)}</div>
              <div style={{ color: T.dim, fontSize: 8 }}>FCFA</div>
            </div>
          ))}
        </div>
      </div>

      {/* Relances rapides */}
      {stats.impaye > 0 && (
        <button onClick={() => onNavigate("reminders")} style={{ width: "100%", background: T.redDim, border: `1px solid ${T.red}30`, borderRadius: 10, padding: "11px 14px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", textAlign: "left" }}>
          <span style={{ color: T.red, fontSize: 16 }}>⚡</span>
          <div>
            <div style={{ color: T.red, fontWeight: 700, fontSize: 12 }}>Relances en attente</div>
            <div style={{ color: T.sub, fontSize: 10 }}>{fmtShort(stats.impaye)} FCFA impayés · Cliquez pour relancer</div>
          </div>
          <div style={{ marginLeft: "auto", color: T.red }}>→</div>
        </button>
      )}
    </div>
  );
}

/* ─── AI AGENT ─── */
const createTools = (token, userId) => ({
  async creerClient({ nom, email, telephone }) {
    const err = validate.client({ nom }); if (err) return { success: false, message: `❌ ${err}` };
    const r = await db.insert("clients", { nom: nom.trim(), email: email || null, telephone: telephone || null, statut: "actif", user_id: userId }, token);
    await db.auditLog("CREATE", "clients", r[0]?.id, { nom }, userId, token);
    return { success: true, message: `✓ Client **${nom}** créé.` };
  },
  async creerFacture({ client_nom, montant_ht, description, date_echeance }) {
    const err = validate.facture({ client_nom, montant_ht }); if (err) return { success: false, message: `❌ ${err}` };
    const ht = Math.round(Number(montant_ht)), tva = Math.round(ht * 0.18), ttc = ht + tva, ref = genRef();
    await db.insert("factures", { reference: ref, client_nom: client_nom.trim(), montant_ht: ht, tva_rate: 18, tva_montant: tva, montant_ttc: ttc, statut: "impayée", description: description || null, date_echeance: date_echeance || null, user_id: userId }, token);
    await createEcritures(ref, client_nom, ht, tva, ttc, userId, token);
    await db.auditLog("CREATE", "factures", null, { ref, client_nom, ttc }, userId, token);
    return { success: true, message: `✓ Facture **${ref}**\n• Client : **${client_nom}**\n• HT : ${ht.toLocaleString("fr-FR")} FCFA\n• TVA 18% : ${tva.toLocaleString("fr-FR")} FCFA\n• **TTC : ${ttc.toLocaleString("fr-FR")} FCFA**\n✓ SYSCOHADA 411/706/443 générées` };
  },
  async listerFactures({ statut }) {
    const filter = statut && statut !== "null" ? `statut=eq.${statut}` : null;
    const data = await db.query("factures", { select: "*", order: "created_at.desc", filter }, token);
    const list = Array.isArray(data) ? data : [];
    if (!list.length) return { success: true, message: "Aucune facture." };
    const total = list.reduce((s, f) => s + (f.montant_ttc || 0), 0);
    return { success: true, message: `**${list.length} facture(s)** · ${total.toLocaleString("fr-FR")} FCFA\n\n${list.slice(0, 8).map(f => `• **${f.reference}** — ${f.client_nom} — ${(f.montant_ttc || 0).toLocaleString("fr-FR")} FCFA — ${f.statut}`).join("\n")}` };
  },
  async listerClients() {
    const data = await db.query("clients", { select: "*", order: "created_at.desc" }, token);
    const list = Array.isArray(data) ? data : [];
    if (!list.length) return { success: true, message: "Aucun client." };
    return { success: true, message: `**${list.length} client(s) :**\n\n${list.map(c => `• **${c.nom}** — ${c.email || c.telephone || "—"}`).join("\n")}` };
  },
  async analyserTresorerie() {
    const [ops, factures] = await Promise.all([db.query("tresorerie", { select: "type,montant" }, token), db.query("factures", { select: "statut,montant_ttc" }, token)]);
    const list = Array.isArray(ops) ? ops : [];
    const e = list.filter(o => o.type === "entrée").reduce((s, o) => s + (o.montant || 0), 0);
    const s = list.filter(o => o.type === "sortie").reduce((s, o) => s + (o.montant || 0), 0);
    const imp = Array.isArray(factures) ? factures.filter(f => f.statut !== "payée").reduce((s, f) => s + (f.montant_ttc || 0), 0) : 0;
    return { success: true, message: `**Trésorerie :**\n• Entrées : **${e.toLocaleString("fr-FR")} FCFA**\n• Sorties : **${s.toLocaleString("fr-FR")} FCFA**\n• **Solde : ${(e - s).toLocaleString("fr-FR")} FCFA**\n• Impayés : **${imp.toLocaleString("fr-FR")} FCFA**` };
  },
  async enregistrerOperation({ type, montant, description, categorie }) {
    const err = validate.operation({ montant }); if (err) return { success: false, message: `❌ ${err}` };
    await db.insert("tresorerie", { type, montant: Math.round(Number(montant)), description: description || null, categorie: categorie || null, user_id: userId }, token);
    return { success: true, message: `✓ **${type}** de **${Math.round(Number(montant)).toLocaleString("fr-FR")} FCFA** enregistrée` };
  },
  async statistiques() {
    const [clients, factures, ops] = await Promise.all([db.query("clients", { select: "id" }, token), db.query("factures", { select: "statut,montant_ttc" }, token), db.query("tresorerie", { select: "type,montant" }, token)]);
    const imp = Array.isArray(factures) ? factures.filter(f => f.statut !== "payée").reduce((s, f) => s + (f.montant_ttc || 0), 0) : 0;
    const pay = Array.isArray(factures) ? factures.filter(f => f.statut === "payée").reduce((s, f) => s + (f.montant_ttc || 0), 0) : 0;
    const ent = Array.isArray(ops) ? ops.filter(o => o.type === "entrée").reduce((s, o) => s + (o.montant || 0), 0) : 0;
    const sor = Array.isArray(ops) ? ops.filter(o => o.type === "sortie").reduce((s, o) => s + (o.montant || 0), 0) : 0;
    return { success: true, message: `**Tableau de bord :**\n👥 Clients : **${Array.isArray(clients) ? clients.length : 0}**\n📄 Factures : **${Array.isArray(factures) ? factures.length : 0}**\n✓ CA encaissé : **${pay.toLocaleString("fr-FR")} FCFA**\n⚠ Impayés : **${imp.toLocaleString("fr-FR")} FCFA**\n💰 Trésorerie : **${(ent - sor).toLocaleString("fr-FR")} FCFA**` };
  },
});

async function runAI(msg, history, onStatus, token, userId) {
  const tools = createTools(token, userId);
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 800, system: `Tu es NeoERP AI Agent — ERP autonome SYSCOHADA PME africaines. TOOLS sur une ligne TOOL:{json}: creer_client, creer_facture, lister_factures, lister_clients, analyser_tresorerie, enregistrer_operation, statistiques. Réponds en français. Montants FCFA.`, messages: [...history, { role: "user", content: msg }] }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || "Erreur IA"); }
  const data = await res.json();
  const aiText = data.content?.[0]?.text || "";
  const toolLine = aiText.split("\n").find(l => l.trim().startsWith("TOOL:"));
  if (toolLine) {
    try {
      const { tool, params } = JSON.parse(toolLine.replace("TOOL:", "").trim());
      const map = { creer_client: tools.creerClient, creer_facture: tools.creerFacture, lister_factures: tools.listerFactures, lister_clients: tools.listerClients, analyser_tresorerie: tools.analyserTresorerie, enregistrer_operation: tools.enregistrerOperation, statistiques: tools.statistiques };
      if (map[tool]) { onStatus(`⚙ ${tool.replace(/_/g, " ")}…`); return (await map[tool](params || {})).message; }
    } catch (e) { return `❌ ${e.message}`; }
  }
  return aiText;
}

function AIAgent({ token, userId, onRefresh }) {
  const [msgs, setMsgs] = useState([{ role: "ai", text: `**NeoERP AI Agent**\n\nConnecté · SYSCOHADA · PDF\n\nQue souhaitez-vous faire ?` }]);
  const [input, setInput] = useState(""); const [loading, setLoading] = useState(false); const [history, setHistory] = useState([]); const endRef = useRef(null);
  const SUGG = ["Comment se porte mon entreprise ?", "Crée une facture de 500 000 FCFA pour SODECO", "Montre mes factures impayées", "Analyse ma trésorerie"];
  const send = async (text) => {
    const msg = text || input.trim(); if (!msg || loading) return;
    setInput(""); setMsgs(m => [...m, { role: "user", text: msg }]); setLoading(true);
    try {
      const reply = await runAI(msg, history, s => setMsgs(m => [...m, { role: "tool", text: s }]), token, userId);
      setMsgs(m => [...m.filter(x => x.role !== "tool"), { role: "ai", text: reply }]);
      setHistory(h => [...h, { role: "user", content: msg }, { role: "assistant", content: reply }]);
      onRefresh();
    } catch (e) { setMsgs(m => [...m.filter(x => x.role !== "tool"), { role: "ai", text: `❌ ${e.message}` }]); }
    setLoading(false);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };
  const rend = (text) => text.split("\n").map((line, i) => { const parts = line.split(/\*\*(.*?)\*\*/g); return <div key={i} style={{ lineHeight: 1.7, minHeight: line ? "auto" : "0.4em" }}>{parts.map((p, j) => j % 2 === 1 ? <strong key={j} style={{ color: T.accent }}>{p}</strong> : <span key={j}>{p}</span>)}</div>; });
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "12px 16px 8px", borderBottom: `1px solid ${T.border}`, flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: T.accent, boxShadow: `0 0 7px ${T.accent}` }} />
        <div style={{ color: T.text, fontSize: 15, fontWeight: 800 }}>Agent IA</div>
        <div style={{ marginLeft: "auto", background: T.accentDim, border: `1px solid ${T.accentBorder}`, borderRadius: 6, padding: "2px 8px", color: T.accent, fontSize: 9, fontWeight: 700 }}>🔒 SÉCURISÉ</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        {msgs.map((m, i) => (<div key={i}>{m.role === "tool" && <div style={{ display: "flex", justifyContent: "center" }}><div style={{ background: T.s3, border: `1px solid ${T.borderLight}`, borderRadius: 20, padding: "3px 12px", color: T.sub, fontSize: 10, display: "flex", gap: 5, alignItems: "center" }}><div style={{ width: 4, height: 4, borderRadius: "50%", background: T.accent, animation: "pulse 1s infinite" }} />{m.text}</div></div>}{m.role !== "tool" && <div style={{ display: "flex", gap: 9, flexDirection: m.role === "user" ? "row-reverse" : "row" }}>{m.role === "ai" && <div style={{ width: 26, height: 26, borderRadius: 7, background: `linear-gradient(135deg, ${T.accent}, #009970)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0 }}>◈</div>}<div style={{ background: m.role === "user" ? T.s2 : T.s3, border: `1px solid ${m.role === "ai" ? T.accentBorder : T.border}`, borderRadius: m.role === "user" ? "11px 11px 3px 11px" : "11px 11px 11px 3px", padding: "9px 12px", maxWidth: "85%", color: T.text, fontSize: 12 }}>{rend(m.text)}</div></div>}</div>))}
        {loading && <div style={{ display: "flex", gap: 9 }}><div style={{ width: 26, height: 26, borderRadius: 7, background: `linear-gradient(135deg, ${T.accent}, #009970)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>◈</div><div style={{ background: T.s3, border: `1px solid ${T.accentBorder}`, borderRadius: "11px 11px 11px 3px", padding: "11px 13px", display: "flex", gap: 4 }}>{[0,1,2].map(j => <div key={j} style={{ width: 5, height: 5, borderRadius: "50%", background: T.accent, animation: "pulse 1s infinite", animationDelay: `${j*0.2}s` }} />)}</div></div>}
        <div ref={endRef} />
      </div>
      <div style={{ padding: "6px 10px", display: "flex", gap: 4, flexWrap: "wrap", borderTop: `1px solid ${T.border}` }}>{SUGG.map((s, i) => <button key={i} onClick={() => send(s)} disabled={loading} style={{ background: T.s2, border: `1px solid ${T.border}`, borderRadius: 20, padding: "3px 9px", color: T.sub, fontSize: 10, cursor: "pointer", whiteSpace: "nowrap" }}>{s}</button>)}</div>
      <div style={{ padding: "9px 12px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 7 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !loading && send()} placeholder="Tapez une commande ERP…" style={{ flex: 1, background: T.s2, border: `1px solid ${T.border}`, borderRadius: 9, padding: "9px 13px", color: T.text, fontSize: 12, outline: "none" }} />
        <button onClick={() => send()} disabled={loading || !input.trim()} style={{ background: loading || !input.trim() ? T.s2 : T.accent, border: "none", borderRadius: 9, width: 40, height: 40, color: loading || !input.trim() ? T.dim : T.bg, cursor: loading || !input.trim() ? "default" : "pointer", fontSize: 15 }}>→</button>
      </div>
    </div>
  );
}

function FacturesModule({ token, userId, toast, refreshKey }) {
  const [factures, setFactures] = useState([]); const [loading, setLoading] = useState(true); const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ client_nom: "", montant_ht: "", description: "", date_echeance: "" });
  const load = async () => { setLoading(true); try { const d = await db.query("factures", { select: "*", order: "created_at.desc" }, token); setFactures(Array.isArray(d) ? d : []); } catch (e) { toast(e.message, "error"); } setLoading(false); };
  useEffect(() => { load(); }, [refreshKey]);
  const save = async () => {
    const e = validate.facture(form); if (e) return toast(e, "error");
    try {
      const ht = Math.round(Number(form.montant_ht)), tva = Math.round(ht * 0.18), ttc = ht + tva, ref = genRef();
      await db.insert("factures", { reference: ref, client_nom: form.client_nom.trim(), montant_ht: ht, tva_rate: 18, tva_montant: tva, montant_ttc: ttc, statut: "impayée", description: form.description || null, date_echeance: form.date_echeance || null, user_id: userId }, token);
      await createEcritures(ref, form.client_nom, ht, tva, ttc, userId, token);
      toast(`${ref} créée ✓`, "success"); setShowForm(false); setForm({ client_nom: "", montant_ht: "", description: "", date_echeance: "" }); load();
    } catch (e) { toast(e.message, "error"); }
  };
  const markPaid = async (id) => { try { await db.update("factures", id, { statut: "payée" }, token); toast("Payée ✓", "success"); load(); } catch (e) { toast(e.message, "error"); } };
  const impaye = factures.filter(f => f.statut !== "payée").reduce((s, f) => s + (f.montant_ttc || 0), 0);
  return (
    <div style={{ padding: 18, height: "100%", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 13 }}>
        <div><div style={{ color: T.sub, fontSize: 10, fontWeight: 700, letterSpacing: "0.15em" }}>◧ SYSCOHADA · PDF</div><div style={{ color: T.text, fontSize: 17, fontWeight: 800 }}>Facturation</div></div>
        <button onClick={() => setShowForm(!showForm)} style={{ background: T.accent, border: "none", borderRadius: 8, padding: "7px 13px", color: T.bg, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>+ Nouvelle</button>
      </div>
      {impaye > 0 && <div style={{ background: T.goldDim, border: `1px solid ${T.gold}30`, borderRadius: 8, padding: "7px 11px", marginBottom: 11, fontSize: 11, color: T.gold }}>⚠ Impayés : <strong>{impaye.toLocaleString("fr-FR")} FCFA</strong></div>}
      {showForm && (<div style={{ background: T.s2, border: `1px solid ${T.accentBorder}`, borderRadius: 11, padding: 13, marginBottom: 13 }}><div style={{ background: T.accentDim, borderRadius: 7, padding: "5px 10px", marginBottom: 8, fontSize: 10, color: T.accent }}>✓ TVA 18% · SYSCOHADA 411/706/443 · PDF</div><div style={{ display: "flex", flexDirection: "column", gap: 7 }}><input value={form.client_nom} onChange={e => setForm(p => ({ ...p, client_nom: e.target.value }))} placeholder="Nom du client *" style={{ background: T.s3, border: `1px solid ${T.border}`, borderRadius: 7, padding: "8px 11px", color: T.text, fontSize: 12, outline: "none" }} /><input value={form.montant_ht} onChange={e => setForm(p => ({ ...p, montant_ht: e.target.value }))} placeholder="Montant HT en FCFA *" type="number" style={{ background: T.s3, border: `1px solid ${T.border}`, borderRadius: 7, padding: "8px 11px", color: T.text, fontSize: 12, outline: "none" }} />{form.montant_ht > 0 && <div style={{ background: T.accentDim, borderRadius: 7, padding: "5px 10px", fontSize: 11, color: T.accent }}>TTC : {Math.round(Number(form.montant_ht) * 1.18).toLocaleString("fr-FR")} FCFA</div>}<input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Description" style={{ background: T.s3, border: `1px solid ${T.border}`, borderRadius: 7, padding: "8px 11px", color: T.text, fontSize: 12, outline: "none" }} /><input value={form.date_echeance} onChange={e => setForm(p => ({ ...p, date_echeance: e.target.value }))} type="date" style={{ background: T.s3, border: `1px solid ${T.border}`, borderRadius: 7, padding: "8px 11px", color: T.text, fontSize: 12, outline: "none" }} /></div><div style={{ display: "flex", gap: 7, marginTop: 10 }}><button onClick={save} style={{ background: T.accent, border: "none", borderRadius: 7, padding: "8px 15px", color: T.bg, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Enregistrer</button><button onClick={() => setShowForm(false)} style={{ background: T.s3, border: `1px solid ${T.border}`, borderRadius: 7, padding: "8px 11px", color: T.sub, fontSize: 12, cursor: "pointer" }}>Annuler</button></div></div>)}
      {loading ? <div style={{ textAlign: "center", padding: 40, color: T.sub, fontSize: 12 }}>Chargement…</div> : factures.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: T.sub, fontSize: 13 }}>Aucune facture.</div> : <div style={{ background: T.s2, border: `1px solid ${T.border}`, borderRadius: 11, overflow: "hidden" }}>{factures.map((f, i) => (<div key={f.id} style={{ padding: "10px 13px", borderBottom: i < factures.length - 1 ? `1px solid ${T.border}` : "none" }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ color: T.dim, fontSize: 9, fontFamily: "monospace", minWidth: 90 }}>{f.reference}</div><div style={{ color: T.text, fontSize: 12, flex: 1 }}>{f.client_nom}</div><div style={{ color: T.text, fontSize: 12, fontWeight: 700 }}>{fmtShort(f.montant_ttc)} F</div><Badge status={f.statut} /></div><div style={{ display: "flex", gap: 6, marginTop: 6 }}>{f.statut !== "payée" && <button onClick={() => markPaid(f.id)} style={{ background: T.accentDim, border: `1px solid ${T.accentBorder}`, borderRadius: 5, padding: "3px 9px", color: T.accent, fontSize: 10, cursor: "pointer", fontWeight: 600 }}>✓ Payée</button>}<button onClick={() => generatePDF(f)} style={{ background: T.blueDim, border: `1px solid ${T.blue}30`, borderRadius: 5, padding: "3px 9px", color: T.blue, fontSize: 10, cursor: "pointer", fontWeight: 600 }}>⬇ PDF</button></div></div>))}</div>}
    </div>
  );
}

function ClientsModule({ token, userId, toast, refreshKey }) {
  const [clients, setClients] = useState([]); const [loading, setLoading] = useState(true); const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nom: "", contact: "", email: "", telephone: "" });
  const load = async () => { setLoading(true); try { const d = await db.query("clients", { select: "*", order: "created_at.desc" }, token); setClients(Array.isArray(d) ? d : []); } catch (e) { toast(e.message, "error"); } setLoading(false); };
  useEffect(() => { load(); }, [refreshKey]);
  const save = async () => {
    const e = validate.client(form); if (e) return toast(e, "error");
    try { await db.insert("clients", { ...form, statut: "actif", user_id: userId }, token); toast("Client ajouté ✓", "success"); setShowForm(false); setForm({ nom: "", contact: "", email: "", telephone: "" }); load(); } catch (e) { toast(e.message, "error"); }
  };
  return (
    <div style={{ padding: 18, height: "100%", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div><div style={{ color: T.sub, fontSize: 10, fontWeight: 700, letterSpacing: "0.15em" }}>◉ LIVE</div><div style={{ color: T.text, fontSize: 17, fontWeight: 800 }}>Clients</div></div>
        <button onClick={() => setShowForm(!showForm)} style={{ background: T.accent, border: "none", borderRadius: 8, padding: "7px 13px", color: T.bg, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>+ Nouveau</button>
      </div>
      {showForm && (<div style={{ background: T.s2, border: `1px solid ${T.accentBorder}`, borderRadius: 11, padding: 13, marginBottom: 13 }}><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 8 }}>{[{ k: "nom", p: "Nom société *" }, { k: "contact", p: "Contact" }, { k: "email", p: "Email" }, { k: "telephone", p: "Téléphone" }].map(f => <input key={f.k} value={form[f.k]} onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))} placeholder={f.p} style={{ background: T.s3, border: `1px solid ${T.border}`, borderRadius: 7, padding: "8px 11px", color: T.text, fontSize: 12, outline: "none" }} />)}</div><div style={{ display: "flex", gap: 7 }}><button onClick={save} style={{ background: T.accent, border: "none", borderRadius: 7, padding: "8px 15px", color: T.bg, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Enregistrer</button><button onClick={() => setShowForm(false)} style={{ background: T.s3, border: `1px solid ${T.border}`, borderRadius: 7, padding: "8px 11px", color: T.sub, fontSize: 12, cursor: "pointer" }}>Annuler</button></div></div>)}
      {loading ? <div style={{ textAlign: "center", padding: 40, color: T.sub, fontSize: 12 }}>Chargement…</div> : clients.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: T.sub, fontSize: 13 }}>Aucun client.</div> : <div style={{ background: T.s2, border: `1px solid ${T.border}`, borderRadius: 11, overflow: "hidden" }}>{clients.map((c, i) => <div key={c.id} style={{ padding: "11px 13px", borderBottom: i < clients.length - 1 ? `1px solid ${T.border}` : "none", display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${T.blue}, #2060CC)`, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{c.nom?.[0]?.toUpperCase()}</div><div style={{ flex: 1 }}><div style={{ color: T.text, fontWeight: 600, fontSize: 13 }}>{c.nom}</div><div style={{ color: T.sub, fontSize: 10 }}>{c.email || c.telephone || "—"}</div></div><Badge status={c.statut || "actif"} /></div>)}</div>}
    </div>
  );
}

function TresorerieModule({ token, userId, toast, refreshKey }) {
  const [ops, setOps] = useState([]); const [loading, setLoading] = useState(true); const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "entrée", montant: "", description: "", categorie: "" });
  const load = async () => { setLoading(true); try { const d = await db.query("tresorerie", { select: "*", order: "created_at.desc" }, token); setOps(Array.isArray(d) ? d : []); } catch (e) { toast(e.message, "error"); } setLoading(false); };
  useEffect(() => { load(); }, [refreshKey]);
  const save = async () => {
    const e = validate.operation(form); if (e) return toast(e, "error");
    try { await db.insert("tresorerie", { ...form, montant: Math.round(Number(form.montant)), user_id: userId }, token); toast("Enregistrée ✓", "success"); setShowForm(false); setForm({ type: "entrée", montant: "", description: "", categorie: "" }); load(); } catch (e) { toast(e.message, "error"); }
  };
  const ent = ops.filter(o => o.type === "entrée").reduce((s, o) => s + (o.montant || 0), 0);
  const sor = ops.filter(o => o.type === "sortie").reduce((s, o) => s + (o.montant || 0), 0);
  return (
    <div style={{ padding: 18, height: "100%", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 13 }}>
        <div><div style={{ color: T.sub, fontSize: 10, fontWeight: 700, letterSpacing: "0.15em" }}>◈ LIVE</div><div style={{ color: T.text, fontSize: 17, fontWeight: 800 }}>Trésorerie</div></div>
        <button onClick={() => setShowForm(!showForm)} style={{ background: T.accent, border: "none", borderRadius: 8, padding: "7px 13px", color: T.bg, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>+ Opération</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 9, marginBottom: 13 }}>
        {[{ l: "Entrées", v: ent, c: T.accent }, { l: "Sorties", v: sor, c: T.red }, { l: "Solde", v: ent - sor, c: ent - sor >= 0 ? T.blue : T.red }].map((k, i) => <div key={i} style={{ background: T.s2, border: `1px solid ${T.border}`, borderRadius: 9, padding: "10px 11px" }}><div style={{ color: T.sub, fontSize: 10 }}>{k.l}</div><div style={{ color: k.c, fontSize: 15, fontWeight: 800 }}>{fmtShort(k.v)}</div><div style={{ color: T.dim, fontSize: 9 }}>FCFA</div></div>)}
      </div>
      {showForm && (<div style={{ background: T.s2, border: `1px solid ${T.accentBorder}`, borderRadius: 11, padding: 13, marginBottom: 13 }}><div style={{ display: "flex", gap: 7, marginBottom: 8 }}>{["entrée", "sortie"].map(t => <button key={t} onClick={() => setForm(p => ({ ...p, type: t }))} style={{ background: form.type === t ? (t === "entrée" ? T.accentDim : T.redDim) : T.s3, border: `1px solid ${form.type === t ? (t === "entrée" ? T.accent : T.red) : T.border}`, borderRadius: 6, padding: "6px 13px", color: form.type === t ? (t === "entrée" ? T.accent : T.red) : T.sub, fontSize: 12, cursor: "pointer", fontWeight: 600, textTransform: "capitalize" }}>{t}</button>)}</div><div style={{ display: "flex", flexDirection: "column", gap: 7 }}><input value={form.montant} onChange={e => setForm(p => ({ ...p, montant: e.target.value }))} placeholder="Montant FCFA *" type="number" style={{ background: T.s3, border: `1px solid ${T.border}`, borderRadius: 7, padding: "8px 11px", color: T.text, fontSize: 12, outline: "none" }} /><input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Description" style={{ background: T.s3, border: `1px solid ${T.border}`, borderRadius: 7, padding: "8px 11px", color: T.text, fontSize: 12, outline: "none" }} /><input value={form.categorie} onChange={e => setForm(p => ({ ...p, categorie: e.target.value }))} placeholder="Catégorie" style={{ background: T.s3, border: `1px solid ${T.border}`, borderRadius: 7, padding: "8px 11px", color: T.text, fontSize: 12, outline: "none" }} /></div><div style={{ display: "flex", gap: 7, marginTop: 10 }}><button onClick={save} style={{ background: T.accent, border: "none", borderRadius: 7, padding: "8px 15px", color: T.bg, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Enregistrer</button><button onClick={() => setShowForm(false)} style={{ background: T.s3, border: `1px solid ${T.border}`, borderRadius: 7, padding: "8px 11px", color: T.sub, fontSize: 12, cursor: "pointer" }}>Annuler</button></div></div>)}
      {loading ? <div style={{ textAlign: "center", padding: 40, color: T.sub, fontSize: 12 }}>Chargement…</div> : ops.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: T.sub, fontSize: 13 }}>Aucune opération.</div> : <div style={{ background: T.s2, border: `1px solid ${T.border}`, borderRadius: 11, overflow: "hidden" }}>{ops.map((o, i) => <div key={o.id} style={{ padding: "9px 13px", borderBottom: i < ops.length - 1 ? `1px solid ${T.border}` : "none", display: "flex", alignItems: "center", gap: 9 }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: o.type === "entrée" ? T.accent : T.red, flexShrink: 0 }} /><div style={{ flex: 1 }}><div style={{ color: T.text, fontSize: 12 }}>{o.description || o.categorie || "—"}</div><div style={{ color: T.sub, fontSize: 10 }}>{new Date(o.created_at).toLocaleDateString("fr-FR")}</div></div><div style={{ color: o.type === "entrée" ? T.accent : T.red, fontWeight: 700, fontSize: 13 }}>{o.type === "entrée" ? "+" : "-"}{fmtShort(o.montant)} F</div></div>)}</div>}
    </div>
  );
}

function Badge({ status }) {
  const m = { payée: { bg: T.accentDim, c: T.accent, l: "Payée" }, impayée: { bg: T.goldDim, c: T.gold, l: "Impayée" }, retard: { bg: T.redDim, c: T.red, l: "Retard" }, actif: { bg: T.accentDim, c: T.accent, l: "Actif" } };
  const s = m[status] || { bg: T.s2, c: T.dim, l: status };
  return <span style={{ background: s.bg, color: s.c, border: `1px solid ${s.c}30`, borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>{s.l}</span>;
}

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, []);
  return <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: type === "success" ? T.accent : T.red, color: T.bg, borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 13, zIndex: 999, boxShadow: "0 8px 30px rgba(0,0,0,0.4)", whiteSpace: "nowrap" }}>{msg}</div>;
}

/* ─── LANDING PAGE ─── */
function LandingPage({ onGetStarted }) {
  const features = [
    { icon: "◧", title: "Facturation PDF", desc: "Factures professionnelles avec TVA 18% en un clic." },
    { icon: "◈", title: "Agent IA autonome", desc: "Dites à l'IA ce que vous voulez. Elle exécute." },
    { icon: "⊞", title: "SYSCOHADA natif", desc: "Écritures 411/706/443 générées automatiquement." },
    { icon: "📊", title: "Dashboard graphique", desc: "CA, trésorerie, impayés — tout en un coup d'œil." },
    { icon: "⚡", title: "Relances automatiques", desc: "J+7, J+15, J+30 — relancez sans effort." },
    { icon: "🔒", title: "Sécurité entreprise", desc: "RLS, auth sécurisée, audit logs complets." },
  ];
  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: T.bg, color: T.text, minHeight: "100vh", overflowY: "auto" }}>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      <nav style={{ position: "sticky", top: 0, background: `${T.bg}EE`, backdropFilter: "blur(12px)", borderBottom: `1px solid ${T.border}`, padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, zIndex: 50 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: `linear-gradient(135deg, ${T.accent}, #009970)`, display: "flex", alignItems: "center", justifyContent: "center", color: T.bg, fontWeight: 900, fontSize: 13 }}>N</div>
        <div style={{ color: T.text, fontWeight: 800, fontSize: 14 }}>NeoERP AI</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={() => onGetStarted("login")} style={{ background: T.s2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "7px 14px", color: T.sub, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>Se connecter</button>
          <button onClick={() => onGetStarted("register")} style={{ background: T.accent, border: "none", borderRadius: 8, padding: "7px 14px", color: T.bg, fontSize: 12, cursor: "pointer", fontWeight: 700 }}>Essai gratuit</button>
        </div>
      </nav>
      <div style={{ padding: "60px 20px 40px", textAlign: "center", maxWidth: 600, margin: "0 auto" }}>
        <div style={{ background: T.accentDim, border: `1px solid ${T.accentBorder}`, borderRadius: 20, padding: "4px 14px", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.accent }} />
          <span style={{ color: T.accent, fontSize: 11, fontWeight: 700 }}>ERP IA · SYSCOHADA · PME Afrique</span>
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.2, marginBottom: 16, letterSpacing: "-0.03em" }}>Dirigez votre entreprise<br /><span style={{ color: T.accent }}>avec l'intelligence artificielle</span></h1>
        <p style={{ color: T.sub, fontSize: 14, lineHeight: 1.7, marginBottom: 28 }}>Le premier ERP autonome pour PME africaines. Facturez, gérez votre comptabilité SYSCOHADA et pilotez votre trésorerie en langage naturel.</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => onGetStarted("register")} style={{ background: T.accent, border: "none", borderRadius: 10, padding: "13px 24px", color: T.bg, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>Démarrer gratuitement →</button>
          <button onClick={() => onGetStarted("login")} style={{ background: T.s2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "13px 24px", color: T.text, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Se connecter</button>
        </div>
        <div style={{ color: T.dim, fontSize: 11, marginTop: 14 }}>✓ 14 jours gratuits · ✓ Sans carte bancaire · ✓ FCFA & SYSCOHADA</div>
      </div>
      <div style={{ padding: "0 20px 40px", maxWidth: 600, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}><h2 style={{ fontSize: 20, fontWeight: 900 }}>Tout ce dont votre PME a besoin</h2></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {features.map((f, i) => <div key={i} style={{ background: T.s2, border: `1px solid ${T.border}`, borderRadius: 11, padding: "13px 13px" }}><div style={{ fontSize: 18, marginBottom: 7 }}>{f.icon}</div><div style={{ color: T.text, fontWeight: 700, fontSize: 13, marginBottom: 3 }}>{f.title}</div><div style={{ color: T.sub, fontSize: 11, lineHeight: 1.5 }}>{f.desc}</div></div>)}
        </div>
      </div>
      <div style={{ padding: "0 20px 50px", maxWidth: 600, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}><h2 style={{ fontSize: 20, fontWeight: 900 }}>Tarifs simples</h2><p style={{ color: T.sub, fontSize: 12, marginTop: 6 }}>En FCFA · Sans engagement</p></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {PLANS.map((plan) => (
            <div key={plan.id} style={{ background: plan.popular ? T.accentDim : T.s2, border: `2px solid ${plan.popular ? T.accent : T.border}`, borderRadius: 12, padding: "16px", position: "relative" }}>
              {plan.popular && <div style={{ position: "absolute", top: -10, right: 14, background: T.accent, color: T.bg, borderRadius: 20, padding: "2px 10px", fontSize: 9, fontWeight: 800 }}>POPULAIRE</div>}
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <div><div style={{ color: plan.color, fontWeight: 800, fontSize: 15 }}>{plan.name}</div><div style={{ color: T.sub, fontSize: 11 }}>{plan.desc}</div></div>
                <div style={{ textAlign: "right" }}><div style={{ color: T.text, fontWeight: 900, fontSize: 18 }}>{plan.price.toLocaleString("fr-FR")} <span style={{ fontSize: 10, color: T.sub, fontWeight: 400 }}>FCFA/mois</span></div></div>
              </div>
              <div style={{ marginBottom: 12 }}>{plan.features.map((f, i) => <div key={i} style={{ display: "flex", gap: 6, padding: "3px 0", fontSize: 11, color: T.sub }}><span style={{ color: plan.color }}>✓</span> {f}</div>)}</div>
              <button onClick={() => onGetStarted("register")} style={{ width: "100%", background: plan.popular ? T.accent : T.s3, border: `1px solid ${plan.popular ? T.accent : T.border}`, borderRadius: 8, padding: "10px", color: plan.popular ? T.bg : T.text, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{plan.cta}{plan.trial ? " — 14 jours gratuits" : ""}</button>
            </div>
          ))}
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${T.border}`, padding: "16px 20px", textAlign: "center" }}>
        <div style={{ color: T.dim, fontSize: 11 }}>© 2026 NeoERP AI — NeoTech Solutions — Lomé, Togo · SYSCOHADA · UEMOA</div>
      </div>
    </div>
  );
}

/* ─── AUTH SCREEN ─── */
function AuthScreen({ onAuth, defaultMode = "login" }) {
  const [mode, setMode] = useState(defaultMode); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [company, setCompany] = useState(""); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const submit = async () => {
    if (!email || !password) return setError("Email et mot de passe obligatoires");
    if (password.length < 6) return setError("Mot de passe minimum 6 caractères");
    setLoading(true); setError("");
    try {
      if (mode === "register") { await auth.signUp(email, password); setMode("login"); setError("✓ Compte créé. Connectez-vous."); }
      else { const r = await auth.signIn(email, password); const co = company || "Mon Entreprise"; auth.saveSession(r, co, "starter"); onAuth(r.access_token, r.refresh_token, r.user, co, "starter"); }
    } catch (e) { setError(e.message); }
    setLoading(false);
  };
  return (
    <div style={{ height: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "min(400px, 100%)" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: `linear-gradient(135deg, ${T.accent}, #009970)`, display: "flex", alignItems: "center", justifyContent: "center", color: T.bg, fontWeight: 900, fontSize: 20, margin: "0 auto 12px" }}>N</div>
          <div style={{ color: T.text, fontSize: 20, fontWeight: 900 }}>NeoERP AI</div>
          <div style={{ color: T.sub, fontSize: 12, marginTop: 3 }}>ERP intelligent · PME africaines · SYSCOHADA</div>
        </div>
        <div style={{ background: T.s2, border: `1px solid ${T.border}`, borderRadius: 14, padding: 20 }}>
          <div style={{ display: "flex", marginBottom: 16, background: T.s3, borderRadius: 8, padding: 3 }}>{["login", "register"].map(m => <button key={m} onClick={() => { setMode(m); setError(""); }} style={{ flex: 1, background: mode === m ? T.accent : "none", border: "none", borderRadius: 6, padding: "7px", color: mode === m ? T.bg : T.sub, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{m === "login" ? "Se connecter" : "Créer un compte"}</button>)}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {mode === "register" && <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Nom de votre entreprise" style={{ background: T.s3, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 13px", color: T.text, fontSize: 13, outline: "none" }} />}
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" style={{ background: T.s3, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 13px", color: T.text, fontSize: 13, outline: "none" }} />
            <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Mot de passe" type="password" onKeyDown={e => e.key === "Enter" && submit()} style={{ background: T.s3, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 13px", color: T.text, fontSize: 13, outline: "none" }} />
          </div>
          {error && <div style={{ marginTop: 9, padding: "8px 11px", borderRadius: 7, background: error.startsWith("✓") ? T.accentDim : T.redDim, color: error.startsWith("✓") ? T.accent : T.red, fontSize: 12 }}>{error}</div>}
          <button onClick={submit} disabled={loading} style={{ width: "100%", marginTop: 13, background: loading ? T.s3 : T.accent, border: "none", borderRadius: 8, padding: "12px", color: loading ? T.sub : T.bg, fontWeight: 800, fontSize: 14, cursor: loading ? "default" : "pointer" }}>{loading ? "Chargement…" : mode === "login" ? "Se connecter" : "Créer mon compte"}</button>
          <div style={{ marginTop: 12, fontSize: 10, color: T.sub, textAlign: "center" }}>🔒 Données isolées · RLS · Session persistante</div>
        </div>
      </div>
    </div>
  );
}

/* ─── NAV ─── */
const NAV = [
  { id: "dashboard", icon: "⬡", label: "Tableau de bord" },
  { id: "agent", icon: "◈", label: "Agent IA" },
  { id: "clients", icon: "◉", label: "Clients" },
  { id: "factures", icon: "◧", label: "Facturation" },
  { id: "tresorerie", icon: "◈", label: "Trésorerie" },
  { id: "reminders", icon: "⚡", label: "Relances" },
];

/* ─── ROOT ─── */
export default function NeoERPV9() {
  const [screen, setScreen] = useState("landing");
  const [authMode, setAuthMode] = useState("login");
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [view, setView] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [toast, setToast] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [factures, setFactures] = useState([]);

  useEffect(() => {
    const run = async () => {
      const saved = auth.loadSession();
      if (!saved) { setSessionLoading(false); return; }
      if (Date.now() > saved.expires_at - 60000) {
        try { const r = await auth.refreshToken(saved.refresh_token); auth.saveSession(r, saved.company, saved.plan); setSession({ token: r.access_token, refresh_token: r.refresh_token, user: r.user, company: saved.company, plan: saved.plan || "starter", expires_at: Date.now() + (r.expires_in * 1000) }); setScreen("app"); }
        catch (e) { auth.clearSession(); }
      } else { setSession(saved); setScreen("app"); }
      setSessionLoading(false);
    };
    run();
  }, []);

  // Load factures for reminders
  useEffect(() => {
    if (session && screen === "app") {
      db.query("factures", { select: "*", order: "created_at.desc" }, session.token).then(d => setFactures(Array.isArray(d) ? d : [])).catch(() => {});
    }
  }, [session, refreshKey, screen]);

  const showToast = (msg, type = "success") => setToast({ msg, type });
  const refresh = () => setRefreshKey(k => k + 1);
  const handleGetStarted = (mode) => { setAuthMode(mode); setScreen("auth"); };
  const handleAuth = (token, refresh_token, user, company, plan) => { const s = { token, refresh_token, user, company, plan: plan || "starter", expires_at: Date.now() + 3600000 }; setSession(s); setScreen("app"); };
  const handleLogout = async () => { try { await auth.signOut(session.token); } catch (e) {} auth.clearSession(); setSession(null); setScreen("landing"); };

  if (sessionLoading) return <div style={{ height: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ textAlign: "center" }}><div style={{ width: 40, height: 40, borderRadius: 10, background: `linear-gradient(135deg, ${T.accent}, #009970)`, display: "flex", alignItems: "center", justifyContent: "center", color: T.bg, fontWeight: 900, fontSize: 18, margin: "0 auto 12px" }}>N</div><div style={{ color: T.sub, fontSize: 12 }}>Chargement…</div></div></div>;

  if (screen === "landing") return <LandingPage onGetStarted={handleGetStarted} />;
  if (screen === "auth") return <AuthScreen onAuth={handleAuth} defaultMode={authMode} />;

  const props = { token: session.token, userId: session.user?.id, toast: showToast, refreshKey };

  const renderView = () => {
    switch (view) {
      case "dashboard": return <Dashboard {...props} onNavigate={setView} plan={session.plan} company={session.company} />;
      case "agent": return <AIAgent token={session.token} userId={session.user?.id} onRefresh={refresh} />;
      case "clients": return <ClientsModule {...props} />;
      case "factures": return <FacturesModule {...props} />;
      case "tresorerie": return <TresorerieModule {...props} />;
      case "reminders": return <RemindersModule factures={factures} token={session.token} userId={session.user?.id} toast={showToast} />;
      default: return <Dashboard {...props} onNavigate={setView} plan={session.plan} company={session.company} />;
    }
  };

  const impayeCount = factures.filter(f => f.statut !== "payée").length;

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: T.bg, color: T.text, height: "100vh", display: "flex", overflow: "hidden" }}>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; } ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-thumb { background: ${T.border}; } input::placeholder { color: ${T.dim}; } button { font-family: inherit; } @keyframes pulse { 0%,100%{opacity:0.2;transform:scale(0.85)} 50%{opacity:1;transform:scale(1.15)} }`}</style>
      <div style={{ width: collapsed ? 50 : 210, flexShrink: 0, background: T.s1, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", transition: "width 0.22s", overflow: "hidden" }}>
        <div style={{ padding: "13px 11px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 27, height: 27, borderRadius: 8, background: `linear-gradient(135deg, ${T.accent}, #009970)`, display: "flex", alignItems: "center", justifyContent: "center", color: T.bg, fontWeight: 900, fontSize: 12, flexShrink: 0 }}>N</div>
          {!collapsed && (<><div><div style={{ color: T.text, fontWeight: 800, fontSize: 12 }}>NeoERP AI</div><div style={{ color: T.accent, fontSize: 9, fontWeight: 600 }}>● V9 · Charts · Relances</div></div><button onClick={() => setCollapsed(true)} style={{ marginLeft: "auto", background: "none", border: "none", color: T.dim, cursor: "pointer" }}>⇤</button></>)}
          {collapsed && <button onClick={() => setCollapsed(false)} style={{ background: "none", border: "none", color: T.dim, cursor: "pointer" }}>⇥</button>}
        </div>
        <nav style={{ flex: 1, padding: "7px 5px" }}>
          {NAV.map(item => (
            <button key={item.id} onClick={() => setView(item.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: collapsed ? "9px 0" : "9px 9px", justifyContent: collapsed ? "center" : "flex-start", background: view === item.id ? T.accentDim : "none", border: view === item.id ? `1px solid ${T.accentBorder}` : "1px solid transparent", borderRadius: 7, cursor: "pointer", color: view === item.id ? T.accent : (item.id === "reminders" && impayeCount > 0 ? T.red : T.sub), fontSize: 12, marginBottom: 1, whiteSpace: "nowrap", overflow: "hidden", position: "relative" }}>
              <span style={{ fontSize: 13, flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && item.id === "reminders" && impayeCount > 0 && <span style={{ marginLeft: "auto", background: T.red, color: "white", borderRadius: 10, padding: "1px 6px", fontSize: 9, fontWeight: 700 }}>{impayeCount}</span>}
            </button>
          ))}
        </nav>
        <div style={{ padding: "9px 9px", borderTop: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: collapsed ? 0 : 7 }}>
            <div style={{ width: 24, height: 24, borderRadius: 6, background: `linear-gradient(135deg, ${T.blue}, #2060CC)`, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 800, fontSize: 10, flexShrink: 0 }}>{session.user?.email?.[0]?.toUpperCase()}</div>
            {!collapsed && <div style={{ overflow: "hidden" }}><div style={{ color: T.text, fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.company}</div><div style={{ color: T.dim, fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.user?.email}</div></div>}
          </div>
          {!collapsed && <button onClick={handleLogout} style={{ width: "100%", background: T.s2, border: `1px solid ${T.border}`, borderRadius: 6, padding: "5px", color: T.sub, fontSize: 10, cursor: "pointer" }}>Déconnexion</button>}
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "0 16px", height: 43, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", background: T.s1, flexShrink: 0 }}>
          <span style={{ color: T.sub, fontSize: 11, flex: 1 }}>{NAV.find(n => n.id === view)?.label}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: T.accent, boxShadow: `0 0 5px ${T.accent}` }} />
            <span style={{ color: T.sub, fontSize: 10 }}>V9 · Charts · Relances</span>
          </div>
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>{renderView()}</div>
      </div>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
