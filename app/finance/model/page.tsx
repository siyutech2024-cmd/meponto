"use client";

import { useState, useEffect } from "react";
import { AppShell } from "../../components/ui";
import { Check, AlertCircle, Save, Trash2, RefreshCw, Download, Layers } from "lucide-react";

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

export default function ProfitModelPage() {
  const [mounted, setMounted] = useState(false);

  // Core financial inputs (always numeric state)
  const [riders, setRiders] = useState<number>(30);
  const [hours, setHours] = useState<number>(48);
  const [oph, setOph] = useState<number>(2.0);
  const [revenuePerOrder, setRevenuePerOrder] = useState<number>(12.0);
  const [variableCost, setVariableCost] = useState<number>(9.0);
  const [fixedCost, setFixedCost] = useState<number>(8500);

  // Scenario management state
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [newScenarioName, setNewScenarioName] = useState("");

  // Default initial presets
  const defaultPresets: Scenario[] = [
    {
      id: "preset-small",
      name: "小型网点 (Micro-Hub)",
      riders: 15,
      hours: 40,
      oph: 1.8,
      revenuePerOrder: 11.5,
      variableCost: 8.5,
      fixedCost: 3500
    },
    {
      id: "preset-medium",
      name: "标准网点 (Hub Padrão)",
      riders: 30,
      hours: 48,
      oph: 2.0,
      revenuePerOrder: 12.0,
      variableCost: 9.0,
      fixedCost: 8500
    },
    {
      id: "preset-large",
      name: "大型旗舰网点 (Macro-Hub)",
      riders: 80,
      hours: 55,
      oph: 2.3,
      revenuePerOrder: 13.0,
      variableCost: 9.5,
      fixedCost: 22000
    }
  ];

  // Prevent hydration mismatches and load initial data safely
  useEffect(() => {
    setMounted(true);
    let loadedScenarios = defaultPresets;
    try {
      const saved = localStorage.getItem("meponto_profit_scenarios");
      if (saved) {
        loadedScenarios = JSON.parse(saved);
      } else {
        localStorage.setItem("meponto_profit_scenarios", JSON.stringify(defaultPresets));
      }
    } catch (e) {
      console.warn("Storage access failed, running in-memory mode", e);
    }
    setScenarios(loadedScenarios);
  }, []);

  // Save current simulation as a custom scenario safely
  const handleSaveScenario = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScenarioName.trim()) return;

    const newScenario: Scenario = {
      id: `custom-${Date.now()}`,
      name: newScenarioName.trim(),
      riders: isNaN(riders) ? 30 : riders,
      hours: isNaN(hours) ? 48 : hours,
      oph: isNaN(oph) ? 2.0 : oph,
      revenuePerOrder: isNaN(revenuePerOrder) ? 12.0 : revenuePerOrder,
      variableCost: isNaN(variableCost) ? 9.0 : variableCost,
      fixedCost: isNaN(fixedCost) ? 8500 : fixedCost
    };

    const updated = [...scenarios, newScenario];
    setScenarios(updated);
    try {
      localStorage.setItem("meponto_profit_scenarios", JSON.stringify(updated));
    } catch (err) {
      console.warn("Could not save to localStorage", err);
    }
    setNewScenarioName("");
  };

  // Delete a scenario safely
  const handleDeleteScenario = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = scenarios.filter(s => s.id !== id);
    setScenarios(updated);
    try {
      localStorage.setItem("meponto_profit_scenarios", JSON.stringify(updated));
    } catch (err) {
      console.warn("Could not delete from localStorage", err);
    }
  };

  // Load selected scenario
  const handleLoadScenario = (s: Scenario) => {
    setRiders(s.riders);
    setHours(s.hours);
    setOph(s.oph);
    setRevenuePerOrder(s.revenuePerOrder);
    setVariableCost(s.variableCost);
    setFixedCost(s.fixedCost);
  };

  // Reset to default standard configuration
  const handleReset = () => {
    setRiders(30);
    setHours(48);
    setOph(2.0);
    setRevenuePerOrder(12.0);
    setVariableCost(9.0);
    setFixedCost(8500);
  };

  // Export scenario to JSON safely
  const handleExport = () => {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({
        riders,
        hours,
        oph,
        revenuePerOrder,
        variableCost,
        fixedCost,
        exportedAt: new Date().toISOString()
      }, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `meponto-finance-model-${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (err) {
      console.error("Export failed", err);
    }
  };

  // Defensive Math Calculations (prevent NaN and crashes)
  const safeRiders = isNaN(riders) ? 0 : riders;
  const safeHours = isNaN(hours) ? 0 : hours;
  const safeOph = isNaN(oph) ? 0.0 : oph;
  const safeRevenuePerOrder = isNaN(revenuePerOrder) ? 0.0 : revenuePerOrder;
  const safeVariableCost = isNaN(variableCost) ? 0.0 : variableCost;
  const safeFixedCost = isNaN(fixedCost) ? 0 : fixedCost;

  const totalOrders = safeRiders * safeHours * safeOph;
  const revenue = totalOrders * safeRevenuePerOrder;
  const totalVarCost = totalOrders * safeVariableCost;
  const totalCost = totalVarCost + safeFixedCost;
  const netProfit = revenue - totalCost;
  const profitMargin = revenue > 0 ? netProfit / revenue : 0;
  
  // Contribution Margin & Break-even dynamics
  const contributionMargin = safeRevenuePerOrder - safeVariableCost;
  const breakEvenOph = contributionMargin > 0 && safeRiders > 0 && safeHours > 0 
    ? safeFixedCost / (safeRiders * safeHours * contributionMargin) 
    : 0;
  
  // Break-even orders
  const breakEvenOrders = contributionMargin > 0 ? safeFixedCost / contributionMargin : 0;
  
  const isBreakEven = safeOph >= breakEvenOph && contributionMargin > 0;

  // Currency & Percentage formatters
  const formatBRL = (val: number) => {
    const safeVal = isNaN(val) || !isFinite(val) ? 0 : val;
    const sign = safeVal < 0 ? "-" : "";
    return `${sign}R$ ${Math.abs(safeVal).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const formatPercent = (val: number) => {
    const safeVal = isNaN(val) || !isFinite(val) ? 0 : val;
    return `${(safeVal * 100).toFixed(1)}%`;
  };
  
  // Progress clamping for the semi-circle gauge (0 to 100%)
  const progressPercent = Math.max(0, Math.min(100, profitMargin * 100));

  if (!mounted) {
    return (
      <AppShell>
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#8b5cf6] border-t-transparent"></div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Page Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 animate-fade-in">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-[#8b5cf6]">SIMULAÇÃO FINANCEIRA DE HUB</div>
          <h1 className="text-3xl font-extrabold tracking-tight font-[family-name:var(--font-outfit)] bg-gradient-to-r from-white to-[#c4c4d4] bg-clip-text text-transparent">
            物流网点动态利润核算模型
          </h1>
          <p className="mt-2 text-sm text-[#8b8ba3]">
            适配巴西本地网点周运营数据，支持自定义参数滑块与盈亏平衡深度测算。
          </p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] px-4 py-2 text-xs font-bold text-white transition-all hover:bg-[#2a2a4a]"
          >
            <Download size={14} /> 导出配置
          </button>
          <button 
            onClick={handleReset}
            className="flex items-center gap-2 rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] px-4 py-2 text-xs font-bold text-white transition-all hover:bg-[#2a2a4a]"
          >
            <RefreshCw size={14} /> 重置参数
          </button>
        </div>
      </div>

      {/* Scenarios / Presets Section */}
      <div className="mb-6 rounded-2xl border border-[#2a2a4a] bg-[#0d0d1a]/80 p-5 backdrop-blur-md">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#8b8ba3] flex items-center gap-2">
          <Layers size={14} className="text-[#8b5cf6]" /> 预设场景与配置方案 (Cenários e Modelos)
        </h3>
        <div className="flex flex-wrap gap-2 items-center">
          {scenarios.map((s) => (
            <button
              key={s.id}
              onClick={() => handleLoadScenario(s)}
              className="group flex items-center gap-2 rounded-xl border border-[#2a2a4a] bg-[#1a1a2e]/60 px-3.5 py-2 text-xs font-semibold text-[#c4c4d4] transition-all hover:border-[#8b5cf6] hover:bg-[#1a1a2e]"
            >
              <span>{s.name}</span>
              {s.id.startsWith("custom-") && (
                <Trash2 
                  size={12} 
                  className="text-red-500 opacity-60 hover:opacity-100 transition-opacity" 
                  onClick={(e) => handleDeleteScenario(s.id, e)}
                />
              )}
            </button>
          ))}
          
          <form onSubmit={handleSaveScenario} className="ml-auto flex items-center gap-2">
            <input
              type="text"
              placeholder="命名当前方案..."
              value={newScenarioName}
              onChange={(e) => setNewScenarioName(e.target.value)}
              className="rounded-xl border border-[#2a2a4a] bg-[#1a1a2e]/50 px-3 py-1.5 text-xs text-white placeholder-[#555] outline-none focus:border-[#8b5cf6]"
            />
            <button
              type="submit"
              className="flex items-center gap-1 rounded-xl bg-[#8b5cf6] px-3 py-1.5 text-xs font-bold text-white transition-all hover:brightness-110"
            >
              <Save size={12} /> 保存方案
            </button>
          </form>
        </div>
      </div>

      {/* Main Analysis Dashboard */}
      <div className="grid gap-6 lg:grid-cols-3 mb-6">
        
        {/* Core Indicators */}
        <div className="lg:col-span-2 panel p-6 industrial-shadow relative overflow-hidden flex flex-col justify-between">
          <div className="absolute -top-32 -right-32 w-96 h-96 bg-[#8b5cf6]/5 rounded-full blur-3xl pointer-events-none" />
          
          <div>
            <h3 className="text-lg font-bold text-white mb-4">财务核算报表 (Balanço de Resultados)</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-[#1a1a2e]/60 p-4 border border-[#2a2a4a] transition-all hover:border-[#8b5cf6]/30">
                <div className="text-xs text-[#8b8ba3] font-semibold">每周预计营业额 (Faturamento)</div>
                <div className="mt-1.5 font-mono text-2xl font-bold text-[#8b5cf6]">{formatBRL(revenue)}</div>
                <div className="text-[10px] text-[#555] mt-1">周总单量: {totalOrders.toFixed(0)} 单</div>
              </div>
              
              <div className="rounded-xl bg-[#1a1a2e]/60 p-4 border border-[#2a2a4a] transition-all hover:border-[#8b5cf6]/30">
                <div className="text-xs text-[#8b8ba3] font-semibold">每周总成本 (Custo Total)</div>
                <div className="mt-1.5 font-mono text-2xl font-bold text-white">{formatBRL(totalCost)}</div>
                <div className="text-[10px] text-[#555] mt-1">
                  固定: {formatBRL(safeFixedCost)} | 变动: {formatBRL(totalVarCost)}
                </div>
              </div>

              <div className="rounded-xl bg-[#1a1a2e]/60 p-4 border border-[#2a2a4a] transition-all hover:border-[#8b5cf6]/30">
                <div className="text-xs text-[#8b8ba3] font-semibold">单票边际贡献 (Margem de Contribuição)</div>
                <div className={`mt-1.5 font-mono text-2xl font-bold ${contributionMargin > 0 ? "text-[#06d6a0]" : "text-[#f43f5e]"}`}>
                  {formatBRL(contributionMargin)}
                </div>
                <div className="text-[10px] text-[#555] mt-1">结算价 R$ {safeRevenuePerOrder.toFixed(2)} - 变动成本 R$ {safeVariableCost.toFixed(2)}</div>
              </div>

              <div className="rounded-xl bg-[#1a1a2e]/60 p-4 border border-[#2a2a4a] transition-all hover:border-[#8b5cf6]/30">
                <div className="text-xs text-[#8b8ba3] font-semibold">每周净利润 (Lucro Líquido)</div>
                <div className={`mt-1.5 font-mono text-2xl font-bold ${netProfit >= 0 ? "text-[#06d6a0]" : "text-[#f43f5e]"}`}>
                  {formatBRL(netProfit)}
                </div>
                <div className="text-[10px] text-[#555] mt-1">利润率: {formatPercent(profitMargin)}</div>
              </div>
            </div>
          </div>

          {/* Break-even Status Banner */}
          <div className={`mt-6 rounded-xl border p-4 flex items-center justify-between gap-3 ${
            contributionMargin <= 0 
              ? 'border-red-500/20 bg-red-500/5 text-red-400'
              : isBreakEven 
                ? 'border-[#06d6a0]/20 bg-[#06d6a0]/5 text-[#06d6a0]' 
                : 'border-[#f43f5e]/20 bg-[#f43f5e]/5 text-[#f43f5e]'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                contributionMargin <= 0 ? 'bg-red-500/10' : isBreakEven ? 'bg-[#06d6a0]/10' : 'bg-[#f43f5e]/10'
              }`}>
                {contributionMargin <= 0 ? <AlertCircle size={18} /> : isBreakEven ? <Check size={18} /> : <AlertCircle size={18} />}
              </div>
              <div>
                <div className="text-sm font-bold">
                  {contributionMargin <= 0 
                    ? "亏损警告：单票结算价低于变动成本！" 
                    : isBreakEven 
                      ? "网点已达到盈亏平衡状态" 
                      : "网点处于亏损状态，需要提升效率或规模"}
                </div>
                <div className="text-xs opacity-80 mt-0.5">
                  {contributionMargin <= 0 
                    ? "请重新配置合理的结算价或降低变动成本" 
                    : `盈亏平衡单量为 ${Math.ceil(breakEvenOrders)} 单，当前单量 ${totalOrders.toFixed(0)} 单`}
                </div>
              </div>
            </div>
            
            {contributionMargin > 0 && (
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider opacity-60">盈亏平衡 OPH</div>
                <div className="font-mono font-bold text-lg">{breakEvenOph.toFixed(2)}</div>
              </div>
            )}
          </div>
        </div>

        {/* Circular Gauge Card */}
        <div className="panel p-6 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-[#06d6a0]/5 rounded-full blur-3xl pointer-events-none" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#8b8ba3] mb-6 self-start">网点利润率 (Margem)</h3>
          
          <div className="relative flex h-52 w-52 items-center justify-center rounded-full">
            {/* Conic gradient for the active border ring */}
            <div 
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(from 180deg, #162032 50%, #06d6a0 50%, #06d6a0 calc(50% + ${progressPercent / 2}%), #162032 calc(50% + ${progressPercent / 2}%), #162032 100%)`,
                transform: 'rotate(-90deg)'
              }}
            />
            {/* Mask to hollow out the center and create a dynamic ring */}
            <div className="absolute inset-4 rounded-full bg-[#0d0d1a] flex flex-col items-center justify-center">
              <div className={`text-4xl font-extrabold font-[family-name:var(--font-outfit)] ${netProfit >= 0 ? 'text-[#06d6a0]' : 'text-[#f43f5e]'}`}>
                {formatPercent(profitMargin)}
              </div>
              <div className="text-[10px] font-bold text-[#8b8ba3] uppercase tracking-wider mt-1">
                {netProfit >= 0 ? "Lucro Líquido" : "Prejuízo"}
              </div>
            </div>
            {/* Bottom half visual masking for high-end look */}
            <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-[#0d0d1a] via-[#0d0d1a]/85 to-transparent pointer-events-none" />
          </div>
          
          <div className="text-center mt-2 z-10">
            <span className="text-xs text-[#8b8ba3]">预计每周净收益为</span>
            <div className={`text-lg font-bold font-mono mt-0.5 ${netProfit >= 0 ? 'text-[#06d6a0]' : 'text-[#f43f5e]'}`}>
              {formatBRL(netProfit)}
            </div>
          </div>
        </div>
      </div>

      {/* Break-even slider bar */}
      {contributionMargin > 0 && (
        <div className="panel p-6 mb-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#8b8ba3] mb-8">
            配送效率盈亏线指示器 (Escala de Ponto de Equilíbrio - OPH)
          </h3>
          
          <div className="relative w-full h-8 flex items-center">
            {/* The core bar track */}
            <div className="absolute left-0 right-0 h-3 rounded-full bg-[#2a2a4a] shadow-inner">
              {/* Highlight active zone */}
              <div 
                className="absolute left-0 top-0 bottom-0 rounded-full bg-gradient-to-r from-[#8b5cf6] to-[#06d6a0]"
                style={{ width: `${Math.min(100, (safeOph / 5) * 100)}%` }}
              />
              
              {/* Break-even point vertical indicator */}
              <div 
                className="absolute top-1/2 h-8 w-1.5 -translate-y-1/2 rounded-full bg-[#8b8ba3] shadow-[0_0_8px_rgba(255,255,255,0.4)] transition-all" 
                style={{ left: `${Math.min(100, (breakEvenOph / 5) * 100)}%` }}
              />
              
              {/* Current OPH point vertical indicator */}
              <div 
                className="absolute top-1/2 h-8 w-1.5 -translate-y-1/2 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.8)] transition-all" 
                style={{ left: `${Math.min(100, (safeOph / 5) * 100)}%` }}
              />
            </div>
          </div>

          {/* Labels & Details beneath the scale */}
          <div className="relative w-full h-12 mt-2">
            <div 
              className="absolute text-center whitespace-nowrap transition-all"
              style={{ left: `${Math.min(100, (breakEvenOph / 5) * 100)}%`, transform: 'translateX(-50%)' }}
            >
              <div className="text-[10px] font-bold text-[#8b8ba3] uppercase tracking-wider">盈亏平衡线 (Break-even)</div>
              <div className="font-mono text-xs font-semibold text-[#8b8ba3]">{breakEvenOph.toFixed(2)} OPH</div>
            </div>

            <div 
              className="absolute text-center whitespace-nowrap transition-all"
              style={{ left: `${Math.min(100, (safeOph / 5) * 100)}%`, transform: 'translateX(-50%)' }}
            >
              <div className="text-[10px] font-bold text-white uppercase tracking-wider bg-[#8b5cf6]/20 px-2 py-0.5 rounded-full border border-[#8b5cf6]/30">当前工作效率</div>
              <div className="font-mono text-xs font-bold text-white mt-0.5">{safeOph.toFixed(2)} OPH</div>
            </div>
          </div>
        </div>
      )}

      {/* Simulation Controls Room */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sliders Area */}
        <div className="space-y-6 rounded-2xl border border-[#2a2a4a] bg-[#0d0d1a]/50 p-6 backdrop-blur-sm">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#8b8ba3]">规模与效率滑块 (Escala e OPH)</h3>
          
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <label className="text-sm font-semibold text-[#c4c4d4]">网点骑手人数 (Riders)</label>
              <div className="relative flex items-center">
                <input 
                  type="number" 
                  min="1" 
                  max="1000" 
                  value={riders} 
                  onChange={e => {
                    const val = parseInt(e.target.value, 10);
                    setRiders(isNaN(val) ? 0 : Math.max(0, Math.min(1000, val)));
                  }} 
                  className="w-24 rounded-lg border border-[#8b5cf6]/30 bg-[#8b5cf6]/10 text-center font-mono font-bold text-[#c4c4d4] py-1 pr-6 pl-2 focus:border-[#8b5cf6] outline-none"
                />
                <span className="absolute right-2 text-[10px] font-bold text-[#8b8ba3] pointer-events-none">人</span>
              </div>
            </div>
            <input 
              type="range" 
              min="1" 
              max="150" 
              step="1" 
              value={safeRiders} 
              onChange={e => setRiders(parseInt(e.target.value, 10))} 
              className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-[#2a2a4a] accent-[#8b5cf6]" 
            />
            <div className="flex justify-between text-[10px] text-[#555]">
              <span>1 人</span>
              <span>150 人</span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <label className="text-sm font-semibold text-[#c4c4d4]">周人均工时 (Jornada Semanal)</label>
              <div className="relative flex items-center">
                <input 
                  type="number" 
                  min="1" 
                  max="168" 
                  value={hours} 
                  onChange={e => {
                    const val = parseInt(e.target.value, 10);
                    setHours(isNaN(val) ? 0 : Math.max(0, Math.min(168, val)));
                  }} 
                  className="w-24 rounded-lg border border-[#8b5cf6]/30 bg-[#8b5cf6]/10 text-center font-mono font-bold text-[#c4c4d4] py-1 pr-10 pl-2 focus:border-[#8b5cf6] outline-none"
                />
                <span className="absolute right-2 text-[10px] font-bold text-[#8b8ba3] pointer-events-none">小时</span>
              </div>
            </div>
            <input 
              type="range" 
              min="10" 
              max="80" 
              step="1" 
              value={safeHours} 
              onChange={e => setHours(parseInt(e.target.value, 10))} 
              className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-[#2a2a4a] accent-[#8b5cf6]" 
            />
            <div className="flex justify-between text-[10px] text-[#555]">
              <span>10 小时</span>
              <span>80 小时</span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <label className="text-sm font-semibold text-[#c4c4d4]">配送每小时单量 (OPH)</label>
              <div className="relative flex items-center">
                <input 
                  type="number" 
                  min="0.1" 
                  max="20" 
                  step="0.1"
                  value={oph} 
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    setOph(isNaN(val) ? 0.0 : Math.max(0, Math.min(20, val)));
                  }} 
                  className="w-24 rounded-lg border border-[#8b5cf6]/30 bg-[#8b5cf6]/10 text-center font-mono font-bold text-[#c4c4d4] py-1 pr-10 pl-2 focus:border-[#8b5cf6] outline-none"
                />
                <span className="absolute right-2 text-[10px] font-bold text-[#8b8ba3] pointer-events-none">OPH</span>
              </div>
            </div>
            <input 
              type="range" 
              min="0.5" 
              max="5.0" 
              step="0.1" 
              value={safeOph} 
              onChange={e => setOph(parseFloat(e.target.value))} 
              className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-[#2a2a4a] accent-[#8b5cf6]" 
            />
            <div className="flex justify-between text-[10px] text-[#555]">
              <span>0.5 OPH</span>
              <span>5.0 OPH</span>
            </div>
          </div>
        </div>

        {/* Precision Inputs Area */}
        <div className="space-y-6 rounded-2xl border border-[#2a2a4a] bg-[#0d0d1a]/50 p-6 flex flex-col justify-center backdrop-blur-sm">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#8b8ba3] mb-2">财务成本明细精确设定 (Valores Financeiros)</h3>
          
          <div className="flex items-center justify-between gap-4">
            <div>
              <label className="text-sm font-semibold text-[#c4c4d4]">单票配送结算价 (Valor por Pedido)</label>
              <p className="text-[10px] text-[#8b8ba3] mt-0.5">从上游物流平台获取的单票收入</p>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#8b8ba3] font-bold">R$</span>
              <input 
                type="number" 
                value={revenuePerOrder} 
                onChange={e => setRevenuePerOrder(parseFloat(e.target.value) || 0)} 
                className="w-32 rounded-lg border border-[#2a2a4a] bg-[#1a1a2e] pl-9 pr-4 py-2 font-mono font-bold text-white outline-none transition-colors focus:border-[#06d6a0]" 
              />
            </div>
          </div>
          
          <div className="flex items-center justify-between gap-4">
            <div>
              <label className="text-sm font-semibold text-[#c4c4d4]">单票配送变动成本 (Custo Variável)</label>
              <p className="text-[10px] text-[#8b8ba3] mt-0.5">包含支付给骑手的配送费及其他变动费用</p>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#8b8ba3] font-bold">R$</span>
              <input 
                type="number" 
                value={variableCost} 
                onChange={e => setVariableCost(parseFloat(e.target.value) || 0)} 
                className="w-32 rounded-lg border border-[#2a2a4a] bg-[#1a1a2e] pl-9 pr-4 py-2 font-mono font-bold text-white outline-none transition-colors focus:border-[#06d6a0]" 
              />
            </div>
          </div>
          
          <div className="flex items-center justify-between gap-4">
            <div>
              <label className="text-sm font-semibold text-[#c4c4d4]">每周网点固定成本 (Custo Fixo Semanal)</label>
              <p className="text-[10px] text-[#8b8ba3] mt-0.5">包含网点租金、宽带水电及管理层每周薪资</p>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#8b8ba3] font-bold">R$</span>
              <input 
                type="number" 
                value={fixedCost} 
                onChange={e => setFixedCost(parseInt(e.target.value, 10) || 0)} 
                className="w-32 rounded-lg border border-[#2a2a4a] bg-[#1a1a2e] pl-9 pr-4 py-2 font-mono font-bold text-white outline-none transition-colors focus:border-[#06d6a0]" 
              />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
