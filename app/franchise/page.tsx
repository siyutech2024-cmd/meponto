"use client";

import { AlertTriangle, CalendarDays, CheckCircle2, FileText, MapPinned, Target, TrendingUp } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../components/ui";
import type { Language } from "../lib/i18n";
import { useVentoStore } from "../lib/store";

type CardTuple = [string, string, string?];

type FranchiseCopy = {
  title: string;
  eyebrow: string;
  commercialTerms: CardTuple[];
  governance: {
    eyebrow: string;
    title: string;
    badge: string;
    cards: CardTuple[];
  };
  productTitle: string;
  productEyebrow: string;
  productMilestones: Array<{ title: string; items: string[] }>;
  pricingTitle: string;
  pricingEyebrow: string;
  monthlyPricing: CardTuple[];
  siteTitle: string;
  siteEyebrow: string;
  siteSop: CardTuple[];
  lifecycleTitle: string;
  lifecycleEyebrow: string;
  lifecycleMeta: string;
  riderLifecycle: CardTuple[];
  dataTitle: string;
  dataEyebrow: string;
  dataSupport: CardTuple[];
  batchTitle: string;
  batchEyebrow: string;
  batchCards: CardTuple[];
  futureTitle: string;
  futureEyebrow: string;
  futureStation: CardTuple[];
  cadenceTitle: string;
  cadenceEyebrow: string;
  cadenceCards: CardTuple[];
  exitTitle: string;
  exitDescription: string;
  docTitle: string;
  docDescription: string;
  dateTitle: string;
  dateDescription: string;
  targetTitle: string;
  targetDescription: string;
  modelTitle: string;
  modelDescription: string;
};

const franchiseCopies: Record<Language, FranchiseCopy> = {
  zh: {
    title: "加盟商合作方案",
    eyebrow: "首店 / Quality 12 / 三个月保护期",
    commercialTerms: [
      ["Quality 定价", "12", "首店基准价，作为加盟商运营和 KPI 浮动的基础。"],
      ["KPI 浮动", "80%-120%", "围绕 Quality 定价上下 20%，奖励和扣减按月度 KPI 规则执行。"],
      ["房租支持", "50% / 3个月", "前三个月房租由 MePonto 承担一半，加盟商承担一半。"],
      ["保护期", "3个月", "三个月后加盟商可选择继续运营或退出运营。"],
    ],
    governance: {
      eyebrow: "Governance",
      title: "合作原则与决策权",
      badge: "MePonto operating logic prevails",
      cards: [
        ["加盟商职责", "负责本地站点执行、骑手招募承接、现场管理、日常反馈、资产维护和问题上报。"],
        ["MePonto 支持", "提供 PontoSys、运营模型、数据支持、定价政策、SOP 标准、培训、复盘和关键问题决策。"],
        ["意见分歧处理", "先复盘数据和现场证据；如仍无法统一，以 MePonto 的运营思路和标准 SOP 为最终执行口径。"],
      ],
    },
    productTitle: "6 月中旬产品功能",
    productEyebrow: "Product milestone",
    productMilestones: [
      {
        title: "Binding & Slot management",
        items: [
          "During slots 可正常接 food orders。",
          "Outside slots 不可接 food 和 mobility orders。",
          "Slot duration 内不可 leave slots，第一版可不强制。",
          "不可 unbind OL 并切换到 Cloud。",
        ],
      },
      {
        title: "Courier income & perception",
        items: [
          "Broadcast cards 不显示 order income。",
          "D-app account 不接收 orders income。",
          "不接收 incentives。",
          "Earnings page / Order details 不显示 income。",
        ],
      },
    ],
    pricingTitle: "月度定价机制",
    pricingEyebrow: "Pricing",
    monthlyPricing: [
      ["月底定价", "例如 5 月底确定 6 月固定价格和 KPI 规则。"],
      ["6 月口径", "Total 12；不算世界杯；不算 0.2-0.3 commission fee；包含参考活动费用 2-3。"],
      ["骑手支持", "骑手支持成本需要体现在定价中，并和下月政策一起同步。"],
      ["KPI 项目", "6 月 KPI 考核项目暂不变化，先沿用现有考核项目。"],
    ],
    siteTitle: "6 月 2 日站点 SOP",
    siteEyebrow: "Site launch",
    siteSop: [
      ["站点位置", "6 月 2 日前明确具体位置、功能、人员配置和服务范围。"],
      ["站点功能", "招聘到场、资料核验、新骑手培训、全职骑手签到、异常升级和数据反馈。"],
      ["骑手生命周期", "新骑手入职、新骑手培训运营、提升、留存、淘汰/退出。"],
      ["招聘 SOP", "确认来源、判断标准、到场预约、资料核验、注册协助、绑定和首班转化。"],
      ["运营过程", "围绕骑手选、用、育、留执行，加盟商需与 MePonto 讨论并确认 SOP。"],
    ],
    lifecycleTitle: "骑手生命周期",
    lifecycleEyebrow: "Rider lifecycle",
    lifecycleMeta: "选用育留",
    riderLifecycle: [
      ["选", "判断骑手是否有 moto、是否接受 Ponto 管理、是否能稳定排班和执行 slot。"],
      ["用", "根据 hotzone、slot、峰值时段和站点目标安排骑手使用。"],
      ["育", "通过培训、复盘、陪跑和异常纠正提升 AR、OPH、在线纪律和安全习惯。"],
      ["留", "通过稳定排班、问题响应、后市场服务和成长路径提高留存。"],
    ],
    dataTitle: "数据支持与运营同步",
    dataEyebrow: "Data support",
    dataSupport: [
      ["云骑手次日单均", "MePonto 提供给加盟商作为价格、运力和站点策略参考。"],
      ["Hotzone 周同步", "每周同步 hotzone，用于排班、招聘目标和骑手调度。"],
      ["Hotzone 分时段同步", "按时段同步热区，支持 slot 管理和高峰期站点运营。"],
      ["PontoSys 数据", "提供 D-1 站点数据、骑手表现、异常队列、招聘转化和财务对账。"],
    ],
    batchTitle: "合单与追单策略",
    batchEyebrow: "Batch order",
    batchCards: [
      ["SP 口径", "合单策略暂不确定 SP 适用口径，最终执行前需要结合平台规则、骑手接受度和单均影响测算。"],
      ["追单价格", "追单价格暂按一样价格处理。"],
      ["合单降价", "初步考虑 -30% 到 -50%，执行前需由 MePonto 确认。"],
    ],
    futureTitle: "骑手驿站后期发展",
    futureEyebrow: "Future station model",
    futureStation: [
      ["平台佣金", "参考中国模型，一天 1000 单可盈利；当前目标为 20 名骑手达到持平。"],
      ["骑手后市场", "工具、租车优惠、骑手宿舍、信用卡、手机、加油卡、电话卡等由 MePonto 统一接入。"],
      ["载具和闲散订单", "后期围绕载具供给、闲散订单分配和站点服务变现。"],
    ],
    cadenceTitle: "月度/季度管理节奏",
    cadenceEyebrow: "Operating cadence",
    cadenceCards: [
      ["每周", "同步 hotzone、分时段热区、站点问题、招聘转化、骑手表现和异常闭环。", "Weekly"],
      ["每月底", "确定下月 Quality 定价、KPI、活动费用、骑手支持、云骑手对标和整体政策。", "Monthly"],
      ["三个月", "复盘保护期结果，决定继续运营、调整模型或退出运营。", "Quarterly"],
      ["红线", "未经 MePonto 确认，不得自行对外承诺价格、收入、补贴、处罚、平台政策或产品能力。", "Control"],
    ],
    exitTitle: "首店退出与交接原则",
    exitDescription:
      "三个月后如加盟商选择退出，必须完成骑手、站点资产、未结订单、付款争议、投诉、事故、PontoSys 数据和 hotzone 执行记录交接；未闭环事项必须明确责任人、状态和预计完成时间。",
    docTitle: "文档版本",
    docDescription: "franchise-cooperation-plan.md",
    dateTitle: "关键日期",
    dateDescription: "6 月 2 日站点 SOP，6 月中旬产品功能。",
    targetTitle: "站点目标",
    targetDescription: "当前目标 20 名骑手达到持平。",
    modelTitle: "长期模型",
    modelDescription: "平台佣金 + 骑手后市场 + 载具和闲散订单。",
  },
  en: {
    title: "Franchise Cooperation Plan",
    eyebrow: "First site / Quality 12 / 3-month protection",
    commercialTerms: [
      ["Quality price", "12", "Baseline price for the first site and the foundation for KPI-based adjustment."],
      ["KPI range", "80%-120%", "Monthly KPI reward or deduction moves within plus or minus 20% of the Quality price."],
      ["Rent support", "50% / 3 months", "For the first three months, MePonto covers half of the rent and the franchisee covers half."],
      ["Protection period", "3 months", "After three months, the franchisee may continue operations or exit."],
    ],
    governance: {
      eyebrow: "Governance",
      title: "Operating Principles and Decision Rights",
      badge: "MePonto operating logic prevails",
      cards: [
        ["Franchisee role", "Own local execution, rider recruitment handoff, on-site management, daily feedback, asset care and issue escalation."],
        ["MePonto support", "Provide PontoSys, the operating model, data support, pricing policy, SOP standards, training, reviews and key decisions."],
        ["Disagreement rule", "Review data and field evidence first. If alignment is still not possible, MePonto operating logic and SOP standards prevail."],
      ],
    },
    productTitle: "Mid-June Product Scope",
    productEyebrow: "Product milestone",
    productMilestones: [
      {
        title: "Binding & Slot management",
        items: [
          "Food orders can be received normally during slots.",
          "Outside slots, riders cannot receive food or mobility orders.",
          "Leaving slots during slot duration is not mandatory for the first version.",
          "Riders cannot unbind from OL and switch to Cloud.",
        ],
      },
      {
        title: "Courier income & perception",
        items: [
          "Broadcast cards cannot display order income.",
          "Order income cannot be received in the d-app account.",
          "Riders cannot receive incentives.",
          "Earnings page and order details cannot display income.",
        ],
      },
    ],
    pricingTitle: "Monthly Pricing Mechanism",
    pricingEyebrow: "Pricing",
    monthlyPricing: [
      ["Month-end pricing", "For example, pricing and KPI rules for June are confirmed at the end of May."],
      ["June basis", "Total 12; excludes World Cup effects; excludes 0.2-0.3 commission fee; includes reference activity cost of 2-3."],
      ["Rider support", "Rider support cost must be reflected in pricing and synchronized with next-month policy."],
      ["KPI items", "June KPI items remain unchanged and continue with the current assessment model."],
    ],
    siteTitle: "June 2 Site SOP",
    siteEyebrow: "Site launch",
    siteSop: [
      ["Site location", "Confirm exact location, function, staffing and service scope by June 2."],
      ["Site functions", "Recruitment arrival, document check, new rider training, full-time rider check-in, escalation and data feedback."],
      ["Rider lifecycle", "New rider onboarding, training operations, improvement, retention and exit."],
      ["Recruitment SOP", "Define source, qualification, booking, document check, registration support, binding and first-shift conversion."],
      ["Operating process", "Run rider selection, utilization, development and retention with SOP confirmed by MePonto and the franchisee."],
    ],
    lifecycleTitle: "Rider Lifecycle",
    lifecycleEyebrow: "Rider lifecycle",
    lifecycleMeta: "Select / Use / Develop / Retain",
    riderLifecycle: [
      ["Select", "Assess motorcycle availability, Ponto management acceptance, schedule stability and slot compliance."],
      ["Use", "Allocate riders based on hotzones, slots, peak periods and site targets."],
      ["Develop", "Improve AR, OPH, online discipline and safety habits through training, reviews and coaching."],
      ["Retain", "Increase retention through stable scheduling, issue response, after-market services and growth paths."],
    ],
    dataTitle: "Data Support and Operations Sync",
    dataEyebrow: "Data support",
    dataSupport: [
      ["Cloud rider next-day AOV", "MePonto provides this to support pricing, capacity and site strategy."],
      ["Weekly hotzone sync", "Weekly hotzone updates support scheduling, recruitment goals and rider dispatch."],
      ["Time-based hotzone sync", "Hourly or daypart hotzone views support slot management and peak operations."],
      ["PontoSys data", "D-1 site data, rider performance, exception queues, recruitment conversion and finance reconciliation."],
    ],
    batchTitle: "Batch and Follow-up Order Strategy",
    batchEyebrow: "Batch order",
    batchCards: [
      ["SP rule", "The SP rule for batch orders is not confirmed yet and must be validated before execution."],
      ["Follow-up price", "Follow-up order price is temporarily treated as the same price."],
      ["Batch discount", "Initial range is -30% to -50%, subject to MePonto confirmation before execution."],
    ],
    futureTitle: "Future Rider Station Model",
    futureEyebrow: "Future station model",
    futureStation: [
      ["Platform commission", "Reference China model: 1,000 daily orders can be profitable; current target is break-even with 20 riders."],
      ["Rider after-market", "Tools, rental discounts, rider housing, credit cards, phones, fuel cards and SIM cards are integrated by MePonto."],
      ["Vehicles and idle orders", "Future monetization around vehicle supply, idle order allocation and station services."],
    ],
    cadenceTitle: "Monthly and Quarterly Cadence",
    cadenceEyebrow: "Operating cadence",
    cadenceCards: [
      ["Weekly", "Sync hotzones, time-based zones, site issues, recruitment conversion, rider performance and exception closeout.", "Weekly"],
      ["Month end", "Confirm next-month Quality price, KPI, activity cost, rider support, Cloud rider benchmark and policy.", "Monthly"],
      ["Three months", "Review protection-period results and decide whether to continue, adjust or exit.", "Quarterly"],
      ["Red line", "No external promise on price, income, subsidy, penalty, platform policy or product capability without MePonto approval.", "Control"],
    ],
    exitTitle: "First-site Exit and Handoff Principles",
    exitDescription:
      "If the franchisee exits after three months, rider handoff, site assets, open orders, payment disputes, complaints, incidents, PontoSys data and hotzone execution records must be transferred with clear owners, status and due dates.",
    docTitle: "Document version",
    docDescription: "franchise-cooperation-plan.md",
    dateTitle: "Key dates",
    dateDescription: "June 2 site SOP and mid-June product scope.",
    targetTitle: "Site target",
    targetDescription: "Current target: 20 riders to reach break-even.",
    modelTitle: "Long-term model",
    modelDescription: "Platform commission + rider after-market + vehicles and idle orders.",
  },
  pt: {
    title: "Plano de Cooperação de Franquia",
    eyebrow: "Primeira loja / Quality 12 / Proteção de 3 meses",
    commercialTerms: [
      ["Preço Quality", "12", "Preço base da primeira loja e referência para o ajuste por KPI."],
      ["Faixa KPI", "80%-120%", "Bônus ou desconto mensal dentro de mais ou menos 20% do preço Quality."],
      ["Apoio de aluguel", "50% / 3 meses", "Nos três primeiros meses, MePonto paga metade do aluguel e o franqueado paga metade."],
      ["Período protegido", "3 meses", "Após três meses, o franqueado pode continuar operando ou sair da operação."],
    ],
    governance: {
      eyebrow: "Governança",
      title: "Princípios Operacionais e Decisão",
      badge: "lógica operacional da MePonto prevalece",
      cards: [
        ["Papel do franqueado", "Executar a operação local, receber recrutamento, gerir o ponto, dar feedback diário, cuidar de ativos e escalar problemas."],
        ["Suporte MePonto", "Fornecer PontoSys, modelo operacional, dados, política de preço, padrões SOP, treinamento, revisões e decisões-chave."],
        ["Regra de divergência", "Revisar dados e evidências de campo primeiro. Sem acordo, prevalecem a lógica operacional e o SOP da MePonto."],
      ],
    },
    productTitle: "Escopo do Produto em Meados de Junho",
    productEyebrow: "Marco de produto",
    productMilestones: [
      {
        title: "Binding & Slot management",
        items: [
          "Durante slots, pedidos food podem ser recebidos normalmente.",
          "Fora dos slots, não recebe pedidos food nem mobility.",
          "Não sair do slot durante a duração pode ficar fora da primeira versão obrigatória.",
          "Não pode desvincular OL e mudar para Cloud.",
        ],
      },
      {
        title: "Courier income & perception",
        items: [
          "Broadcast cards não podem mostrar renda do pedido.",
          "Renda de pedidos não entra na conta d-app.",
          "Não recebe incentives.",
          "Earnings page e order details não mostram renda.",
        ],
      },
    ],
    pricingTitle: "Mecanismo de Preço Mensal",
    pricingEyebrow: "Preço",
    monthlyPricing: [
      ["Preço no fim do mês", "Exemplo: no fim de maio são definidos preço fixo e KPI de junho."],
      ["Base de junho", "Total 12; sem Copa do Mundo; sem commission fee 0,2-0,3; inclui custo de atividades 2-3."],
      ["Apoio ao motoboy", "O custo de suporte ao motoboy precisa aparecer no preço e na política do mês seguinte."],
      ["Itens KPI", "Em junho os itens de KPI não mudam e seguem o modelo atual."],
    ],
    siteTitle: "SOP do Ponto em 2 de Junho",
    siteEyebrow: "Lançamento do ponto",
    siteSop: [
      ["Local do ponto", "Confirmar localização, função, equipe e escopo de serviço até 2 de junho."],
      ["Funções do ponto", "Chegada de candidatos, documentos, treinamento, check-in, escalonamento e feedback de dados."],
      ["Ciclo do motoboy", "Entrada, treinamento, melhoria, retenção e saída."],
      ["SOP de recrutamento", "Definir origem, qualificação, agendamento, documentos, registro, binding e primeiro turno."],
      ["Processo operacional", "Executar seleção, uso, desenvolvimento e retenção com SOP confirmado por MePonto e franqueado."],
    ],
    lifecycleTitle: "Ciclo do Motoboy",
    lifecycleEyebrow: "Ciclo do motoboy",
    lifecycleMeta: "Selecionar / Usar / Desenvolver / Reter",
    riderLifecycle: [
      ["Selecionar", "Avaliar moto, aceite da gestão Ponto, estabilidade de escala e cumprimento de slot."],
      ["Usar", "Alocar motoboys por hotzone, slot, pico e metas do ponto."],
      ["Desenvolver", "Melhorar AR, OPH, disciplina online e segurança com treinamento, revisão e acompanhamento."],
      ["Reter", "Aumentar retenção com escala estável, resposta a problemas, serviços pós-mercado e evolução."],
    ],
    dataTitle: "Suporte de Dados e Sincronização",
    dataEyebrow: "Suporte de dados",
    dataSupport: [
      ["Média do Cloud rider D+1", "MePonto fornece para apoiar preço, capacidade e estratégia do ponto."],
      ["Hotzone semanal", "Atualização semanal para escala, metas de recrutamento e despacho."],
      ["Hotzone por horário", "Visão por faixa horária para slot management e operação de pico."],
      ["Dados PontoSys", "Dados D-1, performance, exceções, conversão de recrutamento e reconciliação financeira."],
    ],
    batchTitle: "Estratégia de Pedido Agrupado e Follow-up",
    batchEyebrow: "Pedido agrupado",
    batchCards: [
      ["Regra SP", "A regra de SP ainda não está confirmada e precisa ser validada antes da execução."],
      ["Preço follow-up", "Preço de follow-up temporariamente igual."],
      ["Desconto agrupado", "Faixa inicial de -30% a -50%, sujeita à confirmação da MePonto."],
    ],
    futureTitle: "Modelo Futuro da Estação de Motoboys",
    futureEyebrow: "Modelo futuro",
    futureStation: [
      ["Comissão da plataforma", "Referência China: 1.000 pedidos/dia pode dar lucro; meta atual é empatar com 20 motoboys."],
      ["Pós-mercado do motoboy", "Ferramentas, aluguel, moradia, cartão, celular, combustível e chip integrados pela MePonto."],
      ["Veículos e pedidos ociosos", "Monetização futura com veículos, alocação de pedidos ociosos e serviços do ponto."],
    ],
    cadenceTitle: "Ritmo Mensal e Trimestral",
    cadenceEyebrow: "Cadência operacional",
    cadenceCards: [
      ["Semanal", "Sincronizar hotzone, faixas horárias, problemas do ponto, recrutamento, performance e exceções.", "Semanal"],
      ["Fim do mês", "Confirmar preço Quality, KPI, atividade, suporte ao motoboy, benchmark Cloud e política.", "Mensal"],
      ["Três meses", "Revisar período protegido e decidir continuar, ajustar ou sair.", "Trimestral"],
      ["Linha vermelha", "Sem aprovação da MePonto, não prometer preço, renda, subsídio, penalidade, política ou produto.", "Controle"],
    ],
    exitTitle: "Princípios de Saída e Handoff",
    exitDescription:
      "Se o franqueado sair após três meses, motoboys, ativos, pedidos abertos, disputas de pagamento, reclamações, incidentes, dados PontoSys e registros hotzone devem ser transferidos com responsáveis, status e prazos.",
    docTitle: "Versão do documento",
    docDescription: "franchise-cooperation-plan.md",
    dateTitle: "Datas-chave",
    dateDescription: "SOP do ponto em 2 de junho e escopo do produto em meados de junho.",
    targetTitle: "Meta do ponto",
    targetDescription: "Meta atual: 20 motoboys para atingir break-even.",
    modelTitle: "Modelo de longo prazo",
    modelDescription: "Comissão da plataforma + pós-mercado + veículos e pedidos ociosos.",
  },
};

function Panel({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[#2a2a4a] bg-[#0d0d1a] p-5">
      <div className="mb-4">
        <div className="text-xs font-black uppercase text-[#8b5cf6]">{eyebrow}</div>
        <h2 className="text-2xl font-black text-white">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function ActionCard({ title, detail, meta }: { title: string; detail: string; meta?: string }) {
  return (
    <div className="rounded-lg border border-[#2a2a4a] bg-[#111827] p-4">
      {meta ? <div className="mb-2 text-xs font-black uppercase text-[#06d6a0]">{meta}</div> : null}
      <h3 className="font-black text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[#c4c4d4]">{detail}</p>
    </div>
  );
}

export default function FranchisePage() {
  const language = useVentoStore((state) => state.language);
  const copy = franchiseCopies[language];

  return (
    <AppShell>
      <div data-i18n-skip>
      <PageTitle title={copy.title} eyebrow={copy.eyebrow} />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {copy.commercialTerms.map(([label, value, detail]) => (
          <div key={label} className="rounded-xl border border-[#2a2a4a] bg-[#0d0d1a] p-4">
            <div className="text-xs font-black uppercase text-[#8b8ba3]">{label}</div>
            <div className="mt-2 text-3xl font-black text-white">{value}</div>
            <p className="mt-2 text-sm leading-6 text-[#c4c4d4]">{detail}</p>
          </div>
        ))}
      </section>

      <section className="mt-5 rounded-xl border border-[#5542a0] bg-[#151129] p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase text-[#a78bfa]">{copy.governance.eyebrow}</div>
            <h2 className="text-2xl font-black text-white">{copy.governance.title}</h2>
          </div>
          <Badge value={copy.governance.badge} />
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {copy.governance.cards.map(([title, detail]) => (
            <ActionCard key={title} title={title} detail={detail} />
          ))}
        </div>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <Panel title={copy.productTitle} eyebrow={copy.productEyebrow}>
          <div className="grid gap-3 md:grid-cols-2">
            {copy.productMilestones.map((group) => (
              <div key={group.title} className="rounded-lg border border-[#2a2a4a] bg-[#111827] p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Target className="text-[#06d6a0]" size={18} />
                  <h3 className="font-black text-white">{group.title}</h3>
                </div>
                <ul className="space-y-2 text-sm leading-6 text-[#c4c4d4]">
                  {group.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <CheckCircle2 className="mt-1 shrink-0 text-[#06d6a0]" size={15} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={copy.pricingTitle} eyebrow={copy.pricingEyebrow}>
          <div className="space-y-3">
            {copy.monthlyPricing.map(([title, detail]) => (
              <ActionCard key={title} title={title} detail={detail} />
            ))}
          </div>
        </Panel>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel title={copy.siteTitle} eyebrow={copy.siteEyebrow}>
          <div className="grid gap-3">
            {copy.siteSop.map(([title, detail]) => (
              <ActionCard key={title} title={title} detail={detail} />
            ))}
          </div>
        </Panel>

        <Panel title={copy.lifecycleTitle} eyebrow={copy.lifecycleEyebrow}>
          <div className="grid gap-3 md:grid-cols-2">
            {copy.riderLifecycle.map(([title, detail]) => (
              <ActionCard key={title} title={title} detail={detail} meta={copy.lifecycleMeta} />
            ))}
          </div>
        </Panel>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_0.85fr]">
        <Panel title={copy.dataTitle} eyebrow={copy.dataEyebrow}>
          <div className="grid gap-3 md:grid-cols-2">
            {copy.dataSupport.map(([title, detail]) => (
              <ActionCard key={title} title={title} detail={detail} />
            ))}
          </div>
        </Panel>

        <Panel title={copy.batchTitle} eyebrow={copy.batchEyebrow}>
          <div className="space-y-3">
            {copy.batchCards.map(([title, detail]) => (
              <ActionCard key={title} title={title} detail={detail} />
            ))}
          </div>
        </Panel>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title={copy.futureTitle} eyebrow={copy.futureEyebrow}>
          <div className="space-y-3">
            {copy.futureStation.map(([title, detail]) => (
              <ActionCard key={title} title={title} detail={detail} />
            ))}
          </div>
        </Panel>

        <Panel title={copy.cadenceTitle} eyebrow={copy.cadenceEyebrow}>
          <div className="grid gap-3 md:grid-cols-2">
            {copy.cadenceCards.map(([title, detail, meta]) => (
              <ActionCard key={title} title={title} detail={detail} meta={meta} />
            ))}
          </div>
        </Panel>
      </section>

      <section className="mt-5 rounded-xl border border-[#74303c] bg-[#240d14] p-5">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="text-[#fb7185]" size={20} />
          <h2 className="text-2xl font-black text-white">{copy.exitTitle}</h2>
        </div>
        <p className="max-w-4xl text-sm leading-6 text-[#ffc1cb]">
          {copy.exitDescription}
        </p>
      </section>

      <section className="mt-5 grid gap-3 md:grid-cols-4">
        <a href="/franchise-cooperation-plan.md" className="rounded-lg border border-[#2a2a4a] bg-[#111827] p-4">
          <FileText className="mb-2 text-[#8b5cf6]" size={20} />
          <div className="font-black text-white">{copy.docTitle}</div>
          <p className="mt-2 text-sm text-[#8b8ba3]">{copy.docDescription}</p>
        </a>
        <div className="rounded-lg border border-[#2a2a4a] bg-[#111827] p-4">
          <CalendarDays className="mb-2 text-[#38bdf8]" size={20} />
          <div className="font-black text-white">{copy.dateTitle}</div>
          <p className="mt-2 text-sm text-[#8b8ba3]">{copy.dateDescription}</p>
        </div>
        <div className="rounded-lg border border-[#2a2a4a] bg-[#111827] p-4">
          <MapPinned className="mb-2 text-[#f59e0b]" size={20} />
          <div className="font-black text-white">{copy.targetTitle}</div>
          <p className="mt-2 text-sm text-[#8b8ba3]">{copy.targetDescription}</p>
        </div>
        <div className="rounded-lg border border-[#2a2a4a] bg-[#111827] p-4">
          <TrendingUp className="mb-2 text-[#06d6a0]" size={20} />
          <div className="font-black text-white">{copy.modelTitle}</div>
          <p className="mt-2 text-sm text-[#8b8ba3]">{copy.modelDescription}</p>
        </div>
      </section>
      </div>
    </AppShell>
  );
}
