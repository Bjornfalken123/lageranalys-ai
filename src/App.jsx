import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts";
import {
  AlertTriangle,
  BarChart3,
  Car,
  Clock,
  Database,
  FileUp,
  Home,
  Info,
  Settings,
  Sparkles,
  Star,
  Tag,
  Target,
  TrendingUp,
  Upload
} from "lucide-react";

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

function readExcelRows(file) {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, {
      type: "array",
      cellDates: true
    });

    const firstSheet = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheet];

    return XLSX.utils.sheet_to_json(sheet, {
      defval: ""
    });
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
  if (value === null || value === undefined || value === "") return undefined;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    return Math.round(value);
  }

  const cleaned = String(value)
    .replace(/\s/g, "")
    .replace("kr", "")
    .replace("SEK", "")
    .replace(",", ".")
    .trim();

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed) : undefined;
}

function parseMakeModel(raw) {
  const text = String(raw || "").trim();

  if (!text) {
    return {
      brand: "Okänt",
      model: "Okänt",
      modelYear: undefined
    };
  }

  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  const modelYear = yearMatch ? Number(yearMatch[0]) : undefined;

  const withoutYear = text.replace(/\b(19|20)\d{2}\b/, "").trim();
  const parts = withoutYear.split(" ").filter(Boolean);

  let brand = parts[0] || "Okänt";
  let model = parts.slice(1).join(" ") || "Okänt";

  if (brand.toLowerCase() === "mercedes") {
    brand = "Mercedes-Benz";
    model = parts.slice(2).join(" ") || "Okänt";
  }

  return {
    brand,
    model,
    modelYear
  };
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

function normalizeInventoryRow(row) {
  const rawMakeModel = String(
    getValue(row, ["Märke & Modell", "Märke Modell", "Bil", "Fordonsmodell"]) || ""
  );

  const parsed = parseMakeModel(rawMakeModel);

  const adPrice = parseNumber(
    getValue(row, ["Annonspris ink", "Annonspris inkl", "Annonspris", "Pris"])
  );

  const mileage = parseNumber(getValue(row, ["Mil", "Miltal"]));

  return {
    regNumber: String(
      getValue(row, ["Reg.nummer", "Regnummer", "Registreringsnummer"]) || ""
    ),
    rawMakeModel,
    ...parsed,
    mileage,
    adPrice,
    purchasePrice: parseNumber(getValue(row, ["Inköpspris inkl", "Inköpspris"])),
    productCost: parseNumber(getValue(row, ["Produktkostnad inkl", "Produktkostnad"])),
    estimatedMargin: parseNumber(
      getValue(row, ["Beräknad marginal", "Vinstmarginal exkl", "Marginal"])
    ),
    daysInStock: parseNumber(getValue(row, ["Dagar i lager", "Lagerdagar"])),
    prepDays: parseNumber(getValue(row, ["Dagar iordningställande"])),
    purchaseType: String(getValue(row, ["Inköpssätt"]) || ""),
    source: String(getValue(row, ["Inkom från"]) || ""),
    priceBucket: getPriceBucket(adPrice),
    mileageBucket: getMileageBucket(mileage)
  };
}

function KpiCard({ icon, title, value, subtitle }) {
  return (
    <div className="card kpi-card">
      <div className="icon-circle">{icon}</div>
      <div>
        <div className="kpi-title">{title}</div>
        <div className="kpi-value">{value}</div>
        <div className="kpi-subtitle">{subtitle}</div>
      </div>
    </div>
  );
}

function ScoreBar({ label, value }) {
  return (
    <div className="score-row">
      <div className="score-label">
        <span>{label}</span>
        <strong>{value}/100</strong>
      </div>
      <div className="score-track">
        <div className="score-fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function Sidebar({ activeView, setActiveView }) {
  const items = [
    { id: "overview", label: "Översikt", icon: <Home size={20} /> },
    { id: "trends", label: "Historiska trender", icon: <TrendingUp size={20} /> },
    { id: "analysis", label: "Ny lageranalys", icon: <Upload size={20} /> },
    { id: "risks", label: "Risklager", icon: <AlertTriangle size={20} /> },
    { id: "admin", label: "Adminimport", icon: <Database size={20} /> },
    { id: "settings", label: "Inställningar", icon: <Settings size={20} /> }
  ];

  return (
    <aside className="sidebar">
      <div className="logo">
        <BarChart3 size={28} />
        <span>
          LagerAnalys <strong>AI</strong>
        </span>
      </div>

      <nav className="nav">
        {items.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${activeView === item.id ? "active" : ""}`}
            onClick={() => setActiveView(item.id)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-card">
        <Info size={22} />
        <div>
          <strong>Privat historik</strong>
          <p>Sålda-data ligger i D1 och visas aldrig som rådata i frontend.</p>
        </div>
      </div>
    </aside>
  );
}

function AdminImport({ onImported }) {
  const [adminKey, setAdminKey] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleImport(file) {
    try {
      setLoading(true);
      setStatus("Läser Excel-fil...");

      const rows = await readExcelRows(file);

      setStatus(`Importerar ${rows.length} rader till privat D1-databas...`);

      const response = await fetch("/api/import-sold", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey
        },
        body: JSON.stringify({
          rows
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Import misslyckades.");
      }

      setStatus(`Klart. ${data.imported} sålda bilar importerades.`);
      onImported?.();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-section">
      <div className="card wide-card">
        <div className="section-title">
          <Database size={22} />
          <div>
            <h2>Adminimport av sålda bilar</h2>
            <p>
              Den här importen görs bara av dig. Filen sparas inte publikt och
              skickas inte till vanliga användare.
            </p>
          </div>
        </div>

        <label className="field-label">Adminnyckel</label>
        <input
          className="input"
          type="password"
          placeholder="Skriv ADMIN_KEY från Cloudflare"
          value={adminKey}
          onChange={(e) => setAdminKey(e.target.value)}
        />

        <label className="upload-box">
          <FileUp size={32} />
          <strong>Ladda upp sålda-filen</strong>
          <span>Excel-filen importeras till D1 bakom backend.</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            disabled={loading || !adminKey}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImport(file);
            }}
          />
        </label>

        {status && <div className="status-box">{status}</div>}
      </div>
    </div>
  );
}

function UploadAnalysis({ targetMonth, setTargetMonth, onAnalysis }) {
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleInventoryUpload(file) {
    try {
      setLoading(true);
      setStatus("Läser lagerfil...");

      const rows = await readExcelRows(file);
      const vehicles = rows.map(normalizeInventoryRow);

      setStatus(`Analyserar ${vehicles.length} lagerbilar mot privat historik...`);

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          targetMonth,
          vehicles
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Analysen misslyckades.");
      }

      onAnalysis(data);
      setStatus(`Analys klar. Lagerbetyg: ${data.totalScore}/100`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card upload-panel">
      <div className="section-title">
        <Upload size={22} />
        <div>
          <h2>Ny lageranalys</h2>
          <p>Ladda upp aktuell lagerlista och välj månad att optimera mot.</p>
        </div>
      </div>

      <label className="field-label">Målmånad</label>
      <select
        className="select"
        value={targetMonth}
        onChange={(e) => setTargetMonth(Number(e.target.value))}
      >
        {MONTHS.map((month, index) => (
          <option key={month} value={index + 1}>
            {month}
          </option>
        ))}
      </select>

      <label className="upload-box">
        <FileUp size={32} />
        <strong>Ladda upp lagerlista</strong>
        <span>Excel/CSV. Analysen körs mot privat sålda-historik i backend.</span>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          disabled={loading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleInventoryUpload(file);
          }}
        />
      </label>

      {status && <div className="status-box">{status}</div>}
    </div>
  );
}

function Dashboard({ analysis, targetMonth }) {
  if (!analysis) {
    return (
      <div className="empty-state">
        <Sparkles size={42} />
        <h2>Ingen lageranalys ännu</h2>
        <p>Ladda upp en lagerlista för att skapa första analysen.</p>
      </div>
    );
  }

  const summaryText = analysis.summary || {
    headline: `Lagret får ${analysis.totalScore}/100 inför ${MONTHS[targetMonth - 1]}.`,
    body:
      "Analysen jämför aktuell lagerlista mot historisk försäljning. Fokus ligger på prisbalans, märkesmix, miltal, lagerålder och datakvalitet."
  };

  return (
    <>
      <div className="kpi-grid">
        <KpiCard
          icon={<Star size={22} />}
          title="Lagerbetyg"
          value={`${analysis.totalScore}/100`}
          subtitle="Samlat betyg"
        />
        <KpiCard
          icon={<Car size={22} />}
          title="Bilar i lager"
          value={analysis.kpis.inventoryCount}
          subtitle="Analyserade bilar"
        />
        <KpiCard
          icon={<Clock size={22} />}
          title="Över 180 dagar"
          value={analysis.kpis.over180Days}
          subtitle="Kritisk lagerålder"
        />
        <KpiCard
          icon={<Tag size={22} />}
          title="Saknar annonspris"
          value={analysis.kpis.missingAdPrice}
          subtitle="Påverkar datakvalitet"
        />
      </div>

      <div className="grid-two">
        <div className="card">
          <div className="card-title">
            <Sparkles size={20} />
            AI-sammanfattning
          </div>
          <h3>{summaryText.headline}</h3>
          <p>{summaryText.body}</p>

          <div className="score-bars">
            <ScoreBar label="Prisbalans" value={analysis.scores.priceMixScore} />
            <ScoreBar label="Märkesmix" value={analysis.scores.brandScore} />
            <ScoreBar label="Miltal" value={analysis.scores.mileageScore} />
            <ScoreBar label="Lagerålder" value={analysis.scores.stockRiskScore} />
            <ScoreBar label="Datakvalitet" value={analysis.scores.dataQualityScore} />
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <Target size={20} />
            Inköpsfokus
          </div>

          <div className="recommendation-list">
            {analysis.recommendations.map((rec, index) => (
              <div key={index} className={`recommendation ${rec.priority}`}>
                <strong>{rec.title}</strong>
                <p>{rec.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid-two">
        <div className="card chart-card">
          <div className="card-title">
            <TrendingUp size={20} />
            Historiska trender
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={analysis.trends.monthlySales}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="antal" strokeWidth={3} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card chart-card">
          <div className="card-title">
            <BarChart3 size={20} />
            Mixanalys: lager vs målprofil
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={analysis.mixChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="bucket" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="lager" name="Aktuellt lager" />
              <Bar dataKey="målprofil" name="Historisk målprofil" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid-two">
        <div className="card">
          <div className="card-title">
            <AlertTriangle size={20} />
            Riskbilar
          </div>

          {analysis.riskVehicles.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Bil</th>
                  <th>Dagar</th>
                  <th>Risk</th>
                  <th>Åtgärd</th>
                </tr>
              </thead>
              <tbody>
                {analysis.riskVehicles.map((vehicle, index) => (
                  <tr key={index}>
                    <td>
                      <strong>{vehicle.name}</strong>
                      <span>{vehicle.regNumber}</span>
                    </td>
                    <td>{vehicle.daysInStock}</td>
                    <td>
                      <span className={`badge ${vehicle.risk.toLowerCase()}`}>
                        {vehicle.risk}
                      </span>
                    </td>
                    <td>{vehicle.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>Inga tydliga riskbilar hittades i lagerlistan.</p>
          )}
        </div>

        <div className="card">
          <div className="card-title">
            <Info size={20} />
            Datakvalitet
          </div>
          <div className="data-quality">
            <div className="quality-number">
              {analysis.scores.dataQualityScore}%
            </div>
            <p>
              {analysis.kpis.missingAdPrice} bilar saknar användbart annonspris.
              Detta påverkar marginal- och prisanalysens säkerhet.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export default function App() {
  const [activeView, setActiveView] = useState("overview");
  const [targetMonth, setTargetMonth] = useState(6);
  const [analysis, setAnalysis] = useState(null);
  const [historyStatus, setHistoryStatus] = useState(null);

  async function loadHistoryStatus() {
    try {
      const response = await fetch("/api/trends");
      const data = await response.json();

      if (response.ok) {
        setHistoryStatus(data);
      }
    } catch {
      setHistoryStatus(null);
    }
  }

  useEffect(() => {
    loadHistoryStatus();
  }, []);

  const title = useMemo(() => {
    if (activeView === "admin") return "Adminimport";
    if (activeView === "analysis") return "Ny lageranalys";
    if (activeView === "trends") return "Historiska trender";
    if (activeView === "risks") return "Risklager";
    if (activeView === "settings") return "Inställningar";
    return `Lageranalys inför ${MONTHS[targetMonth - 1].toLowerCase()}`;
  }, [activeView, targetMonth]);

  return (
    <div className="app">
      <Sidebar activeView={activeView} setActiveView={setActiveView} />

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{title}</h1>
            <p>Privat historik i backend. Lagerfil analyseras vid uppladdning.</p>
          </div>

          <div className="topbar-actions">
            <select
              className="select compact"
              value={targetMonth}
              onChange={(e) => setTargetMonth(Number(e.target.value))}
            >
              {MONTHS.map((month, index) => (
                <option key={month} value={index + 1}>
                  {month}
                </option>
              ))}
            </select>

            <button className="primary-button" onClick={() => setActiveView("analysis")}>
              <Upload size={18} />
              Ladda upp lagerlista
            </button>
          </div>
        </header>

        {historyStatus && (
          <div className="history-status">
            <Database size={18} />
            Historisk databas: {historyStatus.totalSold || 0} sålda bilar importerade.
          </div>
        )}

        {activeView === "admin" && <AdminImport onImported={loadHistoryStatus} />}

        {activeView === "analysis" && (
          <UploadAnalysis
            targetMonth={targetMonth}
            setTargetMonth={setTargetMonth}
            onAnalysis={(result) => {
              setAnalysis(result);
              setActiveView("overview");
            }}
          />
        )}

        {activeView !== "admin" && activeView !== "analysis" && (
          <Dashboard analysis={analysis} targetMonth={targetMonth} />
        )}
      </main>
    </div>
  );
}
