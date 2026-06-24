import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Download,
  Gauge,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  RefreshCw,
  Settings,
  TrainFront,
  X,
  Wifi,
  WifiOff
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import "./styles.css";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const PRESSURE_TABLE = import.meta.env.VITE_PRESSURE_TABLE || "bpc_pressure";
const DEVICE_TABLE = import.meta.env.VITE_DEVICE_TABLE || "coaches_railway";
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || "admin123";
const OFFLINE_AFTER_SECONDS = Number(import.meta.env.VITE_OFFLINE_AFTER_SECONDS || 120);
const TRAIN_RUNNING_AFTER_SECONDS = Number(import.meta.env.VITE_TRAIN_RUNNING_AFTER_SECONDS || 120);

const supabase =
  SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const fieldAliases = {
  id: ["id", "record_id"],
  technicalId: ["technical_id", "technicalId"],
  deviceId: ["device_id", "deviceId", "device"],
  actualId: ["Actual_id", "actual_id", "actualId"],
  wagonId: ["wagon_id", "wagonId", "wagon", "coach", "coach_no", "coach_id"],
  trainNo: ["train_no", "Train_no", "train_number", "trainNo", "train"],
  bp: ["bp", "BP", "brake_pipe", "brakePipe"],
  fp: ["fp", "FP", "feed_pipe", "feedPipe"],
  cr: ["cr", "CR", "control_reservoir", "controlReservoir"],
  bc: ["bc", "BC", "brake_cylinder", "brakeCylinder"],
  timestamp: ["created_at", "timestamp", "time", "reading_time", "inserted_at"],
  location: ["location", "Location", "station", "current_location"],
  brakeStatus: ["brake_status", "status"],
  brakeFault: ["brake_fault", "fault", "fault_type"],
  brakeDuration: ["brake_duration", "duration"],
  brakeAppliedTime: ["brake_applied_time", "applied_time"],
  brakeReleasedTime: ["brake_released_time", "released_time"]
};

function readField(row, key, fallback = "") {
  const aliases = fieldAliases[key] || [key];
  const found = aliases.find((name) => row?.[name] !== undefined && row?.[name] !== null);
  return found ? row[found] : fallback;
}

function numberField(row, key) {
  const value = readField(row, key, 0);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedDevice(row) {
  return {
    id: readField(row, "id", crypto.randomUUID()),
    technicalId: readField(row, "technicalId", ""),
    deviceId: readField(row, "deviceId", ""),
    actualId: readField(row, "actualId", ""),
    wagonId: readField(row, "wagonId", ""),
    trainNo: readField(row, "trainNo", ""),
    location: readField(row, "location", "")
  };
}

function normalized(row, deviceMeta = null) {
  return {
    source: row,
    id: readField(row, "id", crypto.randomUUID()),
    deviceId: readField(row, "deviceId", "Unknown device"),
    actualId: readField(row, "actualId", deviceMeta?.actualId || ""),
    wagonId: readField(row, "wagonId", deviceMeta?.wagonId || "Wagon 1"),
    trainNo: readField(row, "trainNo", deviceMeta?.trainNo || "-"),
    bp: numberField(row, "bp"),
    fp: numberField(row, "fp"),
    cr: numberField(row, "cr"),
    bc: numberField(row, "bc"),
    timestamp: readField(row, "timestamp", new Date().toISOString()),
    location: readField(row, "location", deviceMeta?.location || "-"),
    brakeStatus: readField(row, "brakeStatus", ""),
    brakeFault: readField(row, "brakeFault", ""),
    brakeDuration: readField(row, "brakeDuration", ""),
    brakeAppliedTime: readField(row, "brakeAppliedTime", ""),
    brakeReleasedTime: readField(row, "brakeReleasedTime", "")
  };
}

function displayDevice(row) {
  return row?.actualId || row?.deviceId || "Unknown device";
}

function near(value, target, tolerance = 0.15) {
  return Math.abs(Number(value) - target) <= tolerance;
}

function getBrakeState(row) {
  const fault = String(row.brakeFault || "").trim();
  if (fault && fault.toLowerCase() !== "null") {
    const critical = /over|defect|fault|critical/i.test(fault);
    return { label: fault, tone: critical ? "critical" : "applied", severity: critical ? "Critical" : "Warning" };
  }
  const suppliedStatus = String(row.brakeStatus || "").trim();
  if (suppliedStatus && !/system progress/i.test(suppliedStatus)) {
    return { label: suppliedStatus, tone: "monitoring", severity: "Information" };
  }
  const { bp, fp, cr, bc } = row;
  if (near(bp, 0) && near(fp, 0) && near(cr, 0) && near(bc, 0)) {
    return { label: "Device Off", tone: "offline", severity: "Warning" };
  }
  if (cr > 5.05) {
    return { label: "CR Overcharge / Heating", tone: "critical", severity: "Critical" };
  }
  if (near(bp, 0, 0.25) && near(fp, 6, 0.25) && near(cr, 5, 0.25) && bc >= 2.8) {
    return { label: "Brake Applied", tone: "applied", severity: "Information" };
  }
  if (near(bp, 5, 0.35) && near(fp, 6, 0.35) && near(cr, 5, 0.35) && bc <= 0.5) {
    return { label: "Brake Released", tone: "released", severity: "Information" };
  }
  if (near(bp, 5, 0.35) && near(fp, 6, 0.35) && near(cr, 5, 0.35) && near(bc, 0, 0.25)) {
    return { label: "Idle", tone: "idle", severity: "Normal" };
  }
  return { label: "Monitoring", tone: "monitoring", severity: "Normal" };
}

function parseDashboardTime(value) {
  if (!value) return new Date(Number.NaN);
  const text = String(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})/);
  if (match) {
    const [, year, month, day, hour, minute, second] = match.map(Number);
    return new Date(Date.UTC(year, month - 1, day, hour - 5, minute - 30, second));
  }
  return new Date(value);
}

const istFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

const istTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

function formatTime(value) {
  const date = parseDashboardTime(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${istTimeFormatter.format(date)} IST`;
}

function formatDateTime(value) {
  const date = parseDashboardTime(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${istFormatter.format(date)} IST`;
}

function displayTimeValue(value) {
  if (value === undefined || value === null || value === "" || Number(value) === 0) return "-";
  return String(value);
}

function secondsSince(value) {
  const date = parseDashboardTime(value);
  if (Number.isNaN(date.getTime())) return Infinity;
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
}

function relativeSeenText(ageSeconds) {
  if (!Number.isFinite(ageSeconds)) return "No readings";
  if (ageSeconds <= 0) return "Just now";
  if (ageSeconds < 60) return `${ageSeconds} sec ago`;
  const minutes = Math.floor(ageSeconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr ago`;
}

function exportCsv(rows) {
  const headers = ["Time", "Train", "Wagon", "Device", "BP", "FP", "CR", "BC", "Status", "Location"];
  const lines = rows.map((row) => [
    formatDateTime(row.timestamp),
    row.trainNo,
    row.wagonId,
    row.deviceId,
    row.bp,
    row.fp,
    row.cr,
    row.bc,
    getBrakeState(row).label,
    row.location
  ]);
  const csv = [headers, ...lines]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `smart-wagons-report-${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function Login({ onLogin }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function submit(event) {
    event.preventDefault();
    if (password === ADMIN_PASSWORD) {
      localStorage.setItem("smartWagonsLoggedIn", "true");
      onLogin();
      return;
    }
    setError("Incorrect admin password");
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-mark">SW</div>
        <h1>Smart Wagons</h1>
        <p>Brake binding monitoring dashboard</p>
        <label>
          Admin password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter password"
          />
        </label>
        {error ? <span className="error-text">{error}</span> : null}
        <button type="submit">
          <Lock size={18} />
          Login
        </button>
      </form>
    </main>
  );
}

function PressureGauge({ label, sublabel, value, color, max = 10 }) {
  const percentage = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <section className="gauge-card">
      <div className="gauge-head">
        <span style={{ background: color }}>
          <Gauge size={18} />
        </span>
        <div>
          <h3>{label}</h3>
          <p>{sublabel}</p>
        </div>
      </div>
      <div
        className="gauge-ring"
        style={{ "--gauge-color": color, "--gauge-sweep": `${percentage / 2}%` }}
      >
        <div>
          <strong>{value.toFixed(2)}</strong>
          <small>kg/cm2</small>
        </div>
      </div>
      <div className="gauge-scale">
        <span>0</span>
        <span>{max}</span>
      </div>
    </section>
  );
}

function Metric({ label, value, detail }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function RecordsTable({ rows, compact = false }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Time</th>
            {!compact ? <th>Device</th> : null}
            <th>Wagon</th>
            <th>BP</th>
            <th>FP</th>
            <th>CR</th>
            <th>BC</th>
            <th>Duration</th>
            <th>Applied</th>
            <th>Released</th>
            <th>Brake Status</th>
            <th>Fault</th>
            <th>Location</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, compact ? 25 : 80).map((row, index) => {
            const rowStatus = getBrakeState(row);
            return (
              <tr key={`${row.id}-${index}`}>
                <td>{index + 1}</td>
                <td>{formatDateTime(row.timestamp)}</td>
                {!compact ? <td>{displayDevice(row)}</td> : null}
                <td>{row.wagonId}</td>
                <td>{row.bp.toFixed(2)}</td>
                <td>{row.fp.toFixed(2)}</td>
                <td>{row.cr.toFixed(2)}</td>
                <td>{row.bc.toFixed(2)}</td>
                <td>{displayTimeValue(row.brakeDuration)}</td>
                <td>{displayTimeValue(row.brakeAppliedTime)}</td>
                <td>{displayTimeValue(row.brakeReleasedTime)}</td>
                <td><span className={`badge ${rowStatus.tone}`}>{rowStatus.label}</span></td>
                <td>{displayTimeValue(row.brakeFault)}</td>
                <td>{row.location}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DeviceMasterTable({ devicesMeta }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Actual ID</th>
            <th>Internal Device</th>
            <th>Technical ID</th>
            <th>Wagon No.</th>
            <th>Train No.</th>
            <th>Location</th>
          </tr>
        </thead>
        <tbody>
          {devicesMeta.map((device, index) => (
            <tr key={device.id || device.deviceId || index}>
              <td>{index + 1}</td>
              <td>{device.actualId || "-"}</td>
              <td>{device.deviceId || "-"}</td>
              <td>{device.technicalId || "-"}</td>
              <td>{device.wagonId || "-"}</td>
              <td>{device.trainNo || "-"}</td>
              <td>{device.location || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrainStatusTable({ statuses, compact = false }) {
  return (
    <div className="table-wrap">
      <table className="train-status-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Train No.</th>
            <th>Actual ID</th>
            <th>Device</th>
            <th>Wagon</th>
            <th>Location</th>
            <th>Running Status</th>
            <th>Last Active</th>
            {!compact ? <th>Brake / Fault</th> : null}
          </tr>
        </thead>
        <tbody>
          {statuses.map((item, index) => (
            <tr key={item.deviceId || item.actualId || index}>
              <td>{index + 1}</td>
              <td>{item.trainNo || "-"}</td>
              <td>{item.actualId || "-"}</td>
              <td>{item.deviceId || "-"}</td>
              <td>{item.wagonId || "-"}</td>
              <td>{item.location || "-"}</td>
              <td>
                <span className={`run-badge ${item.running ? "running" : "stopped"}`}>
                  <i />
                  {item.running ? "Running" : "Not Running"}
                </span>
              </td>
              <td>
                <strong className="last-active-time">{item.latestRow ? formatDateTime(item.latestRow.timestamp) : "-"}</strong>
                <small>{relativeSeenText(item.ageSeconds)}</small>
              </td>
              {!compact ? (
                <td>
                  <span className={`badge ${item.brakeState.tone}`}>{item.brakeState.label}</span>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function App() {
  const [loggedIn, setLoggedIn] = useState(localStorage.getItem("smartWagonsLoggedIn") === "true");
  const [activePage, setActivePage] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [devicesMeta, setDevicesMeta] = useState([]);
  const [rows, setRows] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(localStorage.getItem("smartWagonsDevice") || "");
  const [selectedWagon, setSelectedWagon] = useState(localStorage.getItem("smartWagonsSelected") || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState(null);

  async function loadRows() {
    if (!supabase) return;
    setLoading(true);
    const devicesResult = await supabase.from(DEVICE_TABLE).select("*").order("id", { ascending: true });
    const deviceList = devicesResult.error ? [] : (devicesResult.data || []).map(normalizedDevice);
    const metaByDevice = new Map(deviceList.map((device) => [device.deviceId, device]));

    let result = await supabase.from(PRESSURE_TABLE).select("*").order("timestamp", { ascending: false }).limit(500);
    if (result.error) {
      result = await supabase.from(PRESSURE_TABLE).select("*").order("created_at", { ascending: false }).limit(500);
    }
    if (result.error) {
      result = await supabase.from(PRESSURE_TABLE).select("*").order("id", { ascending: false }).limit(500);
    }
    const { data, error: fetchError } = result;
    if (fetchError) {
      setError(fetchError.message);
      setRows([]);
    } else {
      setError("");
      setDevicesMeta(deviceList);
      setRows((data || []).map((row) => {
        const readingDevice = readField(row, "deviceId", "");
        return normalized(row, metaByDevice.get(readingDevice));
      }));
      setLastRefresh(new Date());
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!loggedIn) return undefined;
    loadRows();
    const interval = window.setInterval(loadRows, 1000);
    return () => window.clearInterval(interval);
  }, [loggedIn]);

  useEffect(() => {
    if (!supabase || !loggedIn) return undefined;
    const channel = supabase
      .channel(`live-${PRESSURE_TABLE}`)
      .on("postgres_changes", { event: "*", schema: "public", table: PRESSURE_TABLE }, loadRows)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loggedIn]);

  const devices = useMemo(() => {
    const fromMaster = devicesMeta.map((row) => row.actualId || row.deviceId).filter(Boolean);
    const fromReadings = rows.map((row) => displayDevice(row)).filter(Boolean);
    return [...new Set([...fromMaster, ...fromReadings])].sort();
  }, [devicesMeta, rows]);

  useEffect(() => {
    if (!selectedDevice && devices.length) {
      setSelectedDevice(devices[0]);
      localStorage.setItem("smartWagonsDevice", devices[0]);
    }
  }, [devices, selectedDevice]);

  const deviceRows = useMemo(() => {
    if (!selectedDevice) return rows;
    const selectedMeta = devicesMeta.find((device) => (device.actualId || device.deviceId) === selectedDevice);
    if (selectedMeta?.deviceId) {
      return rows.filter((row) => row.deviceId === selectedMeta.deviceId);
    }
    return rows.filter((row) => displayDevice(row) === selectedDevice);
  }, [rows, selectedDevice]);

  const wagons = useMemo(() => {
    return [...new Set(deviceRows.map((row) => row.wagonId).filter(Boolean))].sort();
  }, [deviceRows]);

  useEffect(() => {
    if (wagons.length && !wagons.includes(selectedWagon)) {
      setSelectedWagon(wagons[0]);
      localStorage.setItem("smartWagonsSelected", wagons[0]);
    }
  }, [wagons, selectedWagon]);

  const wagonRows = useMemo(() => {
    const filtered = selectedWagon ? deviceRows.filter((row) => row.wagonId === selectedWagon) : deviceRows;
    return filtered.sort((a, b) => parseDashboardTime(b.timestamp) - parseDashboardTime(a.timestamp));
  }, [deviceRows, selectedWagon]);

  const latest = wagonRows[0] || null;
  const status = latest ? getBrakeState(latest) : { label: "No Data", tone: "offline", severity: "Warning" };
  const offline = !latest || secondsSince(latest.timestamp) > OFFLINE_AFTER_SECONDS;
  const alerts = wagonRows.filter((row) => {
    const rowStatus = getBrakeState(row);
    return ["critical", "offline"].includes(rowStatus.tone) || Boolean(String(row.brakeFault || "").trim());
  });
  const allRows = useMemo(() => {
    return [...rows].sort((a, b) => parseDashboardTime(b.timestamp) - parseDashboardTime(a.timestamp));
  }, [rows]);
  const latestByDevice = useMemo(() => {
    const map = new Map();
    allRows.forEach((row) => {
      if (!row.deviceId) return;
      const existing = map.get(row.deviceId);
      if (!existing || parseDashboardTime(row.timestamp) > parseDashboardTime(existing.timestamp)) {
        map.set(row.deviceId, row);
      }
    });
    return map;
  }, [allRows]);
  const trainStatuses = useMemo(() => {
    const masterDevices = devicesMeta.length
      ? devicesMeta
      : [...new Set(allRows.map((row) => row.deviceId).filter(Boolean))].map((deviceId) => ({ deviceId }));
    return masterDevices
      .map((device) => {
        const latestRow = latestByDevice.get(device.deviceId);
        const ageSeconds = latestRow ? secondsSince(latestRow.timestamp) : Infinity;
        return {
          ...device,
          latestRow,
          ageSeconds,
          running: Boolean(latestRow) && ageSeconds <= TRAIN_RUNNING_AFTER_SECONDS,
          brakeState: latestRow ? getBrakeState(latestRow) : { label: "No Readings", tone: "offline", severity: "Warning" },
          trainNo: device.trainNo || latestRow?.trainNo || "-",
          wagonId: device.wagonId || latestRow?.wagonId || "-",
          location: device.location || latestRow?.location || "-"
        };
      })
      .sort((a, b) => {
        if (a.running !== b.running) return a.running ? -1 : 1;
        return String(a.trainNo || "").localeCompare(String(b.trainNo || ""));
      });
  }, [allRows, devicesMeta, latestByDevice]);
  const runningTrains = trainStatuses.filter((item) => item.running);
  const stoppedTrains = trainStatuses.filter((item) => !item.running);
  const faultRows = useMemo(() => {
    return allRows.filter((row) => {
      const fault = String(row.brakeFault || "").trim();
      return fault && fault.toLowerCase() !== "null";
    });
  }, [allRows]);
  const chartData = [...wagonRows]
    .slice(0, 40)
    .reverse()
    .map((row) => ({
      time: formatTime(row.timestamp),
      BP: row.bp,
      FP: row.fp,
      CR: row.cr,
      BC: row.bc
    }));

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "realtime", label: "Real-time Monitor", icon: BarChart3 },
    { id: "timeline", label: "Event History", icon: TrainFront },
    { id: "alerts", label: "Faults & Alerts", icon: AlertTriangle },
    { id: "reports", label: "Reports", icon: Download },
    { id: "wagons", label: "Wagon Management", icon: TrainFront },
    { id: "settings", label: "System Settings", icon: Settings }
  ];

  if (!loggedIn) return <Login onLogin={() => setLoggedIn(true)} />;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-brand-row">
          <button
            className="menu-toggle"
            onClick={() => setMenuOpen(true)}
            type="button"
            aria-label="Open navigation"
          >
            <Menu size={22} />
          </button>
          <div className="brand">
            <div className="brand-mark">SW</div>
            <div>
              <strong>Smart Wagons</strong>
              <span>Brake Monitoring</span>
            </div>
          </div>
        </div>
        <div className="controls">
          <label>
            Select Device
            <select
              value={selectedDevice}
              onChange={(event) => {
                setSelectedDevice(event.target.value);
                setSelectedWagon("");
                localStorage.setItem("smartWagonsDevice", event.target.value);
              }}
            >
              {devices.length ? devices.map((device) => <option key={device}>{device}</option>) : <option>No devices</option>}
            </select>
          </label>
          <button className="icon-button" onClick={loadRows} title="Refresh data">
            <RefreshCw size={18} className={loading ? "spin" : ""} />
          </button>
          <div className={`live-pill ${offline ? "offline" : "online"}`}>
            {offline ? <WifiOff size={18} /> : <Wifi size={18} />}
            <div>
              <strong>{offline ? "Sensor Offline" : "Live Data"}</strong>
              <span>{latest ? `Last updated ${formatTime(latest.timestamp)}` : "No readings"}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="app-body">
        <button
          className={`drawer-backdrop ${menuOpen ? "show" : ""}`}
          onClick={() => setMenuOpen(false)}
          type="button"
          aria-label="Close navigation"
        />
        <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
          <div className="sidebar-head">
            <strong>Menu</strong>
            <button onClick={() => setMenuOpen(false)} type="button" aria-label="Close navigation">
              <X size={20} />
            </button>
          </div>
          <nav>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={activePage === item.id ? "active" : ""}
                  onClick={() => {
                    setActivePage(item.id);
                    setMenuOpen(false);
                  }}
                  type="button"
                >
                  <Icon size={18} />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="device-box">
            <h3>Device Information</h3>
            <dl>
              <div><dt>Device ID</dt><dd>{latest?.deviceId || "-"}</dd></div>
              <div><dt>Actual ID</dt><dd>{latest?.actualId || "-"}</dd></div>
              <div><dt>Wagon ID</dt><dd>{latest?.wagonId || selectedWagon || "-"}</dd></div>
              <div><dt>Train No.</dt><dd>{latest?.trainNo || "-"}</dd></div>
              <div><dt>Location</dt><dd>{latest?.location || "-"}</dd></div>
              <div><dt>Connection Status</dt><dd className={offline ? "danger" : "success"}>{offline ? "Offline" : "Online"}</dd></div>
            </dl>
          </div>
          <button
            className="logout"
            onClick={() => {
              localStorage.removeItem("smartWagonsLoggedIn");
              setLoggedIn(false);
            }}
          >
            <LogOut size={17} />
            Logout
          </button>
        </aside>

        <main className="content">
          {error ? (
            <section className="setup-alert">
              <strong>Supabase read connection needs attention</strong>
              <span>{error}</span>
              <small>Dashboard reads only from {PRESSURE_TABLE} and {DEVICE_TABLE}. It does not write or change Supabase.</small>
            </section>
          ) : null}

          {activePage === "dashboard" ? (
            <>
          <section className="grid main-grid">
            <div className="panel pressure-panel">
              <div className="panel-head">
                <h2>Live Pressure Monitoring</h2>
                <span>Calibrated</span>
              </div>
              <div className="gauges">
                <PressureGauge label="BP" sublabel="Brake Pipe" value={latest?.bp || 0} color="#1769e0" />
                <PressureGauge label="FP" sublabel="Feed Pipe" value={latest?.fp || 0} color="#18a66a" />
                <PressureGauge label="CR" sublabel="Control Reservoir" value={latest?.cr || 0} color="#f2b705" />
                <PressureGauge label="BC" sublabel="Brake Cylinder" value={latest?.bc || 0} color="#ef4444" />
              </div>
            </div>

            <div className={`panel brake-status ${status.tone}`}>
              <div className="panel-head">
                <h2>Brake Status</h2>
                <span>{selectedWagon || "Selected wagon"}</span>
              </div>
              <div className="status-banner">{offline ? "Sensor Offline" : status.label}</div>
              <div className="status-details">
                <Metric label="Brake Duration" value={displayTimeValue(latest?.brakeDuration) || (latest ? secondsSince(latest.timestamp) : "-")} detail="sec" />
                <Metric label="Severity" value={offline ? "Warning" : status.severity} detail="Current" />
                <Metric label="Applied Time" value={displayTimeValue(latest?.brakeAppliedTime)} detail="Latest" />
              </div>
            </div>
          </section>

          <section className="panel table-panel train-status-panel">
            <div className="panel-head">
              <div>
                <h2>Train Running Status</h2>
                <span>Calculated from each device's latest Supabase reading</span>
              </div>
              <div className="mini-metrics">
                <Metric label="Running" value={runningTrains.length} detail="trains" />
                <Metric label="Not Running" value={stoppedTrains.length} detail="trains" />
                <Metric label="Last Refresh" value={lastRefresh ? formatTime(lastRefresh) : "-"} detail="dashboard" />
              </div>
            </div>
            <TrainStatusTable statuses={trainStatuses} compact />
          </section>

          <section className="grid lower-grid">
            <div className="panel chart-panel">
              <div className="panel-head">
                <h2>Pressure Timeline</h2>
                <button onClick={() => exportCsv(wagonRows)}>
                  <Download size={16} />
                  Export
                </button>
              </div>
              <ResponsiveContainer width="100%" height={285}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d8e1ea" />
                  <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="BP" stroke="#1769e0" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="FP" stroke="#18a66a" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="CR" stroke="#f2b705" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="BC" stroke="#ef4444" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="panel alerts-panel">
              <div className="panel-head">
                <h2>Active Faults / Alerts</h2>
                <span>{alerts.length} found</span>
              </div>
              <div className="alert-summary">
                <Metric label="Critical" value={alerts.filter((row) => getBrakeState(row).tone === "critical").length} detail="Faults" />
                <Metric label="Warnings" value={offline ? 1 : 0} detail="Offline sensor" />
              </div>
              <div className="empty-state">
                {alerts.length || offline ? <AlertTriangle size={34} /> : <CheckCircle2 size={34} />}
                <strong>{alerts.length || offline ? "Attention Required" : "No Active Faults"}</strong>
                <span>{alerts.length || offline ? "Review latest wagon readings" : "All systems are normal"}</span>
              </div>
            </div>
          </section>

          <section className="grid table-grid">
            <div className="panel table-panel">
              <div className="panel-head">
                <h2>Event History</h2>
                <span>Live records</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Time</th>
                      <th>BP</th>
                      <th>FP</th>
                      <th>CR</th>
                      <th>BC</th>
                      <th>Duration</th>
                      <th>Applied</th>
                      <th>Released</th>
                      <th>Brake Status</th>
                      <th>Fault</th>
                      <th>Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wagonRows.slice(0, 25).map((row, index) => {
                      const rowStatus = getBrakeState(row);
                      return (
                        <tr key={`${row.id}-${index}`}>
                          <td>{index + 1}</td>
                          <td>{formatDateTime(row.timestamp)}</td>
                          <td>{row.bp.toFixed(2)}</td>
                          <td>{row.fp.toFixed(2)}</td>
                          <td>{row.cr.toFixed(2)}</td>
                          <td>{row.bc.toFixed(2)}</td>
                          <td>{displayTimeValue(row.brakeDuration)}</td>
                          <td>{displayTimeValue(row.brakeAppliedTime)}</td>
                          <td>{displayTimeValue(row.brakeReleasedTime)}</td>
                          <td><span className={`badge ${rowStatus.tone}`}>{rowStatus.label}</span></td>
                          <td>{displayTimeValue(row.brakeFault)}</td>
                          <td>{row.location}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="panel overview-panel">
              <div className="panel-head">
                <h2>System Overview</h2>
              </div>
              <Metric label="Train No." value={latest?.trainNo || "-"} detail="Selected record" />
              <Metric label="Wagon No." value={latest?.wagonId || selectedWagon || "-"} detail="Active wagon" />
              <Metric label="Device ID" value={displayDevice(latest)} detail="Installed unit" />
              <Metric label="Status" value={offline ? "Offline" : "Online"} detail={latest ? `${secondsSince(latest.timestamp)} sec ago` : "No data"} />
              <div className="legend">
                <h3>Legend</h3>
                <span><i style={{ background: "#1769e0" }} /> BP Brake Pipe</span>
                <span><i style={{ background: "#18a66a" }} /> FP Feed Pipe</span>
                <span><i style={{ background: "#f2b705" }} /> CR Control Reservoir</span>
                <span><i style={{ background: "#ef4444" }} /> BC Brake Cylinder</span>
              </div>
            </div>
          </section>
            </>
          ) : null}

          {activePage === "realtime" ? (
            <>
              <section className="grid main-grid">
                <div className="panel pressure-panel">
                  <div className="panel-head">
                    <h2>Real-time Monitor</h2>
                    <span>{latest ? `Updated ${formatTime(latest.timestamp)}` : "Waiting for readings"}</span>
                  </div>
                  <div className="gauges">
                    <PressureGauge label="BP" sublabel="Brake Pipe" value={latest?.bp || 0} color="#1769e0" />
                    <PressureGauge label="FP" sublabel="Feed Pipe" value={latest?.fp || 0} color="#18a66a" />
                    <PressureGauge label="CR" sublabel="Control Reservoir" value={latest?.cr || 0} color="#f2b705" />
                    <PressureGauge label="BC" sublabel="Brake Cylinder" value={latest?.bc || 0} color="#ef4444" />
                  </div>
                </div>
                <div className={`panel brake-status ${status.tone}`}>
                  <div className="panel-head">
                    <h2>Current State</h2>
                    <span>{displayDevice(latest)}</span>
                  </div>
                  <div className="status-banner">{offline ? "Sensor Offline" : status.label}</div>
                  <div className="status-details">
                    <Metric label="Train No." value={latest?.trainNo || "-"} detail="Selected" />
                    <Metric label="Wagon No." value={latest?.wagonId || "-"} detail="Selected" />
                    <Metric label="Last Seen" value={latest ? `${secondsSince(latest.timestamp)} sec` : "-"} detail="ago" />
                  </div>
                </div>
              </section>
              <section className="panel chart-panel">
                <div className="panel-head">
                  <h2>Live Pressure Trend</h2>
                  <span>Latest 40 readings</span>
                </div>
                <ResponsiveContainer width="100%" height={360}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#d8e1ea" />
                    <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="BP" stroke="#1769e0" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="FP" stroke="#18a66a" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="CR" stroke="#f2b705" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="BC" stroke="#ef4444" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </section>
            </>
          ) : null}

          {activePage === "timeline" ? (
            <section className="panel table-panel">
              <div className="panel-head">
                <h2>Event History</h2>
                <button onClick={() => exportCsv(wagonRows)}>
                  <Download size={16} />
                  Export
                </button>
              </div>
              <RecordsTable rows={wagonRows} />
            </section>
          ) : null}

          {activePage === "alerts" ? (
            <>
              <section className="status-details page-metrics">
                <Metric label="Total Faults" value={faultRows.length} detail="All devices" />
                <Metric label="Selected Faults" value={alerts.length} detail="Current device/wagon" />
                <Metric label="Offline Warning" value={offline ? 1 : 0} detail="Current sensor" />
              </section>
              <section className="panel table-panel">
                <div className="panel-head">
                  <h2>Faults & Alerts</h2>
                  <span>Read from brake_fault and live status</span>
                </div>
                <RecordsTable rows={faultRows} />
              </section>
            </>
          ) : null}

          {activePage === "reports" ? (
            <>
              <section className="status-details page-metrics">
                <Metric label="Report Rows" value={allRows.length} detail="Loaded records" />
                <Metric label="Selected Rows" value={wagonRows.length} detail="Filtered records" />
                <Metric label="Fault Rows" value={faultRows.length} detail="Fault records" />
              </section>
              <section className="panel table-panel">
                <div className="panel-head">
                  <h2>Reports</h2>
                  <button onClick={() => exportCsv(wagonRows.length ? wagonRows : allRows)}>
                    <Download size={16} />
                    Export CSV
                  </button>
                </div>
                <RecordsTable rows={wagonRows.length ? wagonRows : allRows} />
              </section>
            </>
          ) : null}

          {activePage === "wagons" ? (
            <>
              <section className="status-details page-metrics">
                <Metric label="Running" value={runningTrains.length} detail="latest active" />
                <Metric label="Not Running" value={stoppedTrains.length} detail="no recent data" />
                <Metric label="Status Window" value={TRAIN_RUNNING_AFTER_SECONDS} detail="seconds" />
              </section>
              <section className="panel table-panel">
                <div className="panel-head">
                  <h2>Train Running Status</h2>
                  <span>Last active date and time for every train</span>
                </div>
                <TrainStatusTable statuses={trainStatuses} />
              </section>
              <section className="panel table-panel">
                <div className="panel-head">
                  <h2>Wagon Management</h2>
                  <span>Read-only master list from {DEVICE_TABLE}</span>
                </div>
                <DeviceMasterTable devicesMeta={devicesMeta} />
              </section>
            </>
          ) : null}

          {activePage === "settings" ? (
            <section className="grid lower-grid">
              <div className="panel overview-panel">
                <div className="panel-head">
                  <h2>System Settings</h2>
                  <span>Read-only</span>
                </div>
                <Metric label="Pressure Table" value={PRESSURE_TABLE} detail="Live readings" />
                <Metric label="Device Table" value={DEVICE_TABLE} detail="Master device list" />
                <Metric label="Offline After" value={OFFLINE_AFTER_SECONDS} detail="seconds" />
                <Metric label="Running Window" value={TRAIN_RUNNING_AFTER_SECONDS} detail="seconds" />
                <Metric label="Supabase Mode" value="Read Only" detail="select + realtime" />
              </div>
              <div className="panel table-panel">
                <div className="panel-head">
                  <h2>Deployment Notes</h2>
                  <span>Vercel-ready</span>
                </div>
                <div className="settings-copy">
                  <p>Build command: npm run build</p>
                  <p>Output directory: dist</p>
                  <p>The frontend reads Supabase with the publishable key. It does not insert, update, delete, or alter any table.</p>
                </div>
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}

export default App;
