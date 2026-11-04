// Fonction Vercel : relaie les questions vers Groq (offre gratuite) sans exposer la clé.
const LIMITE = 40;            // demandes par personne
const FENETRE = 10 * 60e3;    // sur 10 minutes
const vus = new Map();        // mémoire simple (non partagée entre instances)

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Méthode non permise");
  const cle = process.env.GROQ_API_KEY;
  if (!cle) return res.status(500).send("Clé API absente");

  const ip = String(req.headers["x-forwarded-for"] || "inconnu").split(",")[0].trim();
  const maintenant = Date.now();
  const liste = (vus.get(ip) || []).filter((t) => maintenant - t < FENETRE);
  if (liste.length >= LIMITE) return res.status(429).send("Trop de demandes");
  liste.push(maintenant);
  vus.set(ip, liste);

  let corps = req.body;
  if (typeof corps === "string") { try { corps = JSON.parse(corps); } catch { corps = {}; } }
  corps = corps || {};
  const messages = (Array.isArray(corps.messages) ? corps.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 9000) }));
  if (!messages.length || messages[messages.length - 1].role !== "user")
    return res.status(400).send("Requête invalide");

  // Modèle léger pour le chat, modèle plus fort pour corriger les copies.
  const model = corps.tier === "complex" ? "openai/gpt-oss-120b" : "openai/gpt-oss-20b";
  const amont = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + cle },
    body: JSON.stringify({ model, messages, stream: true, reasoning_effort: "low", max_completion_tokens: 2500 }),
  });
  if (amont.status === 429) return res.status(429).send("Limite gratuite atteinte");
  if (!amont.ok || !amont.body) return res.status(502).send("Erreur du service IA");

  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store" });
  const lecteur = amont.body.getReader();
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    res.write(Buffer.from(value));
  }
  res.end();
};
