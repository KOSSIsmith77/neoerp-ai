export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { plan, amount, email, firstname, lastname } = await req.json();

    const txResponse = await fetch("https://sandbox-api.fedapay.com/v1/transactions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.FEDAPAY_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        description: `Abonnement NeoERP AI - Plan ${plan}`,
        amount: amount,
        currency: { iso: "XOF" },
        callback_url: "https://neoerp-ai.vercel.app/payment-success",
        customer: {
          firstname: firstname || "Client",
          lastname: lastname || "NeoERP",
          email: email,
        },
      }),
    });

    const txData = await txResponse.json();
    if (!txResponse.ok) {
      return new Response(JSON.stringify({ error: txData }), {
        status: txResponse.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const tokenResponse = await fetch(
      `https://sandbox-api.fedapay.com/v1/transactions/${txData.v1/transaction.id}/token`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.FEDAPAY_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const tokenData = await tokenResponse.json();

    return new Response(JSON.stringify({ payment_url: tokenData.url, transaction_id: txData["v1/transaction"]?.id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
