"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AppShell } from "../../components/ui";
import type { Language } from "../../lib/i18n";
import { useVentoStore } from "../../lib/store";
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

const qualityLaunchModel: Omit<Scenario, "id" | "name"> = {
  riders: 20,
  hours: 42,
  oph: 1.5,
  revenuePerOrder: 12.0,
  variableCost: 9.0,
  fixedCost: 3780,
};

const normalizeNumberInput = (value: string, min: number, max: number, step: number) => {
  const parsed = step < 1 ? parseFloat(value) : parseInt(value, 10);
  return isNaN(parsed) ? min : Math.max(min, Math.min(max, parsed));
};

const financeCopy: Record<Language, {
  eyebrow: string;
  title: string;
  description: string;
  exportLabel: string;
  resetLabel: string;
  presets: string;
  scenarioPlaceholder: string;
  save: string;
  presetNames: Record<string, string>;
  metrics: {
    revenue: string;
    totalCost: string;
    netProfit: string;
    contribution: string;
    ordersUnit: string;
    fixed: string;
    variable: string;
    marginRate: string;
  };
  sections: {
    revenueVsCosts: string;
    revenue: string;
    totalCost: string;
    costStructure: string;
    variable: string;
    fixed: string;
    variableCost: string;
    fixedCost: string;
    margin: string;
    sensitivity: string;
    ophScale: string;
    scaleParams: string;
    financialSettings: string;
  };
  breakEven: {
    negativeContribution: string;
    reached: string;
    notReached: string;
    improve: string;
    prefix: string;
    current: string;
    oph: string;
    line: string;
  };
  labels: {
    profit: string;
    loss: string;
    ridersUp: string;
    netProfit: string;
    current: string;
    riders: string;
    hours: string;
  };
  controls: {
    ridersLabel: string;
    ridersSublabel: string;
    ridersUnit: string;
    hoursLabel: string;
    hoursSublabel: string;
    hoursUnit: string;
    ophLabel: string;
    ophSublabel: string;
    ophUnit: string;
    revenuePerOrderLabel: string;
    revenuePerOrderSublabel: string;
    variableCostLabel: string;
    variableCostSublabel: string;
    fixedCostLabel: string;
    fixedCostSublabel: string;
  };
}> = {
  en: {
    eyebrow: "Hub Financial Simulation",
    title: "Dynamic Site Profit Model",
    description: "Move sliders or enter exact values. All financial metrics recalculate in real time for weekly Brazil site operations.",
    exportLabel: "Export",
    resetLabel: "Reset",
    presets: "Presets",
    scenarioPlaceholder: "Scenario name...",
    save: "Save",
    presetNames: {
      "preset-small": "Micro-Hub",
      "preset-quality-launch": "Quality first site protection",
      "preset-medium": "Standard Hub",
      "preset-large": "Macro-Hub",
    },
    metrics: {
      revenue: "Weekly Revenue",
      totalCost: "Weekly Total Cost",
      netProfit: "Weekly Net Profit",
      contribution: "Contribution per Order",
      ordersUnit: "orders",
      fixed: "Fixed",
      variable: "Variable",
      marginRate: "Margin",
    },
    sections: {
      revenueVsCosts: "Revenue vs Costs",
      revenue: "Revenue",
      totalCost: "Total cost",
      costStructure: "Cost Structure",
      variable: "Variable",
      fixed: "Fixed",
      variableCost: "Variable cost",
      fixedCost: "Fixed cost",
      margin: "Margin",
      sensitivity: "Sensitivity Analysis",
      ophScale: "Break-even OPH Scale",
      scaleParams: "Scale & Efficiency Inputs",
      financialSettings: "Financial Cost Settings",
    },
    breakEven: {
      negativeContribution: "Revenue per order is below variable cost",
      reached: "Break-even reached",
      notReached: "Break-even not reached",
      improve: "Increase price per order or reduce variable cost",
      prefix: "Break-even",
      current: "current",
      oph: "Break-even OPH",
      line: "Break-even line",
    },
    labels: {
      profit: "Profit",
      loss: "Loss",
      ridersUp: "Riders +10%",
      netProfit: "Net profit",
      current: "Current",
      riders: "riders",
      hours: "hours",
    },
    controls: {
      ridersLabel: "Riders",
      ridersSublabel: "Active riders at this site",
      ridersUnit: "riders",
      hoursLabel: "Weekly Hours",
      hoursSublabel: "Delivery hours per rider per week",
      hoursUnit: "hours",
      ophLabel: "Delivery Efficiency OPH",
      ophSublabel: "Completed orders per rider hour",
      ophUnit: "OPH",
      revenuePerOrderLabel: "Revenue per Order",
      revenuePerOrderSublabel: "Upstream logistics platform income per completed order",
      variableCostLabel: "Variable Cost per Order",
      variableCostSublabel: "Rider delivery fee and other variable expenses",
      fixedCostLabel: "Weekly Fixed Cost",
      fixedCostSublabel: "Site rent, utilities and management salary",
    },
  },
  zh: {
    eyebrow: "站点财务模拟",
    title: "站点动态利润核算模型",
    description: "拖动滑块或输入精确数值，所有财务指标实时联动计算。适配巴西本地网点周运营数据。",
    exportLabel: "导出",
    resetLabel: "重置",
    presets: "预设方案",
    scenarioPlaceholder: "方案名称...",
    save: "保存",
    presetNames: {
      "preset-small": "小型网点",
      "preset-quality-launch": "Quality 首店保护期",
      "preset-medium": "标准网点",
      "preset-large": "旗舰网点",
    },
    metrics: {
      revenue: "每周营业额",
      totalCost: "每周总成本",
      netProfit: "每周净利润",
      contribution: "单票边际贡献",
      ordersUnit: "单",
      fixed: "固定",
      variable: "变动",
      marginRate: "利润率",
    },
    sections: {
      revenueVsCosts: "收支对比",
      revenue: "营业额",
      totalCost: "总成本",
      costStructure: "成本结构拆解",
      variable: "变动",
      fixed: "固定",
      variableCost: "变动成本",
      fixedCost: "固定成本",
      margin: "利润率",
      sensitivity: "敏感度分析",
      ophScale: "配送效率盈亏线",
      scaleParams: "规模与效率参数",
      financialSettings: "财务成本设定",
    },
    breakEven: {
      negativeContribution: "单票结算价低于变动成本",
      reached: "已达到盈亏平衡",
      notReached: "未达盈亏平衡",
      improve: "请提高结算价或降低变动成本",
      prefix: "盈亏平衡",
      current: "当前",
      oph: "盈亏OPH",
      line: "盈亏线",
    },
    labels: {
      profit: "盈利",
      loss: "亏损",
      ridersUp: "骑手人数 +10%",
      netProfit: "净利润",
      current: "当前",
      riders: "人",
      hours: "小时",
    },
    controls: {
      ridersLabel: "骑手人数",
      ridersSublabel: "网点活跃骑手总数",
      ridersUnit: "人",
      hoursLabel: "周人均工时",
      hoursSublabel: "每位骑手每周配送小时数",
      hoursUnit: "小时",
      ophLabel: "配送效率 OPH",
      ophSublabel: "每小时人均完成订单数",
      ophUnit: "OPH",
      revenuePerOrderLabel: "单票结算价",
      revenuePerOrderSublabel: "上游物流平台单票配送收入",
      variableCostLabel: "单票变动成本",
      variableCostSublabel: "骑手配送费及其他变动费用",
      fixedCostLabel: "周固定成本",
      fixedCostSublabel: "网点租金、水电及管理层薪资",
    },
  },
  pt: {
    eyebrow: "Simulacao Financeira de Hub",
    title: "Modelo Dinamico de Lucro do Ponto",
    description: "Use os sliders ou digite valores exatos. Todos os indicadores financeiros recalculam em tempo real para a operacao semanal no Brasil.",
    exportLabel: "Exportar",
    resetLabel: "Redefinir",
    presets: "Cenarios",
    scenarioPlaceholder: "Nome do cenario...",
    save: "Salvar",
    presetNames: {
      "preset-small": "Micro-Hub",
      "preset-quality-launch": "Protecao inicial Quality",
      "preset-medium": "Hub Padrao",
      "preset-large": "Macro-Hub",
    },
    metrics: {
      revenue: "Faturamento Semanal",
      totalCost: "Custo Total Semanal",
      netProfit: "Lucro Liquido Semanal",
      contribution: "Margem por Pedido",
      ordersUnit: "pedidos",
      fixed: "Fixo",
      variable: "Variavel",
      marginRate: "Margem",
    },
    sections: {
      revenueVsCosts: "Receita vs Custos",
      revenue: "Faturamento",
      totalCost: "Custo total",
      costStructure: "Estrutura de Custos",
      variable: "Variavel",
      fixed: "Fixo",
      variableCost: "Custo variavel",
      fixedCost: "Custo fixo",
      margin: "Margem",
      sensitivity: "Analise de Sensibilidade",
      ophScale: "Escala OPH de Equilibrio",
      scaleParams: "Parametros de Escala e Eficiencia",
      financialSettings: "Configuracao de Custos",
    },
    breakEven: {
      negativeContribution: "Valor por pedido abaixo do custo variavel",
      reached: "Equilibrio atingido",
      notReached: "Equilibrio ainda nao atingido",
      improve: "Aumente o valor por pedido ou reduza o custo variavel",
      prefix: "Equilibrio",
      current: "atual",
      oph: "OPH de equilibrio",
      line: "Linha de equilibrio",
    },
    labels: {
      profit: "Lucro",
      loss: "Prejuizo",
      ridersUp: "Motoboys +10%",
      netProfit: "Lucro liquido",
      current: "Atual",
      riders: "motoboys",
      hours: "horas",
    },
    controls: {
      ridersLabel: "Motoboys",
      ridersSublabel: "Total de motoboys ativos no ponto",
      ridersUnit: "motoboys",
      hoursLabel: "Horas Semanais",
      hoursSublabel: "Horas de entrega por motoboy por semana",
      hoursUnit: "horas",
      ophLabel: "Eficiencia OPH",
      ophSublabel: "Pedidos concluidos por hora online",
      ophUnit: "OPH",
      revenuePerOrderLabel: "Valor por Pedido",
      revenuePerOrderSublabel: "Receita da plataforma logistica por pedido concluido",
      variableCostLabel: "Custo Variavel por Pedido",
      variableCostSublabel: "Repasse do motoboy e outras despesas variaveis",
      fixedCostLabel: "Custo Fixo Semanal",
      fixedCostSublabel: "Aluguel, utilidades e gestao do ponto",
    },
  },
};

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
  color = "var(--accent)",
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
  const handleNumberInput = (rawValue: string) => {
    onChange(normalizeNumberInput(rawValue, min, max, step));
  };
  const handleRangeInput = (rawValue: string) => {
    onChange(step < 1 ? parseFloat(rawValue) : parseInt(rawValue, 10));
  };

  return (
    <div className="group rounded-xl border border-[var(--line)] bg-[var(--surface)]/60 p-4 transition-all hover:border-[var(--accent)]/30 hover:bg-[var(--surface)]/80">
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
            onChange={(e) => handleNumberInput(e.target.value)}
            onInput={(e) => handleNumberInput(e.currentTarget.value)}
            className="w-20 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] text-center font-mono text-sm font-bold text-[var(--text)] py-1.5 pr-1 pl-1 outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_12px_rgba(139,92,246,0.15)]"
          />
          <span className="ml-1.5 text-[10px] font-bold text-[#666] min-w-[28px]">
            {unit}
          </span>
        </div>
      </div>
      {/* Custom styled range */}
      <div className="relative h-6 flex items-center">
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-[var(--surface-raised)] overflow-hidden">
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
          onChange={(e) => handleRangeInput(e.target.value)}
          onInput={(e) => handleRangeInput(e.currentTarget.value)}
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
  const handleValueInput = (rawValue: string) => {
    const val = parseFloat(rawValue);
    onChange(isNaN(val) ? 0 : val);
  };

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface)]/40 px-4 py-3 transition-all hover:border-[var(--muted)]">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-[var(--text-soft)]">{label}</div>
        <p className="text-[10px] text-[#555] mt-0.5">{sublabel}</p>
      </div>
      <div className="relative shrink-0">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#666] font-bold">
          R$
        </span>
        <input
          type="number"
          value={value}
          onChange={(e) => handleValueInput(e.target.value)}
          onInput={(e) => handleValueInput(e.currentTarget.value)}
          className="w-28 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] pl-9 pr-3 py-2 font-mono text-sm font-bold text-[var(--text)] outline-none transition-all"
          style={{
            borderColor: undefined,
          }}
          onFocus={(e) =>
            (e.target.style.borderColor = accentColor)
          }
          onBlur={(e) =>
            (e.target.style.borderColor = "var(--line)")
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
    <div className="rounded-xl bg-[var(--surface)]/70 p-4 border border-[var(--line)] transition-all hover:border-[var(--accent)]/20 hover:shadow-[0_4px_20px_rgba(139,92,246,0.06)] group">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--surface-raised)] text-[var(--muted)] group-hover:text-[var(--accent)] transition-colors">
          <Icon size={13} />
        </div>
        <div className="text-[11px] text-[var(--muted)] font-semibold leading-tight">
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
  const language = useVentoStore((state) => state.language);
  const copy = financeCopy[language];

  /* Core financial inputs */
  const [riders, setRiders] = useState<number>(qualityLaunchModel.riders);
  const [hours, setHours] = useState<number>(qualityLaunchModel.hours);
  const [oph, setOph] = useState<number>(qualityLaunchModel.oph);
  const [revenuePerOrder, setRevenuePerOrder] = useState<number>(qualityLaunchModel.revenuePerOrder);
  const [variableCost, setVariableCost] = useState<number>(qualityLaunchModel.variableCost);
  const [fixedCost, setFixedCost] = useState<number>(qualityLaunchModel.fixedCost);

  /* Scenario management */
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [newScenarioName, setNewScenarioName] = useState("");

  const defaultPresets: Scenario[] = [
    {
      id: "preset-small",
      name: copy.presetNames["preset-small"],
      riders: 15,
      hours: 40,
      oph: 1.8,
      revenuePerOrder: 11.5,
      variableCost: 8.5,
      fixedCost: 3500,
    },
    {
      id: "preset-quality-launch",
      name: copy.presetNames["preset-quality-launch"],
      ...qualityLaunchModel,
    },
    {
      id: "preset-medium",
      name: copy.presetNames["preset-medium"],
      riders: 30,
      hours: 48,
      oph: 2.0,
      revenuePerOrder: 12.0,
      variableCost: 9.0,
      fixedCost: 8500,
    },
    {
      id: "preset-large",
      name: copy.presetNames["preset-large"],
      riders: 80,
      hours: 55,
      oph: 2.3,
      revenuePerOrder: 13.0,
      variableCost: 9.5,
      fixedCost: 22000,
    },
  ];
  const scenarioDisplayName = (scenario: Scenario) => copy.presetNames[scenario.id] ?? scenario.name;

  useEffect(() => {
    setMounted(true);
    let loadedScenarios = defaultPresets;
    try {
      const saved = localStorage.getItem("meponto_profit_scenarios");
      if (saved) {
        const parsed = JSON.parse(saved) as Scenario[];
        const customScenarios = parsed.filter((scenario) => scenario.id.startsWith("custom-"));
        loadedScenarios = [
          ...defaultPresets,
          ...customScenarios.filter((custom) => !defaultPresets.some((preset) => preset.id === custom.id)),
        ];
        localStorage.setItem(
          "meponto_profit_scenarios",
          JSON.stringify(loadedScenarios)
        );
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
    setRiders(qualityLaunchModel.riders);
    setHours(qualityLaunchModel.hours);
    setOph(qualityLaunchModel.oph);
    setRevenuePerOrder(qualityLaunchModel.revenuePerOrder);
    setVariableCost(qualityLaunchModel.variableCost);
    setFixedCost(qualityLaunchModel.fixedCost);
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
        `MePonto-finance-model-${Date.now()}.json`
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
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--accent)] border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div data-i18n-skip>
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
          border: 3px solid var(--slider-color, var(--accent));
          box-shadow: 0 0 10px var(--slider-color, var(--accent)),
            0 2px 6px rgba(0, 0, 0, 0.4);
          cursor: grab;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
          position: relative;
          z-index: 2;
        }
        .finance-slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 0 16px var(--slider-color, var(--accent)),
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
          border: 3px solid var(--slider-color, var(--accent));
          box-shadow: 0 0 10px var(--slider-color, var(--accent)),
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
          <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--accent)] font-[family-name:var(--font-outfit)]">
            {copy.eyebrow}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-[family-name:var(--font-outfit)] bg-gradient-to-r from-white via-[#e0e0f0] to-[#8b8ba3] bg-clip-text text-transparent">
            {copy.title}
          </h1>
          <p className="mt-1.5 text-xs text-[#666] max-w-lg">
            {copy.description}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-1.5 text-[11px] font-bold text-[var(--muted)] transition-all hover:border-[var(--accent)]/30 hover:text-[var(--text)]"
          >
            <Download size={12} /> {copy.exportLabel}
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-1.5 text-[11px] font-bold text-[var(--muted)] transition-all hover:border-[var(--accent)]/30 hover:text-[var(--text)]"
          >
            <RefreshCw size={12} /> {copy.resetLabel}
          </button>
        </div>
        </div>

      {/* ─── Scenarios ─── */}
        <div className="mb-5 rounded-xl border border-[var(--line)] bg-[var(--surface)]/60 p-4 backdrop-blur-md">
        <div className="flex flex-wrap gap-2 items-center">
          <Layers size={13} className="text-[var(--accent)]" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#666] mr-2">
            {copy.presets}
          </span>
          {scenarios.map((s) => (
            <button
              key={s.id}
              onClick={() => handleLoadScenario(s)}
              className="group flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)]/50 px-3 py-1.5 text-[11px] font-semibold text-[var(--muted)] transition-all hover:border-[var(--accent)] hover:text-[var(--text)] hover:bg-[var(--accent)]/10"
            >
              {scenarioDisplayName(s)}
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
              placeholder={copy.scenarioPlaceholder}
              value={newScenarioName}
              onChange={(e) => setNewScenarioName(e.target.value)}
              className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)]/50 px-2.5 py-1 text-[11px] text-[var(--text)] placeholder-[var(--muted)] outline-none focus:border-[var(--accent)] w-28"
            />
            <button
              type="submit"
              className="flex items-center gap-1 rounded-lg bg-[var(--accent)] px-2.5 py-1 text-[11px] font-bold text-[var(--accent-ink)] hover:brightness-110 transition-all"
            >
              <Save size={10} /> {copy.save}
            </button>
          </form>
        </div>
        </div>

      {/* ═══ METRICS DASHBOARD ═══ */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-5 animate-fade-in">
        <MetricCard
          title={copy.metrics.revenue}
          value={revenue}
          subtitle={`${fNum(Math.round(totalOrders))} ${copy.metrics.ordersUnit} × R$ ${srpo.toFixed(2)}`}
          icon={DollarSign}
          valueColor="text-[var(--accent)]"
          formatter={fBRL}
        />
        <MetricCard
          title={copy.metrics.totalCost}
          value={totalCost}
          subtitle={`${copy.metrics.fixed} ${fBRL(sfc)} + ${copy.metrics.variable} ${fBRL(totalVarCost)}`}
          icon={BarChart3}
          valueColor="text-[var(--text)]"
          formatter={fBRL}
        />
        <MetricCard
          title={copy.metrics.netProfit}
          value={netProfit}
          subtitle={`${copy.metrics.marginRate} ${fPct(profitMargin)}`}
          icon={netProfit >= 0 ? TrendingUp : TrendingDown}
          valueColor={netProfit >= 0 ? "text-[#06d6a0]" : "text-[#f43f5e]"}
          formatter={fBRL}
        />
        <MetricCard
          title={copy.metrics.contribution}
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
              {copy.sections.revenueVsCosts}
            </h3>
            <div className="space-y-2.5">
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-[var(--muted)]">{copy.sections.revenue}</span>
                  <span className="font-mono font-bold text-[var(--accent)]">
                    {fBRL(revenue)}
                  </span>
                </div>
                <div className="h-5 rounded-md bg-[var(--surface-raised)] overflow-hidden relative">
                  <div
                    className="absolute inset-y-0 left-0 rounded-md transition-all duration-300"
                    style={{
                      width: `${revBarPct}%`,
                      background:
                        "linear-gradient(90deg, var(--accent), var(--accent))",
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-[var(--muted)]">{copy.sections.totalCost}</span>
                  <span className="font-mono font-bold text-[var(--text)]">
                    {fBRL(totalCost)}
                  </span>
                </div>
                <div className="h-5 rounded-md bg-[var(--surface-raised)] overflow-hidden relative">
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
              {copy.sections.costStructure}
            </h3>
            <div className="h-4 rounded-full bg-[var(--surface-raised)] overflow-hidden flex">
              <div
                className="transition-all duration-300 flex items-center justify-center"
                style={{
                  width: `${varPct}%`,
                  background: "linear-gradient(90deg, #fb923c, #f97316)",
                }}
              >
                {varPct > 15 && (
                  <span className="text-[8px] font-bold text-[var(--text)]/80">
                    {copy.sections.variable} {varPct.toFixed(0)}%
                  </span>
                )}
              </div>
              <div
                className="transition-all duration-300 flex items-center justify-center"
                style={{
                  width: `${fixPct}%`,
                  background: "linear-gradient(90deg, var(--accent), var(--accent-strong))",
                }}
              >
                {fixPct > 15 && (
                  <span className="text-[8px] font-bold text-[var(--text)]/80">
                    {copy.sections.fixed} {fixPct.toFixed(0)}%
                  </span>
                )}
              </div>
            </div>
            <div className="flex justify-between mt-2 text-[10px]">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-[#fb923c]" />
                <span className="text-[var(--muted)]">
                  {copy.sections.variableCost} {fBRL(totalVarCost)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                <span className="text-[var(--muted)]">
                  {copy.sections.fixedCost} {fBRL(sfc)}
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
                    ? copy.breakEven.negativeContribution
                    : isBreakEven
                      ? copy.breakEven.reached
                      : copy.breakEven.notReached}
                </div>
                <div className="text-[10px] opacity-70">
                  {contributionMargin <= 0
                    ? copy.breakEven.improve
                    : `${copy.breakEven.prefix} ${Math.ceil(breakEvenOrders)} ${copy.metrics.ordersUnit}, ${copy.breakEven.current} ${fNum(Math.round(totalOrders))} ${copy.metrics.ordersUnit}`}
                </div>
              </div>
            </div>
            {contributionMargin > 0 && (
              <div className="text-right shrink-0">
                <div className="text-[9px] uppercase tracking-wider opacity-50">
                  {copy.breakEven.oph}
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
              {copy.sections.margin}
            </div>

            <div className="relative flex h-36 w-36 items-center justify-center rounded-full">
              <div
                className="absolute inset-0 rounded-full transition-all duration-500"
                style={{
                  background: `conic-gradient(from 180deg, #162032 50%, ${netProfit >= 0 ? "#06d6a0" : "#f43f5e"} 50%, ${netProfit >= 0 ? "#06d6a0" : "#f43f5e"} calc(50% + ${gaugePercent / 2}%), #162032 calc(50% + ${gaugePercent / 2}%), #162032 100%)`,
                  transform: "rotate(-90deg)",
                }}
              />
              <div className="absolute inset-3 rounded-full bg-[var(--surface)] flex flex-col items-center justify-center">
                <AnimatedValue
                  value={profitMargin}
                  formatter={fPct}
                  className={`text-2xl font-extrabold font-[family-name:var(--font-outfit)] ${netProfit >= 0 ? "text-[#06d6a0]" : "text-[#f43f5e]"}`}
                />
                <div className="text-[8px] font-bold text-[#555] uppercase tracking-wider mt-0.5">
                  {netProfit >= 0 ? copy.labels.profit : copy.labels.loss}
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-[var(--surface)] via-[var(--surface)]/80 to-transparent pointer-events-none" />
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
              <Target size={11} className="text-[var(--accent)]" /> {copy.sections.sensitivity}
            </div>
            <div className="rounded-lg bg-[var(--surface)]/60 border border-[var(--line)] p-3">
              <div className="text-[10px] text-[#666]">
                {copy.labels.ridersUp} → {sensRiders} {copy.labels.riders}
              </div>
              <div
                className={`text-xs font-mono font-bold mt-0.5 ${sensProfitRiders >= 0 ? "text-[#06d6a0]" : "text-[#f43f5e]"}`}
              >
                {copy.labels.netProfit} {fBRL(sensProfitRiders)}
                <span className="text-[10px] ml-1 opacity-60">
                  ({sensProfitRiders > netProfit ? "+" : ""}
                  {fBRL(sensProfitRiders - netProfit)})
                </span>
              </div>
            </div>
            <div className="rounded-lg bg-[var(--surface)]/60 border border-[var(--line)] p-3">
              <div className="text-[10px] text-[#666]">
                OPH +0.5 → {sensOph.toFixed(1)}
              </div>
              <div
                className={`text-xs font-mono font-bold mt-0.5 ${sensProfitOph >= 0 ? "text-[#06d6a0]" : "text-[#f43f5e]"}`}
              >
                {copy.labels.netProfit} {fBRL(sensProfitOph)}
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
            {copy.sections.ophScale}
          </h3>
          <div className="relative w-full h-8 flex items-center">
            <div className="absolute left-0 right-0 h-2 rounded-full bg-[var(--surface-raised)]">
              <div
                className="absolute left-0 top-0 bottom-0 rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, (so / 5) * 100)}%`,
                  background: "linear-gradient(90deg, var(--accent), #06d6a0)",
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
              <div className="text-[9px] text-[#666]">{copy.breakEven.line}</div>
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
              <div className="text-[9px] font-bold text-[var(--text)] bg-[var(--accent)]/20 px-1.5 py-0.5 rounded border border-[var(--accent)]/20">
                {copy.labels.current}
              </div>
              <div className="font-mono text-[10px] font-bold text-[var(--text)] mt-0.5">
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
            <Zap size={12} className="text-[var(--accent)]" /> {copy.sections.scaleParams}
          </h3>
          <PremiumSlider
            label={copy.controls.ridersLabel}
            sublabel={copy.controls.ridersSublabel}
            icon={Users}
            value={riders}
            min={1}
            max={150}
            step={1}
            unit={copy.controls.ridersUnit}
            onChange={setRiders}
            color="var(--accent)"
          />
          <PremiumSlider
            label={copy.controls.hoursLabel}
            sublabel={copy.controls.hoursSublabel}
            icon={Clock}
            value={hours}
            min={10}
            max={80}
            step={1}
            unit={copy.controls.hoursUnit}
            onChange={setHours}
            color="#06d6a0"
          />
          <PremiumSlider
            label={copy.controls.ophLabel}
            sublabel={copy.controls.ophSublabel}
            icon={Zap}
            value={oph}
            min={0.5}
            max={5.0}
            step={0.1}
            unit={copy.controls.ophUnit}
            onChange={setOph}
            color="#fb923c"
          />
        </div>

        {/* Financial Inputs */}
        <div className="space-y-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#666] flex items-center gap-1.5 mb-1">
            <DollarSign size={12} className="text-[#06d6a0]" /> {copy.sections.financialSettings}
          </h3>
          <CostInput
            label={copy.controls.revenuePerOrderLabel}
            sublabel={copy.controls.revenuePerOrderSublabel}
            value={revenuePerOrder}
            onChange={setRevenuePerOrder}
            accentColor="var(--accent)"
          />
          <CostInput
            label={copy.controls.variableCostLabel}
            sublabel={copy.controls.variableCostSublabel}
            value={variableCost}
            onChange={setVariableCost}
            accentColor="#fb923c"
          />
          <CostInput
            label={copy.controls.fixedCostLabel}
            sublabel={copy.controls.fixedCostSublabel}
            value={fixedCost}
            onChange={setFixedCost}
            accentColor="#06d6a0"
          />
        </div>
        </div>
      </div>
    </AppShell>
  );
}
