function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function normalizeKey(key) {
  return String(key || "")
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
}

function getValue(row, possibleNames) {
  const keys = Object.keys(row);
  const keyMap = new Map(keys.map((key) => [normalizeKey(key), key]));

  for (const name of possibleNames) {
    const realKey = keyMap.get(normalizeKey(name));
    if (realKey) return row[realKey];
  }

  return undefined;
}

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return Math.round(value);
  }

  const cleaned = String(value)
    .replace(/\s/g, "")
    .replace("kr", "")
    .replace("SEK", "")
    .replace(",", ".")
    .trim();

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function parseExcelDate(value) {
  if (!value) return "";

  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
    return value;
  }

  if (typeof value === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return date.toISOString().slice(0, 10);
  }

  return String(value || "");
}

function getMonthFromDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getMonth() + 1;
}

function parseMakeModel(raw) {
  const text = String(raw || "").trim();

  if (!text) {
    return {
      brand: "Okänt",
      model: "Okänt",
      modelYear: null
    };
  }

  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  const modelYear = yearMatch ? Number(yearMatch[0]) : null;

  const withoutYear = text.replace(/\b(19|20)\d{2}\b/, "").trim();
  const parts = withoutYear.split(" ").filter(Boolean);

  let brand = parts[0] || "Okänt";
  let model = parts.slice(1).join(" ") || "Okänt";

  if (brand.toLowerCase() === "mercedes") {
    brand = "Mercedes-Benz";
    model = parts.slice(2).join(" ") || "Okänt";
  }

  return { brand, model, modelYear };
}

function getPriceBucket(price) {
  if (!price || price <= 0) return "Okänt";
  if (price < 100000) return "0-100k";
  if (price < 150000) return "100-150k";
  if (price < 200000) return "150-200k";
  if (price < 300000) return "200-300k";
  if (price < 500000) return "300-500k";
  return "500k+";
}

function getMileageBucket(mileage) {
  if (mileage === undefined || mileage === null) return "Okänt";
  if (mileage < 5000) return "0-5k mil";
  if (mileage < 10000) return "5-10k mil";
  if (mileage < 15000) return "10-15k mil";
  return "15k+ mil";
}

function normalizeSoldRow(row) {
  const rawMakeModel = String(
    getValue(row, ["Märke & Modell", "Märke Modell", "Bil", "Fordonsmodell"]) || ""
  );

  const parsed = parseMakeModel(rawMakeModel);

  const soldDate = parseExcelDate(
    getValue(row, ["Försäljningsdatum", "Såld datum", "Leveransdatum"])
  );

  const salePrice = parseNumber(
    getValue(row, [
      "Försäljningspris inkl",
      "Försäljningspris ink",
      "Försäljningspris",
      "Pris"
    ])
  );

  const mileage = parseNumber(getValue(row, ["Mil", "Miltal"]));

  return {
    id: crypto.randomUUID(),
    regNumber: String(
      getValue(row, ["Reg.nummer", "Regnummer", "Registreringsnummer"]) || ""
    ),
    rawMakeModel,
    brand: parsed.brand,
    model: parsed.model,
    modelYear: parsed.modelYear,
    mileage,
    soldDate,
    soldMonth: getMonthFromDate(soldDate),
    salePrice,
    purchasePrice: parseNumber(getValue(row, ["Inköpspris inkl", "Inköpspris"])),
    productCost: parseNumber(getValue(row, ["Produktkostnad inkl", "Produktkostnad"])),
    grossMargin: parseNumber(
      getValue(row, ["Vinstmarginal exkl", "Vinstmarginal", "Marginal"])
    ),
    daysInStock: parseNumber(getValue(row, ["Dagar i lager", "Lagerdagar"])),
    prepDays: parseNumber(getValue(row, ["Dagar iordningställande"])),
    purchaseType: String(getValue(row, ["Inköpssätt"]) || ""),
    source: String(getValue(row, ["Inkom från"]) || ""),
    priceBucket: getPriceBucket(salePrice),
    mileageBucket: getMileageBucket(mileage)
  };
}

export async function onRequestPost({ request, env }) {
  try {
    const adminKey = request.headers.get("x-admin-key");

    if (!env.ADMIN_KEY || adminKey !== env.ADMIN_KEY) {
      return json({ error: "Fel eller saknad adminnyckel." }, 401);
    }

    if (!env.DB) {
      return json({ error: "D1-binding DB saknas." }, 500);
    }

    const body = await request.json();
    const rows = Array.isArray(body.rows) ? body.rows : [];

    if (!rows.length) {
      return json({ error: "Inga rader hittades i importen." }, 400);
    }

    const vehicles = rows
      .map(normalizeSoldRow)
      .filter((vehicle) => vehicle.rawMakeModel && vehicle.soldMonth);

    await env.DB.prepare("DELETE FROM sold_vehicles").run();

    const statement = env.DB.prepare(`
      INSERT INTO sold_vehicles (
        id,
        reg_number,
        raw_make_model,
        brand,
        model,
        model_year,
        mileage,
        sold_date,
        sold_month,
        sale_price,
        purchase_price,
        product_cost,
        gross_margin,
        days_in_stock,
        prep_days,
        purchase_type,
        source,
        price_bucket,
        mileage_bucket,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();

    const batches = vehicles.map((vehicle) =>
      statement.bind(
        vehicle.id,
        vehicle.regNumber,
        vehicle.rawMakeModel,
        vehicle.brand,
        vehicle.model,
        vehicle.modelYear,
        vehicle.mileage,
        vehicle.soldDate,
        vehicle.soldMonth,
        vehicle.salePrice,
        vehicle.purchasePrice,
        vehicle.productCost,
        vehicle.grossMargin,
        vehicle.daysInStock,
        vehicle.prepDays,
        vehicle.purchaseType,
        vehicle.source,
        vehicle.priceBucket,
        vehicle.mileageBucket,
        now
      )
    );

    const chunkSize = 100;

    for (let i = 0; i < batches.length; i += chunkSize) {
      await env.DB.batch(batches.slice(i, i + chunkSize));
    }

    return json({
      imported: vehicles.length,
      ignored: rows.length - vehicles.length
    });
  } catch (error) {
    return json({ error: error.message || "Importfel." }, 500);
  }
}
