export const config = {
  runtime: "edge",
};

const SUPABASE_URL = "https://yctdyzcusvyumrfbqgyx.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljdGR5emN1c3Z5dW1yZmJxZ3l4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0ODk5NDEsImV4cCI6MjA5NjA2NTk0MX0.ShrXFKzMX4RDym-E1J1CZPuxMstBqfZZssvqF29Zrgw";

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    const event = await req.json();

    if (event.name === "transaction.approved" || event.entity?.status === "approved") {
      const transaction = event.entity || event.data;
      const email = transaction.customer?.email;
      const description = transaction.description || "";

      if (email) {
        let plan = "starter";
        if (description.includes("Business")) plan = "business";
        if (description.includes("Pro")) plan = "pro";

        await fetch(`${SUPABASE_URL}/rest/v1/company_settings?email=eq.${email}`, {
          method: "PATCH",
          headers: {
            apikey: SUPABASE_ANON,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({ plan, plan_active: true, plan_updated_at: new Date().toISOString() }),
        });
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
