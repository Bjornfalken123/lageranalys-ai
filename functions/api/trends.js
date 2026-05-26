function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Maj",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dec"
];

const PRICE_BUCKETS = [
  "0-100k",
  "100-150k",
  "150-200k",
  "200-300k",
  "300-500k",
  "500k+",
  "Okänt"
];

const MILEAGE_BUCKETS = [
  "0-5k mil",
  "5-10k mil",
  "10-15k mil",
  "15k+ mil",
  "Okänt"
];

function rowsToMap(rows, keyField, valueField) {
  const map = {};
  for (const row of rows) {
    map[row[keyField]] = row[valueField];
  }
  return map;
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

    const priceBuckets = await env.DB.prepare(`
      SELECT price_bucket AS bucket, COUNT(*) AS antal
      FROM sold_vehicles
      WHERE price_bucket IS NOT NULL
      GROUP BY price_bucket
    `).all();

    const mileageBuckets = await env.DB.prepare(`
      SELECT mileage_bucket AS bucket, COUNT(*) AS antal
      FROM sold_vehicles
      WHERE mileage_bucket IS NOT NULL
      GROUP BY mileage_bucket
    `).all();

    const topBrands = await env.DB.prepare(`
      SELECT brand, COUNT(*) AS antal
      FROM sold_vehicles
      WHERE brand IS NOT NULL AND brand != ''
      GROUP BY brand
      ORDER BY antal DESC
      LIMIT 10
    `).all();

    const avgByMonth = await env.DB.prepare(`
      SELECT
        sold_month AS month,
        AVG(sale_price) AS avgSalePrice,
        AVG(days_in_stock) AS avgDaysInStock,
        AVG(gross_margin) AS avgMargin
      FROM sold_vehicles
      WHERE sold_month IS NOT NULL
      GROUP BY sold_month
      ORDER BY sold_month
    `).all();

    const monthlyMap = rowsToMap(monthly.results || [], "month", "antal");
    const avgMap = {};

    for (const row of avgByMonth.results || []) {
      avgMap[row.month] = row;
    }

    const monthlySales = MONTHS.map((monthName, index) => {
      const month = index + 1;
      const avg = avgMap[month] || {};

      return {
        month: monthName,
        antal: monthlyMap[month] || 0,
        snittpris: Math.round(avg.avgSalePrice || 0),
        lagerdagar: Math.round(avg.avgDaysInStock || 0),
        marginal: Math.round(avg.avgMargin || 0)
      };
    });

    const totalSold = total?.total || 0;

    const priceDistribution = PRICE_BUCKETS.map((bucket) => {
      const row = (priceBuckets.results || []).find((item) => item.bucket === bucket);
      const antal = row?.antal || 0;

      return {
        bucket,
        antal,
        andel: totalSold ? Math.round((antal / totalSold) * 100) : 0
      };
    });

    const mileageDistribution = MILEAGE_BUCKETS.map((bucket) => {
      const row = (mileageBuckets.results || []).find((item) => item.bucket === bucket);
      const antal = row?.antal || 0;

      return {
        bucket,
        antal,
        andel: totalSold ? Math.round((antal / totalSold) * 100) : 0
      };
    });

    return json({
      totalSold,
      monthlySales,
      priceDistribution,
      mileageDistribution,
      topBrands: topBrands.results || []
    });
  } catch (error) {
    return json({ error: error.message || "Kunde inte hämta trender." }, 500);
  }
}
