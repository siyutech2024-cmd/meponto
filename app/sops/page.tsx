"use client";

import Link from "next/link";
import { BookOpen, CheckCircle2, Clock3, Database, FileText, ShieldCheck, Users } from "lucide-react";
import { AppShell, Badge, PageTitle } from "../components/ui";
import type { Language } from "../lib/i18n";
import { useVentoStore } from "../lib/store";

const sourceDocs = [
  {
    title: "PontoSys 操作手册",
    description: "PontoSys 每日导入、站点执行、招聘转化、巡查证据和闭环操作说明。",
    href: "/sop-assets/pontosys-manual.html",
  },
  {
    title: "Brand Guide",
    description: "99Food communication rules, tone of voice, visual identity and forbidden claims.",
    href: "/sop-assets/communication-guide.pdf",
  },
  {
    title: "Good Practices FAQ",
    description: "OL FAQ for bags, payment, modal rules, unlinking, safety and daily best practices.",
    href: "/sop-assets/good-practices-faq.pdf",
  },
  {
    title: "Communication Guide",
    description: "Reclame Aqui response flow, SLA, scorecard targets and reputation management.",
    href: "/sop-assets/reclame-aqui-playbook.pdf",
  },
];

const sectionTones = {
  data: {
    label: "数据底座",
    accent: "text-[#38bdf8]",
    border: "border-[#1f5f78]",
    bg: "bg-[#071923]",
    soft: "bg-[#0b2430]",
    chip: "border-[#38bdf8]/35 bg-[#082636] text-[#9ee7ff]",
  },
  rider: {
    label: "全职骑手",
    accent: "text-[#06d6a0]",
    border: "border-[#166b55]",
    bg: "bg-[#071f19]",
    soft: "bg-[#0a2b22]",
    chip: "border-[#06d6a0]/35 bg-[#06251a] text-[#8ff5c2]",
  },
  recruitment: {
    label: "招聘转化",
    accent: "text-[#a78bfa]",
    border: "border-[#5542a0]",
    bg: "bg-[#151129]",
    soft: "bg-[#1d1738]",
    chip: "border-[#a78bfa]/35 bg-[#211846] text-[#d9ccff]",
  },
  site: {
    label: "站点运营",
    accent: "text-[#f59e0b]",
    border: "border-[#7a4d10]",
    bg: "bg-[#211707]",
    soft: "bg-[#2c1f0b]",
    chip: "border-[#f59e0b]/35 bg-[#34230a] text-[#ffd999]",
  },
  inspection: {
    label: "总部巡查",
    accent: "text-[#fb7185]",
    border: "border-[#74303c]",
    bg: "bg-[#240d14]",
    soft: "bg-[#31111b]",
    chip: "border-[#fb7185]/35 bg-[#3b111d] text-[#ffc1cb]",
  },
  library: {
    label: "资料库",
    accent: "text-[#cbd5e1]",
    border: "border-[#46556b]",
    bg: "bg-[var(--surface-raised)]",
    soft: "bg-[#162033]",
    chip: "border-[#94a3b8]/35 bg-[#1e293b] text-[#dbeafe]",
  },
} as const;

type SectionTone = keyof typeof sectionTones;

const sopCategories = [
  {
    code: "SOP 01",
    name: "数据导入 SOP",
    owner: "总部运营 / 数据",
    scope: "99 后台前一天数据导出、校验、导入 PontoSys、对账和异常队列。",
    modules: ["D-1 数据包", "数据校验", "PontoSys 导入", "财务/排班对账", "异常队列"],
    tone: "data",
    href: "#data-foundation",
  },
  {
    code: "SOP 02",
    name: "全职骑手每日 SOP",
    owner: "站点负责人 / Leader",
    scope: "全职骑手从到站、开工、午晚高峰、夜班安全到收工复盘的每日动作。",
    modules: ["工作时长", "班前检查", "高峰规则", "夜班定位", "收工复盘"],
    tone: "rider",
    href: "#rider-daily",
  },
  {
    code: "SOP 03",
    name: "招聘骑手 SOP",
    owner: "总部市场 / 总部运营 / 站点",
    scope: "总部招聘投放、线索预约、线下注册、后台绑定、培训首班和转全职。",
    modules: ["总部投放", "线索预约", "线下注册", "后台绑定", "首班转化", "招聘 KPI"],
    tone: "recruitment",
    href: "#recruitment",
  },
  {
    code: "SOP 04",
    name: "站点运营 SOP",
    owner: "站点负责人 / 运营助理",
    scope: "每站两人配置下，如何接收总部数据、开站、调度、招聘承接和异常升级。",
    modules: ["双人配置", "总部数据", "站点日流程", "招聘承接", "异常升级"],
    tone: "site",
    href: "#site-ops",
  },
  {
    code: "SOP 05",
    name: "总部巡查 SOP",
    owner: "总部运营 / 区域管理",
    scope: "总部巡查站点时检查动作是否执行、记录是否完整、证据是否可查、异常是否闭环。",
    modules: ["执行动作表", "负责人", "频次时限", "系统记录", "巡查证据", "闭环指标"],
    tone: "inspection",
    href: "#inspection",
  },
];

const dataFlow = [
  ["D-1 99后台导出", "导出前一天骑手、排班、订单、在线时长、AR、取消、财务和 guaranteed 补差数据。"],
  ["数据校验", "检查 Rider ID、手机号、Ponto、班次、订单数、金额、缺失字段和重复记录。"],
  ["PontoSys 导入", "导入到 Riders、Pontos、Finance、Reports 和 Realtime 模块，保留导入批次号。"],
  ["数据对账", "和 99 后台报表核对订单、在线时长、TSH、AR、CAA、D+1/D+2 应付金额。"],
  ["异常队列", "缺字段、金额差异、未排班上线、异常取消、投诉和事故进入运营队列。"],
  ["站点简报", "站点经理按数据生成当天招聘、排班、付款、培训和风险处理任务。"],
];

const riderDailyTimeline = [
  ["T-30min", "到达 Ponto", "早午班到站点，晚班线上确认；完成车辆、手机、保温包、雨具、证件、油量、刹车和轮胎检查。"],
  ["开工", "班次确认", "Leader 确认责任区域、班次、午晚高峰规则、AR 95%、OPH 1.5 和当天风险点。"],
  ["午高峰", "11:00-14:00", "禁止离线，必须在指定区域；异常订单先走平台流程，再同步 Leader。"],
  ["下午班", "14:00-18:00", "按系统休息/离线规则执行；超出系统允许范围必须报备。"],
  ["晚班/夜班", "18:00-22:00", "禁止离线，系统每 10 分钟发定位；危险区域可拒单但必须提交说明。"],
  ["收工前", "固定时间复盘", "站点组织沟通，确认在线时长、完成单、OPH、AR、事故、投诉和次日安排。"],
];

const recruitmentPipeline = [
  ["HQ", "总部发布", "总部统一发布招聘公告、市场营销物料和报名入口，站点不得私自改口径。"],
  ["Lead", "线索收集", "收集城市/Ponto 意向、联系方式、是否有 moto、可工作时段和到场预约。"],
  ["Offline", "线下注册", "引导骑手到指定站点/报名点完成说明、资料核验、99 app 注册和绑定协助。"],
  ["Backoffice", "总部后台处理", "PontoSys 仅由总部/授权后台人员使用，处理绑定、排班和数据核验，不对骑手开放。"],
  ["Train", "站点培训", "完成 Ponto 纪律、订单流程、安全、付款、沟通和事故处理培训。"],
  ["Convert", "转全职", "首班复盘 AR、OPH、在线时长、取消、投诉和是否进入 7h/8h/11h 班表。"],
];

const recruitmentActions = [
  ["投放前", "总部确认城市/Ponto 缺口、目标人数、物料版本、报名入口、线下点位、负责人和当日容量。"],
  ["线索进入", "规定时间内首次联系，确认 moto、城市、可工作时间、到场意愿，并发送线下注册地址和所需资料。"],
  ["到场接待", "现场签到、核验资料、讲解 OL 模式、工作时长、付款周期、Ponto 纪律和高峰期规则。"],
  ["注册协助", "协助骑手完成 99 app 注册/资料提交；平台审核结果不由 OL 承诺。"],
  ["后台绑定", "总部/授权后台人员处理 PontoSys 绑定，96 小时内批准或拒绝，并记录失败原因。"],
  ["首班转化", "绑定成功后加入 Ponto/Leader/群组，完成培训，安排首班并复盘是否转全职。"],
];

const recruitmentOwners = [
  ["总部市场", "招聘公告、营销物料、投放渠道、报名入口、话术合规。"],
  ["总部运营", "招聘目标、城市/Ponto 缺口、总部后台绑定、数据核验、转化追踪。"],
  ["站点经理", "线下接待、资料核验、培训安排、Ponto 容量、首班承接。"],
  ["Leader", "首班跟进、每日 SOP 培训、早期表现反馈、待观察骑手辅导。"],
];

const recruitmentKpis = [
  ["线索响应率", "95%+", "收到线索后规定时间内完成首次联系。"],
  ["到场率", "50%-70%", "已预约骑手中实际到线下注册的人数占比。"],
  ["资料完整率", "90%+", "到场骑手中资料完整、可进入注册/绑定的人数占比。"],
  ["注册完成率", "70%-85%", "到场骑手中完成 99 app 注册/资料提交的人数占比。"],
  ["绑定成功率", "60%-80%", "进入绑定流程后成功绑定 OL 的人数占比。"],
  ["首班完成率", "80%+", "绑定成功骑手中完成首个班次的人数占比。"],
  ["转全职率", "50%-70%", "完成首班后进入正式 7h/8h/11h 班表的人数占比。"],
  ["7日留存率", "60%+", "转全职后 7 天仍正常出勤的人数占比。"],
];

const recruitmentDecisionRules = [
  {
    title: "通过",
    tone: "border-[#214632] bg-[#0f2118] text-[#b9f6cf]",
    items: ["资料完整", "绑定成功", "完成培训", "首班 AR >= 95%", "首班 OPH >= 1.5", "无重大投诉/事故"],
  },
  {
    title: "待观察",
    tone: "border-[#4a3a18] bg-[#20190d] text-[#ffe0a3]",
    items: ["轻微迟到", "AR/OPH 略低", "沟通不稳定", "规则不熟", "需要二次跟班培训"],
  },
  {
    title: "淘汰",
    tone: "border-[#4a2028] bg-[#211016] text-[#ffc0cb]",
    items: ["资料造假", "车辆不符合", "拒绝班表", "高峰期离线", "严重投诉", "危险驾驶", "不服从站点管理"],
  },
];

const siteStaffingModel = [
  ["站点负责人", "负责现场秩序、签到/收工、骑手沟通、异常升级、培训执行、站点结果复盘。"],
  ["运营助理", "负责资料核验、打卡记录、群消息、装备检查、首班跟进、问题登记和 PontoSys 更新。"],
];

const hqDataSupport = [
  ["D-1 数据包", "总部每天提供 PontoSys 前一天导出数据：在线时长、班次、订单、AR、CAA、财务和异常。"],
  ["排班建议", "总部根据 Ponto 缺口、午晚高峰需求、夜班风险和历史产能给出当日排班建议。"],
  ["风险预警", "总部标记低 TSH、低 AR、高取消、投诉、事故、付款差异和连续缺勤骑手。"],
  ["招聘缺口", "总部输出每站目标人数、候选人预约、到场名单、绑定状态和首班转化结果。"],
];

const siteOpsTimeline = [
  ["开站前", "双人到位", "负责人确认当日目标和风险；运营助理准备签到表、培训名单、装备检查和群通知。"],
  ["晨会", "接收总部数据", "查看 D-1 数据、排班建议、招聘缺口、付款差异、风险骑手和事故未结案。"],
  ["班前", "骑手到站", "提前 30 分钟完成签到、装备检查、区域确认、午晚高峰规则和异常报备。"],
  ["班中", "现场调度", "负责人处理现场和异常；运营助理记录离线、拒单说明、投诉、事故和群沟通。"],
  ["收工", "复盘交接", "核对在线时长、OPH、AR、未处理事故/投诉、付款争议和次日排班需求。"],
];

const executionActions = [
  {
    stage: "开站准备",
    owner: "站点负责人",
    cadence: "每日开站前",
    action: "确认两人到岗、当日目标、总部数据包、风险骑手、预约到场名单和未结事项。",
    record: "PontoSys 日任务 / 站点群开站消息",
    evidence: "两人签到、开站照片、当日任务截图、群通知记录。",
  },
  {
    stage: "数据晨会",
    owner: "站点负责人 + 总部运营",
    cadence: "每日晨会",
    action: "把总部 D-1 数据转成站点动作：谁补资料、谁首班、谁风险跟进、谁付款核查。",
    record: "PontoSys 异常队列 / 总部数据简报",
    evidence: "晨会记录、异常名单、责任人分配、完成状态。",
  },
  {
    stage: "招聘到场",
    owner: "运营助理",
    cadence: "每场招聘",
    action: "候选人签到、核验资料、讲解 OL 模式、协助 99 app 注册，标记到场/未到场/资料待补。",
    record: "招聘线索表 / PontoSys 招聘状态",
    evidence: "签到表、资料完整率、注册完成截图、未到场回访记录。",
  },
  {
    stage: "后台绑定",
    owner: "总部后台",
    cadence: "96 小时内",
    action: "处理 PontoSys 绑定/解绑，记录成功、失败、资料不全、平台未过审、重复绑定等原因。",
    record: "总部后台 / PontoSys 绑定状态",
    evidence: "绑定状态、失败原因、处理时间、超时清单。",
  },
  {
    stage: "班前签到",
    owner: "运营助理",
    cadence: "班前 30 分钟",
    action: "核对骑手到站、装备、车辆、证件、手机电量、区域和班次，未到岗立即标记并通知负责人。",
    record: "PontoSys 签到 / 站点签到表",
    evidence: "签到时间、装备检查表、迟到名单、补位记录。",
  },
  {
    stage: "高峰调度",
    owner: "站点负责人",
    cadence: "午晚高峰",
    action: "盯高峰期在线、区域、离线、拒单说明、低 AR、低 OPH、事故和投诉，及时协调补位。",
    record: "PontoSys 实时运营 / 异常事件",
    evidence: "在线截图、异常处理记录、拒单说明、事故/投诉单。",
  },
  {
    stage: "夜班安全",
    owner: "站点负责人 + Leader",
    cadence: "夜班每 10 分钟定位",
    action: "检查夜班定位、异常停留、危险区域拒单说明和安全事件升级。",
    record: "定位记录 / Incident",
    evidence: "定位轨迹、10 分钟记录、拒单说明、升级记录。",
  },
  {
    stage: "收工复盘",
    owner: "站点负责人 + 运营助理",
    cadence: "每日收工前",
    action: "核对在线时长、OPH、AR、未结事故、投诉、付款争议、次日缺口和总部需支持事项。",
    record: "PontoSys 日结 / 站点复盘",
    evidence: "日结表、未结清单、次日排班需求、总部反馈单。",
  },
];

const fullTimeRiderSop = [
  {
    title: "1. 每日工作制",
    items: [
      "全职骑手按 7 小时、8 小时、11 小时三种日工作时长区分排班和考核。",
      "每周制度支持 6 天休 1 天、7 天连续运营和站点排班制，由站点按需求发布。",
      "每日最低在线时长按 7 小时基准执行；8 小时和 11 小时班次按系统班表另行计算。",
      "每日产能目标使用 OPH 1.5，即每在线小时完成 1.5 单作为基础标准。",
    ],
  },
  {
    title: "2. 班次与签到",
    items: [
      "早午班参考 11:00-14:00、14:00-18:00；晚班/夜班参考 18:00-22:00。",
      "骑手必须到指定 Ponto 签到，并提前 30 分钟到达完成准备。",
      "早午班在站点打卡；晚班按线上打卡执行，站点仍需确认人员在线。",
      "Leader 在开工前确认责任区域、班次目标、午晚高峰要求和特殊风险。",
    ],
  },
  {
    title: "3. 开工前检查",
    items: [
      "检查车辆、油量、刹车、轮胎、灯光、手机电量、网络和支架。",
      "确认保温包、雨具、证件、头盔和必要安全装备齐全。",
      "如车辆、证件、手机或装备异常，必须在班前向 Leader 报备并等待处理。",
    ],
  },
  {
    title: "4. 工作中执行",
    items: [
      "接单率 AR 最低要求 95%，拒单必须有系统可追溯原因。",
      "午高峰和晚高峰禁止离线，必须在指定区域内保持可调度状态。",
      "休息和离线规则按照骑手系统执行；超出系统允许范围必须报备。",
      "遇到商家延迟、客户失联、地址错误、车辆故障或平台异常，先按平台流程处理，再同步 Leader。",
    ],
  },
  {
    title: "5. 夜班安全",
    items: [
      "夜班系统每 10 分钟发送一次定位，站点和 Leader 需关注异常停留。",
      "进入危险区域、异常地址或人身风险场景时，骑手可拒单，但必须提交拒单说明。",
      "夜班事故或安全事件优先保障人员安全，再联系急救/警方、Leader，并在系统创建 Incident。",
    ],
  },
  {
    title: "6. 收工与复盘",
    items: [
      "下班前固定时间由站点组织沟通，确认在线时长、完成单、OPH、AR、异常和次日安排。",
      "早午班在站点完成下班打卡；晚班完成线上收工打卡。",
      "未处理事故、投诉、付款争议或严重异常不得直接收工，必须交接给 Leader 或站点负责人。",
    ],
  },
];

const recruitmentSop = [
  {
    title: "1. 总部统一招募",
    items: [
      "招聘需求由总部根据 Ponto 班次缺口、午晚高峰缺口、夜班缺口和 7h/8h/11h 全职班表统一确认。",
      "总部负责发布招聘公告、市场营销物料、报名入口和转化活动；站点负责承接到场和培训。",
      "所有对外物料必须使用总部批准版本，站点不得私自承诺收入、补贴、政策或 99 官方决定。",
      "对外只说明合作配送机会和线下注册安排，不提 总部后台、不展示后台截图、不让骑手接触后台系统。",
    ],
  },
  {
    title: "2. 线索收集与预约",
    items: [
      "通过总部报名入口收集姓名、电话、城市、Ponto 意向、车辆类型、工作意愿和可排班时间。",
      "初步确认候选人有 moto 或可自行解决 moto；OL 模式下默认不接受 bike，除非 99 官方另行通知。",
      "根据城市和 Ponto 容量安排线下注册时间，提醒候选人携带证件、手机、车辆资料和必要联系方式。",
      "线索状态记录为待联系、已预约、未到场、已到场、资料待补、注册中、绑定中、培训中、已转化或淘汰。",
    ],
  },
  {
    title: "3. 线下注册与资料核验",
    items: [
      "骑手到线下站点/报名点后，由工作人员说明 OL 模式、工作时长、Ponto、AR 95%、OPH 1.5 和高峰期规则。",
      "现场核验姓名、RG、CPF、邮箱、电话、城市、车辆和联系方式；缺字段不得进入绑定流程。",
      "候选人按 99 app 要求自行完成注册资料提交；OL 不控制平台审核结果，也不承诺一定通过。",
      "bag 供应由 OL 负责，可使用 OL 自有品牌 bag，但必须符合配送专业形象。",
    ],
  },
  {
    title: "4. 总部后台绑定",
    items: [
      "PontoSys 是 MePonto 的运营系统，承接总部从 99 后台导入的数据和排班任务，不对外开放，不作为招聘页面、群话术或骑手培训入口。",
      "候选人完成 99 app 注册和平台审核后，由总部/授权后台人员在 PontoSys 处理 OL 绑定、排班和数据核验。",
      "绑定/解绑申请必须在 96 小时内批准或拒绝；超时会自动过期并被系统拒绝。",
      "绑定成功后，总部同步站点；站点再将骑手加入对应 Ponto、Leader、应用内聊天室和培训名单。",
    ],
  },
  {
    title: "5. 培训与首班",
    items: [
      "首班前完成 Ponto 纪律、每日 SOP、订单流程、取送标准、夜班安全、付款规则和投诉处理培训。",
      "明确付款规则：订单收入建议 D+1，guaranteed 补差如适用按 D+2；付款问题由 OL 负责解释。",
      "站点只培训骑手需要知道的执行规则；后台排班、PontoSys 数据和总部账号权限不对骑手展示。",
      "新骑手首班由 Leader 跟进，重点看签到、上线、接单、取送、沟通、定位和异常上报。",
      "首班结束复盘在线时长、OPH、AR、取消、投诉、事故、迟到和是否适合进入全职排班。",
    ],
  },
  {
    title: "6. 录用与淘汰",
    items: [
      "通过者进入 7h/8h/11h 全职班表，并设置 Ponto、Leader、班次和每日目标。",
      "待观察者安排第二次跟班培训，重点纠正低 AR、低 OPH、迟到、离线或沟通问题。",
      "不合格者不进入全职班表；如需解绑，由总部/授权后台人员按 PontoSys 解绑流程处理并完成财务结算。",
      "所有录用、待观察、淘汰原因必须记录在 PontoSys，作为后续招聘渠道质量分析依据。",
    ],
  },
];

const siteOpsSop = [
  {
    title: "1. 站点人员配置",
    items: [
      "每个站点配置 2 人：站点负责人 + 运营助理。",
      "站点负责人负责现场管理、骑手沟通、异常升级、培训落地和每日结果。",
      "运营助理负责签到/收工记录、资料核验、装备检查、群通知、问题登记和系统更新。",
      "两人必须共享同一份当日任务清单，避免一个人知道、另一个人不知道。",
    ],
  },
  {
    title: "2. 总部数据支持",
    items: [
      "总部每天提供 99 D-1 数据、排班建议、招聘缺口、风险骑手和财务差异。",
      "站点不直接对外解释 PontoSys，也不向骑手展示后台；站点只承接总部给出的运营任务。",
      "总部数据必须转化成站点动作：谁到站、谁补资料、谁首班、谁风险跟进、谁付款核查。",
      "站点发现数据和现场不一致时，当天反馈总部，由总部复核后台数据。",
    ],
  },
  {
    title: "3. 每日现场运营",
    items: [
      "开站前两人确认当日排班、预约到场、首班骑手、风险骑手、未结事故和重点沟通事项。",
      "班前 30 分钟组织签到、装备检查、区域确认、午晚高峰禁止离线说明和夜班定位提醒。",
      "班中跟进未上线、低在线、低 AR、拒单说明、危险区域、事故、投诉和付款争议。",
      "收工前固定时间组织复盘，确认在线时长、OPH、AR、异常、未结事项和次日安排。",
    ],
  },
  {
    title: "4. 招聘与培训承接",
    items: [
      "总部投放带来的候选人到站后，站点负责线下接待、资料核验、规则讲解和注册协助。",
      "绑定成功名单由总部同步后，站点安排 Ponto、Leader、应用内聊天室、首班培训和首班复盘。",
      "新骑手首班表现必须记录：签到、上线、OPH、AR、取消、投诉、事故和是否转全职。",
      "站点每日向总部反馈到场率、资料完整率、首班完成率、转全职率和淘汰原因。",
    ],
  },
  {
    title: "5. 异常与升级",
    items: [
      "事故、人身安全、严重投诉、付款争议、后台数据异常和高峰期大面积离线必须升级总部。",
      "需要 CPF、地址、付款等敏感数据时只用私聊/授权渠道，不在群内收集。",
      "群内只发布总部确认过的运营、排班、付款、培训和安全信息。",
      "每日未结事故、投诉、付款争议和数据差异必须形成交接，不能口头带过。",
    ],
  },
];

const localizedSopContent = {
  en: {
    eyebrow: "Full-time riders / Recruitment / Site operations",
    title: "MePonto PontoSys SOP Center",
    mapEyebrow: "SOP category map",
    mapTitle: "There are 5 formal SOPs",
    mapDescription:
      "The source library is used only for manuals, video, brand rules and communication references. Formal SOPs are managed across data, full-time rider execution, recruitment conversion, site operations and HQ inspection.",
    counters: ["Formal SOPs", "Source library", "Execution roles"],
    sourceTitle: "Source Library",
    sourceDescription: "PontoSys manual, brand guide, good practices, communication guide and the training video for station managers and Leaders.",
    sectionLabels: {
      data: "Data foundation",
      rider: "Full-time rider",
      recruitment: "Recruitment conversion",
      site: "Site operations",
      inspection: "HQ inspection",
      library: "Library",
    },
    ui: {
      actionBadge: "Action",
      briefingBadge: "Briefing",
      closeoutBadge: "Closeout",
      dailyCadenceTitle: "Daily cadence",
      dailyRiderEyebrow: "Daily rider SOP",
      decisionRulesEyebrow: "Decision rules",
      dispatchBadge: "Dispatch",
      documentLabel: "Document",
      d1DataBadge: "D-1 99 Data",
      evidenceBadge: "Evidence",
      funnelQualityBadge: "Funnel quality",
      hqDataSupportEyebrow: "HQ data support",
      hqInspectionActionsEyebrow: "HQ inspection actions",
      openBadge: "Open",
      ownerBadge: "Owner",
      ownershipEyebrow: "Ownership",
      recruitmentActionsEyebrow: "Recruitment actions",
      recruitmentFunnelEyebrow: "Recruitment funnel",
      recruitmentKpiEyebrow: "Recruitment KPI",
      recruitmentKpiTitle: "Recruitment KPIs",
      redLinesTitle: "Red lines",
      siteDailyFlowEyebrow: "Site daily flow",
      siteOperationsEyebrow: "Site operations",
      siteStaffingEyebrow: "Site staffing",
      stepLabelPrefix: "Step",
      trainingVideo: "Training video",
      twoPeopleBadge: "2 people / Ponto",
    },
    sourceDocs: [
      {
        title: "PontoSys Manual",
        description: "Daily import, site execution, recruitment conversion, inspection evidence and closeout operations.",
        href: "/sop-assets/pontosys-manual.html",
      },
      {
        title: "Brand Guide",
        description: "99Food communication rules, tone of voice, visual identity and forbidden claims.",
        href: "/sop-assets/communication-guide.pdf",
      },
      {
        title: "Good Practices FAQ",
        description: "OL FAQ for bags, payment, modal rules, unlinking, safety and daily best practices.",
        href: "/sop-assets/good-practices-faq.pdf",
      },
      {
        title: "Communication Guide",
        description: "Reclame Aqui response flow, SLA, scorecard targets and reputation management.",
        href: "/sop-assets/reclame-aqui-playbook.pdf",
      },
    ],
    categories: [
      {
        code: "SOP 01",
        name: "Data Import SOP",
        owner: "HQ Ops / Data",
        scope: "Export previous-day data from the 99 back office, validate it, import it into PontoSys, reconcile finance and create exception queues.",
        modules: ["D-1 package", "Validation", "PontoSys import", "Reconciliation", "Exceptions"],
        tone: "data" as SectionTone,
        href: "#data-foundation",
      },
      {
        code: "SOP 02",
        name: "Full-time Rider Daily SOP",
        owner: "Site Manager / Leader",
        scope: "Daily actions from arrival, pre-shift checks, peak-hour rules, night safety, clock-out and closeout.",
        modules: ["Shift length", "Check-in", "Peak rules", "Location pulse", "Closeout"],
        tone: "rider" as SectionTone,
        href: "#rider-daily",
      },
      {
        code: "SOP 03",
        name: "Rider Recruitment SOP",
        owner: "HQ Marketing / HQ Ops / Site",
        scope: "HQ campaigns, lead booking, offline registration, authorized binding, first shift and full-time conversion.",
        modules: ["Campaign", "Lead booking", "Registration", "Binding", "First shift"],
        tone: "recruitment" as SectionTone,
        href: "#recruitment",
      },
      {
        code: "SOP 04",
        name: "Site Operations SOP",
        owner: "Site Manager / Operations Assistant",
        scope: "Two-person site model for receiving HQ data, opening the site, dispatching, recruitment handoff and escalation.",
        modules: ["2-person team", "HQ data", "Daily site flow", "Recruitment handoff", "Escalation"],
        tone: "site" as SectionTone,
        href: "#site-ops",
      },
      {
        code: "SOP 05",
        name: "HQ Inspection SOP",
        owner: "HQ Ops / Regional Manager",
        scope: "HQ inspection checks whether actions were executed, records are complete, evidence exists and exceptions are closed.",
        modules: ["Action table", "Owner", "Frequency", "Evidence", "Closeout"],
        tone: "inspection" as SectionTone,
        href: "#inspection",
      },
    ],
    data: {
      title: "Data Principle",
      eyebrow: "Data foundation",
      paragraph:
        "PontoSys does not replace the 99 back office as the source of truth. HQ exports previous-day data from 99 and imports it into PontoSys for site operations, rider management, finance reconciliation, risk alerts and SOP tracking.",
      flow: [
        ["D-1 99 export", "Export riders, shifts, orders, online hours, AR, cancellations, finance and guaranteed adjustment data."],
        ["Validation", "Check Rider ID, phone, Ponto, shift, order count, amount, missing fields and duplicates."],
        ["PontoSys import", "Import into Riders, Pontos, Finance, Reports and Realtime, keeping a batch number."],
        ["Reconciliation", "Compare orders, online hours, TSH, AR, CAA and D+1/D+2 payables with 99 reports."],
        ["Exception queue", "Missing fields, amount gaps, unplanned online riders, abnormal cancellations, complaints and incidents go to operations."],
        ["Daily briefing", "Site managers convert the data into recruitment, scheduling, payment, training and risk actions."],
      ],
      video: "The video is used as PontoSys operations training material with the manual for site managers and Leaders.",
    },
    rider: {
      title: "Full-time Rider Daily Flow",
      description: "Green marks the daily actions every full-time rider and site team must complete.",
      timeline: [
        ["T-30min", "Arrive at Ponto", "Check in 30 minutes early; check vehicle, phone battery, thermal bag, rain gear, documents, fuel, brakes and tires."],
        ["Start", "Confirm shift", "Leader confirms area, shift, lunch/dinner peak rules, AR 95%, OPH 1.5 and daily risks."],
        ["Lunch peak", "11:00-14:00", "No offline time; riders must stay in the assigned area and report exceptions through the proper flow."],
        ["Afternoon", "14:00-18:00", "Breaks and offline time follow the rider system; anything outside the allowed rule must be reported."],
        ["Night", "18:00-22:00", "No offline time; send location every 10 minutes. Dangerous-area refusals require an explanation."],
        ["Closeout", "End-of-shift review", "Confirm online hours, completed orders, OPH, AR, incidents, complaints and the next-day plan."],
      ],
      blocks: [
        ["Work model", ["7h, 8h and 11h daily schedules are supported.", "Weekly models include 6 days + 1 rest day, 7 days, or site scheduling.", "Daily baseline is 7h online and OPH 1.5."]],
        ["Pre-shift checks", ["Vehicle, fuel, brakes, tires, lights, phone, network, support mount, bag, rain gear, documents and helmet must be ready.", "Problems must be reported before the shift starts."]],
        ["During shift", ["Minimum AR is 95%.", "Lunch and dinner peaks are no-offline windows.", "Platform issues, merchant delay, unreachable customer, address error or vehicle failure must be logged and reported."]],
        ["Night safety", ["Location is sent every 10 minutes.", "Dangerous areas may be refused with an explanation.", "In safety events, protect the rider first, then escalate to emergency services, Leader and Incident."]],
      ],
    },
    recruitment: {
      title: "Rider Recruitment SOP",
      pipeline: [
        ["HQ", "HQ campaign", "HQ publishes recruitment announcements, marketing assets and the signup entry point."],
        ["Lead", "Lead capture", "Collect city, Ponto preference, contact, motorcycle availability, work availability and appointment."],
        ["Offline", "Offline registration", "Guide riders to the site or registration point for briefing, document check, 99 app registration and support."],
        ["Backoffice", "Authorized handling", "PontoSys is only for HQ and authorized back-office users; it is not opened to riders."],
        ["Train", "Site training", "Train Ponto discipline, order flow, safety, payment, communication and incident handling."],
        ["Convert", "Full-time conversion", "Review first-shift AR, OPH, online hours, cancellations, complaints and fit for 7h/8h/11h schedules."],
      ],
      kpis: [
        ["Lead response", "95%+", "First contact within the defined response window."],
        ["Show-up rate", "50%-70%", "Booked candidates who arrive offline."],
        ["Document completeness", "90%+", "Arrived candidates with complete registration data."],
        ["Registration completion", "70%-85%", "Arrived candidates who complete 99 app submission."],
        ["Binding success", "60%-80%", "Candidates who complete authorized binding."],
        ["First-shift completion", "80%+", "Bound riders who complete the first shift."],
        ["Full-time conversion", "50%-70%", "First-shift riders who enter a formal schedule."],
        ["7-day retention", "60%+", "Full-time riders still active after 7 days."],
      ],
      actionsTitle: "Recruitment actions",
      actions: [
        ["Pre-launch", "HQ confirms city/Ponto gap, target headcount, asset version, signup entry, offline location, owner and daily capacity."],
        ["Lead received", "First contact within SLA to confirm motorcycle, city, availability, show-up intent, and send offline address and required docs."],
        ["Reception", "On-site sign-in, document verification, OL model briefing, shift length, pay cycle, Ponto discipline and peak rules."],
        ["Registration", "Assist rider with 99 app registration/doc submission; platform approval is not guaranteed by the OL."],
        ["Back-office binding", "HQ/authorized users process PontoSys binding, approving or rejecting within 96 hours and logging failure reasons."],
        ["First-shift conversion", "Once bound, add to Ponto/Leader/group, complete training, schedule first shift and review full-time conversion."],
      ],
      ownersTitle: "Ownership matrix",
      owners: [
        ["HQ Marketing", "Recruitment announcements, marketing assets, campaign channels, signup entries, script compliance."],
        ["HQ Operations", "Recruitment targets, city/Ponto gaps, HQ back-office binding, data validation, conversion tracking."],
        ["Site Manager", "On-site reception, document verification, training schedule, Ponto capacity, first-shift onboarding."],
        ["Leader", "First-shift follow-up, daily SOP training, early performance feedback, guidance for riders under observation."],
      ],
      decisionTitle: "Decision rules",
      decisionRules: [
        {
          title: "Pass",
          tone: "border-[#214632] bg-[#0f2118] text-[#b9f6cf]",
          items: ["Complete documents", "Successful binding", "Completed training", "First shift AR >= 95%", "First shift OPH >= 1.5", "No major complaints/incidents"],
        },
        {
          title: "Under Observation",
          tone: "border-[#4a3a18] bg-[#20190d] text-[#ffe0a3]",
          items: ["Slight tardiness", "Slightly low AR/OPH", "Unstable communication", "Unfamiliar with rules", "Needs a second training shift"],
        },
        {
          title: "Rejected",
          tone: "border-[#4a2028] bg-[#211016] text-[#ffc0cb]",
          items: ["Forged documents", "Unsuitable vehicle", "Rejecting schedules", "Offline during peak", "Severe complaints", "Dangerous driving", "Refusing site management"],
        },
      ],
    },
    site: {
      title: "Site Operations SOP",
      staffingTitle: "Site staffing model",
      staffing: [
        ["Site Manager", "Owns on-site order, rider communication, escalation, training execution and daily results."],
        ["Operations Assistant", "Owns check-in/out records, document checks, equipment checks, group messages, issue logging and PontoSys updates."],
      ],
      timeline: [
        ["Before opening", "Two people ready", "Confirm targets, HQ data package, risk riders, appointments and open issues."],
        ["Morning briefing", "Receive HQ data", "Review D-1 data, schedule suggestion, recruitment gap, payment gaps, risk riders and unresolved incidents."],
        ["Pre-shift", "Rider arrival", "Complete check-in 30 minutes early, equipment check, area confirmation, peak rules and exception reporting."],
        ["During shift", "Live dispatch", "Manager handles field issues; assistant logs offline time, refusals, complaints, incidents and group communication."],
        ["Closeout", "Review and handoff", "Check online hours, OPH, AR, open incidents, complaints, payment disputes and next-day schedule needs."],
      ],
      dataSupportTitle: "HQ data support",
      hqDataSupport: [
        ["D-1 data package", "HQ provides previous-day PontoSys exported data daily: online hours, shifts, orders, AR, CAA, finance and exceptions."],
        ["Scheduling tips", "HQ gives daily schedule suggestions based on Ponto gaps, lunch/dinner peak needs, night risks and history capacity."],
        ["Risk alerts", "HQ flags low TSH, low AR, high cancellations, complaints, accidents, payment gaps and consecutive absence."],
        ["Recruitment gap", "HQ outputs site target count, candidate booking, show-up lists, binding status and first-shift conversion."],
      ],
    },
    inspection: {
      title: "HQ Inspection SOP",
      tableHeaders: ["Stage", "Execution Action", "Owner", "Cadence", "System Record", "Evidence"],
      actions: [
        {
          stage: "Site opening",
          owner: "Site Manager",
          cadence: "Daily before opening",
          action: "Confirm attendance of two, daily targets, HQ data package, risk riders, booking show-up list, and pending issues.",
          record: "PontoSys daily tasks / Site group opening message",
          evidence: "Two-person sign-in, opening photo, daily task screenshot, group notification records.",
        },
        {
          stage: "Data briefing",
          owner: "Site Manager + HQ Ops",
          cadence: "Daily morning briefing",
          action: "Convert D-1 data to site actions: who submits documents, who starts first shift, who has risk tracking, who requires payment checks.",
          record: "PontoSys exception queue / HQ data briefing",
          evidence: "Morning briefing notes, exception lists, owner assignments, completion status.",
        },
        {
          stage: "Recruitment arrival",
          owner: "Operations Assistant",
          cadence: "Each recruitment session",
          action: "Candidate sign-in, document check, OL model briefing, assist with 99 app registration, mark show-up/no-show/pending documents.",
          record: "Recruitment lead sheet / PontoSys status",
          evidence: "Sign-in sheet, document completeness rate, registration completion screenshots, no-show recall logs.",
        },
        {
          stage: "Back-office binding",
          owner: "HQ Back-office",
          cadence: "Within 96 hours",
          action: "Process PontoSys binding/unbinding, record success, failure, incomplete documents, platform rejected, or duplicate binding.",
          record: "HQ Back-office / PontoSys binding status",
          evidence: "Binding status, failure reasons, processing time, overdue lists.",
        },
        {
          stage: "Pre-shift check-in",
          owner: "Operations Assistant",
          cadence: "30 minutes before shift",
          action: "Check rider arrival, equipment, vehicle, documents, phone battery, area and shift; mark and notify manager immediately if absent.",
          record: "PontoSys check-in / Site check-in sheet",
          evidence: "Check-in timestamp, equipment checklist, late rider list, backup rider assignments.",
        },
        {
          stage: "Peak dispatch",
          owner: "Site Manager",
          cadence: "Lunch/dinner peak",
          action: "Monitor peak online status, area, offline behavior, refusal explanations, low AR, low OPH, accidents, complaints; coordinate backups.",
          record: "PontoSys realtime ops / Exception events",
          evidence: "Online status screenshots, exception handling records, refusal explanations, incident/complaint tickets.",
        },
        {
          stage: "Night shift safety",
          owner: "Site Manager + Leader",
          cadence: "Night shift location every 10m",
          action: "Check night shift locations, abnormal stops, dangerous-area refusal explanations and security incident escalation.",
          record: "Location logs / Incident",
          evidence: "Location tracking, 10m records, refusal explanations, escalation logs.",
        },
        {
          stage: "Closeout review",
          owner: "Site Manager + Assistant",
          cadence: "Daily before closing",
          action: "Check online hours, OPH, AR, unresolved accidents, complaints, payment disputes, next-day gaps, and HQ support items.",
          record: "PontoSys daily closeout / Site review",
          evidence: "Daily closeout sheets, unresolved checklists, next-day scheduling needs, HQ feedback forms.",
        },
      ],
      metrics: [
        ["Record completeness", "100%", "Every action has a PontoSys record, sign-in sheet, group record or back-office status."],
        ["Evidence traceability", "95%+", "Screenshots, forms, messages, locations, incident tickets and reviews can be checked."],
        ["Overdue actions", "0", "No action can exceed the defined frequency or SLA without escalation."],
        ["Exception closeout", "100%", "Incidents, complaints, payment gaps and data gaps must have owner and next step."],
      ],
    },
  },
  pt: {
    eyebrow: "Motoboys fixos / Recrutamento / Operacao de ponto",
    title: "Central SOP MePonto PontoSys",
    mapEyebrow: "Mapa de categorias SOP",
    mapTitle: "Existem 5 SOPs formais",
    mapDescription:
      "A biblioteca serve apenas para manuais, video, regras de marca e comunicacao. Os SOPs formais cobrem dados, execucao do motoboy fixo, conversao de recrutamento, operacao de ponto e inspecao da matriz.",
    counters: ["SOPs formais", "Biblioteca", "Papeis de execucao"],
    sourceTitle: "Biblioteca",
    sourceDescription: "Manual PontoSys, brand guide, boas praticas, guia de comunicacao e video de treinamento para gerentes de ponto e Leaders.",
    sectionLabels: {
      data: "Base de dados",
      rider: "Motoboy fixo",
      recruitment: "Conversao de recrutamento",
      site: "Operacao do ponto",
      inspection: "Inspecao HQ",
      library: "Biblioteca",
    },
    ui: {
      actionBadge: "Acao",
      briefingBadge: "Briefing",
      closeoutBadge: "Fechamento",
      dailyCadenceTitle: "Cadencia diaria",
      dailyRiderEyebrow: "SOP diario do motoboy",
      decisionRulesEyebrow: "Regras de decisao",
      dispatchBadge: "Despacho",
      documentLabel: "Documento",
      d1DataBadge: "Dados D-1 99",
      evidenceBadge: "Evidencia",
      funnelQualityBadge: "Qualidade do funil",
      hqDataSupportEyebrow: "Suporte de dados HQ",
      hqInspectionActionsEyebrow: "Acoes de inspecao HQ",
      openBadge: "Abertura",
      ownerBadge: "Responsavel",
      ownershipEyebrow: "Responsabilidades",
      recruitmentActionsEyebrow: "Acoes de recrutamento",
      recruitmentFunnelEyebrow: "Funil de recrutamento",
      recruitmentKpiEyebrow: "KPI de recrutamento",
      recruitmentKpiTitle: "KPIs de recrutamento",
      redLinesTitle: "Linhas vermelhas",
      siteDailyFlowEyebrow: "Fluxo diario do ponto",
      siteOperationsEyebrow: "Operacao do ponto",
      siteStaffingEyebrow: "Equipe do ponto",
      stepLabelPrefix: "Etapa",
      trainingVideo: "Video de treinamento",
      twoPeopleBadge: "2 pessoas / Ponto",
    },
    sourceDocs: [
      {
        title: "Manual PontoSys",
        description: "Importacao diaria, execucao do ponto, conversao de recrutamento, evidencias de inspecao e fechamento operacional.",
        href: "/sop-assets/pontosys-manual.html",
      },
      {
        title: "Guia de Marca",
        description: "Regras de comunicacao 99Food, tom de voz, identidade visual e promessas proibidas.",
        href: "/sop-assets/communication-guide.pdf",
      },
      {
        title: "FAQ de Boas Praticas",
        description: "FAQ OL sobre bags, repasses, regras de modal, desvinculacao, seguranca e melhores praticas diarias.",
        href: "/sop-assets/good-practices-faq.pdf",
      },
      {
        title: "Guia de Comunicacao",
        description: "Fluxo Reclame Aqui, SLA, metas de scorecard e gestao de reputacao.",
        href: "/sop-assets/reclame-aqui-playbook.pdf",
      },
    ],
    categories: [
      {
        code: "SOP 01",
        name: "SOP de Importacao de Dados",
        owner: "HQ Ops / Dados",
        scope: "Exportar dados D-1 do back office 99, validar, importar no PontoSys, reconciliar financeiro e criar fila de excecoes.",
        modules: ["Pacote D-1", "Validacao", "Importacao PontoSys", "Reconciliacao", "Excecoes"],
        tone: "data" as SectionTone,
        href: "#data-foundation",
      },
      {
        code: "SOP 02",
        name: "SOP Diario do Motoboy Fixo",
        owner: "Gerente de Ponto / Leader",
        scope: "Acoes diarias desde chegada, checklist pre-turno, regras de pico, seguranca noturna, saida e fechamento.",
        modules: ["Carga horaria", "Check-in", "Picos", "Localizacao", "Fechamento"],
        tone: "rider" as SectionTone,
        href: "#rider-daily",
      },
      {
        code: "SOP 03",
        name: "SOP de Recrutamento",
        owner: "HQ Marketing / HQ Ops / Ponto",
        scope: "Campanhas da matriz, agendamento de leads, registro presencial, vinculacao autorizada, primeiro turno e conversao.",
        modules: ["Campanha", "Lead", "Registro", "Vinculacao", "Primeiro turno"],
        tone: "recruitment" as SectionTone,
        href: "#recruitment",
      },
      {
        code: "SOP 04",
        name: "SOP de Operacao do Ponto",
        owner: "Gerente de Ponto / Assistente",
        scope: "Modelo com duas pessoas para receber dados da matriz, abrir o ponto, despachar, receber recrutamento e escalar problemas.",
        modules: ["Equipe 2 pessoas", "Dados HQ", "Rotina diaria", "Recrutamento", "Escalacao"],
        tone: "site" as SectionTone,
        href: "#site-ops",
      },
      {
        code: "SOP 05",
        name: "SOP de Inspecao HQ",
        owner: "HQ Ops / Gerente Regional",
        scope: "A matriz verifica execucao, registros completos, evidencias disponiveis e excecoes fechadas.",
        modules: ["Tabela de acao", "Responsavel", "Frequencia", "Evidencia", "Fechamento"],
        tone: "inspection" as SectionTone,
        href: "#inspection",
      },
    ],
    data: {
      title: "Principio de Dados",
      eyebrow: "Base de dados",
      paragraph:
        "O PontoSys nao substitui o back office 99 como fonte original. A matriz exporta dados D-1 do 99 e importa no PontoSys para operacao, gestao de motoboys, reconciliacao financeira, alertas de risco e rastreio de SOP.",
      flow: [
        ["Exportacao D-1 99", "Exportar motoboys, turnos, pedidos, horas online, AR, cancelamentos, financeiro e ajustes garantidos."],
        ["Validacao", "Checar Rider ID, telefone, Ponto, turno, pedidos, valores, campos ausentes e duplicados."],
        ["Importacao PontoSys", "Importar em Riders, Pontos, Finance, Reports e Realtime, mantendo numero do lote."],
        ["Reconciliacao", "Comparar pedidos, horas online, TSH, AR, CAA e valores D+1/D+2 com relatorios 99."],
        ["Fila de excecoes", "Campos ausentes, diferencas, online sem escala, cancelamentos anormais, reclamacoes e incidentes entram na fila."],
        ["Briefing diario", "Gerentes transformam os dados em acoes de recrutamento, escala, pagamento, treinamento e risco."],
      ],
      video: "O video e usado como treinamento operacional do PontoSys junto com o manual para gerentes de ponto e Leaders.",
    },
    rider: {
      title: "Fluxo Diario do Motoboy Fixo",
      description: "O verde marca as acoes diarias obrigatorias para motoboys fixos e equipe do ponto.",
      timeline: [
        ["T-30min", "Chegar ao Ponto", "Check-in 30 minutos antes; verificar moto, bateria, bag, capa de chuva, documentos, combustivel, freios e pneus."],
        ["Inicio", "Confirmar turno", "Leader confirma area, turno, regras de pico, AR 95%, OPH 1.5 e riscos do dia."],
        ["Pico almoco", "11:00-14:00", "Nao ficar offline; permanecer na area definida e reportar excecoes pelo fluxo correto."],
        ["Tarde", "14:00-18:00", "Pausas e offline seguem o sistema do motoboy; fora da regra precisa de reporte."],
        ["Noite", "18:00-22:00", "Nao ficar offline; enviar localizacao a cada 10 minutos. Recusa por area perigosa exige justificativa."],
        ["Fechamento", "Revisao do turno", "Confirmar horas online, pedidos, OPH, AR, incidentes, reclamacoes e plano do dia seguinte."],
      ],
      blocks: [
        ["Modelo de trabalho", ["Turnos diarios de 7h, 8h e 11h.", "Modelos semanais: 6 dias + 1 folga, 7 dias ou escala do ponto.", "Base diaria: 7h online e OPH 1.5."]],
        ["Checklist pre-turno", ["Moto, combustivel, freios, pneus, luzes, celular, rede, suporte, bag, chuva, documentos e capacete.", "Problemas devem ser reportados antes do inicio."]],
        ["Durante o turno", ["AR minimo de 95%.", "Picos de almoco e jantar sem offline.", "Problemas de plataforma, loja, cliente, endereco ou moto precisam ser registrados e reportados."]],
        ["Seguranca noturna", ["Localizacao a cada 10 minutos.", "Areas perigosas podem ser recusadas com justificativa.", "Em eventos de seguranca, proteger a pessoa primeiro e escalar para emergencia, Leader e Incident."]],
      ],
    },
    recruitment: {
      title: "SOP de Recrutamento",
      pipeline: [
        ["HQ", "Campanha HQ", "A matriz publica anuncios, materiais de marketing e entrada de inscricao."],
        ["Lead", "Captura de lead", "Coletar cidade, Ponto desejado, contato, disponibilidade de moto, horario e agendamento."],
        ["Offline", "Registro presencial", "Levar o candidato ao ponto para explicacao, checagem de documentos, registro no app 99 e suporte."],
        ["Backoffice", "Tratamento autorizado", "PontoSys e apenas para matriz e usuarios autorizados; nao e aberto aos motoboys."],
        ["Train", "Treinamento do ponto", "Treinar disciplina de Ponto, fluxo de pedido, seguranca, pagamento, comunicacao e incidentes."],
        ["Convert", "Conversao full-time", "Revisar AR, OPH, horas online, cancelamentos, reclamacoes e aderencia a 7h/8h/11h."],
      ],
      kpis: [
        ["Resposta ao lead", "95%+", "Primeiro contato dentro da janela definida."],
        ["Comparecimento", "50%-70%", "Candidatos agendados que chegam presencialmente."],
        ["Documentos completos", "90%+", "Candidatos com dados completos para registro."],
        ["Registro concluido", "70%-85%", "Candidatos que completam submissao no app 99."],
        ["Vinculacao aprovada", "60%-80%", "Candidatos que concluem vinculacao autorizada."],
        ["Primeiro turno", "80%+", "Vinculados que completam o primeiro turno."],
        ["Conversao full-time", "50%-70%", "Candidatos que entram em escala formal."],
        ["Retencao 7 dias", "60%+", "Full-time ainda ativo depois de 7 dias."],
      ],
      actionsTitle: "Lista de ações de recrutamento",
      actions: [
        ["Pré-lançamento", "HQ confirma lacuna da cidade/Ponto, meta de headcount, versão do material, entrada de inscrição, ponto físico, responsável e capacidade diária."],
        ["Lead recebido", "Primeiro contato dentro do SLA para confirmar moto, cidade, disponibilidade, intenção de comparecer e enviar endereço presencial e documentos necessários."],
        ["Recepção", "Check-in presencial, verificação de documentos, briefing do modelo OL, carga horária, ciclo de pagamento, disciplina de Ponto e regras de pico."],
        ["Registro", "Auxiliar o motoboy no cadastro do app 99 e envio de documentos; aprovação da plataforma não é garantida pelo OL."],
        ["Vinculação back-office", "HQ/usuários autorizados processam vinculação no PontoSys, aprovando ou rejeitando em até 96 horas e registrando o motivo da falha."],
        ["Conversão", "Após vinculado, adicionar ao Ponto/Leader/grupo, completar treinamento, agendar primeiro turno e avaliar conversão para fixo."],
      ],
      ownersTitle: "Matriz de responsáveis",
      owners: [
        ["Marketing Matriz", "Anúncios de recrutamento, materiais de marketing, canais de campanha, entradas de inscrição, conformidade de roteiros."],
        ["Ops Matriz", "Metas de recrutamento, lacunas de cidade/Ponto, vinculação de back-office, validação de dados, rastreio de conversão."],
        ["Gerente de Ponto", "Recepção presencial, verificação de documentos, cronograma de treinamento, capacidade do Ponto, integração do primeiro turno."],
        ["Leader", "Acompanhamento do primeiro turno, treinamento diário de SOP, feedback inicial de desempenho, mentoria para motoboys em observação."],
      ],
      decisionTitle: "Regras de decisão (Aprovado / Em Observação / Reprovado)",
      decisionRules: [
        {
          title: "Aprovado",
          tone: "border-[#214632] bg-[#0f2118] text-[#b9f6cf]",
          items: ["Documentos completos", "Vinculação com sucesso", "Treinamento concluído", "Primeiro turno AR >= 95%", "Primeiro turno OPH >= 1.5", "Sem reclamações/acidentes graves"],
        },
        {
          title: "Em Observação",
          tone: "border-[#4a3a18] bg-[#20190d] text-[#ffe0a3]",
          items: ["Pequeno atraso", "AR/OPH ligeiramente baixos", "Comunicação instável", "Falta de familiaridade com regras", "Necessita de segundo turno de treinamento"],
        },
        {
          title: "Reprovado",
          tone: "border-[#4a2028] bg-[#211016] text-[#ffc0cb]",
          items: ["Documentos falsos", "Veículo inadequado", "Rejeição de escalas", "Offline durante o pico", "Reclamações graves", "Direção perigosa", "Recusa de gestão local"],
        },
      ],
    },
    site: {
      title: "SOP de Operacao do Ponto",
      staffingTitle: "Modelo de equipe do ponto",
      staffing: [
        ["Gerente de Ponto", "Responsavel por ordem local, comunicacao com motoboys, escalacao, treinamento e resultado diario."],
        ["Assistente Operacional", "Responsavel por check-in/out, documentos, equipamentos, mensagens de grupo, registro de problemas e atualizacao PontoSys."],
      ],
      timeline: [
        ["Antes de abrir", "Duas pessoas prontas", "Confirmar metas, pacote HQ, motoboys de risco, agendamentos e pendencias."],
        ["Briefing", "Receber dados HQ", "Revisar dados D-1, sugestao de escala, lacuna de recrutamento, pagamento, risco e incidentes abertos."],
        ["Pre-turno", "Chegada do motoboy", "Check-in 30 minutos antes, equipamentos, area, regras de pico e reporte de excecoes."],
        ["Durante turno", "Despacho ao vivo", "Gerente resolve campo; assistente registra offline, recusas, reclamacoes, incidentes e mensagens."],
        ["Fechamento", "Revisao e passagem", "Checar horas online, OPH, AR, incidentes, reclamacoes, pagamentos e necessidades do proximo dia."],
      ],
      dataSupportTitle: "Suporte de dados da matriz",
      hqDataSupport: [
        ["Pacote de dados D-1", "A matriz fornece diariamente os dados exportados do PontoSys do dia anterior: horas online, turnos, pedidos, AR, CAA, financeiro e exceções."],
        ["Sugestões de escala", "A matriz sugere escalas diárias com base em lacunas do Ponto, necessidades de pico de almoço/jantar, riscos noturnos e capacidade histórica."],
        ["Alertas de risco", "A matriz sinaliza TSH baixo, AR baixa, cancelamentos altos, reclamações, acidentes, divergências de pagamento e ausência consecutiva."],
        ["Lacunas de contratação", "A matriz define headcount do ponto, agendamentos, lista de presença, status de vinculação e conversão do primeiro turno."],
      ],
    },
    inspection: {
      title: "SOP de Inspecao HQ",
      tableHeaders: ["Etapa", "Ação de Execução", "Responsável", "Cadência", "Registro no Sistema", "Evidência de Inspeção"],
      actions: [
        {
          stage: "Abertura do Ponto",
          owner: "Gerente de Ponto",
          cadence: "Diário antes de abrir",
          action: "Confirmar presença dos dois, metas diárias, pacote de dados HQ, motoboys de risco, lista de comparecimento de agendados e pendências.",
          record: "Tarefas diárias PontoSys / Mensagem de abertura do grupo de ponto",
          evidence: "Check-in de duas pessoas, foto de abertura, print da tarefa diária, registros de notificação do grupo.",
        },
        {
          stage: "Briefing de dados",
          owner: "Gerente de Ponto + HQ Ops",
          cadence: "Diário no briefing matinal",
          action: "Converter dados D-1 em ações locais: quem fornece docs, quem inicia primeiro turno, quem tem alerta de risco ou repasse.",
          record: "Fila de exceções PontoSys / Briefing de dados HQ",
          evidence: "Notas do briefing matinal, lista de exceções, atribuições de responsáveis, status de conclusão.",
        },
        {
          stage: "Chegada recrutamento",
          owner: "Assistente Operacional",
          cadence: "A cada sessão de recrutamento",
          action: "Assinatura do candidato, checagem de documentos, briefing do modelo OL, apoiar no app 99, marcar comparecimento/ausência/pendências.",
          record: "Planilha de leads de recrutamento / Status PontoSys",
          evidence: "Lista de presença, taxa de documentos completos, prints de cadastro concluído, registros de retorno de ausentes.",
        },
        {
          stage: "Vinculação back-office",
          owner: "Back-office HQ",
          cadence: "Dentro de 96 horas",
          action: "Processar vinculação/desvinculação no PontoSys, registrar sucesso, falha, documentos incompletos, rejeição de plataforma ou duplicidade.",
          record: "Back-office HQ / Status de vinculação PontoSys",
          evidence: "Status de vinculação, motivos de falha, tempo de processamento, listas vencidas.",
        },
        {
          stage: "Check-in pré-turno",
          owner: "Assistente Operacional",
          cadence: "30 minutos antes do turno",
          action: "Verificar chegada do motoboy, equipamentos, moto, documentos, bateria, área e turno; marcar e notificar gerente imediatamente se ausente.",
          record: "Check-in PontoSys / Planilha de check-in local",
          evidence: "Timestamp de check-in, checklist de equipamentos, lista de motoboys atrasados, motoboys de reserva.",
        },
        {
          stage: "Despacho de pico",
          owner: "Gerente de Ponto",
          cadence: "Pico de almoço/jantar",
          action: "Monitorar status online no pico, área, offline, justificativas de recusa, AR baixa, OPH baixo, acidentes, reclamações; coordenar reservas.",
          record: "Operação em tempo real PontoSys / Eventos de exceção",
          evidence: "Prints de status online, registros de tratamento de exceções, justificativas de recusa, tickets de incidentes/reclamações.",
        },
        {
          stage: "Segurança noturna",
          owner: "Gerente de Ponto + Leader",
          cadence: "Localização noturna a cada 10m",
          action: "Verificar localizações noturnas, paradas anormais, justificativas de recusa em áreas perigosas e escalação de incidentes de segurança.",
          record: "Logs de localização / Incident",
          evidence: "Rastreamento de localização, registros de 10m, justificativas de recusa, logs de escalação.",
        },
        {
          stage: "Fechamento diário",
          owner: "Gerente de Ponto + Assistente",
          cadence: "Diário antes de fechar",
          action: "Checar horas online, OPH, AR, acidentes não resolvidos, reclamações, divergências de repasse, lacunas do dia seguinte e suporte da matriz.",
          record: "Fechamento diário PontoSys / Revisão local",
          evidence: "Planilhas de fechamento diário, checklists de pendências, necessidades de escala para o dia seguinte, formulários de feedback HQ.",
        },
      ],
      metrics: [
        ["Completude de registro", "100%", "Cada acao tem PontoSys, lista, registro de grupo ou status back-office."],
        ["Evidencia rastreavel", "95%+", "Prints, formularios, mensagens, localizacao, tickets e revisoes podem ser auditados."],
        ["Acoes vencidas", "0", "Nenhuma acao passa do SLA sem escalacao."],
        ["Fechamento de excecoes", "100%", "Incidentes, reclamacoes, pagamentos e dados precisam de dono e proximo passo."],
      ],
    },
  },
} satisfies Record<Exclude<Language, "zh">, {
  eyebrow: string;
  title: string;
  mapEyebrow: string;
  mapTitle: string;
  mapDescription: string;
  counters: string[];
  sourceTitle: string;
  sourceDescription: string;
  sectionLabels: Record<SectionTone, string>;
  ui: Record<
    | "actionBadge"
    | "briefingBadge"
    | "closeoutBadge"
    | "dailyCadenceTitle"
    | "dailyRiderEyebrow"
    | "decisionRulesEyebrow"
    | "dispatchBadge"
    | "documentLabel"
    | "d1DataBadge"
    | "evidenceBadge"
    | "funnelQualityBadge"
    | "hqDataSupportEyebrow"
    | "hqInspectionActionsEyebrow"
    | "openBadge"
    | "ownerBadge"
    | "ownershipEyebrow"
    | "recruitmentActionsEyebrow"
    | "recruitmentFunnelEyebrow"
    | "recruitmentKpiEyebrow"
    | "recruitmentKpiTitle"
    | "redLinesTitle"
    | "siteDailyFlowEyebrow"
    | "siteOperationsEyebrow"
    | "siteStaffingEyebrow"
    | "stepLabelPrefix"
    | "trainingVideo"
    | "twoPeopleBadge",
    string
  >;
  sourceDocs: typeof sourceDocs;
  categories: Array<{ code: string; name: string; owner: string; scope: string; modules: string[]; tone: SectionTone; href: string }>;
  data: { title: string; eyebrow: string; paragraph: string; flow: string[][]; video: string };
  rider: { title: string; description: string; timeline: string[][]; blocks: Array<[string, string[]]> };
  recruitment: {
    title: string;
    pipeline: string[][];
    kpis: string[][];
    actionsTitle: string;
    actions: string[][];
    ownersTitle: string;
    owners: string[][];
    decisionTitle: string;
    decisionRules: Array<{ title: string; tone: string; items: string[] }>;
  };
  site: {
    title: string;
    staffingTitle: string;
    staffing: string[][];
    timeline: string[][];
    dataSupportTitle: string;
    hqDataSupport: string[][];
  };
  inspection: {
    title: string;
    tableHeaders: string[];
    actions: Array<{ stage: string; owner: string; cadence: string; action: string; record: string; evidence: string }>;
    metrics: string[][];
  };
}>;

const fullTimeRiderSopEn = [
  {
    title: "1. Daily Work Schedule",
    items: [
      "Full-time riders are scheduled and evaluated based on three shift lengths: 7 hours, 8 hours, and 11 hours.",
      "Weekly schedules support 6 days on + 1 day off, 7-day continuous operations, or site-based shifts, published by the site as needed.",
      "Daily minimum online hours are based on a 7-hour baseline; 8h and 11h shifts are calculated separately per the system schedule.",
      "Daily productivity target is OPH 1.5 (1.5 completed orders per online hour) as the baseline standard.",
    ],
  },
  {
    title: "2. Shifts & Check-in",
    items: [
      "Morning/afternoon shifts typically run 11:00-14:00 and 14:00-18:00; evening/night shifts typically run 18:00-22:00.",
      "Riders must check in at their designated Ponto and arrive 30 minutes early to prepare.",
      "Morning/afternoon shifts check in on-site; evening shifts check in online, with the site still verifying their status.",
      "Leaders confirm the assigned area, shift targets, peak hours, and specific risks before starting.",
    ],
  },
  {
    title: "3. Pre-shift Inspection",
    items: [
      "Check vehicle, fuel, brakes, tires, lights, phone battery, network connectivity, and support mount.",
      "Confirm thermal bag, rain gear, documents, helmet, and mandatory safety equipment are complete.",
      "Report any anomalies in vehicle, documents, phone, or gear to the Leader before shift start and wait for instructions.",
    ],
  },
  {
    title: "4. On-duty Execution",
    items: [
      "Minimum Acceptance Rate (AR) is 95%; any order rejection must have a system-traceable reason.",
      "No offline time is allowed during lunch and dinner peaks; riders must stay in their assigned areas and remain dispatchable.",
      "Breaks and offline status must follow the rider system rules; any deviation must be pre-approved.",
      "For merchant delays, unreachable customers, incorrect addresses, vehicle breakdowns, or platform errors, follow the platform flow first, then sync with the Leader.",
    ],
  },
  {
    title: "5. Night Shift Safety",
    items: [
      "The night shift system pings location every 10 minutes; sites and Leaders must monitor abnormal stops.",
      "Riders may refuse orders in high-risk areas, abnormal addresses, or dangerous situations but must submit a refusal explanation.",
      "In case of night accidents or safety incidents, prioritize rider safety first, contact emergency/police and the Leader, and create an Incident ticket.",
    ],
  },
  {
    title: "6. Clock-out & Review",
    items: [
      "Before ending the shift, a scheduled review is organized by the site to confirm online hours, completed orders, OPH, AR, anomalies, and next-day plans.",
      "Morning/afternoon shifts complete check-out at the site; evening shifts complete check-out online.",
      "Unresolved accidents, complaints, payment disputes, or severe anomalies must be handed over to the Leader or Site Manager before clocking out.",
    ],
  },
];

const fullTimeRiderSopPt = [
  {
    title: "1. Jornada Diária de Trabalho",
    items: [
      "Motoboys fixos são escalados e avaliados com base em três durações de turno: 7 horas, 8 horas e 11 horas.",
      "A escala semanal suporta 6 dias de trabalho + 1 folga, operação contínua de 7 dias ou escala do ponto, publicada conforme necessidade.",
      "As horas online mínimas diárias baseiam-se em 7h; turnos de 8h e 11h são calculados separadamente conforme a escala do sistema.",
      "A meta diária de produtividade é OPH 1.5 (1.5 pedidos concluídos por hora online) como padrão básico.",
    ],
  },
  {
    title: "2. Turnos e Check-in",
    items: [
      "Turnos da manhã/tarde são das 11:00-14:00 e 14:00-18:00; turnos da noite/madrugada são das 18:00-22:00.",
      "Os motoboys devem fazer check-in no Ponto designado e chegar 30 minutos antes para preparação.",
      "Turnos da manhã/tarde registram no ponto físico; turnos da noite fazem check-in online, com o ponto confirmando a presença.",
      "O Leader confirma a área de responsabilidade, metas do turno, regras de pico e riscos específicos antes do início.",
    ],
  },
  {
    title: "3. Inspeção Pré-turno",
    items: [
      "Verificar veículo, combustível, freios, pneus, luzes, bateria do celular, rede e suporte de guidão.",
      "Confirmar se a bag térmica, capa de chuva, documentos, capacete e equipamentos de segurança obrigatórios estão completos.",
      "Qualquer problema no veículo, documentos, celular ou equipamentos deve ser reportado ao Leader antes do turno para orientação.",
    ],
  },
  {
    title: "4. Execução em Serviço",
    items: [
      "Taxa de Aceitação (AR) mínima de 95%; recusas de pedidos devem ter justificativa rastreável no sistema.",
      "Proibido ficar offline nos picos de almoço e jantar; os motoboys devem permanecer na área designada e disponíveis para despacho.",
      "Pausas e status offline devem seguir as regras do sistema; qualquer exceção deve ser reportada.",
      "Em atrasos de lojas, clientes ausentes, endereços errados, quebra de moto ou erros da plataforma, siga o fluxo da plataforma primeiro e depois avise o Leader.",
    ],
  },
  {
    title: "5. Segurança Noturna",
    items: [
      "O sistema noturno envia localização a cada 10 minutos; pontos e Leaders monitoram paradas anormais.",
      "Motoboys podem recusar pedidos em áreas de risco, endereços anormais ou perigo pessoal, mas devem justificar a recusa.",
      "Em acidentes noturnos ou ocorrências de segurança, priorize a integridade física, acione emergência/polícia, avise o Leader e crie um Incident no sistema.",
    ],
  },
  {
    title: "6. Fechamento e Revisão",
    items: [
      "Antes de deslogar, o ponto organiza uma revisão diária para confirmar horas online, pedidos, OPH, AR, exceções e o dia seguinte.",
      "Turnos da manhã/tarde fazem check-out no ponto físico; turnos da noite fazem check-out online.",
      "Acidentes não resolvidos, reclamações, disputas de repasse ou anomalias graves devem ser passados ao Leader ou Gerente antes da saída.",
    ],
  },
];

const recruitmentSopEn = [
  {
    title: "1. HQ Unified Recruitment",
    items: [
      "Recruitment needs are confirmed by HQ based on Ponto shift gaps, peak-hour gaps, night shift gaps, and the 7h/8h/11h full-time schedule.",
      "HQ manages recruitment announcements, marketing assets, registration entries, and conversion campaigns; sites handle reception and training.",
      "All external materials must use HQ-approved versions; sites are prohibited from promising earnings, subsidies, policies, or official 99 decisions.",
      "External communications only highlight delivery opportunities and offline registration; do not mention the HQ back office, show dashboard screenshots, or allow riders to access internal systems.",
    ],
  },
  {
    title: "2. Lead Collection & Booking",
    items: [
      "Name, phone, city, Ponto preference, vehicle type, work intent, and scheduling availability are collected via HQ signup entry.",
      "Initial verification confirms candidates have a motorcycle; under the OL model, bikes are not accepted unless officially stated by 99.",
      "Arrange offline registration slots based on city and Ponto capacity; remind candidates to bring documents, phone, and vehicle papers.",
      "Lead status is tracked as: Pending, Booked, No-show, Show-up, Pending Docs, Registering, Binding, In-training, Converted, or Rejected.",
    ],
  },
  {
    title: "3. Offline Registration & Document Check",
    items: [
      "Upon candidate arrival, staff explain the OL model, shift lengths, Ponto rules, AR 95%, OPH 1.5, and peak-hour rules.",
      "Verify RG, CPF, email, phone, city, vehicle, and contact info; missing fields will block the binding process.",
      "Candidates submit their registration details in the 99 app; the OL does not guarantee or control the platform's approval results.",
      "OL provides delivery bags; proprietary branded bags may be used, maintaining a professional delivery image.",
    ],
  },
  {
    title: "4. HQ Back-office Binding",
    items: [
      "PontoSys is an internal operating system for importing 99 data and scheduling; it is not for recruitment, groups, or training.",
      "Once 99 app registration and platform review are complete, authorized HQ staff process the OL binding, scheduling, and data check in PontoSys.",
      "Binding/unbinding requests must be approved or rejected within 96 hours; otherwise, they automatically expire and get rejected.",
      "After binding, HQ syncs with the site; the site then adds the rider to the Ponto, Leader, In-App Chat rooms, and training list.",
    ],
  },
  {
    title: "5. Training & First Shift",
    items: [
      "Before the first shift, complete training on Ponto discipline, daily SOP, order flow, pickup/delivery standards, night safety, payment, and incidents.",
      "Clarify payment rules: D+1 for order earnings, D+2 for guaranteed adjustments (if applicable); OL is responsible for explaining payments.",
      "Train riders only on execution rules; do not show them back-office scheduling, PontoSys data, or HQ credentials.",
      "Leaders follow up on the new rider's first shift, focusing on check-in, online status, acceptance, delivery, communication, location, and exceptions.",
      "Review first shift online hours, OPH, AR, cancellations, complaints, accidents, tardiness, and suitability for the full-time schedule.",
    ],
  },
  {
    title: "6. Onboarding & Rejection",
    items: [
      "Approved riders enter the 7h/8h/11h full-time schedule, with Ponto, Leader, shift, and daily goals assigned.",
      "Under-observation riders receive a second training shift, focusing on low AR, low OPH, tardiness, offline behavior, or communication issues.",
      "Unsuitable candidates are excluded; if unlinking is needed, authorized HQ staff process unbinding in PontoSys and complete financial settlement.",
      "All onboarding, observation, and rejection reasons must be logged in PontoSys for recruitment quality channel analysis.",
    ],
  },
];

const recruitmentSopPt = [
  {
    title: "1. Recrutamento Unificado da Matriz",
    items: [
      "As demandas de contratação são confirmadas pela matriz com base nas lacunas de turnos do Ponto, picos de almoço/jantar, turnos da noite e escala fixa de 7h/8h/11h.",
      "A matriz gerencia os anúncios de vagas, materiais de marketing, links de inscrição e campanhas de conversão; o ponto cuida da recepção e treinamento.",
      "Todos os materiais externos devem ser versões aprovadas pela matriz; o ponto não pode prometer ganhos, subsídios, políticas ou decisões oficiais da 99.",
      "Comunicações externas destacam apenas as oportunidades de entrega e o registro presencial; não mencione o back-office HQ, não mostre prints do sistema nem permita que motoboys vejam sistemas internos.",
    ],
  },
  {
    title: "2. Coleta e Agendamento de Leads",
    items: [
      "Nome, telefone, cidade, Ponto preferido, tipo de veículo, intenção de trabalho e disponibilidade são coletados pelo link oficial da matriz.",
      "Confirmação inicial de que o candidato possui moto; no modelo OL, bikes não são aceitas por padrão, exceto sob orientação oficial da 99.",
      "Agendar horários presenciais com base na capacidade da cidade e do Ponto; lembrar os candidatos de trazer documentos, celular e dados do veículo.",
      "O status do lead é rastreado como: Pendente, Agendado, Ausente, Compareceu, Docs Pendentes, Cadastrando, Vinculando, Em Treinamento, Convertido ou Reprovado.",
    ],
  },
  {
    title: "3. Registro Presencial e Checagem de Docs",
    items: [
      "Ao chegar ao ponto físico, a equipe explica o modelo OL, carga horária, regras de Ponto, AR de 95%, OPH de 1.5 e regras de pico.",
      "Validar presencialmente nome, RG, CPF, e-mail, telefone, cidade, veículo e contatos; dados ausentes bloqueiam a vinculação.",
      "O candidato envia o cadastro no app da 99 por conta própria; a OL não controla o resultado da aprovação da plataforma nem garante aprovação.",
      "O fornecimento de bags é responsabilidade da OL; bags de marca própria podem ser usadas, desde que mantenham a imagem profissional de entrega.",
    ],
  },
  {
    title: "4. Vinculação Back-office HQ",
    items: [
      "O PontoSys é um sistema interno operacional para receber dados e escalas da 99; não deve ser usado para recrutamento, grupos ou treinamento.",
      "Após o cadastro e aprovação na plataforma 99, a equipe autorizada da matriz processa a vinculação OL, escala e checagem de dados no PontoSys.",
      "Solicitações de vinculação/desvinculação devem ser tratadas em até 96 horas; caso contrário, expiram automaticamente e são rejeitadas pelo sistema.",
      "Confirmada a vinculação, a matriz avisa o ponto; o ponto adiciona o motoboy ao Ponto, Leader, salas do chat interno e lista de treinamento.",
    ],
  },
  {
    title: "5. Treinamento e Primeiro Turno",
    items: [
      "Antes do primeiro turno, conclua o treinamento sobre disciplina do Ponto, SOP diário, fluxo de pedidos, padrões de coleta/entrega, segurança noturna, repasses e incidentes.",
      "Esclarecer regras de repasse: ganhos de corridas sugeridos em D+1, complementos garantidos (se aplicável) em D+2; a OL é responsável por explicar repasses.",
      "Treinar motoboys apenas nas regras de execução; não exiba escalas de back-office, dados do PontoSys ou credenciais da matriz.",
      "O Leader acompanha o primeiro turno do novato, focando em check-in, status online, aceitação, entrega, comunicação, localização e exceções.",
      "Avaliar horas online do primeiro turno, OPH, AR, cancelamentos, reclamações, acidentes, atrasos e aptidão para a escala fixa.",
    ],
  },
  {
    title: "6. Admissão e Desvinculação",
    items: [
      "Aprovados entram na escala fixa de 7h/8h/11h, com Ponto, Leader, turno e metas diárias definidas.",
      "Em observação recebem um segundo turno de treinamento, focando em AR baixa, OPH baixo, atrasos, offline ou falhas de comunicação.",
      "Reprovados não entram na escala fixa; se a desvinculação for necessária, a matriz processa no PontoSys e conclui o acerto financeiro.",
      "Todos os motivos de admissão, observação e reprovação devem ser registrados no PontoSys para análise de qualidade do canal de atração.",
    ],
  },
];

const siteOpsSopEn = [
  {
    title: "1. Site Staffing Model",
    items: [
      "Each site is staffed by 2 people: Site Manager and Operations Assistant.",
      "The Site Manager owns on-site management, rider communication, escalations, training execution, and daily site results.",
      "The Operations Assistant owns check-in/out records, document validation, equipment checks, group messaging, issue logging, and system updates.",
      "Both staff must share the same daily task list to prevent communication gaps.",
    ],
  },
  {
    title: "2. HQ Data Support",
    items: [
      "HQ provides daily previous-day 99 data, schedule suggestions, recruitment gaps, risk riders, and financial gaps.",
      "Sites do not explain PontoSys or show the dashboard to riders; sites only execute operational tasks assigned by HQ.",
      "HQ data must be converted into site actions: who submits documents, who starts their first shift, who has risk tracking, who requires payment checks.",
      "If site staff find discrepancies between data and field reality, they report to HQ on the same day for data verification.",
    ],
  },
  {
    title: "3. Daily On-site Operations",
    items: [
      "Before opening, both staff confirm daily schedules, booking show-ups, first-shift riders, risk riders, open incidents, and key communications.",
      "30 minutes before shift, organize check-in, equipment checks, area assignments, peak no-offline rules, and night safety location reminders.",
      "During shift, monitor missing riders, low online hours, low AR, refusal explanations, dangerous areas, accidents, complaints, and payment disputes.",
      "Before closing, organize a scheduled review to confirm online hours, OPH, AR, anomalies, unresolved issues, and next-day schedules.",
    ],
  },
  {
    title: "4. Recruitment & Training Handoff",
    items: [
      "Candidates brought by HQ marketing arrive at the site; the site handles offline reception, document verification, rules briefing, and registration support.",
      "After binding success is synced by HQ, the site assigns the Ponto, Leader, In-App Chat rooms, first-shift training, and first-shift review.",
      "Performance of new riders must be logged: check-in, online status, OPH, AR, cancellations, complaints, accidents, and full-time conversion.",
      "The site reports daily show-up rate, document completeness, first-shift completion, full-time conversion, and rejection reasons to HQ.",
    ],
  },
  {
    title: "5. Anomalies & Escalations",
    items: [
      "Accidents, personal safety, severe complaints, payment disputes, back-office data anomalies, and mass offline during peak must be escalated to HQ.",
      "Sensitive data such as CPFs, addresses, and payment details must only be collected through private/authorized channels, never in groups.",
      "Only publish HQ-approved operational, scheduling, payment, training, and safety messages in group chats.",
      "Daily unresolved accidents, complaints, payment disputes, and data gaps must have formal handovers, never just verbal updates.",
    ],
  },
];

const siteOpsSopPt = [
  {
    title: "1. Equipe Local de Trabalho",
    items: [
      "Cada ponto é operado por 2 pessoas: Gerente de Ponto e Assistente Operacional.",
      "O Gerente de Ponto é responsável pela gestão local, comunicação com motoboys, escalações, treinamentos e resultados diários do ponto.",
      "O Assistente Operacional cuida dos registros de check-in/out, validação de documentos, checagem de bag/motos, mensagens de grupo, registro de problemas e atualizações do sistema.",
      "Ambos devem compartilhar a mesma lista de tarefas diárias para evitar lacunas de informação.",
    ],
  },
  {
    title: "2. Suporte de Dados da Matriz",
    items: [
      "A matriz fornece diariamente os dados D-1 da 99, sugestões de escala, lacunas de contratação, motoboys de risco e divergências financeiras.",
      "O ponto não explica o PontoSys diretamente nem mostra o dashboard aos motoboys; o ponto apenas executa as tarefas operacionais dadas pela matriz.",
      "Dados da matriz devem se tornar ações locais: quem fornece docs, quem inicia primeiro turno, quem tem alerta de risco ou repasse pendente.",
      "Se o ponto encontrar divergências entre os dados e a realidade de campo, deve reportar à matriz no mesmo dia para verificação dos dados.",
    ],
  },
  {
    title: "3. Rotina Diária de Operação",
    items: [
      "Antes de abrir, ambos confirmam as escalas do dia, agendamentos presenciais, novatos de primeiro turno, motoboys de risco, incidentes abertos e avisos.",
      "30 minutos antes do turno, organizam check-in, checagem de bag/moto, confirmação de área, aviso de proibição de offline no pico e segurança noturna.",
      "Durante o turno, monitoram faltas, baixa online, AR baixa, justificativas de recusa, áreas de risco, acidentes, reclamações e disputas de repasses.",
      "Antes de fechar, organizam uma revisão diária para confirmar horas online, OPH, AR, anomalias, pendências e escalas do dia seguinte.",
    ],
  },
  {
    title: "4. Integração de Recrutamento e Treinamento",
    items: [
      "Candidatos vindos das campanhas da matriz chegam ao ponto; o ponto faz recepção presencial, checa documentos, explica regras e apoia no app.",
      "Confirmada a vinculação pela matriz, o ponto define Ponto, Leader, salas do chat interno, treinamento pré-turno e revisão do primeiro turno.",
      "O desempenho do novato deve ser registrado: check-in, online, OPH, AR, cancelamentos, reclamações, acidentes e conversão para fixo.",
      "O ponto reporta diariamente à matriz a taxa de comparecimento, completude de documentos, conclusão de primeiro turno, conversão e motivos de rejeição.",
    ],
  },
  {
    title: "5. Anomalias e Escalações",
    items: [
      "Acidentes, segurança pessoal, reclamações graves, disputas de repasses, erros de dados e offline massivo no pico devem ser escalados imediatamente à matriz.",
      "Dados sensíveis como CPF, endereços e comprovantes bancários devem ser coletados apenas no privado/canais autorizados, nunca em grupos.",
      "Publique em grupos apenas informações operacionais, escalas, repasses, treinamentos e segurança validados pela matriz.",
      "Pendências diárias de acidentes, reclamações, disputas financeiras e erros de dados devem ter passagens formais registradas, nunca apenas conversas verbais.",
    ],
  },
];

function SopBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
      <h3 className="mb-3 text-base font-black text-[var(--text)]">{title}</h3>
      <ul className="space-y-2 text-sm leading-6 text-[var(--text-soft)]">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <CheckCircle2 className="mt-1 shrink-0 text-[#06d6a0]" size={15} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SectionShell({
  id,
  title,
  eyebrow,
  tone,
  labelOverride,
  children,
}: {
  id: string;
  title: string;
  eyebrow: string;
  tone: SectionTone;
  labelOverride?: string;
  children: React.ReactNode;
}) {
  const colors = sectionTones[tone];
  return (
    <section id={id} className={`mt-5 rounded-xl border ${colors.border} ${colors.bg} p-4 shadow-[0_16px_40px_rgba(0,0,0,0.18)] md:p-5`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className={`text-xs font-black uppercase ${colors.accent}`}>{eyebrow}</div>
          <h2 className="text-2xl font-black text-[var(--text)]">{title}</h2>
        </div>
        <span className={`rounded border px-3 py-1 text-xs font-black uppercase ${colors.chip}`}>{labelOverride ?? colors.label}</span>
      </div>
      {children}
    </section>
  );
}

function SmallCard({
  title,
  detail,
  meta,
  tone,
}: {
  title: string;
  detail: string;
  meta?: string;
  tone: SectionTone;
}) {
  const colors = sectionTones[tone];
  return (
    <div className={`rounded-lg border ${colors.border} ${colors.soft} p-4`}>
      {meta ? <div className={`mb-2 text-xs font-black uppercase ${colors.accent}`}>{meta}</div> : null}
      <h3 className="font-black text-[var(--text)]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--text-soft)]">{detail}</p>
    </div>
  );
}

function SopColumn({
  title,
  eyebrow,
  tone,
  children,
}: {
  title: string;
  eyebrow: string;
  tone: SectionTone;
  children: React.ReactNode;
}) {
  const colors = sectionTones[tone];
  return (
    <div className={`space-y-3 rounded-xl border ${colors.border} ${colors.bg} p-4`}>
      <div>
        <div className={`text-xs font-black uppercase ${colors.accent}`}>{eyebrow}</div>
        <h2 className="text-xl font-black text-[var(--text)]">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function LocalizedSopsPage({ language }: { language: Exclude<Language, "zh"> }) {
  const copy = localizedSopContent[language];
  const isEn = language === "en";

  const riderSopData = isEn ? fullTimeRiderSopEn : fullTimeRiderSopPt;
  const recruitmentSopData = isEn ? recruitmentSopEn : recruitmentSopPt;
  const siteOpsSopData = isEn ? siteOpsSopEn : siteOpsSopPt;
  const dataBadges = isEn ? ["D-1 Import", "99 Data Source", "OL Operations"] : ["Importacao D-1", "Fonte 99", "Operacao OL"];
  const riderBadges = isEn ? ["AR 95%", "OPH 1.5", "Ponto T-30", "Location 10min"] : ["AR 95%", "OPH 1.5", "Ponto T-30", "Localizacao 10min"];
  const recruitmentBadges = isEn
    ? ["HQ Campaign", "Offline Registration", "Backoffice Only", "96h Binding SLA"]
    : ["Campanha HQ", "Registro presencial", "Apenas backoffice", "SLA 96h vinculacao"];

  return (
    <AppShell>
      <div data-i18n-skip>
        <PageTitle title={copy.title} eyebrow={copy.eyebrow} />

        <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase text-[var(--accent)]">{copy.mapEyebrow}</div>
              <h2 className="text-2xl font-black text-[var(--text)]">{copy.mapTitle}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-soft)]">{copy.mapDescription}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center md:grid-cols-3">
              {[5, 1, 3].map((value, index) => (
                <div key={copy.counters[index]} className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3">
                  <div className="text-2xl font-black text-[var(--text)]">{value}</div>
                  <div className="text-xs font-black uppercase text-[var(--muted)]">{copy.counters[index]}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-5">
            {copy.categories.map((category) => {
              const colors = sectionTones[category.tone];
              return (
                <Link key={category.code} href={category.href} className={`rounded-xl border ${colors.border} ${colors.bg} p-4 transition hover:-translate-y-0.5`}>
                  <div className={`text-xs font-black uppercase ${colors.accent}`}>{category.code}</div>
                  <h3 className="mt-2 text-lg font-black text-[var(--text)]">{category.name}</h3>
                  <p className="mt-1 text-xs font-black uppercase text-[var(--muted)]">{category.owner}</p>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-soft)]">{category.scope}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {category.modules.slice(0, 3).map((module) => (
                      <span key={module} className={`rounded border px-2 py-1 text-[11px] font-black ${colors.chip}`}>
                        {module}
                      </span>
                    ))}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <SectionShell id="data-foundation" title={copy.data.title} eyebrow={copy.data.eyebrow} tone="data" labelOverride={copy.sectionLabels.data}>
          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-lg border border-[#1f5f78] bg-[#081d28] p-5">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {dataBadges.map((badge) => (
                  <Badge key={badge} value={badge} />
                ))}
              </div>
              <p className="text-sm leading-6 text-[var(--text-soft)]">{copy.data.paragraph}</p>
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {copy.data.flow.map(([title, detail], index) => (
                  <div key={title} className="rounded-lg border border-[#1f5f78] bg-[#0b2430] p-4">
                    <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-[#38bdf8]">
                      <Database size={15} />
                      {copy.ui.stepLabelPrefix} {index + 1}
                    </div>
                    <h3 className="font-black text-[var(--text)]">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#a9a9bd]">{detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-[#1f5f78] bg-[#081d28] p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-black text-[var(--text)]">
                <BookOpen size={18} />
                {copy.ui.trainingVideo}
              </div>
              <video className="aspect-video w-full rounded-lg border border-[var(--line)] bg-black" controls preload="metadata">
                <source src="/sop-assets/pontosys-training-video.mp4" type="video/mp4" />
              </video>
              <p className="mt-3 text-sm leading-6 text-[#a9a9bd]">{copy.data.video}</p>
            </div>
          </div>
        </SectionShell>

        <SectionShell id="rider-daily" title={copy.rider.title} eyebrow={copy.ui.dailyRiderEyebrow} tone="rider" labelOverride={copy.sectionLabels.rider}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm leading-6 text-[var(--text-soft)]">{copy.rider.description}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {riderBadges.map((badge) => (
                <Badge key={badge} value={badge} />
              ))}
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-6">
            {copy.rider.timeline.map(([time, title, detail]) => (
              <SmallCard key={`${time}-${title}`} title={title} detail={detail} meta={time} tone="rider" />
            ))}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {copy.rider.blocks.map(([title, items]) => (
              <SopBlock key={title} title={title} items={items} />
            ))}
          </div>
        </SectionShell>

        <section id="recruitment" className="mt-5 rounded-xl border border-[#5542a0] bg-[#151129] p-5 shadow-[0_16px_40px_rgba(0,0,0,0.18)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase text-[var(--accent)]">{copy.ui.recruitmentFunnelEyebrow}</div>
              <h2 className="text-2xl font-black text-[var(--text)]">{copy.recruitment.title}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {recruitmentBadges.map((badge) => (
                <Badge key={badge} value={badge} />
              ))}
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-6">
            {copy.recruitment.pipeline.map(([stage, title, detail]) => (
              <div key={`${stage}-${title}`} className="rounded-lg border border-[#5542a0] bg-[#1d1738] p-4">
                <div className="text-xs font-black uppercase text-[#a78bfa]">{stage}</div>
                <h3 className="mt-2 font-black text-[var(--text)]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#a9a9bd]">{detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-5 grid gap-4 xl:grid-cols-[1fr_0.8fr]">
          <div className="rounded-xl border border-[#5542a0] bg-[#151129] p-5">
            <div className="mb-4">
              <div className="text-xs font-black uppercase text-[var(--accent)]">{copy.ui.recruitmentActionsEyebrow}</div>
              <h2 className="text-2xl font-black text-[var(--text)]">{copy.recruitment.actionsTitle}</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {copy.recruitment.actions.map(([stage, detail]) => (
                <div key={stage} className="rounded-lg border border-[#5542a0] bg-[#1d1738] p-4">
                  <div className="text-xs font-black uppercase text-[#a78bfa]">{stage}</div>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-soft)]">{detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[#5542a0] bg-[#151129] p-5">
            <div className="mb-4">
              <div className="text-xs font-black uppercase text-[var(--accent)]">{copy.ui.ownershipEyebrow}</div>
              <h2 className="text-2xl font-black text-[var(--text)]">{copy.recruitment.ownersTitle}</h2>
            </div>
            <div className="space-y-3">
              {copy.recruitment.owners.map(([owner, detail]) => (
                <div key={owner} className="rounded-lg border border-[#5542a0] bg-[#1d1738] p-4">
                  <h3 className="font-black text-[var(--text)]">{owner}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#a9a9bd]">{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-4 xl:grid-cols-[1fr_0.9fr]">
          <div className="rounded-xl border border-[#5542a0] bg-[#151129] p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase text-[var(--accent)]">{copy.ui.recruitmentKpiEyebrow}</div>
                <h2 className="text-2xl font-black text-[var(--text)]">{copy.ui.recruitmentKpiTitle}</h2>
              </div>
              <Badge value={copy.ui.funnelQualityBadge} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {copy.recruitment.kpis.map(([name, target, detail]) => (
                <div key={name} className="rounded-lg border border-[#5542a0] bg-[#1d1738] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-black text-[var(--text)]">{name}</h3>
                    <span className="rounded border border-[#06d6a0]/30 bg-[#06251a] px-2 py-1 text-xs font-black text-[#8ff5c2]">{target}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#a9a9bd]">{detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[#5542a0] bg-[#151129] p-5">
            <div className="mb-4">
              <div className="text-xs font-black uppercase text-[var(--accent)]">{copy.ui.decisionRulesEyebrow}</div>
              <h2 className="text-2xl font-black text-[var(--text)]">{copy.recruitment.decisionTitle}</h2>
            </div>
            <div className="space-y-3">
              {copy.recruitment.decisionRules.map((rule) => (
                <div key={rule.title} className={`rounded-lg border p-4 ${rule.tone}`}>
                  <h3 className="font-black">{rule.title}</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {rule.items.map((item) => (
                      <span key={item} className="rounded border border-current/20 px-2 py-1 text-xs font-black">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="site-ops" className="mt-5 grid gap-4 xl:grid-cols-[0.8fr_1fr]">
          <div className="rounded-xl border border-[#7a4d10] bg-[#211707] p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase text-[#f59e0b]">{copy.ui.siteStaffingEyebrow}</div>
                <h2 className="text-2xl font-black text-[var(--text)]">{copy.site.staffingTitle}</h2>
              </div>
              <Badge value={copy.ui.twoPeopleBadge} />
            </div>
            <div className="space-y-3">
              {copy.site.staffing.map(([role, detail]) => (
                <div key={role} className="rounded-lg border border-[#7a4d10] bg-[#2c1f0b] p-4">
                  <h3 className="font-black text-[var(--text)]">{role}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#a9a9bd]">{detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[#7a4d10] bg-[#211707] p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase text-[#f59e0b]">{copy.ui.hqDataSupportEyebrow}</div>
                <h2 className="text-2xl font-black text-[var(--text)]">{copy.site.dataSupportTitle}</h2>
              </div>
              <Badge value={copy.ui.d1DataBadge} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {copy.site.hqDataSupport.map(([name, detail]) => (
                <div key={name} className="rounded-lg border border-[#7a4d10] bg-[#2c1f0b] p-4">
                  <h3 className="font-black text-[var(--text)]">{name}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#a9a9bd]">{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-xl border border-[#7a4d10] bg-[#211707] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase text-[#f59e0b]">{copy.ui.siteDailyFlowEyebrow}</div>
              <h2 className="text-2xl font-black text-[var(--text)]">{copy.site.title}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge value={copy.ui.openBadge} />
              <Badge value={copy.ui.briefingBadge} />
              <Badge value={copy.ui.dispatchBadge} />
              <Badge value={copy.ui.closeoutBadge} />
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-5">
            {copy.site.timeline.map(([stage, title, detail]) => (
              <div key={`${stage}-${title}`} className="rounded-lg border border-[#7a4d10] bg-[#2c1f0b] p-4">
                <div className="text-xs font-black uppercase text-[#f59e0b]">{stage}</div>
                <h3 className="mt-2 font-black text-[var(--text)]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#a9a9bd]">{detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="inspection" className="mt-5 rounded-xl border border-[#74303c] bg-[#240d14] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase text-[#fb7185]">{copy.ui.hqInspectionActionsEyebrow}</div>
              <h2 className="text-2xl font-black text-[var(--text)]">{copy.inspection.title}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge value={copy.ui.actionBadge} />
              <Badge value={copy.ui.ownerBadge} />
              <Badge value={copy.ui.evidenceBadge} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1120px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[#74303c] text-xs uppercase text-[#ffc1cb]">
                  {copy.inspection.tableHeaders.map((header) => (
                    <th key={header} className="px-3 py-3">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {copy.inspection.actions.map((item) => (
                  <tr key={item.stage} className="border-b border-[#3b1821] align-top">
                    <td className="px-3 py-4 font-black text-[var(--text)]">{item.stage}</td>
                    <td className="px-3 py-4 leading-6 text-[var(--text-soft)]">{item.action}</td>
                    <td className="px-3 py-4 text-[var(--text-soft)]">{item.owner}</td>
                    <td className="px-3 py-4 text-[#a9a9bd]">{item.cadence}</td>
                    <td className="px-3 py-4 text-[#a9a9bd]">{item.record}</td>
                    <td className="px-3 py-4 leading-6 text-[#a9a9bd]">{item.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-4">
          {copy.inspection.metrics.map(([name, target, detail]) => (
            <div key={name} className="rounded-lg border border-[#74303c] bg-[#31111b] p-4">
              <div className="text-xs font-black uppercase text-[#fb7185]">{name}</div>
              <div className="mt-2 text-3xl font-black text-[var(--text)]">{target}</div>
              <p className="mt-2 text-sm leading-6 text-[#a9a9bd]">{detail}</p>
            </div>
          ))}
        </section>

        <section className="mt-5 grid gap-4 xl:grid-cols-3">
          <SopColumn title={isEn ? "Full-time Rider SOP" : "SOP do Motoboy Fixo"} eyebrow={copy.sectionLabels.rider} tone="rider">
            {riderSopData.map((block) => (
              <SopBlock key={block.title} title={block.title} items={block.items} />
            ))}
          </SopColumn>

          <SopColumn title={isEn ? "Rider Recruitment SOP" : "SOP de Recrutamento"} eyebrow={copy.sectionLabels.recruitment} tone="recruitment">
            {recruitmentSopData.map((block) => (
              <SopBlock key={block.title} title={block.title} items={block.items} />
            ))}
          </SopColumn>

          <SopColumn title={isEn ? "Site Operations SOP" : "SOP de Operação do Ponto"} eyebrow={copy.ui.siteOperationsEyebrow} tone="site">
            {siteOpsSopData.map((block) => (
              <SopBlock key={block.title} title={block.title} items={block.items} />
            ))}
          </SopColumn>
        </section>

        <section className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="panel p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-black text-[var(--text)]">
              <Clock3 size={18} />
              {copy.ui.dailyCadenceTitle}
            </div>
            <div className="space-y-3 text-sm leading-6 text-[var(--text-soft)]">
              {isEn ? (
                <>
                  <p><strong className="text-[var(--text)]">08:00</strong> Import D-1 99 Data, generate exceptions and payment gaps.</p>
                  <p><strong className="text-[var(--text)]">10:00</strong> Ponto/Leader morning briefing to confirm recruitment gaps, scheduling, and risk riders.</p>
                  <p><strong className="text-[var(--text)]">14:00</strong> Check PontoSys scheduling plan, shift registration, and rider group.</p>
                  <p><strong className="text-[var(--text)]">18:00</strong> Evening peak/night shift online check, handle incidents and complaints.</p>
                  <p><strong className="text-[var(--text)]">22:00</strong> Review TSH, AR, orders, delay, payment, and next-day scheduling.</p>
                </>
              ) : (
                <>
                  <p><strong className="text-[var(--text)]">08:00</strong> Importar dados D-1 da 99, gerar exceções e divergências de pagamento.</p>
                  <p><strong className="text-[var(--text)]">10:00</strong> Briefing matinal Ponto/Leader, confirmar lacunas de contratação, escala e motoboys de risco.</p>
                  <p><strong className="text-[var(--text)]">14:00</strong> Verificar plano de escala no PontoSys, cadastro de turnos e grupo de motoboys.</p>
                  <p><strong className="text-[var(--text)]">18:00</strong> Verificação online no pico da noite/turno noturno, tratar incidentes e reclamações.</p>
                  <p><strong className="text-[var(--text)]">22:00</strong> Revisar TSH, AR, pedidos, atrasos, pagamentos e escala do dia seguinte.</p>
                </>
              )}
            </div>
          </div>

          <div className="panel p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-black text-[var(--text)]">
              <ShieldCheck size={18} />
              {copy.ui.redLinesTitle}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {(isEn ? [
                "Do not claim to be 99Food or publish official policies on behalf of 99.",
                "Do not collect sensitive info like CPF, address, or financial disputes in group chats.",
                "Do not allow OL riders to execute OL shifts in bike mode.",
                "Do not exceed 96 hours to process binding/unbinding applications.",
                "Do not dump payment disputes directly to 99 support.",
                "Do not give up the final reply to Reclame Aqui complaints."
              ] : [
                "Não se autodenomine 99Food ou publique políticas oficiais em nome da 99.",
                "Não colete informações confidenciais como CPF, endereço ou disputas financeiras em grupos.",
                "Não permita que motoboys OL executem turnos OL no modo bike.",
                "Não exceda 96 horas para processar solicitações de vinculação/desvinculação.",
                "Não repasse disputas de pagamento diretamente para o suporte da 99.",
                "Não abra mão da resposta final às reclamações do Reclame Aqui."
              ]).map((item) => (
                <div key={item} className="rounded-lg border border-[#3c2430] bg-[#1a1018] p-3 text-sm leading-6 text-[#f0c6cf]">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-xl border border-[#46556b] bg-[var(--surface-raised)] p-5">
          <div className="mb-4">
            <div className="text-xs font-black uppercase text-[#cbd5e1]">{copy.sourceTitle}</div>
            <h2 className="text-2xl font-black text-[var(--text)]">{copy.sourceDescription}</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {copy.sourceDocs.map((doc) => (
              <a key={doc.href} href={doc.href} className="rounded-lg border border-[#46556b] bg-[#162033] p-4 transition hover:-translate-y-0.5">
                <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-[#cbd5e1]">
                  <FileText size={15} />
                  {copy.ui.documentLabel}
                </div>
                <h3 className="font-black text-[var(--text)]">{doc.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#a9a9bd]">{doc.description}</p>
              </a>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

export default function SopsPage() {
  const language = useVentoStore((state) => state.language);

  if (language !== "zh") {
    return <LocalizedSopsPage language={language} />;
  }

  return (
    <AppShell>
      <PageTitle title="MePonto PontoSys SOP Center" eyebrow="全职骑手 / 招聘 / 站点运营" />

      <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase text-[var(--accent)]">SOP category map</div>
            <h2 className="text-2xl font-black text-[var(--text)]">当前共有 5 个正式 SOP</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-soft)]">
              资料库只作为 PDF、视频和品牌/沟通来源，不计入正式 SOP。正式 SOP 按“总部数据、骑手执行、招聘转化、站点运营、总部巡查”五类管理。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center md:grid-cols-3">
            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3">
              <div className="text-2xl font-black text-[var(--text)]">5</div>
              <div className="text-xs font-black uppercase text-[var(--muted)]">正式 SOP</div>
            </div>
            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3">
              <div className="text-2xl font-black text-[var(--text)]">1</div>
              <div className="text-xs font-black uppercase text-[var(--muted)]">资料库</div>
            </div>
            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3">
              <div className="text-2xl font-black text-[var(--text)]">3</div>
              <div className="text-xs font-black uppercase text-[var(--muted)]">执行角色</div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-5">
          {sopCategories.map((category) => {
            const colors = sectionTones[category.tone as SectionTone];
            return (
              <Link key={category.code} href={category.href} className={`rounded-xl border ${colors.border} ${colors.bg} p-4 transition hover:-translate-y-0.5`}>
                <div className={`text-xs font-black uppercase ${colors.accent}`}>{category.code}</div>
                <h3 className="mt-2 text-lg font-black text-[var(--text)]">{category.name}</h3>
                <p className="mt-1 text-xs font-black uppercase text-[var(--muted)]">{category.owner}</p>
                <p className="mt-3 text-sm leading-6 text-[var(--text-soft)]">{category.scope}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {category.modules.slice(0, 3).map((module) => (
                    <span key={module} className={`rounded border px-2 py-1 text-[11px] font-black ${colors.chip}`}>
                      {module}
                    </span>
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <SectionShell id="data-foundation" title="系统数据原则" eyebrow="Data foundation" tone="data">
        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-lg border border-[#1f5f78] bg-[#081d28] p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge value="D-1 Import" />
            <Badge value="99 Data Source" />
            <Badge value="OL Operations" />
          </div>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--text-soft)]">
            PontoSys 不直接替代 99 后台数据源作为原始系统。总部每天从 99 后台导出前一天数据，再导入 PontoSys 做站点运营、骑手管理、财务对账、风险提醒和 SOP 执行追踪。
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {dataFlow.map(([title, detail], index) => (
              <div key={title} className="rounded-lg border border-[#1f5f78] bg-[#0b2430] p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-[#38bdf8]">
                  <Database size={15} />
                  Step {index + 1}
                </div>
                <h3 className="font-black text-[var(--text)]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#a9a9bd]">{detail}</p>
              </div>
            ))}
          </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-[#1f5f78] bg-[#081d28] p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-black text-[var(--text)]">
            <BookOpen size={18} />
            Training video
          </div>
          <video className="aspect-video w-full rounded-lg border border-[var(--line)] bg-black" controls preload="metadata">
            <source src="/sop-assets/pontosys-training-video.mp4" type="video/mp4" />
          </video>
          <p className="mt-3 text-sm leading-6 text-[#a9a9bd]">视频作为 PontoSys 操作培训资料，配合 PDF 手册用于站点经理和 Leader 培训。</p>
          </div>
        </div>
      </SectionShell>

      <SectionShell id="rider-daily" title="全职骑手每日执行流" eyebrow="Daily rider SOP" tone="rider">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm leading-6 text-[var(--text-soft)]">用绿色标记骑手每日必须完成的动作和现场要求。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge value="AR 95%" />
            <Badge value="OPH 1.5" />
            <Badge value="Ponto T-30" />
            <Badge value="Location 10min" />
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-6">
          {riderDailyTimeline.map(([time, title, detail]) => (
            <SmallCard key={`${time}-${title}`} title={title} detail={detail} meta={time} tone="rider" />
          ))}
        </div>
      </SectionShell>

      <section id="recruitment" className="mt-5 rounded-xl border border-[#5542a0] bg-[#151129] p-5 shadow-[0_16px_40px_rgba(0,0,0,0.18)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase text-[var(--accent)]">Recruitment funnel</div>
            <h2 className="text-2xl font-black text-[var(--text)]">招聘骑手转化流程</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge value="HQ Campaign" />
            <Badge value="Offline Registration" />
            <Badge value="Backoffice Only" />
            <Badge value="96h Binding SLA" />
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-6">
          {recruitmentPipeline.map(([stage, title, detail]) => (
            <div key={`${stage}-${title}`} className="rounded-lg border border-[#5542a0] bg-[#1d1738] p-4">
              <div className="text-xs font-black uppercase text-[#a78bfa]">{stage}</div>
              <h3 className="mt-2 font-black text-[var(--text)]">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#a9a9bd]">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-5 grid gap-4 xl:grid-cols-[1fr_0.8fr]">
        <div className="rounded-xl border border-[#5542a0] bg-[#151129] p-5">
          <div className="mb-4">
            <div className="text-xs font-black uppercase text-[var(--accent)]">Recruitment actions</div>
            <h2 className="text-2xl font-black text-[var(--text)]">招聘动作清单</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recruitmentActions.map(([stage, detail]) => (
              <div key={stage} className="rounded-lg border border-[#5542a0] bg-[#1d1738] p-4">
                <div className="text-xs font-black uppercase text-[#a78bfa]">{stage}</div>
                <p className="mt-2 text-sm leading-6 text-[var(--text-soft)]">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#5542a0] bg-[#151129] p-5">
          <div className="mb-4">
            <div className="text-xs font-black uppercase text-[var(--accent)]">Ownership</div>
            <h2 className="text-2xl font-black text-[var(--text)]">负责人矩阵</h2>
          </div>
          <div className="space-y-3">
            {recruitmentOwners.map(([owner, detail]) => (
              <div key={owner} className="rounded-lg border border-[#5542a0] bg-[#1d1738] p-4">
                <h3 className="font-black text-[var(--text)]">{owner}</h3>
                <p className="mt-2 text-sm leading-6 text-[#a9a9bd]">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <div className="rounded-xl border border-[#5542a0] bg-[#151129] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase text-[var(--accent)]">Recruitment KPI</div>
              <h2 className="text-2xl font-black text-[var(--text)]">招聘考核规则</h2>
            </div>
            <Badge value="Funnel quality" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {recruitmentKpis.map(([name, target, detail]) => (
              <div key={name} className="rounded-lg border border-[#5542a0] bg-[#1d1738] p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-black text-[var(--text)]">{name}</h3>
                  <span className="rounded border border-[#06d6a0]/30 bg-[#06251a] px-2 py-1 text-xs font-black text-[#8ff5c2]">{target}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#a9a9bd]">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#5542a0] bg-[#151129] p-5">
          <div className="mb-4">
            <div className="text-xs font-black uppercase text-[var(--accent)]">Decision rules</div>
            <h2 className="text-2xl font-black text-[var(--text)]">通过 / 待观察 / 淘汰</h2>
          </div>
          <div className="space-y-3">
            {recruitmentDecisionRules.map((rule) => (
              <div key={rule.title} className={`rounded-lg border p-4 ${rule.tone}`}>
                <h3 className="font-black">{rule.title}</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {rule.items.map((item) => (
                    <span key={item} className="rounded border border-current/20 px-2 py-1 text-xs font-black">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="site-ops" className="mt-5 grid gap-4 xl:grid-cols-[0.8fr_1fr]">
        <div className="rounded-xl border border-[#7a4d10] bg-[#211707] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase text-[var(--accent)]">Site staffing</div>
              <h2 className="text-2xl font-black text-[var(--text)]">每站 2 人配置</h2>
            </div>
            <Badge value="2 people / Ponto" />
          </div>
          <div className="space-y-3">
            {siteStaffingModel.map(([role, detail]) => (
              <div key={role} className="rounded-lg border border-[#7a4d10] bg-[#2c1f0b] p-4">
                <h3 className="font-black text-[var(--text)]">{role}</h3>
                <p className="mt-2 text-sm leading-6 text-[#a9a9bd]">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#7a4d10] bg-[#211707] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase text-[var(--accent)]">HQ data support</div>
              <h2 className="text-2xl font-black text-[var(--text)]">总部数据支持</h2>
            </div>
            <Badge value="D-1 99 Data" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {hqDataSupport.map(([name, detail]) => (
              <div key={name} className="rounded-lg border border-[#7a4d10] bg-[#2c1f0b] p-4">
                <h3 className="font-black text-[var(--text)]">{name}</h3>
                <p className="mt-2 text-sm leading-6 text-[#a9a9bd]">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-5 rounded-xl border border-[#7a4d10] bg-[#211707] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase text-[var(--accent)]">Site daily flow</div>
            <h2 className="text-2xl font-black text-[var(--text)]">站点每日运营流</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge value="Open" />
            <Badge value="Briefing" />
            <Badge value="Dispatch" />
            <Badge value="Closeout" />
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-5">
          {siteOpsTimeline.map(([stage, title, detail]) => (
            <div key={`${stage}-${title}`} className="rounded-lg border border-[#7a4d10] bg-[#2c1f0b] p-4">
              <div className="text-xs font-black uppercase text-[#f59e0b]">{stage}</div>
              <h3 className="mt-2 font-black text-[var(--text)]">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#a9a9bd]">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="inspection" className="mt-5 rounded-xl border border-[#74303c] bg-[#240d14] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase text-[var(--accent)]">HQ inspection actions</div>
            <h2 className="text-2xl font-black text-[var(--text)]">SOP 落地执行动作表</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge value="Action" />
            <Badge value="Owner" />
            <Badge value="Evidence" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1120px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#74303c] text-xs uppercase text-[#ffc1cb]">
                <th className="px-3 py-3">环节</th>
                <th className="px-3 py-3">执行动作</th>
                <th className="px-3 py-3">负责人</th>
                <th className="px-3 py-3">频次/时限</th>
                <th className="px-3 py-3">系统记录</th>
                <th className="px-3 py-3">总部巡查证据</th>
              </tr>
            </thead>
            <tbody>
              {executionActions.map((item) => (
                <tr key={item.stage} className="border-b border-[#3b1821] align-top">
                  <td className="px-3 py-4 font-black text-[var(--text)]">{item.stage}</td>
                  <td className="px-3 py-4 leading-6 text-[var(--text-soft)]">{item.action}</td>
                  <td className="px-3 py-4 text-[var(--text-soft)]">{item.owner}</td>
                  <td className="px-3 py-4 text-[#a9a9bd]">{item.cadence}</td>
                  <td className="px-3 py-4 text-[#a9a9bd]">{item.record}</td>
                  <td className="px-3 py-4 leading-6 text-[#a9a9bd]">{item.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-4">
        {[
          ["记录完整率", "100%", "每个动作必须有 PontoSys、签到表、群记录或后台状态。"],
          ["证据可查率", "95%+", "总部巡查必须能看到截图、表格、定位、事件单或复盘记录。"],
          ["超时动作", "0", "96 小时绑定、班前 30 分钟签到、夜班 10 分钟定位不得超时。"],
          ["异常闭环率", "100%", "事故、投诉、付款争议、数据差异必须有负责人和关闭状态。"],
        ].map(([name, target, detail]) => (
          <div key={name} className="rounded-lg border border-[#74303c] bg-[#31111b] p-4">
            <div className="text-xs font-black uppercase text-[#fb7185]">{name}</div>
            <div className="mt-2 text-3xl font-black text-[var(--text)]">{target}</div>
            <p className="mt-2 text-sm leading-6 text-[#a9a9bd]">{detail}</p>
          </div>
        ))}
      </section>

      <section className="mt-5 grid gap-4 xl:grid-cols-3">
        <SopColumn title="全职骑手 SOP" eyebrow="Full-time rider" tone="rider">
          {fullTimeRiderSop.map((block) => (
            <SopBlock key={block.title} title={block.title} items={block.items} />
          ))}
        </SopColumn>

        <SopColumn title="招聘骑手 SOP" eyebrow="Recruitment" tone="recruitment">
          {recruitmentSop.map((block) => (
            <SopBlock key={block.title} title={block.title} items={block.items} />
          ))}
        </SopColumn>

        <SopColumn title="站点运营 SOP" eyebrow="Site operations" tone="site">
          {siteOpsSop.map((block) => (
            <SopBlock key={block.title} title={block.title} items={block.items} />
          ))}
        </SopColumn>
      </section>

      <section className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="panel p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-black text-[var(--text)]">
            <Clock3 size={18} />
            Daily cadence
          </div>
          <div className="space-y-3 text-sm leading-6 text-[var(--text-soft)]">
            <p><strong className="text-[var(--text)]">08:00</strong> 导入 D-1 99 Data 数据，生成异常和付款差异。</p>
            <p><strong className="text-[var(--text)]">10:00</strong> Ponto/Leader 晨会，确认招聘缺口、排班和风险骑手。</p>
            <p><strong className="text-[var(--text)]">14:00</strong> 检查 PontoSys 排班计划、班次注册和 rider group。</p>
            <p><strong className="text-[var(--text)]">18:00</strong> 晚高峰/夜班上线检查，处理事故和投诉。</p>
            <p><strong className="text-[var(--text)]">22:00</strong> 复盘 TSH、AR、订单、延迟、付款和次日排班。</p>
          </div>
        </div>

        <div className="panel p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-black text-[var(--text)]">
            <ShieldCheck size={18} />
            Red lines
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              "不得自称 99Food 或代表 99 发布官方政策。",
              "不得在群内收集 CPF、地址、财务争议等敏感信息。",
              "不得让 OL 骑手以 bike 模式执行 OL 班次。",
              "不得超过 96 小时不处理绑定/解绑申请。",
              "不得让付款争议直接甩给 99 支持。",
              "不得放弃 Reclame Aqui 投诉最终回复。",
            ].map((item) => (
              <div key={item} className="rounded-lg border border-[#3c2430] bg-[#1a1018] p-3 text-sm leading-6 text-[#f0c6cf]">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="library" className="mt-5 rounded-xl border border-[#46556b] bg-[var(--surface-raised)] p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-black text-[var(--text)]">
          <FileText size={18} />
          Source library
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {sourceDocs.map((doc) => (
            <Link key={doc.href} href={doc.href} className="rounded-lg border border-[#46556b] bg-[#162033] p-4 transition hover:border-[#94a3b8]">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#18182b] text-[var(--accent)]">
                <Users size={18} />
              </div>
              <h3 className="font-black text-[var(--text)]">{doc.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#a9a9bd]">{doc.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
