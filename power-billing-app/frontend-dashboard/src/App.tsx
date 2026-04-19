import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

type UserRole = "admin" | "customer";

type AuthUser = {
  sub: string;
  username: string;
  role: UserRole;
  customerId: string | null;
};

type Meter = {
  id: string;
  customerId: string;
  serialNumber: string;
  location: string;
  status: string;
  installedAt: string;
};

type Reading = {
  id: string;
  timestamp: string;
  kwh: number;
  voltage: number;
  current: number;
  source: string;
};

type FraudAlert = {
  id: string;
  meterId: string;
  severity: string;
  reason: string;
  detectedAt: string;
};

type Bill = {
  month: string;
  totalKwh: number;
  energyCharge: number;
  fixedCharge: number;
  taxes: number;
  totalAmount: number;
};

type BillHistoryItem = {
  month: string;
  totalKwh: number;
  totalAmount: number;
  dueDate: string;
  pdfUrl: string;
};

type CustomerProfile = {
  customerId: string;
  customerName: string;
  serviceNumber: string;
  address: string;
};

type Overview = {
  month: string;
  totalMeters: number;
  activeMeters: number;
  totalReadings: number;
  totalConsumption: number;
  totalAlerts: number;
};

type FraudInsight = {
  month: string;
  severityBreakdown: Array<{ severity: "medium" | "high"; total: number }>;
  riskyMeters: Array<{ meterId: string; location: string; alertCount: number }>;
};

type TariffSlab = { upto: number | null; rate: number };
type TariffPlan = {
  id?: string;
  name: string;
  slabs: TariffSlab[];
  fixedCharge: number;
  taxRate: number;
  active: boolean;
  updatedAt?: string;
};

type ConsumptionPoint = {
  day: string;
  totalKwh: number;
};

type LoginResponse = {
  token: string;
  user: AuthUser;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
const refreshIntervalMs = Number(import.meta.env.VITE_REFRESH_INTERVAL_MS ?? 600000);
const month = new Date().toISOString().slice(0, 7);
const chartColors = ["#ffb347", "#ff6b6b", "#70d6a8", "#64b5f6"];

const tokenStorageKey = "power-billing-token";
const userStorageKey = "power-billing-user";

const credentials = [
  { username: "admin", password: "admin123", role: "admin" },
  { username: "customer_a", password: "customerA123", role: "customer" },
  { username: "customer_b", password: "customerB123", role: "customer" }
];

const tariffPresets: Array<{ label: string; plan: TariffPlan }> = [
  {
    label: "Domestic Cat I(A) 0-100",
    plan: {
      name: "Domestic Cat-I(A)",
      slabs: [
        { upto: 50, rate: 1.95 },
        { upto: 100, rate: 3.1 }
      ],
      fixedCharge: 10,
      taxRate: 0.05,
      active: true
    }
  },
  {
    label: "Domestic Cat I(B)(ii) >200",
    plan: {
      name: "Domestic Cat-I(B)(ii)",
      slabs: [
        { upto: 200, rate: 5.1 },
        { upto: 300, rate: 7.7 },
        { upto: 400, rate: 9.0 },
        { upto: 800, rate: 9.5 },
        { upto: null, rate: 10.0 }
      ],
      fixedCharge: 50,
      taxRate: 0.05,
      active: true
    }
  }
];

const App = () => {
  const [token, setToken] = useState<string>(() => localStorage.getItem(tokenStorageKey) ?? "");
  const [user, setUser] = useState<AuthUser | null>(() => {
    const value = localStorage.getItem(userStorageKey);
    return value ? (JSON.parse(value) as AuthUser) : null;
  });
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [meters, setMeters] = useState<Meter[]>([]);
  const [selectedMeterId, setSelectedMeterId] = useState<string>("meter-001");
  const [readings, setReadings] = useState<Reading[]>([]);
  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [bill, setBill] = useState<Bill | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [insights, setInsights] = useState<FraudInsight | null>(null);
  const [trend, setTrend] = useState<ConsumptionPoint[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [tariff, setTariff] = useState<TariffPlan | null>(null);
  const [tariffSaving, setTariffSaving] = useState(false);
  const [billHistory, setBillHistory] = useState<BillHistoryItem[]>([]);
  const [meterFilter, setMeterFilter] = useState("");
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);

  const apiFetch = async <T,>(path: string): Promise<T> => {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({ message: "Request failed" }))) as { message?: string };
      throw new Error(payload.message ?? `Request failed with ${response.status}`);
    }

    return response.json() as Promise<T>;
  };

  const loadSharedData = async () => {
    if (!token) return;
    setLoading(true);
    setError("");

    try {
      const [meterPayload, overviewPayload, alertsPayload, insightPayload] = await Promise.all([
        apiFetch<{ items: Meter[] }>("/api/meters"),
        apiFetch<Overview>(`/api/dashboard/overview/${month}`),
        apiFetch<{ items: FraudAlert[] }>("/api/fraud-alerts"),
        apiFetch<FraudInsight>(`/api/dashboard/fraud/${month}`)
      ]);

      setMeters(meterPayload.items);
      setOverview(overviewPayload);
      setAlerts(alertsPayload.items);
      setInsights(insightPayload);

      if (user?.role === "admin") {
        try {
          const tariffPayload = await apiFetch<{ plan: TariffPlan | null }>("/admin/tariff");
          setTariff(tariffPayload.plan);
        } catch {
          setTariff(null);
        }
      }

      if (meterPayload.items.length > 0 && !meterPayload.items.some((meter) => meter.id === selectedMeterId)) {
        setSelectedMeterId(meterPayload.items[0].id);
      }

      setLastUpdated(new Date().toLocaleTimeString());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  const loadMeterData = async () => {
    if (!token || !selectedMeterId) return;

    try {
      const [readingsPayload, billPayload, trendPayload, historyPayload, profilePayload] = await Promise.all([
        apiFetch<{ items: Reading[] }>(`/api/meters/${selectedMeterId}/readings`),
        apiFetch<Bill>(`/api/meters/${selectedMeterId}/bills/${month}`),
        apiFetch<{ items: ConsumptionPoint[] }>(`/api/meters/${selectedMeterId}/consumption/${month}`),
        apiFetch<{ items: BillHistoryItem[] }>(`/api/meters/${selectedMeterId}/bills/history?limit=12`),
        apiFetch<{ profile: CustomerProfile }>(`/api/meters/${selectedMeterId}/customer-profile`)
      ]);

      setReadings(readingsPayload.items.slice(0, 12).reverse());
      setBill(billPayload);
      setTrend(trendPayload.items);
      setBillHistory(historyPayload.items);
      setCustomerProfile(profilePayload.profile);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load meter data");
    }
  };

  const downloadBillPdf = async (forMonth = month): Promise<void> => {
    if (!token || !selectedMeterId) return;

    try {
      const response = await fetch(`${apiBaseUrl}/api/meters/${selectedMeterId}/bills/${forMonth}/pdf`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error(`Failed to download PDF (${response.status})`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Bill-${selectedMeterId}-${forMonth}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Failed to download bill PDF");
    }
  };

  useEffect(() => {
    if (!token) return;
    void loadSharedData();
  }, [token]);

  useEffect(() => {
    if (!token || !selectedMeterId) return;
    void loadMeterData();
  }, [token, selectedMeterId]);

  useEffect(() => {
    if (!token) return;

    const stream = new EventSource(`${apiBaseUrl}/api/stream?token=${encodeURIComponent(token)}`);
    const refresh = () => {
      void loadSharedData();
      void loadMeterData();
    };

    stream.addEventListener("reading.created", refresh);
    stream.addEventListener("fraud.alert", refresh);
    stream.addEventListener("meter.created", refresh);
    stream.onerror = () => setError("Live stream disconnected. Falling back to scheduled refresh.");

    return () => stream.close();
  }, [token, selectedMeterId]);

  useEffect(() => {
    if (!token) return;
    const timer = window.setInterval(() => {
      void loadSharedData();
      void loadMeterData();
    }, refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, [token, selectedMeterId]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    try {
      const response = await fetch(`${apiBaseUrl}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? "Login failed");
      }

      const payload = (await response.json()) as LoginResponse;
      localStorage.setItem(tokenStorageKey, payload.token);
      localStorage.setItem(userStorageKey, JSON.stringify(payload.user));
      setToken(payload.token);
      setUser(payload.user);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed");
    }
  };

  const logout = () => {
    localStorage.removeItem(tokenStorageKey);
    localStorage.removeItem(userStorageKey);
    setToken("");
    setUser(null);
    setTariff(null);
    setMeters([]);
    setAlerts([]);
    setReadings([]);
      setTrend([]);
      setBillHistory([]);
      setCustomerProfile(null);
      setBill(null);
      setOverview(null);
      setInsights(null);
  };

  const riskHeadline = useMemo(() => {
    if (!insights || insights.riskyMeters.length === 0) {
      return "No high-risk meter clusters in the current month.";
    }
    const top = insights.riskyMeters[0];
    return `${top.meterId} at ${top.location} has the highest alert volume with ${top.alertCount} alerts.`;
  }, [insights]);

  const visibleMeters = useMemo(() => {
    const keyword = meterFilter.trim().toLowerCase();
    if (!keyword) return meters;
    return meters.filter((meter) =>
      [meter.id, meter.serialNumber, meter.location, meter.customerId].some((text) => text.toLowerCase().includes(keyword))
    );
  }, [meters, meterFilter]);

  const exportBillHistoryCsv = (): void => {
    if (!selectedMeterId || billHistory.length === 0) return;

    const header = ["Month", "Meter ID", "Customer ID", "Service Number", "Units (kWh)", "Total Amount", "Due Date"];
    const rows = billHistory.map((item) => [
      item.month,
      selectedMeterId,
      customerProfile?.customerId ?? "",
      customerProfile?.serviceNumber ?? "",
      String(item.totalKwh),
      String(item.totalAmount),
      item.dueDate
    ]);

    const toCsvCell = (value: string) => `"${value.replace(/"/g, "\"\"")}"`;
    const csv = [header, ...rows].map((row) => row.map((cell) => toCsvCell(cell)).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Bill-History-${selectedMeterId}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  if (!token || !user) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <p className="eyebrow">Smart Energy Access</p>
          <h1>Sign in to Power Billing</h1>
          <p className="subtitle">Use one of the seeded demo accounts to test roles and dashboards.</p>
          <form onSubmit={handleLogin} className="login-form">
            <label>
              Username
              <input value={username} onChange={(event) => setUsername(event.target.value)} />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <button type="submit">Sign in</button>
          </form>
          <div className="credential-grid">
            {credentials.map((credential) => (
              <button
                key={credential.username}
                className="credential-card"
                onClick={() => {
                  setUsername(credential.username);
                  setPassword(credential.password);
                }}
              >
                <strong>{credential.role}</strong>
                <span>{credential.username}</span>
                <small>{credential.password}</small>
              </button>
            ))}
          </div>
          {error ? <div className="error-box">{error}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Smart Energy Operations</p>
          <h1>Power Billing Command Center</h1>
          <p className="subtitle">Live meter usage, bill tracking, fraud analytics, and role-aware operations in one dashboard.</p>
        </div>
        <div className="top-actions">
          <div className="month-chip">Role {user.role}</div>
          <div className="month-chip">Last update {lastUpdated || "waiting"}</div>
          <button className="secondary-button" onClick={() => { void loadSharedData(); void loadMeterData(); }}>Refresh now</button>
          <button className="secondary-button" onClick={logout}>Logout</button>
        </div>
      </header>

      {error ? <div className="error-box">{error}</div> : null}

      <section className="stats-grid">
        <article className="stat-card accent-a"><span>Total meters</span><strong>{overview?.totalMeters ?? 0}</strong></article>
        <article className="stat-card accent-b"><span>Active meters</span><strong>{overview?.activeMeters ?? 0}</strong></article>
        <article className="stat-card accent-c"><span>Consumption this month</span><strong>{overview?.totalConsumption ?? 0} kWh</strong></article>
        <article className="stat-card accent-d"><span>Fraud alerts</span><strong>{overview?.totalAlerts ?? 0}</strong></article>
      </section>

      <section className="content-grid tall-grid">
        <article className="panel">
          <div className="panel-header">
            <h2>Meter operations</h2>
            <select value={selectedMeterId} onChange={(event) => setSelectedMeterId(event.target.value)}>
              {meters.map((meter) => (
                <option key={meter.id} value={meter.id}>{meter.id}</option>
              ))}
            </select>
          </div>
          <input
            className="meter-filter"
            placeholder="Search meter by id, serial, location, customer..."
            value={meterFilter}
            onChange={(event) => setMeterFilter(event.target.value)}
          />
          <div className="meter-list">
            {visibleMeters.map((meter) => (
              <button key={meter.id} className={`meter-row ${selectedMeterId === meter.id ? "selected" : ""}`} onClick={() => setSelectedMeterId(meter.id)}>
                <strong>{meter.id}</strong>
                <span>{meter.location}</span>
                <small>{meter.serialNumber} | {meter.status}</small>
              </button>
            ))}
            {meters.length === 0 ? <p className="empty-copy">No meters found. Start the backend seed data or create a meter.</p> : null}
          </div>
        </article>

        <article className="panel bill-panel">
          <div className="panel-header">
            <h2>Monthly bill</h2>
            <span className="pill">{month}</span>
          </div>
          <div className="profile-card">
            <p className="profile-title">Customer Profile</p>
            <strong>{customerProfile?.customerName ?? "N/A"}</strong>
            <p>Service No: {customerProfile?.serviceNumber ?? "N/A"}</p>
            <p>Customer ID: {customerProfile?.customerId ?? "N/A"}</p>
            <small>{customerProfile?.address ?? "Address not available"}</small>
          </div>
          {bill ? (
            <div className="bill-stack">
              <div><span>Total usage</span><strong>{bill.totalKwh} kWh</strong></div>
              <div><span>Energy charge</span><strong>{bill.energyCharge}</strong></div>
              <div><span>Fixed charge</span><strong>{bill.fixedCharge}</strong></div>
              <div><span>Taxes</span><strong>{bill.taxes}</strong></div>
              <div className="bill-total"><span>Total</span><strong>{bill.totalAmount}</strong></div>
            </div>
          ) : <p className="empty-copy">Bill data will appear once readings are available.</p>}
          <div style={{ marginTop: "12px" }}>
            <button className="secondary-button" onClick={() => void downloadBillPdf()}>Download PDF Bill</button>
          </div>
          <div className="bill-history">
            <div className="panel-header">
              <h2>Bill history</h2>
              <span className="pill">Last 12 months</span>
            </div>
            <div style={{ marginBottom: "12px" }}>
              <button className="secondary-button" onClick={exportBillHistoryCsv} disabled={billHistory.length === 0}>
                Export CSV
              </button>
            </div>
            {billHistory.length === 0 ? (
              <p className="empty-copy">No historical bills yet for this meter.</p>
            ) : (
              <div className="history-list">
                {billHistory.map((item) => (
                  <div key={item.month} className="history-row">
                    <div>
                      <strong>{item.month}</strong>
                      <p>{item.totalKwh} kWh | Total {item.totalAmount}</p>
                      <small>Due {item.dueDate}</small>
                    </div>
                    <button className="secondary-button" onClick={() => void downloadBillPdf(item.month)}>
                      PDF
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </article>

        <article className="panel analytics-panel">
          <div className="panel-header">
            <h2>Fraud intelligence</h2>
            <span className="pill">Real-time + 10 min fallback</span>
          </div>
          <p className="narrative-copy">{riskHeadline}</p>
          <div className="chart-card">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={insights?.severityBreakdown ?? []} dataKey="total" nameKey="severity" outerRadius={90} innerRadius={48}>
                  {(insights?.severityBreakdown ?? []).map((entry, index) => (
                    <Cell key={entry.severity} fill={chartColors[index % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>

      {user.role === "admin" && (
        <section className="panel">
          <div className="panel-header">
            <h2>Tariff editor (admin)</h2>
            <span className="pill">Active plan</span>
          </div>
          <div className="tariff-grid">
            <label className="tariff-field">
              Name
              <input
                value={tariff?.name ?? ""}
                onChange={(e) => setTariff((t) => ({ ...(t ?? { name: "", slabs: [], fixedCharge: 0, taxRate: 0, active: true }), name: e.target.value }))}
              />
            </label>
            <label className="tariff-field">
              Fixed charge
              <input
                type="number"
                value={tariff?.fixedCharge ?? 0}
                onChange={(e) => setTariff((t) => ({ ...(t ?? { name: "", slabs: [], fixedCharge: 0, taxRate: 0, active: true }), fixedCharge: Number(e.target.value) }))}
              />
            </label>
            <label className="tariff-field">
              Tax rate (e.g. 0.05)
              <input
                type="number"
                step="0.01"
                value={tariff?.taxRate ?? 0}
                onChange={(e) => setTariff((t) => ({ ...(t ?? { name: "", slabs: [], fixedCharge: 0, taxRate: 0, active: true }), taxRate: Number(e.target.value) }))}
              />
            </label>
          </div>
          <div className="slab-list">
            {(tariff?.slabs ?? []).map((slab, idx) => (
              <div key={idx} className="slab-row">
                <label>
                  Upto (null = no cap)
                  <input
                    type="number"
                    value={slab.upto ?? ""}
                    placeholder="null"
                    onChange={(e) => {
                      const value = e.target.value === "" ? null : Number(e.target.value);
                      setTariff((t) => {
                        if (!t) return null;
                        const slabs = [...t.slabs];
                        slabs[idx] = { ...slabs[idx], upto: value };
                        return { ...t, slabs };
                      });
                    }}
                  />
                </label>
                <label>
                  Rate (per kWh)
                  <input
                    type="number"
                    step="0.01"
                    value={slab.rate}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      setTariff((t) => {
                        if (!t) return null;
                        const slabs = [...t.slabs];
                        slabs[idx] = { ...slabs[idx], rate: value };
                        return { ...t, slabs };
                      });
                    }}
                  />
                </label>
                <button
                  className="secondary-button"
                  onClick={() =>
                    setTariff((t) => {
                      if (!t) return null;
                      const slabs = t.slabs.filter((_, sIdx) => sIdx !== idx);
                      return { ...t, slabs };
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              className="secondary-button"
              onClick={() =>
                setTariff((t) => {
                  const base = t ?? { name: "", slabs: [], fixedCharge: 0, taxRate: 0, active: true };
                  return { ...base, slabs: [...base.slabs, { upto: null, rate: 0 }] };
                })
              }
            >
              Add slab
            </button>
          </div>
          <div className="tariff-actions">
            <div className="preset-buttons">
              {tariffPresets.map((preset) => (
                <button key={preset.label} className="secondary-button" onClick={() => setTariff({ ...preset.plan })}>
                  Use preset: {preset.label}
                </button>
              ))}
            </div>
            <button
              className="secondary-button"
              disabled={tariffSaving || !tariff}
              onClick={async () => {
                if (!tariff) return;
                setTariffSaving(true);
                setError("");
                try {
                  const response = await fetch(`${apiBaseUrl}/admin/tariff`, {
                    method: "POST",
                    headers: {
                      "content-type": "application/json",
                      Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                      name: tariff.name,
                      fixedCharge: tariff.fixedCharge,
                      taxRate: tariff.taxRate,
                      slabs: tariff.slabs
                    })
                  });
                  if (!response.ok) {
                    const payload = await response.json().catch(() => ({}));
                    throw new Error((payload as { message?: string }).message ?? "Failed to save tariff");
                  }
                  const payload = (await response.json()) as { plan: TariffPlan };
                  setTariff(payload.plan);
                } catch (saveError) {
                  setError(saveError instanceof Error ? saveError.message : "Failed to save tariff");
                } finally {
                  setTariffSaving(false);
                }
              }}
            >
              {tariffSaving ? "Saving..." : "Save tariff"}
            </button>
          </div>
        </section>
      )}

      <section className="content-grid tall-grid">
        <article className="panel">
          <div className="panel-header">
            <h2>Consumption trend</h2>
            <span className="pill">{selectedMeterId}</span>
          </div>
          <div className="chart-card">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="day" stroke="#c8d7e3" />
                <YAxis stroke="#c8d7e3" />
                <Tooltip />
                <Line type="monotone" dataKey="totalKwh" stroke="#ffc26b" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>Risky meters</h2>
            <span className="pill">Top 5</span>
          </div>
          <div className="chart-card">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={insights?.riskyMeters ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="meterId" stroke="#c8d7e3" />
                <YAxis stroke="#c8d7e3" />
                <Tooltip />
                <Bar dataKey="alertCount" fill="#ff7f50" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>

      <section className="content-grid">
        <article className="panel">
          <div className="panel-header">
            <h2>Recent readings</h2>
            {loading ? <span className="pill">Updating...</span> : <span className="pill">Live feed</span>}
          </div>
          <div className="reading-bars">
            {readings.length === 0 ? <p className="empty-copy">No readings yet. Start the simulator to see live data.</p> : readings.map((reading) => (
              <div key={reading.id} className="reading-row">
                <div>
                  <strong>{new Date(reading.timestamp).toLocaleString()}</strong>
                  <p>{reading.voltage}V | {reading.current}A | {reading.source}</p>
                </div>
                <div className="bar-wrap">
                  <div className="bar-fill" style={{ width: `${Math.min(reading.kwh * 4, 100)}%` }} />
                </div>
                <span>{reading.kwh} kWh</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>Fraud alerts</h2>
            <span className="pill">{user.role === "customer" ? "Your meters" : "All meters"}</span>
          </div>
          <div className="alert-list">
            {alerts.length === 0 ? <p className="empty-copy">No alerts yet.</p> : alerts.slice(0, 10).map((alert) => (
              <div key={alert.id} className={`alert-row ${alert.severity}`}>
                <strong>{alert.severity.toUpperCase()} | {alert.meterId}</strong>
                <p>{alert.reason}</p>
                <small>{new Date(alert.detectedAt).toLocaleString()}</small>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
};

export default App;
