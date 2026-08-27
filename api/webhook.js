export const config = {
  runtime: "edge",
};

const SUPABASE_URL = "https://yctdyzcusvyumrfbqgyx.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljdGR5emN1c3Z5dW1yZmJxZ3l4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0ODk5NDEsImV4cCI6MjA5NjA2NTk0MX0.ShrXFKzMX4RDym-E1J1CZPuxMstBqfZZssvqF29Zrgw";

// Detect plan from transaction description
function detectPlan(description) {
  if (!description) return "starter";
  const d = description.toLowerCase();
  if (d.includes("pro")) return "pro";
  if (d.includes("business")) return "business";
  return "starter";
}

// Get user_id from email via Supabase Auth Admin
async function getUserByEmail(email) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/company_settings?email=eq.${encodeURIComponent(email)}&select=user_id,plan`,
    {
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
      },
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

// Update plan in company_settings
async function updatePlan(email, plan) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/company_settings?email=eq.${encodeURIComponent(email)}`,
    {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        plan,
        plan_active: true,
        plan_updated_at: new Date().toISOString(),
      }),
    }
  );
  return res.ok;
}

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const event = await req.json();

    // FedaPay sends different event structures
    const transaction =
      event.entity ||
      event.data ||
      event["v1/transaction"] ||
      event.transaction ||
      null;

    const status =
      transaction?.status ||
      event.status ||
      event.name?.split(".")[1] ||
      null;

    // Only process approved transactions
    if (status === "approved" || status === "complete" || event.name === "transaction.approved") {
      const email =
        transaction?.customer?.email ||
        event.customer?.email ||
        null;

      const description =
        transaction?.description ||
        event.description ||
        "";

      if (email) {
        const plan = detectPlan(description);
        const updated = await updatePlan(email, plan);

        return new Response(
          JSON.stringify({
            received: true,
            email,
            plan,
            updated,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // Event received but not actionable
    return new Response(
      JSON.stringify({ received: true, status, action: "none" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
       
