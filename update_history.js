const fs = require("fs");

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function todayISO_Lima() {
  // GitHub Actions corre en UTC; esto fuerza fecha local Lima aprox (UTC-5)
  const now = new Date();
  const lima = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  const y = lima.getUTCFullYear();
  const m = String(lima.getUTCMonth() + 1).padStart(2, "0");
  const d = String(lima.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function pctToFactor(pct) { return 1 + pct; }

function randBetween(a, b) {
  return a + Math.random() * (b - a);
}

function computeDrift(trend, trendDays, maxDailyChangePct) {
  // Drift suave, para que en ~trendDays se note la dirección
  // Ejemplo: maxDailyChange=5% => drift ~ 0.6% por día en UP/DOWN
  const base = Math.min(0.006, maxDailyChangePct / Math.max(5, trendDays)); // ~0.5-0.7%
  if (trend === "UP") return +base;
  if (trend === "DOWN") return -base;
  return 0;
}

function main() {
  const cfg = JSON.parse(fs.readFileSync("vapecoin-rate.json", "utf8"));
  const history = JSON.parse(fs.readFileSync("history.json", "utf8"));

  const today = todayISO_Lima();
  const last = history[history.length - 1];

  if (!last) throw new Error("history.json está vacío.");

  // si ya existe punto de hoy, no hacemos nada
  if (last.date === today) {
    console.log("Hoy ya existe en history.json. No se actualiza.");
    return;
  }

  const trend = (cfg.trend || "NEUTRAL").toUpperCase();
  const trendDays = Number(cfg.trend_days || 7);

  const noise = Number(cfg.daily_noise_pct ?? 0.02);          // +/- 2%
  const maxDaily = Number(cfg.max_daily_change_pct ?? 0.05);  // tope 5%

  const minUsd = Number(cfg.min_usd ?? 0.005);
  const maxUsd = Number(cfg.max_usd ?? 0.05);

  const prev = Number(last.value);
  const drift = computeDrift(trend, trendDays, maxDaily);

  // ruido aleatorio simétrico
  const n = randBetween(-noise, +noise);

  // cambio propuesto = drift + ruido, pero capado por maxDaily
  const change = clamp(drift + n, -maxDaily, +maxDaily);

  let next = prev * pctToFactor(change);
  next = clamp(next, minUsd, maxUsd);

  history.push({ date: today, value: Number(next.toFixed(6)) });

  // actualiza updated_at “bonito”
  const updateTime = String(cfg.update_time_local || "09:00");
  cfg.updated_at = `${today}T${updateTime}:00-05:00`;

  fs.writeFileSync("history.json", JSON.stringify(history, null, 2) + "\n");
  fs.writeFileSync("vapecoin-rate.json", JSON.stringify(cfg, null, 2) + "\n");

  console.log(`Nuevo punto agregado: ${today} => ${next}`);
}

main();
