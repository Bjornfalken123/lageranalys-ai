const MONTHS = [
  "Januari",
  "Februari",
  "Mars",
  "April",
  "Maj",
  "Juni",
  "Juli",
  "Augusti",
  "September",
  "Oktober",
  "November",
  "December"
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function getWeightedMonths(targetMonth) {
  const previous = targetMonth === 1 ? 12 : targetMonth - 1;
  const next = targetMonth === 12 ? 1 : targetMonth + 1;

  return [
    { month: targetMonth, weight: 0.6 },
    { month: previous, weight: 0.2 },
    { month: next, weight: 0.2 }
  ];
}

function countBy(items, getter, allowedValues = []) {
  const counts = {};

  for (const value of allowedValues) {
    counts[value] = 0;
  }

  for (const item of items) {
    const key = getter(item) || "Okänt";
    counts[key] = (counts[key] || 0) + 1;
  }

  return counts;
}

function shareBy(items, getter, allowedValues = []) {
  const counts = countBy(items, getter, allowedValues);
  const total = items.length || 1;
  const shares = {};

  for (const [key, count] of Object.entries(counts)) {
    shares[key] = count / total;
  }

  return shares;
}

function scoreMix(currentShares, targetShares, keys) {
  let totalDifference = 0;

  for (const key of keys) {
    totalDifference += Math.abs((currentShares[key] || 0) - (targetShares[key] || 0));
  }

  return Math.max(0, Math.min(100, Math.round(100 - totalDifference * 100)));
}

function percentage(value) {
  return `${Math.round(value * 100)}%`;
}

function pp(value) {
  return `${Math.round(value * 100)} procentenheter`;
}

function buildGaps(currentShares, targetShares, segmentType, keys) {
  return keys
    .filter((key) => key !== "Okänt")
    .map((key) => {
      const currentShare = currentShares[key] || 0;
      const targetShare = targetShares[key] || 0;
      const gap = currentShare - targetShare;
      const absGap = Math.abs(gap);

      return {
        segmentType,
        segmentValue: key,
        currentShare,
        targetShare,
        gap,
        severity: absGap >= 0.15 ? "high" : absGap >= 0.08 ? "medium" : "low"
      };
    })
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
}

function buildBrandGaps(currentShares, targetShares) {
  const importantBrands = Object.entries(targetShares)
    .filter(([brand]) => brand && brand !== "Okänt")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([brand]) => brand);

  return buildGaps(currentShares, targetShares, "Märke", importantBrands);
}

function getTopUnderrepresented(gaps, minTargetShare = 0.08) {
  return gaps
    .filter((gap) => gap.gap < -0.06 && gap.targetShare >= minTargetShare)
    .sort((a, b) => a.gap - b.gap)
    .slice(0, 5);
}

function getTopOverrepresented(gaps, minCurrentShare = 0.08) {
  return gaps
    .filter((gap) => gap.gap > 0.06 && gap.currentShare >= minCurrentShare)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 5);
}

async function getSoldVehicles(env) {
  const result = await env.DB.prepare(`
    SELECT
      brand,
      model,
      sold_month AS soldMonth,
      price_bucket AS priceBucket,
      mileage_bucket AS mileageBucket,
      days_in_stock AS daysInStock,
      gross_margin AS grossMargin
    FROM sold_vehicles
    LIMIT 10000
  `).all();

  return result.results || [];
}

function buildTargetProfile(soldVehicles, targetMonth) {
  const weightedMonths = getWeightedMonths(targetMonth);
  const weightedSold = [];

  for (const config of weightedMonths) {
    const monthItems = soldVehicles.filter((v) => Number(v.soldMonth) === config.month);
    const repetitions = Math.round(config.weight * 10);

    for (let i = 0; i < repetitions; i++) {
      weightedSold.push(...monthItems);
    }
  }

  const basis = weightedSold.length ? weightedSold : soldVehicles;

  const priceShares = shareBy(basis, (v) => v.priceBucket, PRICE_BUCKETS);
  const mileageShares = shareBy(basis, (v) => v.mileageBucket, MILEAGE_BUCKETS);
  const brandShares = shareBy(basis, (v) => v.brand);

  const monthlySales = MONTHS.map((name, index) => {
    const month = index + 1;

    return {
      month: name.slice(0, 3),
      antal: soldVehicles.filter((v) => Number(v.soldMonth) === month).length
    };
  });

  return {
    total: basis.length,
    priceShares,
    mileageShares,
    brandShares,
    monthlySales
  };
}

function createRecommendations({
  targetMonth,
  priceGaps,
  mileageGaps,
  brandGaps,
  over180Days,
  missingAdPrice
}) {
  const recommendations = [];

  const underPrice = getTopUnderrepresented(priceGaps, 0.08);
  const overPrice = getTopOverrepresented(priceGaps, 0.08);

  const underMileage = getTopUnderrepresented(mileageGaps, 0.08);
  const overMileage = getTopOverrepresented(mileageGaps, 0.08);

  const underBrands = getTopUnderrepresented(brandGaps, 0.06);
  const overBrands = getTopOverrepresented(brandGaps, 0.06);

  for (const gap of underPrice.slice(0, 2)) {
    recommendations.push({
      priority: "high",
      type: "buy_more_price",
      title: `Köp in fler bilar i ${gap.segmentValue}`,
      description: `Nuvarande lagerandel är ${percentage(gap.currentShare)}, medan målprofilen för ${MONTHS[targetMonth - 1]} är ${percentage(gap.targetShare)}. Bristen är cirka ${pp(Math.abs(gap.gap))}.`
    });
  }

  for (const gap of underBrands.slice(0, 2)) {
    recommendations.push({
      priority: "medium",
      type: "buy_more_brand",
      title: `Stärk märkesmixen med ${gap.segmentValue}`,
      description: `${gap.segmentValue} är underrepresenterat mot historisk försäljning. Nuvarande andel är ${percentage(gap.currentShare)}, jämfört med målprofilens ${percentage(gap.targetShare)}.`
    });
  }

  for (const gap of underMileage.slice(0, 1)) {
    recommendations.push({
      priority: "medium",
      type: "buy_more_mileage",
      title: `Komplettera med bilar i miltalsgruppen ${gap.segmentValue}`,
      description: `Miltalsgruppen är lägre i nuvarande lager än vad historisk målprofil visar för månaden.`
    });
  }

  for (const gap of overPrice.slice(0, 2)) {
    recommendations.push({
      priority: "medium",
      type: "avoid_price",
      title: `Var försiktig med fler inköp i ${gap.segmentValue}`,
      description: `Segmentet är överrepresenterat. Nuvarande lagerandel är ${percentage(gap.currentShare)}, jämfört med målprofilens ${percentage(gap.targetShare)}.`
    });
  }

  for (const gap of overBrands.slice(0, 1)) {
    recommendations.push({
      priority: "low",
      type: "avoid_brand",
      title: `Undvik att öka exponeringen mot ${gap.segmentValue}`,
      description: `${gap.segmentValue} finns redan i högre andel än målprofilen indikerar för månaden.`
    });
  }

  for (const gap of overMileage.slice(0, 1)) {
    recommendations.push({
      priority: "low",
      type: "avoid_mileage",
      title: `Minska fokus på miltalsgruppen ${gap.segmentValue}`,
      description: `Nuvarande lager har högre andel i denna miltalsgrupp än historisk målprofil.`
    });
  }

  if (over180Days > 0) {
    recommendations.push({
      priority: "high",
      type: "stock_risk",
      title: `Åtgärda ${over180Days} bilar över 180 lagerdagar`,
      description:
        "Dessa bilar binder kapital och bör prioriteras för prisjustering, kampanj eller annan avyttring innan nytt kapital binds i liknande segment."
    });
  }

  if (missingAdPrice > 0) {
    recommendations.push({
      priority: "medium",
      type: "data_quality",
      title: `${missingAdPrice} bilar saknar användbart annonspris`,
      description:
        "Detta gör marginal- och prisanalysen mindre säker. Komplettera annonspris för bättre beslutsunderlag."
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      priority: "medium",
      type: "balanced_stock",
      title: "Lagret ligger nära historisk målprofil",
      description:
        "Fortsätt följa lagerålder, prisbalans och datakvalitet inför kommande inköp."
    });
  }

  return recommendations.slice(0, 8);
}

function buildScoreExplanation(scores) {
  const scoreItems = [
    {
      key: "priceMixScore",
      label: "Prisbalans",
      value: scores.priceMixScore,
      explanation:
        "mäter hur väl lagrets prisgrupper matchar historisk försäljning för vald månad"
    },
    {
      key: "brandScore",
      label: "Märkesmix",
      value: scores.brandScore,
      explanation:
        "mäter hur väl lagrets märken matchar historiskt starka märken"
    },
    {
      key: "mileageScore",
      label: "Miltal",
      value: scores.mileageScore,
      explanation:
        "mäter hur väl lagrets miltalsgrupper matchar historisk försäljning"
    },
    {
      key: "stockRiskScore",
      label: "Lagerålder",
      value: scores.stockRiskScore,
      explanation:
        "påverkas negativt av bilar som stått länge i lager"
    },
    {
      key: "dataQualityScore",
      label: "Datakvalitet",
      value: scores.dataQualityScore,
      explanation:
        "påverkas negativt av saknade eller oanvändbara annonspriser"
    }
  ];

  const weakest = [...scoreItems].sort((a, b) => a.value - b.value).slice(0, 2);
  const strongest = [...scoreItems].sort((a, b) => b.value - a.value).slice(0, 2);

  return {
    weights: [
      { label: "Prisbalans", weight: 30 },
      { label: "Märkesmix", weight: 20 },
      { label: "Miltal", weight: 15 },
      { label: "Lagerålder", weight: 25 },
      { label: "Datakvalitet", weight: 10 }
    ],
    weakest,
    strongest
  };
}

function analyzeInventory(soldVehicles, inventoryVehicles, targetMonth) {
  const targetProfile = buildTargetProfile(soldVehicles, targetMonth);
  const inventoryCount = inventoryVehicles.length || 1;

  const currentPriceShares = shareBy(
    inventoryVehicles,
    (v) => v.priceBucket || "Okänt",
    PRICE_BUCKETS
  );

  const currentMileageShares = shareBy(
    inventoryVehicles,
    (v) => v.mileageBucket || "Okänt",
    MILEAGE_BUCKETS
  );

  const currentBrandShares = shareBy(inventoryVehicles, (v) => v.brand || "Okänt");

  const targetBrandKeys = Object.entries(targetProfile.brandShares)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([brand]) => brand);

  const priceMixScore = scoreMix(
    currentPriceShares,
    targetProfile.priceShares,
    PRICE_BUCKETS.filter((b) => b !== "Okänt")
  );

  const mileageScore = scoreMix(
    currentMileageShares,
    targetProfile.mileageShares,
    MILEAGE_BUCKETS.filter((b) => b !== "Okänt")
  );

  const brandScore = scoreMix(
    currentBrandShares,
    targetProfile.brandShares,
    targetBrandKeys
  );

  const over90Days = inventoryVehicles.filter((v) => Number(v.daysInStock || 0) > 90).length;
  const over180Days = inventoryVehicles.filter((v) => Number(v.daysInStock || 0) > 180).length;
  const missingAdPrice = inventoryVehicles.filter((v) => !v.adPrice || Number(v.adPrice) <= 0).length;

  const stockRiskScore = Math.max(
    0,
    Math.round(100 - (over90Days / inventoryCount) * 80 - (over180Days / inventoryCount) * 120)
  );

  const dataQualityScore = Math.max(
    0,
    Math.round(100 - (missingAdPrice / inventoryCount) * 100)
  );

  const scores = {
    priceMixScore,
    brandScore,
    mileageScore,
    stockRiskScore,
    dataQualityScore
  };

  const totalScore = Math.round(
    priceMixScore * 0.3 +
      brandScore * 0.2 +
      mileageScore * 0.15 +
      stockRiskScore * 0.25 +
      dataQualityScore * 0.1
  );

  const priceGaps = buildGaps(
    currentPriceShares,
    targetProfile.priceShares,
    "Prisgrupp",
    PRICE_BUCKETS
  );

  const mileageGaps = buildGaps(
    currentMileageShares,
    targetProfile.mileageShares,
    "Miltal",
    MILEAGE_BUCKETS
  );

  const brandGaps = buildBrandGaps(
    currentBrandShares,
    targetProfile.brandShares
  );

  const recommendations = createRecommendations({
    targetMonth,
    priceGaps,
    mileageGaps,
    brandGaps,
    over180Days,
    missingAdPrice
  });

  const riskVehicles = inventoryVehicles
    .filter((v) => Number(v.daysInStock || 0) > 90 || !v.adPrice || Number(v.adPrice) <= 0)
    .map((v) => {
      const days = Number(v.daysInStock || 0);
      let risk = "Medium";
      let action = "Följ upp";

      if (days > 180) {
        risk = "Kritisk";
        action = "Prissätt om";
      } else if (days > 90) {
        risk = "Hög";
        action = "Se över pris";
      }

      if (!v.adPrice || Number(v.adPrice) <= 0) {
        action = "Sätt annonspris";
      }

      return {
        regNumber: v.regNumber || "",
        name: v.rawMakeModel || `${v.brand || ""} ${v.model || ""}`.trim(),
        daysInStock: days,
        risk,
        action
      };
    })
    .sort((a, b) => b.daysInStock - a.daysInStock)
    ;

  const mixChartData = PRICE_BUCKETS.filter((bucket) => bucket !== "Okänt").map(
    (bucket) => ({
      bucket,
      lager: Math.round((currentPriceShares[bucket] || 0) * 100),
      målprofil: Math.round((targetProfile.priceShares[bucket] || 0) * 100)
    })
  );

  const topIssue = recommendations[0];

  const summary = {
    headline: `Lagret får ${totalScore}/100 inför ${MONTHS[targetMonth - 1]}.`,
    body: topIssue
      ? `${topIssue.title}. ${topIssue.description}`
      : "Lagret ligger nära historisk målprofil. Fortsätt följa prisbalans, lagerålder och datakvalitet."
  };

  return {
    totalScore,
    scores,
    scoreExplanation: buildScoreExplanation(scores),
    kpis: {
      inventoryCount: inventoryVehicles.length,
      over90Days,
      over180Days,
      missingAdPrice
    },
    trends: {
      monthlySales: targetProfile.monthlySales
    },
    mixChartData,
    priceGaps,
    mileageGaps,
    brandGaps,
    underrepresented: {
      price: getTopUnderrepresented(priceGaps, 0.08),
      mileage: getTopUnderrepresented(mileageGaps, 0.08),
      brands: getTopUnderrepresented(brandGaps, 0.06)
    },
    overrepresented: {
      price: getTopOverrepresented(priceGaps, 0.08),
      mileage: getTopOverrepresented(mileageGaps, 0.08),
      brands: getTopOverrepresented(brandGaps, 0.06)
    },
    recommendations,
    riskVehicles,
    summary
  };
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) {
      return json({ error: "D1-binding DB saknas." }, 500);
    }

    const body = await request.json();
    const targetMonth = Number(body.targetMonth || 6);
    const vehicles = Array.isArray(body.vehicles) ? body.vehicles : [];

    if (!vehicles.length) {
      return json({ error: "Ingen lagerdata skickades." }, 400);
    }

    const soldVehicles = await getSoldVehicles(env);

    if (!soldVehicles.length) {
      return json(
        {
          error:
            "Ingen historisk sålda-data finns importerad. Gå till Adminimport och importera sålda-filen först."
        },
        400
      );
    }

    const result = analyzeInventory(soldVehicles, vehicles, targetMonth);
    return json(result);
  } catch (error) {
    return json({ error: error.message || "Analysen misslyckades." }, 500);
  }
}
