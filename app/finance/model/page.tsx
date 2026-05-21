"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AppShell } from "../../components/ui";
import {
  Check,
  AlertCircle,
  Save,
  Trash2,
  RefreshCw,
  Download,
  Layers,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Clock,
  Zap,
  Target,
  BarChart3,
  PieChart,
} from "lucide-react";

/* ─────── Types ─────── */
interface Scenario {
  id: string;
  name: string;
  riders: number;
  hours: number;
  oph: number;
  revenuePerOrder: number;
  variableCost: number;
  fixedCost: number;
}

/* ─────── Animated Number Component ─────── */
function AnimatedValue({
  value,
  formatter,
  className,
}: {
  value: number;
  formatter: (v: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const prevValue = useRef(value);

  useEffect(() => {
    if (prevValue.current !== value && ref.current) {
      ref.current.classList.remove("value-flash");
      // Force reflow to restart animation
      void ref.current.offsetWidth;
      ref.current.classList.add("value-flash");
    }
    prevValue.current = value;
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {formatter(value)}
    </span>
  );
}

/* ─────── Custom Slider Component ─────── */
function PremiumSlider({
  label,
  sublabel,
  icon: Icon,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  color = "#8b5cf6",
}: {
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
  color?: string;
}) {
  const safeValue = isNaN(value) ? min : value;
  const percent = ((safeValue - min) / (max - min)) * 100;

  return (
    <div className="group rounded-xl border border-[#2a2a4a] bg-[#0d0d1a]/60 p-4 transition-all hover:border-[#8b5cf6]/30 hover:bg-[#0d0d1a]/80">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
            style={{ backgroundColor: `${color}15`, color }}
          >
            <Icon size={16} />
          </div>
          <div>
            <div className="text-sm font-bold text-[#e0e0f0]">{label}</div>
            <div className="text-[10px] text-[#666]">{sublabel}</div>
          </div>
        </div>
        <div className="relative flex items-center">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => {
              const val =
                step < 1
                  ? parseFloat(e.target.value)
                  : parseInt(e.target.value, 10);
              onChange(isNaN(val) ? 0 : Math.max(min, Math.min(max, val)));
            }}
            className="w-20 rounded-lg border border-[#2a2a4a] bg-[#1a1a2e] text-center font-mono text-sm font-bold text-white py-1.5 pr-1 pl-1 outline-none transition-all focus:border-[#8b5cf6] focus:shadow-[0_0_12px_rgba(139,92,246,0.15)]"
          />
          <span className="ml-1.5 text-[10px] font-bold text-[#666] min-w-[28px]">
            {unit}
          </span>
        </div>
      </div>
      {/* Custom styled range */}
      <div className="relative h-6 flex items-center">
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-[#1a1a2e] overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-150"
            style={{
              width: `${percent}%`,
              background: `linear-gradient(90deg, ${color}, ${color}cc)`,
              boxShadow: `0 0 8px ${color}40`,
            }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={safeValue}
          onChange={(e) =>
            onChange(
              step < 1
                ? parseFloat(e.target.value)
                : parseInt(e.target.value, 10)
            )
          }
          className="finance-slider absolute inset-x-0 h-6"
          style={
            {
              "--slider-color": color,
            } as React.CSSProperties
          }
        />
      </div>
      <div className="flex justify-between mt-1 text-[9px] text-[#444] font-mono">
        <span>
          {min} {unit}
        </span>
        <span>
          {max} {unit}
        </span>
      </div>
    </div>
  );
}

/* ─────── Cost Input Component ─────── */
function CostInput({
  label,
  sublabel,
  value,
  onChange,
  accentColor = "#06d6a0",
}: {
  label: string;
  sublabel: string;
  value: number;
  onChange: (v: number) => void;
  accentColor?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-[#2a2a4a] bg-[#0d0d1a]/40 px-4 py-3 transition-all hover:border-[#2a2a5a]">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-[#c4c4d4]">{label}</div>
        <p className="text-[10px] text-[#555] mt-0.5">{sublabel}</p>
      </div>
      <div className="relative shrink-0">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#666] font-bold">
          R$
        </span>
        <input
          type="number"
          value={value}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            onChange(isNaN(val) ? 0 : val);
          }}
          className="w-28 rounded-lg border border-[#2a2a4a] bg-[#1a1a2e] pl-9 pr-3 py-2 font-mono text-sm font-bold text-white outline-none transition-all"
          style={{
            borderColor: undefined,
          }}
          onFocus={(e) =>
            (e.target.style.borderColor = accentColor)
          }
          onBlur={(e) =>
            (e.target.style.borderColor = "#2a2a4a")
          }
        />
      </div>
    </div>
  );
}

/* ─────── Metric Card Component ─────── */
function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  valueColor,
  formatter,
}: {
  title: string;
  value: number;
  subtitle: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  valueColor: string;
  formatter: (v: number) => string;
}) {
  return (
    <div className="rounded-xl bg-[#0d0d1a]/70 p-4 border border-[#2a2a4a] transition-all hover:border-[#8b5cf6]/20 hover:shadow-[0_4px_20px_rgba(139,92,246,0.06)] group">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#1a1a2e] text-[#8b8ba3] group-hover:text-[#8b5cf6] transition-colors">
          <Icon size={13} />
        </div>
        <div className="text-[11px] text-[#8b8ba3] font-semibold leading-tight">
          {title}
        </div>
      </div>
      <AnimatedValue
        value={value}
        formatter={formatter}
        className={`block font-mono text-xl font-bold ${valueColor}`}
      />
      <div className="text-[10px] text-[#444] mt-1.5 font-mono">{subtitle}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ═══════════════════════════════════════════════════ */
export default function ProfitModelPage() {
  const [mounted, setMounted] = useState(false);

  /* Core financial inputs */
  const [riders, setRiders] = useState<number>(30);
  const [hours, setHours] = useState<number>(48);
  const [oph, setOph] = useState<number>(2.0);
  const [revenuePerOrder, setRevenuePerOrder] = useState<number>(12.0);
  const [variableCost, setVariableCost] = useState<number>(9.0);
  const [fixedCost, setFixedCost] = useState<number>(8500);

  /* Scenario management */
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [newScenarioName, setNewScenarioName] = useState("");

  const defaultPresets: Scenario[] = [
    {
      id: "preset-small",
      name: "小型网点 Micro-Hub",
      riders: 15,
      hours: 40,
      oph: 1.8,
      revenuePerOrder: 11.5,
      variableCost: 8.5,
      fixedCost: 3500,
    },
    {
      id: "preset-medium",
      name: "标准网点 Hub Padrão",
      riders: 30,
      hours: 48,
      oph: 2.0,
      revenuePerOrder: 12.0,
      variableCost: 9.0,
      fixedCost: 8500,
    },
    {
      id: "preset-large",
      name: "旗舰网点 Macro-Hub",
      riders: 80,
      hours: 55,
      oph: 2.3,
      revenuePerOrder: 13.0,
      variableCost: 9.5,
      fixedCost: 22000,
    },
  ];

  useEffect(() => {
    setMounted(true);
    let loadedScenarios = defaultPresets;
    try {
      const saved = localStorage.getItem("meponto_profit_scenarios");
      if (saved) {
        loadedScenarios = JSON.parse(saved);
      } else {
        localStorage.setItem(
          "meponto_profit_scenarios",
          JSON.stringify(defaultPresets)
        );
      }
    } catch {
      // localStorage unavailable
    }
    setScenarios(loadedScenarios);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Scenario handlers */
  const handleSaveScenario = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!newScenarioName.trim()) return;
      const s: Scenario = {
        id: `custom-${Date.now()}`,
        name: newScenarioName.trim(),
        riders: isNaN(riders) ? 30 : riders,
        hours: isNaN(hours) ? 48 : hours,
        oph: isNaN(oph) ? 2.0 : oph,
        revenuePerOrder: isNaN(revenuePerOrder) ? 12.0 : revenuePerOrder,
        variableCost: isNaN(variableCost) ? 9.0 : variableCost,
        fixedCost: isNaN(fixedCost) ? 8500 : fixedCost,
      };
      const updated = [...scenarios, s];
      setScenarios(updated);
      try {
        localStorage.setItem(
          "meponto_profit_scenarios",
          JSON.stringify(updated)
        );
      } catch {}
      setNewScenarioName("");
    },
    [
      newScenarioName,
      riders,
      hours,
      oph,
      revenuePerOrder,
      variableCost,
      fixedCost,
      scenarios,
    ]
  );

  const handleDeleteScenario = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const updated = scenarios.filter((s) => s.id !== id);
      setScenarios(updated);
      try {
        localStorage.setItem(
          "meponto_profit_scenarios",
          JSON.stringify(updated)
        );
      } catch {}
    },
    [scenarios]
  );

  const handleLoadScenario = useCallback((s: Scenario) => {
    setRiders(s.riders);
    setHours(s.hours);
    setOph(s.oph);
    setRevenuePerOrder(s.revenuePerOrder);
    setVariableCost(s.variableCost);
    setFixedCost(s.fixedCost);
  }, []);

  const handleReset = useCallback(() => {
    setRiders(30);
    setHours(48);
    setOph(2.0);
    setRevenuePerOrder(12.0);
    setVariableCost(9.0);
    setFixedCost(8500);
  }, []);

  const handleExport = useCallback(() => {
    try {
      const dataStr =
        "data:text/json;charset=utf-8," +
        encodeURIComponent(
          JSON.stringify(
            {
              riders,
              hours,
              oph,
              revenuePerOrder,
              variableCost,
              fixedCost,
              exportedAt: new Date().toISOString(),
            },
            null,
            2
          )
        );
      const a = document.createElement("a");
      a.setAttribute("href", dataStr);
      a.setAttribute(
        "download",
        `meponto-finance-model-${Date.now()}.json`
      );
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {}
  }, [riders, hours, oph, revenuePerOrder, variableCost, fixedCost]);

  /* ─── Defensive calculations ─── */
  const sr = isNaN(riders) ? 0 : riders;
  const sh = isNaN(hours) ? 0 : hours;
  const so = isNaN(oph) ? 0 : oph;
  const srpo = isNaN(revenuePerOrder) ? 0 : revenuePerOrder;
  const svc = isNaN(variableCost) ? 0 : variableCost;
  const sfc = isNaN(fixedCost) ? 0 : fixedCost;

  const totalOrders = sr * sh * so;
  const revenue = totalOrders * srpo;
  const totalVarCost = totalOrders * svc;
  const totalCost = totalVarCost + sfc;
  const netProfit = revenue - totalCost;
  const profitMargin = revenue > 0 ? netProfit / revenue : 0;

  const contributionMargin = srpo - svc;
  const breakEvenOph =
    contributionMargin > 0 && sr > 0 && sh > 0
      ? sfc / (sr * sh * contributionMargin)
      : 0;
  const breakEvenOrders =
    contributionMargin > 0 ? sfc / contributionMargin : 0;
  const isBreakEven = so >= breakEvenOph && contributionMargin > 0;

  /* Sensitivity: +10% riders impact on profit */
  const sensRiders = Math.round(sr * 1.1);
  const sensRevRiders = sensRiders * sh * so * srpo;
  const sensCostRiders = sensRiders * sh * so * svc + sfc;
  const sensProfitRiders = sensRevRiders - sensCostRiders;

  /* Sensitivity: +0.5 OPH impact */
  const sensOph = so + 0.5;
  const sensRevOph = sr * sh * sensOph * srpo;
  const sensCostOph = sr * sh * sensOph * svc + sfc;
  const sensProfitOph = sensRevOph - sensCostOph;

  /* Formatters */
  const fBRL = (val: number) => {
    const sv = isNaN(val) || !isFinite(val) ? 0 : val;
    const sign = sv < 0 ? "-" : "";
    return `${sign}R$ ${Math.abs(sv).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };
  const fPct = (val: number) => {
    const sv = isNaN(val) || !isFinite(val) ? 0 : val;
    return `${(sv * 100).toFixed(1)}%`;
  };
  const fNum = (val: number) => {
    const sv = isNaN(val) || !isFinite(val) ? 0 : val;
    return sv.toLocaleString("pt-BR");
  };

  /* Gauge progress */
  const gaugePercent = Math.max(0, Math.min(100, profitMargin * 100));

  /* Cost structure for visualization */
  const costTotal = totalVarCost + sfc;
  const varPct = costTotal > 0 ? (totalVarCost / costTotal) * 100 : 50;
  const fixPct = costTotal > 0 ? (sfc / costTotal) * 100 : 50;

  /* Revenue vs Cost bar */
  const maxBar = Math.max(revenue, totalCost, 1);
  const revBarPct = (revenue / maxBar) * 100;
  const costBarPct = (totalCost / maxBar) * 100;

  /* ─── Loading skeleton ─── */
  if (!mounted) {
    return (
      <AppShell>
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#8b5cf6] border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Inline styles for custom slider and value flash */}
      <style jsx global>{`
        .finance-slider {
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
          cursor: pointer;
          margin: 0;
          width: 100%;
        }
        .finance-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: white;
          border: 3px solid var(--slider-color, #8b5cf6);
          box-shadow: 0 0 10px var(--slider-color, #8b5cf6),
            0 2px 6px rgba(0, 0, 0, 0.4);
          cursor: grab;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
          position: relative;
          z-index: 2;
        }
        .finance-slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 0 16px var(--slider-color, #8b5cf6),
            0 2px 8px rgba(0, 0, 0, 0.5);
        }
        .finance-slider::-webkit-slider-thumb:active {
          cursor: grabbing;
          transform: scale(1.1);
        }
        .finance-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: white;
          border: 3px solid var(--slider-color, #8b5cf6);
          box-shadow: 0 0 10px var(--slider-color, #8b5cf6),
            0 2px 6px rgba(0, 0, 0, 0.4);
          cursor: grab;
        }
        .finance-slider::-webkit-slider-runnable-track {
          height: 6px;
          background: transparent;
        }
        .finance-slider::-moz-range-track {
          height: 6px;
          background: transparent;
        }
        @keyframes value-flash-anim {
          0% {
            background-color: rgba(139, 92, 246, 0.2);
            border-radius: 6px;
          }
          100% {
            background-color: transparent;
          }
        }
        .value-flash {
          animation: value-flash-anim 0.5s ease-out;
        }
      `}</style>

      {/* ─── Page Header ─── */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 animate-fade-in">
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#8b5cf6] font-[family-name:var(--font-outfit)]">
            SIMULAÇÃO FINANCEIRA DE HUB
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-[family-name:var(--font-outfit)] bg-gradient-to-r from-white via-[#e0e0f0] to-[#8b8ba3] bg-clip-text text-transparent">
            站点动态利润核算模型
          </h1>
          <p className="mt-1.5 text-xs text-[#666] max-w-lg">
            拖动滑块或输入精确数值，所有财务指标实时联动计算。适配巴西本地网点周运营数据。
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg border border-[#2a2a4a] bg-[#1a1a2e] px-3 py-1.5 text-[11px] font-bold text-[#8b8ba3] transition-all hover:border-[#8b5cf6]/30 hover:text-white"
          >
            <Download size={12} /> 导出
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 rounded-lg border border-[#2a2a4a] bg-[#1a1a2e] px-3 py-1.5 text-[11px] font-bold text-[#8b8ba3] transition-all hover:border-[#8b5cf6]/30 hover:text-white"
          >
            <RefreshCw size={12} /> 重置
          </button>
        </div>
      </div>

      {/* ─── Scenarios ─── */}
      <div className="mb-5 rounded-xl border border-[#2a2a4a] bg-[#0d0d1a]/60 p-4 backdrop-blur-md">
        <div className="flex flex-wrap gap-2 items-center">
          <Layers size={13} className="text-[#8b5cf6]" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#666] mr-2">
            预设方案
          </span>
          {scenarios.map((s) => (
            <button
              key={s.id}
              onClick={() => handleLoadScenario(s)}
              className="group flex items-center gap-1.5 rounded-lg border border-[#2a2a4a] bg-[#1a1a2e]/50 px-3 py-1.5 text-[11px] font-semibold text-[#8b8ba3] transition-all hover:border-[#8b5cf6] hover:text-white hover:bg-[#8b5cf6]/10"
            >
              {s.name}
              {s.id.startsWith("custom-") && (
                <Trash2
                  size={10}
                  className="text-red-500/50 hover:text-red-400 transition-colors"
                  onClick={(e) => handleDeleteScenario(s.id, e)}
                />
              )}
            </button>
          ))}

          <form
            onSubmit={handleSaveScenario}
            className="ml-auto flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="方案名称..."
              value={newScenarioName}
              onChange={(e) => setNewScenarioName(e.target.value)}
              className="rounded-lg border border-[#2a2a4a] bg-[#1a1a2e]/50 px-2.5 py-1 text-[11px] text-white placeholder-[#444] outline-none focus:border-[#8b5cf6] w-28"
            />
            <button
              type="submit"
              className="flex items-center gap-1 rounded-lg bg-[#8b5cf6] px-2.5 py-1 text-[11px] font-bold text-white hover:brightness-110 transition-all"
            >
              <Save size={10} /> 保存
            </button>
          </form>
        </div>
      </div>

      {/* ═══ METRICS DASHBOARD ═══ */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-5 animate-fade-in">
        <MetricCard
          title="每周营业额 Faturamento"
          value={revenue}
          subtitle={`${fNum(Math.round(totalOrders))} 单 × R$ ${srpo.toFixed(2)}`}
          icon={DollarSign}
          valueColor="text-[#8b5cf6]"
          formatter={fBRL}
        />
        <MetricCard
          title="每周总成本 Custo Total"
          value={totalCost}
          subtitle={`固定 ${fBRL(sfc)} + 变动 ${fBRL(totalVarCost)}`}
          icon={BarChart3}
          valueColor="text-white"
          formatter={fBRL}
        />
        <MetricCard
          title="每周净利润 Lucro Líquido"
          value={netProfit}
          subtitle={`利润率 ${fPct(profitMargin)}`}
          icon={netProfit >= 0 ? TrendingUp : TrendingDown}
          valueColor={netProfit >= 0 ? "text-[#06d6a0]" : "text-[#f43f5e]"}
          formatter={fBRL}
        />
        <MetricCard
          title="单票边际贡献 Margem"
          value={contributionMargin}
          subtitle={`R$ ${srpo.toFixed(2)} - R$ ${svc.toFixed(2)}`}
          icon={PieChart}
          valueColor={
            contributionMargin > 0 ? "text-[#06d6a0]" : "text-[#f43f5e]"
          }
          formatter={fBRL}
        />
      </div>

      {/* ═══ VISUALIZATION ROW ═══ */}
      <div className="grid gap-5 lg:grid-cols-[1fr_280px] mb-5">
        {/* Revenue vs Cost + Cost Structure */}
        <div className="panel p-5 industrial-shadow space-y-5">
          {/* Revenue vs Cost comparison */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#666] mb-3">
              收支对比 (Receita vs Custos)
            </h3>
            <div className="space-y-2.5">
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-[#8b8ba3]">营业额</span>
                  <span className="font-mono font-bold text-[#8b5cf6]">
                    {fBRL(revenue)}
                  </span>
                </div>
                <div className="h-5 rounded-md bg-[#1a1a2e] overflow-hidden relative">
                  <div
                    className="absolute inset-y-0 left-0 rounded-md transition-all duration-300"
                    style={{
                      width: `${revBarPct}%`,
                      background:
                        "linear-gradient(90deg, #8b5cf6, #a78bfa)",
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-[#8b8ba3]">总成本</span>
                  <span className="font-mono font-bold text-white">
                    {fBRL(totalCost)}
                  </span>
                </div>
                <div className="h-5 rounded-md bg-[#1a1a2e] overflow-hidden relative">
                  <div
                    className="absolute inset-y-0 left-0 rounded-md transition-all duration-300"
                    style={{
                      width: `${costBarPct}%`,
                      background:
                        revenue > totalCost
                          ? "linear-gradient(90deg, #2a4a3a, #3a5a4a)"
                          : "linear-gradient(90deg, #4a2a2a, #5a3a3a)",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Cost Structure Breakdown */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#666] mb-3">
              成本结构拆解 (Estrutura de Custos)
            </h3>
            <div className="h-4 rounded-full bg-[#1a1a2e] overflow-hidden flex">
              <div
                className="transition-all duration-300 flex items-center justify-center"
                style={{
                  width: `${varPct}%`,
                  background: "linear-gradient(90deg, #fb923c, #f97316)",
                }}
              >
                {varPct > 15 && (
                  <span className="text-[8px] font-bold text-white/80">
                    变动 {varPct.toFixed(0)}%
                  </span>
                )}
              </div>
              <div
                className="transition-all duration-300 flex items-center justify-center"
                style={{
                  width: `${fixPct}%`,
                  background: "linear-gradient(90deg, #8b5cf6, #7c3aed)",
                }}
              >
                {fixPct > 15 && (
                  <span className="text-[8px] font-bold text-white/80">
                    固定 {fixPct.toFixed(0)}%
                  </span>
                )}
              </div>
            </div>
            <div className="flex justify-between mt-2 text-[10px]">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-[#fb923c]" />
                <span className="text-[#8b8ba3]">
                  变动成本 {fBRL(totalVarCost)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-[#8b5cf6]" />
                <span className="text-[#8b8ba3]">
                  固定成本 {fBRL(sfc)}
                </span>
              </div>
            </div>
          </div>

          {/* Break-even Status */}
          <div
            className={`rounded-lg border p-3 flex items-center justify-between gap-3 ${
              contributionMargin <= 0
                ? "border-red-500/15 bg-red-500/5 text-red-400"
                : isBreakEven
                  ? "border-[#06d6a0]/15 bg-[#06d6a0]/5 text-[#06d6a0]"
                  : "border-[#f43f5e]/15 bg-[#f43f5e]/5 text-[#f43f5e]"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full ${
                  contributionMargin <= 0
                    ? "bg-red-500/10"
                    : isBreakEven
                      ? "bg-[#06d6a0]/10"
                      : "bg-[#f43f5e]/10"
                }`}
              >
                {isBreakEven && contributionMargin > 0 ? (
                  <Check size={14} />
                ) : (
                  <AlertCircle size={14} />
                )}
              </div>
              <div>
                <div className="text-xs font-bold">
                  {contributionMargin <= 0
                    ? "单票结算价低于变动成本"
                    : isBreakEven
                      ? "已达到盈亏平衡"
                      : "未达盈亏平衡"}
                </div>
                <div className="text-[10px] opacity-70">
                  {contributionMargin <= 0
                    ? "请提高结算价或降低变动成本"
                    : `盈亏平衡 ${Math.ceil(breakEvenOrders)} 单，当前 ${fNum(Math.round(totalOrders))} 单`}
                </div>
              </div>
            </div>
            {contributionMargin > 0 && (
              <div className="text-right shrink-0">
                <div className="text-[9px] uppercase tracking-wider opacity-50">
                  盈亏OPH
                </div>
                <div className="font-mono font-bold text-sm">
                  {breakEvenOph.toFixed(2)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Gauge + Sensitivity */}
        <div className="flex flex-col gap-5">
          {/* Circular Gauge */}
          <div className="panel p-5 flex flex-col items-center justify-center relative overflow-hidden">
            <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-[#06d6a0]/5 rounded-full blur-3xl pointer-events-none" />
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#666] mb-4 self-start">
              利润率 Margem
            </div>

            <div className="relative flex h-36 w-36 items-center justify-center rounded-full">
              <div
                className="absolute inset-0 rounded-full transition-all duration-500"
                style={{
                  background: `conic-gradient(from 180deg, #162032 50%, ${netProfit >= 0 ? "#06d6a0" : "#f43f5e"} 50%, ${netProfit >= 0 ? "#06d6a0" : "#f43f5e"} calc(50% + ${gaugePercent / 2}%), #162032 calc(50% + ${gaugePercent / 2}%), #162032 100%)`,
                  transform: "rotate(-90deg)",
                }}
              />
              <div className="absolute inset-3 rounded-full bg-[#0d0d1a] flex flex-col items-center justify-center">
                <AnimatedValue
                  value={profitMargin}
                  formatter={fPct}
                  className={`text-2xl font-extrabold font-[family-name:var(--font-outfit)] ${netProfit >= 0 ? "text-[#06d6a0]" : "text-[#f43f5e]"}`}
                />
                <div className="text-[8px] font-bold text-[#555] uppercase tracking-wider mt-0.5">
                  {netProfit >= 0 ? "Lucro" : "Prejuízo"}
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-[#0d0d1a] via-[#0d0d1a]/80 to-transparent pointer-events-none" />
            </div>

            <div className="text-center mt-1 z-10">
              <AnimatedValue
                value={netProfit}
                formatter={fBRL}
                className={`text-sm font-bold font-mono ${netProfit >= 0 ? "text-[#06d6a0]" : "text-[#f43f5e]"}`}
              />
            </div>
          </div>

          {/* Sensitivity Analysis */}
          <div className="panel p-4 space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#666] flex items-center gap-1.5">
              <Target size={11} className="text-[#8b5cf6]" /> 敏感度分析
            </div>
            <div className="rounded-lg bg-[#0d0d1a]/60 border border-[#2a2a4a] p-3">
              <div className="text-[10px] text-[#666]">
                骑手人数 +10% → {sensRiders}人
              </div>
              <div
                className={`text-xs font-mono font-bold mt-0.5 ${sensProfitRiders >= 0 ? "text-[#06d6a0]" : "text-[#f43f5e]"}`}
              >
                净利润 {fBRL(sensProfitRiders)}
                <span className="text-[10px] ml-1 opacity-60">
                  ({sensProfitRiders > netProfit ? "+" : ""}
                  {fBRL(sensProfitRiders - netProfit)})
                </span>
              </div>
            </div>
            <div className="rounded-lg bg-[#0d0d1a]/60 border border-[#2a2a4a] p-3">
              <div className="text-[10px] text-[#666]">
                OPH +0.5 → {sensOph.toFixed(1)}
              </div>
              <div
                className={`text-xs font-mono font-bold mt-0.5 ${sensProfitOph >= 0 ? "text-[#06d6a0]" : "text-[#f43f5e]"}`}
              >
                净利润 {fBRL(sensProfitOph)}
                <span className="text-[10px] ml-1 opacity-60">
                  ({sensProfitOph > netProfit ? "+" : ""}
                  {fBRL(sensProfitOph - netProfit)})
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Break-even OPH Scale ═══ */}
      {contributionMargin > 0 && (
        <div className="panel p-5 mb-5">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#666] mb-6">
            配送效率盈亏线 (Escala OPH)
          </h3>
          <div className="relative w-full h-8 flex items-center">
            <div className="absolute left-0 right-0 h-2 rounded-full bg-[#1a1a2e]">
              <div
                className="absolute left-0 top-0 bottom-0 rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, (so / 5) * 100)}%`,
                  background: "linear-gradient(90deg, #8b5cf6, #06d6a0)",
                  boxShadow: "0 0 12px rgba(139,92,246,0.2)",
                }}
              />
              <div
                className="absolute top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-[#666] transition-all duration-300"
                style={{
                  left: `${Math.min(100, (breakEvenOph / 5) * 100)}%`,
                }}
              />
              <div
                className="absolute top-1/2 h-6 w-1.5 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.6)] transition-all duration-300"
                style={{
                  left: `${Math.min(100, (so / 5) * 100)}%`,
                }}
              />
            </div>
          </div>
          <div className="relative w-full h-10 mt-1">
            <div
              className="absolute text-center whitespace-nowrap transition-all duration-300"
              style={{
                left: `${Math.min(95, Math.max(5, (breakEvenOph / 5) * 100))}%`,
                transform: "translateX(-50%)",
              }}
            >
              <div className="text-[9px] text-[#666]">盈亏线</div>
              <div className="font-mono text-[10px] font-bold text-[#666]">
                {breakEvenOph.toFixed(2)}
              </div>
            </div>
            <div
              className="absolute text-center whitespace-nowrap transition-all duration-300"
              style={{
                left: `${Math.min(95, Math.max(5, (so / 5) * 100))}%`,
                transform: "translateX(-50%)",
              }}
            >
              <div className="text-[9px] font-bold text-white bg-[#8b5cf6]/20 px-1.5 py-0.5 rounded border border-[#8b5cf6]/20">
                当前
              </div>
              <div className="font-mono text-[10px] font-bold text-white mt-0.5">
                {so.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ CONTROLS ═══ */}
      <div className="grid gap-5 lg:grid-cols-2 animate-fade-in">
        {/* Sliders */}
        <div className="space-y-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#666] flex items-center gap-1.5 mb-1">
            <Zap size={12} className="text-[#8b5cf6]" /> 规模与效率参数
          </h3>
          <PremiumSlider
            label="骑手人数 Riders"
            sublabel="网点活跃骑手总数"
            icon={Users}
            value={riders}
            min={1}
            max={150}
            step={1}
            unit="人"
            onChange={setRiders}
            color="#8b5cf6"
          />
          <PremiumSlider
            label="周人均工时 Jornada"
            sublabel="每位骑手每周配送小时数"
            icon={Clock}
            value={hours}
            min={10}
            max={80}
            step={1}
            unit="小时"
            onChange={setHours}
            color="#06d6a0"
          />
          <PremiumSlider
            label="配送效率 OPH"
            sublabel="每小时人均完成订单数"
            icon={Zap}
            value={oph}
            min={0.5}
            max={5.0}
            step={0.1}
            unit="OPH"
            onChange={setOph}
            color="#fb923c"
          />
        </div>

        {/* Financial Inputs */}
        <div className="space-y-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#666] flex items-center gap-1.5 mb-1">
            <DollarSign size={12} className="text-[#06d6a0]" /> 财务成本设定
          </h3>
          <CostInput
            label="单票结算价 Valor por Pedido"
            sublabel="上游物流平台单票配送收入"
            value={revenuePerOrder}
            onChange={setRevenuePerOrder}
            accentColor="#8b5cf6"
          />
          <CostInput
            label="单票变动成本 Custo Variável"
            sublabel="骑手配送费及其他变动费用"
            value={variableCost}
            onChange={setVariableCost}
            accentColor="#fb923c"
          />
          <CostInput
            label="周固定成本 Custo Fixo"
            sublabel="网点租金、水电及管理层薪资"
            value={fixedCost}
            onChange={setFixedCost}
            accentColor="#06d6a0"
          />
        </div>
      </div>
    </AppShell>
  );
}
