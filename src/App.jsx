import { useState, useEffect, useRef } from "react";

/* ─── SUPABASE CONFIG ─── */
const SUPABASE_URL = "https://yctdyzcusvyumrfbqgyx.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljdGR5emN1c3Z5dW1yZmJxZ3l4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0ODk5NDEsImV4cCI6MjA5NjA2NTk0MX0.ShrXFKzMX4RDym-E1J1CZPuxMstBqfZZssvqF29Zrgw";
const SESSION_KEY = "neoerp_session";

/* ─── AUTH LAYER ─── */
const auth = {
  async signUp(email, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.msg || err.message || "Erreur inscription");
    }
    return res.json();
  },
  async signIn(email, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error_description || err.message || "Email ou mot de passe incorrect");
    }
    return res.json();
  },
  async signOut(token) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
    });
  },
  async refreshToken(refresh_token) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token }),
    });
    if (!res.ok) throw new Error("Session expirée");
    return res.json();
  },
  saveSession(data, company) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        token: data.access_token,
        refresh_token: data.refresh_token,
        user: data.user,
        company: company || "Mon Entreprise",
        expires_at: Date.now() + (data.expires_in * 1000),
      }));
    } catch (e) {}
  },
  loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  },
  clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  },
};

/* ─── DATABASE LAYER ─── */
const db = {
  async query(table, options = {}, token) {
    let url = `${SUPABASE_URL}/rest/v1/${table}?`;
    if (options.select) url += `select=${encodeURIComponent(options.select)}&`;
    if (options.order) url += `order=${options.order}&`;
    if (options.filter) url += `${options.filter}&`;
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Erreur lecture ${table}`);
    }
    return res.json();
  },
  async insert(table, data, token) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Erreur insertion ${table}`);
    }
    return res.json();
  },
  async update(table, id, data, token) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Erreur mise à jour ${table}`);
    }
    return res.json();
  },
  async auditLog(action, entity, entityId, details, userId, token) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/audit_logs`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action, entity,
          entity_id: entityId || null,
          details: details || {},
          user_id: userId,
        }),
      });
    } catch (e) {}
  },
};

/* ─── VALIDATION ─── */
const validate = {
  facture({ client_nom, montant_ht }) {
    if (!client_nom || client_nom.trim().length < 2) return "Nom du client invalide (min. 2 caractères)";
    const ht = Number(montant_ht);
    if (!ht || ht <= 0) return "Le montant HT doit être supérieur à 0";
    if (ht > 50000000) return "Montant > 50M FCFA — autorisation DG requise";
    return null;
  },
  client({ nom }) {
    if (!nom || nom.trim().length < 2) return "Nom invalide (min. 2 caractères)";
    return null;
  },
  operation({ montant }) {
    const m = Number(montant);
    if (!m || m <= 0) return "Le montant doit être supérieur à 0";
    if (m > 100000000) return "Montant > 100M FCFA — vérification requise";
    return null;
  },
};

/* ─── ACCOUNTING — SYSCOHADA CORRECT ─── */
// Écriture correcte : Débit 411 TTC → Crédit 706 HT + Crédit 443 TVA
// Une seule opération comptable avec 3 lignes
async function createFactureEcritures(ref, clientNom, ht, tva, ttc, userId, token) {
  // Ligne 1 : Débit 411 Clients (TTC)
  await db.insert("ecritures", {
    debit_compte: "411",
    debit_libelle: "Clients",
    credit_compte: null,
    credit_libelle: null,
    montant: ttc,
    description: `${ref} — ${clientNom} — Débit client TTC`,
    user_id: userId,
  }, token);
  // Ligne 2 : Crédit 706 Prestations (HT)
  await db.insert("ecritures", {
    debit_compte: null,
    debit_libelle: null,
    credit_compte: "706",
    credit_libelle: "Prestations de services",
    montant: ht,
    description: `${ref} — ${clientNom} — Crédit prestation HT`,
    user_id: userId,
  }, token);
  // Ligne 3 : Crédit 443 TVA collectée
  await db.insert("ecritures", {
    debit_compte: null,
    debit_libelle: null,
    credit_compte: "443",
    credit_libelle: "TVA collectée 18%",
    montant: tva,
    description: `${ref} — TVA 18% collectée`,
    user_id: userId,
  }, token);
}

/* ─── REF GENERATOR ─── */
const genRef = () => `FAC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

/* ─── TOOL EXECUTION ENGINE ─── */
const createTools = (token, userId) => ({
  async creerClient({ nom, email, telephone, contact }) {
    const err = validate.client({ nom });
    if (err) return { success: false, message: `❌ ${err}` };
    const result = await db.insert("clients", {
      nom: nom.trim(), email: email || null,
      telephone: telephone || null, contact: contact || null,
      statut: "actif", user_id: userId,
    }, token);
    await db.auditLog("CREATE", "clients", result[0]?.id, { nom }, userId, token);
    return { success: true, message: `✓ Client **${nom}** créé et enregistré.` };
  },

  async creerFacture({ client_nom, montant_ht, description, date_echeance }) {
    const err = validate.facture({ client_nom, montant_ht });
    if (err) return { success: false, message: `❌ ${err}` };
    const ht = Math.round(Number(montant_ht));
    const tva = Math.round(ht * 0.18);
    const ttc = ht + tva;
    const ref = genRef();
    const facture = await db.insert("factures", {
      reference: ref, client_nom: client_nom.trim(),
      montant_ht: ht, tva_rate: 18, tva_montant: tva, montant_ttc: ttc,
      statut: "impayée", description: description || null,
      date_echeance: date_echeance || null, user_id: userId,
    }, token);
    await createFactureEcritures(ref, client_nom, ht, tva, ttc, userId, token);
    await db.auditLog("CREATE", "factures", facture[0]?.id, { ref, client_nom, ttc }, userId, token);
    return {
      success: true,
      message: `✓ Facture **${ref}** créée\n• Client : **${client_nom}**\n• HT : ${ht.toLocaleString("fr-FR")} FCFA\n• TVA 18% : ${tva.toLocaleString("fr-FR")} FCFA\n• **TTC : ${ttc.toLocaleString("fr-FR")} FCFA**\n\n✓ Écritures SYSCOHADA correctes :\n• Débit **411** Clients ${ttc.toLocaleString("fr-FR")} FCFA\n• Crédit **706** Prestations ${ht.toLocaleString("fr-FR")} FCFA\n• Crédit **443** TVA collectée ${tva.toLocaleString("fr-FR")} FCFA`,
    };
  },

  async listerFactures({ statut }) {
    const filter = statut && statut !== "null" ? `statut=eq.${statut}` : null;
    const data = await db.query("factures", { select: "*", order: "created_at.desc", filter }, token);
    const list = Array.isArray(data) ? data : [];
    if (list.length === 0) return { success: true, message: "Aucune facture trouvée." };
    const total = list.reduce((s, f) => s + (f.montant_ttc || 0), 0);
    const lines = list.slice(0, 8).map(f =>
      `• **${f.reference}** — ${f.client_nom} — ${(f.montant_ttc || 0).toLocaleString("fr-FR")} FCFA — ${f.statut}`
    ).join("\n");
    return { success: true, message: `**${list.length} facture(s)** · Total : **${total.toLocaleString("fr-FR")} FCFA**\n\n${lines}` };
  },

  async listerClients() {
    const data = await db.query("clients", { select: "*", order: "created_at.desc" }, token);
    const list = Array.isArray(data) ? data : [];
    if (list.length === 0) return { success: true, message: "Aucun client enregistré." };
    const lines = list.map(c => `• **${c.nom}** — ${c.email || c.telephone || "pas de contact"}`).join("\n");
    return { success: true, message: `**${list.length} client(s) :**\n\n${lines}` };
  },

  async analyserTresorerie() {
    const [ops, factures] = await Promise.all([
      db.query("tresorerie", { select: "type,montant" }, token),
      db.query("factures", { select: "statut,montant_ttc" }, token),
    ]);
    const list = Array.isArray(ops) ? ops : [];
    const entrees = list.filter(o => o.type === "entrée").reduce((s, o) => s + (o.montant || 0), 0);
    const sorties = list.filter(o => o.type === "sortie").reduce((s, o) => s + (o.montant || 0), 0);
    const solde = entrees - sorties;
    const impaye = Array.isArray(factures)
      ? factures.filter(f => f.statut !== "payée").reduce((s, f) => s + (f.montant_ttc || 0), 0) : 0;
    return {
      success: true,
      message: `**Trésorerie en temps réel :**\n\n• Entrées : **${entrees.toLocaleString("fr-FR")} FCFA**\n• Sorties : **${sorties.toLocaleString("fr-FR")} FCFA**\n• **Solde : ${solde.toLocaleString("fr-FR")} FCFA**\n• Impayés : **${impaye.toLocaleString("fr-FR")} FCFA**\n\n${solde < 0 ? "⚠ Solde négatif — action urgente." : "✓ Solde positif."}`
    };
  },

  async enregistrerOperation({ type, montant, description, categorie }) {
    const err = validate.operation({ montant });
    if (err) return { success: false, message: `❌ ${err}` };
    await db.insert("tresorerie", {
      type, montant: Math.round(Number(montant)),
      description: description || null,
      categorie: categorie || null,
      user_id: userId,
    }, token);
    await db.auditLog("CREATE", "tresorerie", null, { type, montant }, userId, token);
    return { success: true, message: `✓ **${type}** de **${Math.round(Number(montant)).toLocaleString("fr-FR")} FCFA** enregistrée` };
  },

  async statistiques() {
    const [clients, factures, ops] = await Promise.all([
      db.query("clients", { select: "id" }, token),
      db.query("factures", { select: "statut,montant_ttc" }, token),
      db.query("tresorerie", { select: "type,montant" }, token),
    ]);
    const impaye = Array.isArray(factures)
      ? factures.filter(f => f.statut !== "payée").reduce((s, f) => s + (f.montant_ttc || 0), 0) : 0;
    const payee = Array.isArray(factures)
      ? factures.filter(f => f.statut === "payée").reduce((s, f) => s + (f.montant_ttc || 0), 0) : 0;
    const entrees = Array.isArray(ops)
      ? ops.filter(o => o.type === "entrée").reduce((s, o) => s + (o.montant || 0), 0) : 0;
    const sorties = Array.isArray(ops)
      ? ops.filter(o => o.type === "sortie").reduce((s, o) => s + (o.montant || 0), 0) : 0;
    return {
      success: true,
      message: `**Tableau de bord :**\n\n👥 Clients : **${Array.isArray(clients) ? clients.length : 0}**\n📄 Factures : **${Array.isArray(factures) ? factures.length : 0}**\n✓ CA encaissé : **${payee.toLocaleString("fr-FR")} FCFA**\n⚠ Impayés : **${impaye.toLocaleString("fr-FR")} FCFA**\n💰 Trésorerie : **${(entrees - sorties).toLocaleString("fr-FR")} FCFA**`
    };
  },
});

/* ─── AI AGENT ─── */
async function runAIAgent(userMessage, history, onToolStatus, token, userId) {
  const tools = createTools(token, userId);
  const system = `Tu es NeoERP AI Agent — ERP autonome SYSCOHADA/OHADA pour PME africaines (Togo/UEMOA).
Base PostgreSQL sécurisée (RLS activé). Tu exécutes de vraies actions.

TOOLS — réponds TOOL: {json} sur une seule ligne :
- creer_client: {"tool":"creer_client","params":{"nom":"...","email":"...","telephone":"..."}}
- creer_facture: {"tool":"creer_facture","params":{"client_nom":"...","montant_ht":0,"description":"..."}}
- lister_factures: {"tool":"lister_factures","params":{"statut":"impayée|payée|retard|null"}}
- lister_clients: {"tool":"lister_clients","params":{}}
- analyser_tresorerie: {"tool":"analyser_tresorerie","params":{}}
- enregistrer_operation: {"tool":"enregistrer_operation","params":{"type":"entrée|sortie","montant":0,"description":"...","categorie":"..."}}
- statistiques: {"tool":"statistiques","params":{}}

Réponds en français. Utilise les tools pour toute action ERP. Montants en FCFA.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      system,
      messages: [...history, { role: "user", content: userMessage }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || "Erreur IA");
  }
  const data = await res.json();
  const aiText = data.content?.[0]?.text || "";

  const toolLine = aiText.split("\n").find(l => l.trim().startsWith("TOOL:"));
  if (toolLine) {
    try {
      const { tool, params } = JSON.parse(toolLine.replace("TOOL:", "").trim());
      const toolMap = {
        creer_client: tools.creerClient,
        creer_facture: tools.creerFacture,
        lister_factures: tools.listerFactures,
        lister_clients: tools.listerClients,
        analyser_tresorerie: tools.analyserTresorerie,
        enregistrer_operation: tools.enregistrerOperation,
        statistiques: tools.statistiques,
      };
      if (toolMap[tool]) {
        onToolStatus(`⚙ Exécution : ${tool.replace(/_/g, " ")}…`);
        const result = await toolMap[tool](params || {});
        return result.message;
      }
    } catch (e) {
      return `❌ Erreur d'exécution : ${e.message}`;
    }
  }
  return aiText;
}

/* ─── DESIGN TOKENS ─── */
const T = {
  bg: "#070A0F", s1: "#0D1117", s2: "#111820", s3: "#161E2B",
  border: "#1C2535", borderLight: "#243040",
  accent: "#00E5B0", accentDim: "#00E5B012", accentBorder: "#00E5B025",
  gold: "#FFD060", goldDim: "#FFD06012",
  red: "#FF4D6A", redDim: "#FF4D6A12",
  blue: "#5BA4FF", text: "#E2EAF4", sub: "#8898AA", dim: "#364558",
};

const fmtShort = (n) => {
  n = Number(n || 0);
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return String(n);
};

function Badge({ status }) {
  const m = {
    payée: { bg: T.accentDim, c: T.accent, l: "Payée" },
    impayée: { bg: T.goldDim, c: T.gold, l: "Impayée" },
    retard: { bg: T.redDim, c: T.red, l: "Retard" },
    actif: { bg: T.accentDim, c: T.accent, l: "Actif" },
  };
  const s = m[status] || { bg: T.s2, c: T.dim, l: status };
  return <span style={{ background: s.bg, color: s.c, border: `1px solid ${s.c}30`, borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>{s.l}</span>;
}

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, []);
  return (
    <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: type === "success" ? T.accent : T.red, color: T.bg, borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 13, zIndex: 999, boxShadow: "0 8px 30px rgba(0,0,0,0.4)", whiteSpace: "nowrap" }}>
      {msg}
    </div>
  );
}

/* ─── AUTH SCREEN ─── */
function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!email || !password) return setError("Email et mot de passe obligatoires");
    if (password.length < 6) return setError("Mot de passe minimum 6 caractères");
    setLoading(true);
    setError("");
    try {
      if (mode === "register") {
        await auth.signUp(email, password);
        setMode("login");
        setError("✓ Compte créé. Connectez-vous maintenant.");
      } else {
        const result = await auth.signIn(email, password);
        const companyName = company || "Mon Entreprise";
        auth.saveSession(result, companyName);
        onAuth(result.access_token, result.refresh_token, result.user, companyName);
      }
    } catch (e) {
      setError(e.message || "Erreur de connexion");
    }
    setLoading(false);
  };

  return (
    <div style={{ height: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "min(400px, 100%)" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 50, height: 50, borderRadius: 13, background: `linear-gradient(135deg, ${T.accent}, #009970)`, display: "flex", alignItems: "center", justifyContent: "center", color: T.bg, fontWeight: 900, fontSize: 21, margin: "0 auto 12px" }}>N</div>
          <div style={{ color: T.text, fontSize: 21, fontWeight: 900 }}>NeoERP AI</div>
          <div style={{ color: T.sub, fontSize: 12, marginTop: 3 }}>ERP intelligent · PME africaines · SYSCOHADA</div>
        </div>

        <div style={{ background: T.s2, border: `1px solid ${T.border}`, borderRadius: 14, padding: 22 }}>
          <div style={{ display: "flex", marginBottom: 18, background: T.s3, borderRadius: 8, padding: 3 }}>
            {["login", "register"].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(""); }} style={{ flex: 1, background: mode === m ? T.accent : "none", border: "none", borderRadius: 6, padding: "7px", color: mode === m ? T.bg : T.sub, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                {m === "login" ? "Se connecter" : "Créer un compte"}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {mode === "register" && (
              <input value={company} onChange={e => setCompany(e.target.value)}
                placeholder="Nom de votre entreprise"
                style={{ background: T.s3, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 13px", color: T.text, fontSize: 13, outline: "none" }} />
            )}
            <input value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Email" type="email"
              style={{ background: T.s3, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 13px", color: T.text, fontSize: 13, outline: "none" }} />
            <input value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Mot de passe (min. 6 caractères)" type="password"
              onKeyDown={e => e.key === "Enter" && submit()}
              style={{ background: T.s3, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 13px", color: T.text, fontSize: 13, outline: "none" }} />
          </div>

          {error && (
            <div style={{ marginTop: 9, padding: "8px 11px", borderRadius: 7, background: error.startsWith("✓") ? T.accentDim : T.redDim, color: error.startsWith("✓") ? T.accent : T.red, fontSize: 12 }}>
              {error}
            </div>
          )}

          <button onClick={submit} disabled={loading} style={{ width: "100%", marginTop: 13, background: loading ? T.s3 : T.accent, border: "none", borderRadius: 8, padding: "12px", color: loading ? T.sub : T.bg, fontWeight: 800, fontSize: 14, cursor: loading ? "default" : "pointer" }}>
            {loading ? "Chargement…" : mode === "login" ? "Se connecter" : "Créer mon compte"}
          </button>

          <div style={{ marginTop: 14, padding: "9px 11px", background: T.s3, borderRadius: 7, fontSize: 10, color: T.sub, textAlign: "center" }}>
            🔒 Données isolées par compte · RLS activé · Session persistante
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── AI AGENT MODULE ─── */
function AIAgentModule({ token, userId, onRefresh }) {
  const [messages, setMessages] = useState([{
    role: "ai",
    text: `**NeoERP AI Agent — Connecté et sécurisé**\n\nVos données sont isolées (RLS activé). Session persistante.\n\nActions disponibles :\n• Créer clients et factures réelles\n• Analyser trésorerie en temps réel\n• Écritures SYSCOHADA correctes (411/706/443)\n• Lister et filtrer vos données\n\nQue souhaitez-vous faire ?`
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const endRef = useRef(null);

  const SUGGESTIONS = [
    "Comment se porte mon entreprise ?",
    "Crée une facture de 500 000 FCFA pour SODECO SA",
    "Montre mes factures impayées",
    "Analyse ma trésorerie",
    "Liste mes clients",
  ];

  const send = async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput("");
    setMessages(m => [...m, { role: "user", text: msg }]);
    setLoading(true);
    try {
      const reply = await runAIAgent(
        msg, history,
        (s) => setMessages(m => [...m, { role: "tool", text: s }]),
        token, userId
      );
      setMessages(m => [...m.filter(x => x.role !== "tool"), { role: "ai", text: reply }]);
      setHistory(h => [...h, { role: "user", content: msg }, { role: "assistant", content: reply }]);
      onRefresh();
    } catch (e) {
      setMessages(m => [...m.filter(x => x.role !== "tool"), { role: "ai", text: `❌ ${e.message}` }]);
    }
    setLoading(false);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const renderText = (text) => {
    // Safe render without dangerouslySetInnerHTML
    return text.split("\n").map((line, i) => {
      const parts = line.split(/\*\*(.*?)\*\*/g);
      return (
        <div key={i} style={{ lineHeight: 1.7, minHeight: line ? "auto" : "0.4em" }}>
          {parts.map((part, j) =>
            j % 2 === 1
              ? <strong key={j} style={{ color: T.accent }}>{part}</strong>
              : <span key={j}>{part}</span>
          )}
        </div>
      );
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "12px 16px 8px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: T.accent, boxShadow: `0 0 7px ${T.accent}` }} />
          <div style={{ color: T.text, fontSize: 15, fontWeight: 800 }}>Agent IA Autonome</div>
          <div style={{ marginLeft: "auto", background: T.accentDim, border: `1px solid ${T.accentBorder}`, borderRadius: 6, padding: "2px 8px", color: T.accent, fontSize: 9, fontWeight: 700 }}>🔒 SÉCURISÉ</div>
        </div>
        <div style={{ color: T.sub, fontSize: 10, marginTop: 2 }}>SYSCOHADA 411/706/443 · RLS · Session persistante</div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((m, i) => (
          <div key={i}>
            {m.role === "tool" && (
              <div style={{ display: "flex", justifyContent: "center" }}>
                <div style={{ background: T.s3, border: `1px solid ${T.borderLight}`, borderRadius: 20, padding: "3px 12px", color: T.sub, fontSize: 10, display: "flex", gap: 5, alignItems: "center" }}>
                  <div style={{ width: 4, height: 4, borderRadius: "50%", background: T.accent, animation: "pulse 1s infinite" }} />
                  {m.text}
                </div>
              </div>
            )}
            {m.role !== "tool" && (
              <div style={{ display: "flex", gap: 9, flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
                {m.role === "ai" && (
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: `linear-gradient(135deg, ${T.accent}, #009970)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0 }}>◈</div>
                )}
                <div style={{ background: m.role === "user" ? T.s2 : T.s3, border: `1px solid ${m.role === "ai" ? T.accentBorder : T.border}`, borderRadius: m.role === "user" ? "11px 11px 3px 11px" : "11px 11px 11px 3px", padding: "9px 12px", maxWidth: "85%", color: T.text, fontSize: 12 }}>
                  {renderText(m.text)}
                </div>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 9 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: `linear-gradient(135deg, ${T.accent}, #009970)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>◈</div>
            <div style={{ background: T.s3, border: `1px solid ${T.accentBorder}`, borderRadius: "11px 11px 11px 3px", padding: "11px 13px", display: "flex", gap: 4 }}>
              {[0, 1, 2].map(j => <div key={j} style={{ width: 5, height: 5, borderRadius: "50%", background: T.accent, animation: "pulse 1s infinite", animationDelay: `${j * 0.2}s` }} />)}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div style={{ padding: "6px 10px", display: "flex", gap: 4, flexWrap: "wrap", borderTop: `1px solid ${T.border}` }}>
        {SUGGESTIONS.map((s, i) => (
          <button key={i} onClick={() => send(s)} disabled={loading} style={{ background: T.s2, border: `1px solid ${T.border}`, borderRadius: 20, padding: "3px 9px", color: T.sub, fontSize: 10, cursor: "pointer", whiteSpace: "nowrap" }}>{s}</button>
        ))}
      </div>
      <div style={{ padding: "9px 12px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 7 }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !loading && send()}
          placeholder="Tapez une commande ERP…"
          style={{ flex: 1, background: T.s2, border: `1px solid ${T.border}`, borderRadius: 9, padding: "9px 13px", color: T.text, fontSize: 12, outline: "none" }} />
        <button onClick={() => send()} disabled={loading || !input.trim()} style={{ background: loading || !input.trim() ? T.s2 : T.accent, border: "none", borderRadius: 9, width: 40, height: 40, color: loading || !input.trim() ? T.dim : T.bg, cursor: loading || !input.trim() ? "default" : "pointer", fontSize: 15 }}>→</button>
      </div>
    </div>
  );
}

/* ─── CLIENTS MODULE ─── */
function ClientsModule({ token, userId, toast, refreshKey }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nom: "", contact: "", email: "", telephone: "" });

  const load = async () => {
    setLoading(true);
    try {
      const data = await db.query("clients", { select: "*", order: "created_at.desc" }, token);
      setClients(Array.isArray(data) ? data : []);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [refreshKey]);

  const save = async () => {
    const e = validate.client(form);
    if (e) return toast(e, "error");
    try {
      await db.insert("clients", { ...form, statut: "actif", user_id: userId }, token);
      await db.auditLog("CREATE", "clients", null, { nom: form.nom }, userId, token);
      toast("Client ajouté ✓", "success");
      setShowForm(false);
      setForm({ nom: "", contact: "", email: "", telephone: "" });
      load();
    } catch (e) { toast(e.message, "error"); }
  };

  return (
    <div style={{ padding: 18, height: "100%", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ color: T.sub, fontSize: 10, fontWeight: 700, letterSpacing: "0.15em" }}>◉ LIVE · SÉCURISÉ</div>
          <div style={{ color: T.text, fontSize: 17, fontWeight: 800 }}>Clients</div>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{ background: T.accent, border: "none", borderRadius: 8, padding: "7px 13px", color: T.bg, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>+ Nouveau</button>
      </div>

      {err && <div style={{ background: T.redDim, border: `1px solid ${T.red}30`, borderRadius: 8, padding: "8px 12px", color: T.red, fontSize: 12, marginBottom: 12 }}>⚠ {err}</div>}

      {showForm && (
        <div style={{ background: T.s2, border: `1px solid ${T.accentBorder}`, borderRadius: 11, padding: 13, marginBottom: 13 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 8 }}>
            {[{ k: "nom", p: "Nom société *" }, { k: "contact", p: "Contact" }, { k: "email", p: "Email" }, { k: "telephone", p: "Téléphone" }].map(f => (
              <input key={f.k} value={form[f.k]} onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))}
                placeholder={f.p} style={{ background: T.s3, border: `1px solid ${T.border}`, borderRadius: 7, padding: "8px 11px", color: T.text, fontSize: 12, outline: "none" }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <button onClick={save} style={{ background: T.accent, border: "none", borderRadius: 7, padding: "8px 15px", color: T.bg, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Enregistrer</button>
            <button onClick={() => setShowForm(false)} style={{ background: T.s3, border: `1px solid ${T.border}`, borderRadius: 7, padding: "8px 11px", color: T.sub, fontSize: 12, cursor: "pointer" }}>Annuler</button>
          </div>
        </div>
      )}

      {loading ? <div style={{ textAlign: "center", padding: 40, color: T.sub, fontSize: 12 }}>Chargement…</div>
        : clients.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: T.sub, fontSize: 13 }}>Aucun client. Ajoutez-en un !</div>
          : (
            <div style={{ background: T.s2, border: `1px solid ${T.border}`, borderRadius: 11, overflow: "hidden" }}>
              {clients.map((c, i) => (
                <div key={c.id} style={{ padding: "11px 13px", borderBottom: i < clients.length - 1 ? `1px solid ${T.border}` : "none", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${T.blue}, #2060CC)`, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                    {c.nom?.[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: T.text, fontWeight: 600, fontSize: 13 }}>{c.nom}</div>
                    <div style={{ color: T.sub, fontSize: 10 }}>{c.email || c.telephone || "—"}</div>
                  </div>
                  <Badge status={c.statut || "actif"} />
                </div>
              ))}
            </div>
          )}
    </div>
  );
}

/* ─── FACTURES MODULE ─── */
function FacturesModule({ token, userId, toast, refreshKey }) {
  const [factures, setFactures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ client_nom: "", montant_ht: "", description: "", date_echeance: "" });

  const load = async () => {
    setLoading(true);
    try {
      const data = await db.query("factures", { select: "*", order: "created_at.desc" }, token);
      setFactures(Array.isArray(data) ? data : []);
    } catch (e) { toast(e.message, "error"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [refreshKey]);

  const save = async () => {
    const e = validate.facture(form);
    if (e) return toast(e, "error");
    try {
      const ht = Math.round(Number(form.montant_ht));
      const tva = Math.round(ht * 0.18);
      const ttc = ht + tva;
      const ref = genRef();
      await db.insert("factures", {
        reference: ref, client_nom: form.client_nom.trim(),
        montant_ht: ht, tva_rate: 18, tva_montant: tva, montant_ttc: ttc,
        statut: "impayée", description: form.description || null,
        date_echeance: form.date_echeance || null, user_id: userId,
      }, token);
      await createFactureEcritures(ref, form.client_nom, ht, tva, ttc, userId, token);
      await db.auditLog("CREATE", "factures", null, { ref, client_nom: form.client_nom, ttc }, userId, token);
      toast(`Facture ${ref} créée ✓`, "success");
      setShowForm(false);
      setForm({ client_nom: "", montant_ht: "", description: "", date_echeance: "" });
      load();
    } catch (e) { toast(e.message, "error"); }
  };

  const markPaid = async (id, ref) => {
    try {
      await db.update("factures", id, { statut: "payée" }, token);
      await db.auditLog("UPDATE", "factures", id, { statut: "payée", ref }, userId, token);
      toast("Facture marquée payée ✓", "success");
      load();
    } catch (e) { toast(e.message, "error"); }
  };

  const impaye = factures.filter(f => f.statut !== "payée").reduce((s, f) => s + (f.montant_ttc || 0), 0);

  return (
    <div style={{ padding: 18, height: "100%", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 13 }}>
        <div>
          <div style={{ color: T.sub, fontSize: 10, fontWeight: 700, letterSpacing: "0.15em" }}>◧ SYSCOHADA CORRECT</div>
          <div style={{ color: T.text, fontSize: 17, fontWeight: 800 }}>Facturation</div>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{ background: T.accent, border: "none", borderRadius: 8, padding: "7px 13px", color: T.bg, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>+ Nouvelle</button>
      </div>

      {impaye > 0 && <div style={{ background: T.goldDim, border: `1px solid ${T.gold}30`, borderRadius: 8, padding: "7px 11px", marginBottom: 11, fontSize: 11, color: T.gold }}>⚠ Impayés : <strong>{impaye.toLocaleString("fr-FR")} FCFA</strong></div>}

      {showForm && (
        <div style={{ background: T.s2, border: `1px solid ${T.accentBorder}`, borderRadius: 11, padding: 13, marginBottom: 13 }}>
          <div style={{ background: T.accentDim, borderRadius: 7, padding: "6px 10px", marginBottom: 9, fontSize: 10, color: T.accent }}>
            ✓ Débit 411 TTC → Crédit 706 HT + Crédit 443 TVA
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <input value={form.client_nom} onChange={e => setForm(p => ({ ...p, client_nom: e.target.value }))}
              placeholder="Nom du client *" style={{ background: T.s3, border: `1px solid ${T.border}`, borderRadius: 7, padding: "8px 11px", color: T.text, fontSize: 12, outline: "none" }} />
            <input value={form.montant_ht} onChange={e => setForm(p => ({ ...p, montant_ht: e.target.value }))}
              placeholder="Montant HT en FCFA *" type="number"
              style={{ background: T.s3, border: `1px solid ${T.border}`, borderRadius: 7, padding: "8px 11px", color: T.text, fontSize: 12, outline: "none" }} />
            {form.montant_ht > 0 && (
              <div style={{ background: T.accentDim, borderRadius: 7, padding: "6px 10px", fontSize: 11, color: T.accent }}>
                TTC : {Math.round(Number(form.montant_ht) * 1.18).toLocaleString("fr-FR")} FCFA · TVA : {Math.round(Number(form.montant_ht) * 0.18).toLocaleString("fr-FR")} FCFA
              </div>
            )}
            <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Description" style={{ background: T.s3, border: `1px solid ${T.border}`, borderRadius: 7, padding: "8px 11px", color: T.text, fontSize: 12, outline: "none" }} />
            <input value={form.date_echeance} onChange={e => setForm(p => ({ ...p, date_echeance: e.target.value }))}
              type="date" style={{ background: T.s3, border: `1px solid ${T.border}`, borderRadius: 7, padding: "8px 11px", color: T.text, fontSize: 12, outline: "none" }} />
          </div>
          <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
            <button onClick={save} style={{ background: T.accent, border: "none", borderRadius: 7, padding: "8px 15px", color: T.bg, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Enregistrer</button>
            <button onClick={() => setShowForm(false)} style={{ background: T.s3, border: `1px solid ${T.border}`, borderRadius: 7, padding: "8px 11px", color: T.sub, fontSize: 12, cursor: "pointer" }}>Annuler</button>
          </div>
        </div>
      )}

      {loading ? <div style={{ textAlign: "center", padding: 40, color: T.sub, fontSize: 12 }}>Chargement…</div>
        : factures.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: T.sub, fontSize: 13 }}>Aucune facture. Créez-en une !</div>
          : (
            <div style={{ background: T.s2, border: `1px solid ${T.border}`, borderRadius: 11, overflow: "hidden" }}>
              {factures.map((f, i) => (
                <div key={f.id} style={{ padding: "10px 13px", borderBottom: i < factures.length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ color: T.dim, fontSize: 9, fontFamily: "monospace", minWidth: 90 }}>{f.reference}</div>
                    <div style={{ color: T.text, fontSize: 12, flex: 1 }}>{f.client_nom}</div>
                    <div style={{ color: T.text, fontSize: 12, fontWeight: 700 }}>{fmtShort(f.montant_ttc)} F</div>
                    <Badge status={f.statut} />
                  </div>
                  {f.statut !== "payée" && (
                    <button onClick={() => markPaid(f.id, f.reference)} style={{ marginTop: 5, background: T.accentDim, border: `1px solid ${T.accentBorder}`, borderRadius: 5, padding: "3px 9px", color: T.accent, fontSize: 10, cursor: "pointer", fontWeight: 600 }}>
                      ✓ Marquer payée
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
    </div>
  );
}

/* ─── TRESORERIE ─── */
function TresorerieModule({ token, userId, toast, refreshKey }) {
  const [ops, setOps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "entrée", montant: "", description: "", categorie: "" });

  const load = async () => {
    setLoading(true);
    try {
      const data = await db.query("tresorerie", { select: "*", order: "created_at.desc" }, token);
      setOps(Array.isArray(data) ? data : []);
    } catch (e) { toast(e.message, "error"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [refreshKey]);

  const save = async () => {
    const e = validate.operation(form);
    if (e) return toast(e, "error");
    try {
      await db.insert("tresorerie", { ...form, montant: Math.round(Number(form.montant)), user_id: userId }, token);
      toast("Opération enregistrée ✓", "success");
      setShowForm(false);
      setForm({ type: "entrée", montant: "", description: "", categorie: "" });
      load();
    } catch (e) { toast(e.message, "error"); }
  };

  const entrees = ops.filter(o => o.type === "entrée").reduce((s, o) => s + (o.montant || 0), 0);
  const sorties = ops.filter(o => o.type === "sortie").reduce((s, o) => s + (o.montant || 0), 0);

  return (
    <div style={{ padding: 18, height: "100%", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 13 }}>
        <div>
          <div style={{ color: T.sub, fontSize: 10, fontWeight: 700, letterSpacing: "0.15em" }}>◈ LIVE</div>
          <div style={{ color: T.text, fontSize: 17, fontWeight: 800 }}>Trésorerie</div>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{ background: T.accent, border: "none", borderRadius: 8, padding: "7px 13px", color: T.bg, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>+ Opération</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 9, marginBottom: 13 }}>
        {[
          { l: "Entrées", v: entrees, c: T.accent },
          { l: "Sorties", v: sorties, c: T.red },
          { l: "Solde", v: entrees - sorties, c: entrees - sorties >= 0 ? T.blue : T.red }
        ].map((k, i) => (
          <div key={i} style={{ background: T.s2, border: `1px solid ${T.border}`, borderRadius: 9, padding: "10px 11px" }}>
            <div style={{ color: T.sub, fontSize: 10 }}>{k.l}</div>
            <div style={{ color: k.c, fontSize: 15, fontWeight: 800 }}>{fmtShort(k.v)}</div>
            <div style={{ color: T.dim, fontSize: 9 }}>FCFA</div>
          </div>
        ))}
      </div>

      {showForm && (
        <div style={{ background: T.s2, border: `1px solid ${T.accentBorder}`, borderRadius: 11, padding: 13, marginBottom: 13 }}>
          <div style={{ display: "flex", gap: 7, marginBottom: 8 }}>
            {["entrée", "sortie"].map(t => (
              <button key={t} onClick={() => setForm(p => ({ ...p, type: t }))} style={{ background: form.type === t ? (t === "entrée" ? T.accentDim : T.redDim) : T.s3, border: `1px solid ${form.type === t ? (t === "entrée" ? T.accent : T.red) : T.border}`, borderRadius: 6, padding: "6px 13px", color: form.type === t ? (t === "entrée" ? T.accent : T.red) : T.sub, fontSize: 12, cursor: "pointer", fontWeight: 600, textTransform: "capitalize" }}>{t}</button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <input value={form.montant} onChange={e => setForm(p => ({ ...p, montant: e.target.value }))}
              placeholder="Montant FCFA *" type="number"
              style={{ background: T.s3, border: `1px solid ${T.border}`, borderRadius: 7, padding: "8px 11px", color: T.text, fontSize: 12, outline: "none" }} />
            <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Description"
              style={{ background: T.s3, border: `1px solid ${T.border}`, borderRadius: 7, padding: "8px 11px", color: T.text, fontSize: 12, outline: "none" }} />
            <input value={form.categorie} onChange={e => setForm(p => ({ ...p, categorie: e.target.value }))}
              placeholder="Catégorie"
              style={{ background: T.s3, border: `1px solid ${T.border}`, borderRadius: 7, padding: "8px 11px", color: T.text, fontSize: 12, outline: "none" }} />
          </div>
          <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
            <button onClick={save} style={{ background: T.accent, border: "none", borderRadius: 7, padding: "8px 15px", color: T.bg, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Enregistrer</button>
            <button onClick={() => setShowForm(false)} style={{ background: T.s3, border: `1px solid ${T.border}`, borderRadius: 7, padding: "8px 11px", color: T.sub, fontSize: 12, cursor: "pointer" }}>Annuler</button>
          </div>
        </div>
      )}

      {loading ? <div style={{ textAlign: "center", padding: 40, color: T.sub, fontSize: 12 }}>Chargement…</div>
        : ops.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: T.sub, fontSize: 13 }}>Aucune opération.</div>
          : (
            <div style={{ background: T.s2, border: `1px solid ${T.border}`, borderRadius: 11, overflow: "hidden" }}>
              {ops.map((o, i) => (
                <div key={o.id} style={{ padding: "9px 13px", borderBottom: i < ops.length - 1 ? `1px solid ${T.border}` : "none", display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: o.type === "entrée" ? T.accent : T.red, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ color: T.text, fontSize: 12 }}>{o.description || o.categorie || "—"}</div>
                    <div style={{ color: T.sub, fontSize: 10 }}>{new Date(o.created_at).toLocaleDateString("fr-FR")}</div>
                  </div>
                  <div style={{ color: o.type === "entrée" ? T.accent : T.red, fontWeight: 700, fontSize: 13 }}>
                    {o.type === "entrée" ? "+" : "-"}{fmtShort(o.montant)} F
                  </div>
                </div>
              ))}
            </div>
          )}
    </div>
  );
}

/* ─── DASHBOARD ─── */
function Dashboard({ token, onNavigate, refreshKey }) {
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const run = async () => {
      try {
        const [clients, factures, ops] = await Promise.all([
          db.query("clients", { select: "id" }, token),
          db.query("factures", { select: "statut,montant_ttc" }, token),
          db.query("tresorerie", { select: "type,montant" }, token),
        ]);
        const impaye = Array.isArray(factures) ? factures.filter(f => f.statut !== "payée").reduce((s, f) => s + (f.montant_ttc || 0), 0) : 0;
        const entrees = Array.isArray(ops) ? ops.filter(o => o.type === "entrée").reduce((s, o) => s + (o.montant || 0), 0) : 0;
        const sorties = Array.isArray(ops) ? ops.filter(o => o.type === "sortie").reduce((s, o) => s + (o.montant || 0), 0) : 0;
        setStats({
          clients: Array.isArray(clients) ? clients.length : 0,
          factures: Array.isArray(factures) ? factures.length : 0,
          impaye, solde: entrees - sorties,
        });
      } catch (e) { setErr(e.message); }
    };
    run();
  }, [refreshKey]);

  return (
    <div style={{ padding: 18, height: "100%", overflowY: "auto" }}>
      <button onClick={() => onNavigate("agent")} style={{ width: "100%", background: `linear-gradient(135deg, #0A1A14, #0D2018)`, border: `1px solid ${T.accent}30`, borderRadius: 11, padding: "13px 16px", display: "flex", alignItems: "center", gap: 13, cursor: "pointer", marginBottom: 18, textAlign: "left" }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: `linear-gradient(135deg, ${T.accent}, #009970)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>◈</div>
        <div>
          <div style={{ color: T.accent, fontWeight: 800, fontSize: 13 }}>Agent IA — Actions réelles sécurisées</div>
          <div style={{ color: T.sub, fontSize: 11 }}>SYSCOHADA 411/706/443 · RLS · Session persistante</div>
        </div>
        <div style={{ marginLeft: "auto", color: T.accent, fontSize: 16 }}>→</div>
      </button>

      {err && <div style={{ background: T.redDim, border: `1px solid ${T.red}30`, borderRadius: 8, padding: "8px 12px", color: T.red, fontSize: 12, marginBottom: 12 }}>⚠ {err}</div>}

      {!stats ? <div style={{ textAlign: "center", padding: 40, color: T.sub, fontSize: 12 }}>Chargement…</div> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 11 }}>
          {[
            { label: "Clients", val: stats.clients, color: T.blue, view: "clients" },
            { label: "Factures", val: stats.factures, color: T.accent, view: "factures" },
            { label: "Impayés", val: fmtShort(stats.impaye) + " F", color: T.gold, view: "factures" },
            { label: "Trésorerie", val: fmtShort(stats.solde) + " F", color: stats.solde >= 0 ? T.accent : T.red, view: "tresorerie" },
          ].map((k, i) => (
            <div key={i} onClick={() => onNavigate(k.view)} style={{ background: T.s2, border: `1px solid ${T.border}`, borderRadius: 11, padding: "14px 13px", cursor: "pointer" }}>
              <div style={{ color: T.sub, fontSize: 10, marginBottom: 5 }}>{k.label}</div>
              <div style={{ color: k.color, fontSize: 24, fontWeight: 900 }}>{k.val}</div>
            </div>
          ))}
        </div>
      )}
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
];

/* ─── ROOT ─── */
export default function NeoERPV6() {
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [view, setView] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [toast, setToast] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // ─── CORRECTION 1 : Persistance de session au chargement ───
  useEffect(() => {
    const run = async () => {
      const saved = auth.loadSession();
      if (!saved) { setSessionLoading(false); return; }
      // Si session expirée, tenter un refresh
      if (Date.now() > saved.expires_at - 60000) {
        try {
          const refreshed = await auth.refreshToken(saved.refresh_token);
          const newSession = {
            token: refreshed.access_token,
            refresh_token: refreshed.refresh_token,
            user: refreshed.user,
            company: saved.company,
            expires_at: Date.now() + (refreshed.expires_in * 1000),
          };
          auth.saveSession(refreshed, saved.company);
          setSession(newSession);
        } catch (e) {
          auth.clearSession();
        }
      } else {
        setSession(saved);
      }
      setSessionLoading(false);
    };
    run();
  }, []);

  const showToast = (msg, type = "success") => setToast({ msg, type });
  const refresh = () => setRefreshKey(k => k + 1);

  const handleAuth = (token, refresh_token, user, company) => {
    setSession({ token, refresh_token, user, company, expires_at: Date.now() + 3600000 });
  };

  const handleLogout = async () => {
    try { await auth.signOut(session.token); } catch (e) {}
    auth.clearSession();
    setSession(null);
    setView("dashboard");
  };

  if (sessionLoading) {
    return (
      <div style={{ height: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: `linear-gradient(135deg, ${T.accent}, #009970)`, display: "flex", alignItems: "center", justifyContent: "center", color: T.bg, fontWeight: 900, fontSize: 18, margin: "0 auto 12px" }}>N</div>
          <div style={{ color: T.sub, fontSize: 12 }}>Chargement de la session…</div>
        </div>
      </div>
    );
  }

  if (!session) return <AuthScreen onAuth={handleAuth} />;

  const renderView = () => {
    const props = { token: session.token, userId: session.user?.id, toast: showToast, refreshKey };
    switch (view) {
      case "dashboard": return <Dashboard {...props} onNavigate={setView} />;
      case "agent": return <AIAgentModule token={session.token} userId={session.user?.id} onRefresh={refresh} />;
      case "clients": return <ClientsModule {...props} />;
      case "factures": return <FacturesModule {...props} />;
      case "tresorerie": return <TresorerieModule {...props} />;
      default: return <Dashboard {...props} onNavigate={setView} />;
    }
  };

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: T.bg, color: T.text, height: "100vh", display: "flex", overflow: "hidden" }}>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; } ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-thumb { background: ${T.border}; } input::placeholder { color: ${T.dim}; } button { font-family: inherit; } @keyframes pulse { 0%,100%{opacity:0.2;transform:scale(0.85)} 50%{opacity:1;transform:scale(1.15)} }`}</style>

      {/* Sidebar */}
      <div style={{ width: collapsed ? 50 : 200, flexShrink: 0, background: T.s1, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", transition: "width 0.22s", overflow: "hidden" }}>
        <div style={{ padding: "13px 11px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 27, height: 27, borderRadius: 8, background: `linear-gradient(135deg, ${T.accent}, #009970)`, display: "flex", alignItems: "center", justifyContent: "center", color: T.bg, fontWeight: 900, fontSize: 12, flexShrink: 0 }}>N</div>
          {!collapsed && (
            <>
              <div>
                <div style={{ color: T.text, fontWeight: 800, fontSize: 12 }}>NeoERP AI</div>
                <div style={{ color: T.accent, fontSize: 9, fontWeight: 600 }}>● V6 · Sécurisé</div>
              </div>
              <button onClick={() => setCollapsed(true)} style={{ marginLeft: "auto", background: "none", border: "none", color: T.dim, cursor: "pointer" }}>⇤</button>
            </>
          )}
          {collapsed && <button onClick={() => setCollapsed(false)} style={{ background: "none", border: "none", color: T.dim, cursor: "pointer" }}>⇥</button>}
        </div>

        <nav style={{ flex: 1, padding: "7px 5px" }}>
          {NAV.map(item => (
            <button key={item.id} onClick={() => setView(item.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: collapsed ? "9px 0" : "9px 9px", justifyContent: collapsed ? "center" : "flex-start", background: view === item.id ? T.accentDim : "none", border: view === item.id ? `1px solid ${T.accentBorder}` : "1px solid transparent", borderRadius: 7, cursor: "pointer", color: view === item.id ? T.accent : T.sub, fontSize: 12, marginBottom: 1, whiteSpace: "nowrap", overflow: "hidden" }}>
              <span style={{ fontSize: 13, flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        <div style={{ padding: "9px 9px", borderTop: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: collapsed ? 0 : 7 }}>
            <div style={{ width: 24, height: 24, borderRadius: 6, background: `linear-gradient(135deg, ${T.blue}, #2060CC)`, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 800, fontSize: 10, flexShrink: 0 }}>
              {session.user?.email?.[0]?.toUpperCase()}
            </div>
            {!collapsed && (
              <div style={{ overflow: "hidden" }}>
                <div style={{ color: T.text, fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.company}</div>
                <div style={{ color: T.dim, fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.user?.email}</div>
              </div>
            )}
          </div>
          {!collapsed && (
            <button onClick={handleLogout} style={{ width: "100%", background: T.s2, border: `1px solid ${T.border}`, borderRadius: 6, padding: "5px", color: T.sub, fontSize: 10, cursor: "pointer" }}>
              Déconnexion
            </button>
          )}
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "0 16px", height: 43, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", background: T.s1, flexShrink: 0 }}>
          <span style={{ color: T.sub, fontSize: 11, flex: 1 }}>{NAV.find(n => n.id === view)?.label}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: T.accent, boxShadow: `0 0 5px ${T.accent}` }} />
            <span style={{ color: T.sub, fontSize: 10 }}>🔒 RLS · Auth · Session persistante</span>
          </div>
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>{renderView()}</div>
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
