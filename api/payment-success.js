export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Paiement confirmé — NeoERP AI</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; background: #070A0F; color: #E2EAF4; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
  .card { background: #0D1117; border: 1px solid #1C2535; border-radius: 16px; padding: 40px 30px; text-align: center; max-width: 420px; width: 100%; }
  .icon { width: 70px; height: 70px; border-radius: 50%; background: linear-gradient(135deg, #00E5B0, #009970); display: flex; align-items: center; justify-content: center; font-size: 32px; margin: 0 auto 24px; }
  h1 { font-size: 22px; font-weight: 900; color: #00E5B0; margin-bottom: 10px; }
  p { color: #8898AA; font-size: 14px; line-height: 1.7; margin-bottom: 24px; }
  .btn { display: inline-block; background: #00E5B0; color: #070A0F; border-radius: 10px; padding: 13px 28px; font-weight: 800; font-size: 15px; text-decoration: none; }
  .note { color: #364558; font-size: 11px; margin-top: 16px; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">✓</div>
    <h1>Paiement confirmé !</h1>
    <p>Votre abonnement NeoERP AI est maintenant actif. Vous pouvez accéder à toutes les fonctionnalités de votre plan immédiatement.</p>
    <a class="btn" href="https://neoerp-ai.vercel.app">Accéder à NeoERP →</a>
    <div class="note">Un reçu vous a été envoyé par email · Secured by FedaPay</div>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
}
