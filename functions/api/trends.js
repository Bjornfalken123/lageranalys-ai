function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export async function onRequestGet({ env }) {
  try {
    if (!env.DB) {
      return json({ error: "D1-binding DB saknas." }, 500);
    }

    const total = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM sold_vehicles"
    ).first();

    const monthly = await env.DB.prepare(`
      SELECT sold_month AS month, COUNT(*) AS antal
      FROM sold_vehicles
      WHERE sold_month IS NOT NULL
      GROUP BY sold_month
      ORDER BY sold_month
    `).all();

    return json({
      totalSold: total?.total || 0,
      monthlySales: monthly.results || []
    });
  } catch (error) {
    return json({ error: error.message || "Kunde inte hämta trender." }, 500);
  }
}
