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
    bg: "bg-[#111827]",
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
      "PontoSys 是 meponto 的运营系统，承接总部从 99 后台导入的数据和排班任务，不对外开放，不作为招聘页面、群话术或骑手培训入口。",
      "候选人完成 99 app 注册和平台审核后，由总部/授权后台人员在 PontoSys 处理 OL 绑定、排班和数据核验。",
      "绑定/解绑申请必须在 96 小时内批准或拒绝；超时会自动过期并被系统拒绝。",
      "绑定成功后，总部同步站点；站点再将骑手加入对应 Ponto、Leader、WhatsApp 群和培训名单。",
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
      "绑定成功名单由总部同步后，站点安排 Ponto、Leader、WhatsApp 群、首班培训和首班复盘。",
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
    title: "meponto PontoSys SOP Center",
    mapEyebrow: "SOP category map",
    mapTitle: "There are 5 formal SOPs",
    mapDescription:
      "The source library is used only for manuals, video, brand rules and communication references. Formal SOPs are managed across data, full-time rider execution, recruitment conversion, site operations and HQ inspection.",
    counters: ["Formal SOPs", "Source library", "Execution roles"],
    sourceTitle: "Source Library",
    sourceDescription: "PontoSys manual, brand guide, good practices, communication guide and the training video for station managers and Leaders.",
    categories: [
      {
        code: "SOP 01",
        name: "Data Import SOP",
        owner: "HQ Ops / Data",
        scope: "Export previous-day data from the 99 back office, validate it, import it into PontoSys, reconcile finance and create exception queues.",
        modules: ["D-1 package", "Validation", "PontoSys import", "Reconciliation", "Exceptions"],
        tone: "data" as SectionTone,
        href: "#localized-data",
      },
      {
        code: "SOP 02",
        name: "Full-time Rider Daily SOP",
        owner: "Site Manager / Leader",
        scope: "Daily actions from arrival, pre-shift checks, peak-hour rules, night safety, clock-out and closeout.",
        modules: ["Shift length", "Check-in", "Peak rules", "Location pulse", "Closeout"],
        tone: "rider" as SectionTone,
        href: "#localized-rider",
      },
      {
        code: "SOP 03",
        name: "Rider Recruitment SOP",
        owner: "HQ Marketing / HQ Ops / Site",
        scope: "HQ campaigns, lead booking, offline registration, authorized binding, first shift and full-time conversion.",
        modules: ["Campaign", "Lead booking", "Registration", "Binding", "First shift"],
        tone: "recruitment" as SectionTone,
        href: "#localized-recruitment",
      },
      {
        code: "SOP 04",
        name: "Site Operations SOP",
        owner: "Site Manager / Operations Assistant",
        scope: "Two-person site model for receiving HQ data, opening the site, dispatching, recruitment handoff and escalation.",
        modules: ["2-person team", "HQ data", "Daily site flow", "Recruitment handoff", "Escalation"],
        tone: "site" as SectionTone,
        href: "#localized-site",
      },
      {
        code: "SOP 05",
        name: "HQ Inspection SOP",
        owner: "HQ Ops / Regional Manager",
        scope: "HQ inspection checks whether actions were executed, records are complete, evidence exists and exceptions are closed.",
        modules: ["Action table", "Owner", "Frequency", "Evidence", "Closeout"],
        tone: "inspection" as SectionTone,
        href: "#localized-inspection",
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
    },
    site: {
      title: "Site Operations SOP",
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
    },
    inspection: {
      title: "HQ Inspection SOP",
      actions: [
        ["Site opening", "Daily before opening", "Two-person attendance, opening photo, daily task screenshot and group notice."],
        ["Data briefing", "Daily", "D-1 exception list, responsible owner assignment and completion status."],
        ["Recruitment arrival", "Each recruitment session", "Sign-in sheet, document completeness, registration screenshot and no-show follow-up."],
        ["Binding", "Within 96h", "Binding status, failure reason, handling time and overdue list."],
        ["Peak dispatch", "Lunch/dinner peak", "Online screenshot, exception record, refusal explanation and incident/complaint ticket."],
        ["Closeout", "Daily before closing", "Daily closeout sheet, open issue list, next-day schedule need and HQ feedback."],
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
    title: "Central SOP meponto PontoSys",
    mapEyebrow: "Mapa de categorias SOP",
    mapTitle: "Existem 5 SOPs formais",
    mapDescription:
      "A biblioteca serve apenas para manuais, video, regras de marca e comunicacao. Os SOPs formais cobrem dados, execucao do motoboy fixo, conversao de recrutamento, operacao de ponto e inspecao da matriz.",
    counters: ["SOPs formais", "Biblioteca", "Papeis de execucao"],
    sourceTitle: "Biblioteca",
    sourceDescription: "Manual PontoSys, brand guide, boas praticas, guia de comunicacao e video de treinamento para gerentes de ponto e Leaders.",
    categories: [
      {
        code: "SOP 01",
        name: "SOP de Importacao de Dados",
        owner: "HQ Ops / Dados",
        scope: "Exportar dados D-1 do back office 99, validar, importar no PontoSys, reconciliar financeiro e criar fila de excecoes.",
        modules: ["Pacote D-1", "Validacao", "Importacao PontoSys", "Reconciliacao", "Excecoes"],
        tone: "data" as SectionTone,
        href: "#localized-data",
      },
      {
        code: "SOP 02",
        name: "SOP Diario do Motoboy Fixo",
        owner: "Gerente de Ponto / Leader",
        scope: "Acoes diarias desde chegada, checklist pre-turno, regras de pico, seguranca noturna, saida e fechamento.",
        modules: ["Carga horaria", "Check-in", "Picos", "Localizacao", "Fechamento"],
        tone: "rider" as SectionTone,
        href: "#localized-rider",
      },
      {
        code: "SOP 03",
        name: "SOP de Recrutamento",
        owner: "HQ Marketing / HQ Ops / Ponto",
        scope: "Campanhas da matriz, agendamento de leads, registro presencial, vinculacao autorizada, primeiro turno e conversao.",
        modules: ["Campanha", "Lead", "Registro", "Vinculacao", "Primeiro turno"],
        tone: "recruitment" as SectionTone,
        href: "#localized-recruitment",
      },
      {
        code: "SOP 04",
        name: "SOP de Operacao do Ponto",
        owner: "Gerente de Ponto / Assistente",
        scope: "Modelo com duas pessoas para receber dados da matriz, abrir o ponto, despachar, receber recrutamento e escalar problemas.",
        modules: ["Equipe 2 pessoas", "Dados HQ", "Rotina diaria", "Recrutamento", "Escalacao"],
        tone: "site" as SectionTone,
        href: "#localized-site",
      },
      {
        code: "SOP 05",
        name: "SOP de Inspecao HQ",
        owner: "HQ Ops / Gerente Regional",
        scope: "A matriz verifica execucao, registros completos, evidencias disponiveis e excecoes fechadas.",
        modules: ["Tabela de acao", "Responsavel", "Frequencia", "Evidencia", "Fechamento"],
        tone: "inspection" as SectionTone,
        href: "#localized-inspection",
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
    },
    site: {
      title: "SOP de Operacao do Ponto",
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
    },
    inspection: {
      title: "SOP de Inspecao HQ",
      actions: [
        ["Abertura", "Diario antes de abrir", "Presenca das duas pessoas, foto de abertura, tarefa do dia e aviso no grupo."],
        ["Briefing de dados", "Diario", "Lista de excecoes D-1, responsavel definido e status de conclusao."],
        ["Chegada recrutamento", "Cada sessao", "Lista de presenca, documentos, print de registro e retorno aos ausentes."],
        ["Vinculacao", "Ate 96h", "Status, motivo de falha, tempo de tratamento e lista vencida."],
        ["Despacho de pico", "Almoco/jantar", "Print online, registro de excecao, justificativa de recusa e ticket de incidente/reclamacao."],
        ["Fechamento", "Diario antes de fechar", "Resumo diario, pendencias, necessidade de escala e retorno HQ."],
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
  categories: Array<{ code: string; name: string; owner: string; scope: string; modules: string[]; tone: SectionTone; href: string }>;
  data: { title: string; eyebrow: string; paragraph: string; flow: string[][]; video: string };
  rider: { title: string; description: string; timeline: string[][]; blocks: Array<[string, string[]]> };
  recruitment: { title: string; pipeline: string[][]; kpis: string[][] };
  site: { title: string; staffing: string[][]; timeline: string[][] };
  inspection: { title: string; actions: string[][]; metrics: string[][] };
}>;

function SopBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-lg border border-[#2a2a4a] bg-[#10101d] p-4">
      <h3 className="mb-3 text-base font-black text-white">{title}</h3>
      <ul className="space-y-2 text-sm leading-6 text-[#c4c4d4]">
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
  children,
}: {
  id: string;
  title: string;
  eyebrow: string;
  tone: SectionTone;
  children: React.ReactNode;
}) {
  const colors = sectionTones[tone];
  return (
    <section id={id} className={`mt-5 rounded-xl border ${colors.border} ${colors.bg} p-4 shadow-[0_16px_40px_rgba(0,0,0,0.18)] md:p-5`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className={`text-xs font-black uppercase ${colors.accent}`}>{eyebrow}</div>
          <h2 className="text-2xl font-black text-white">{title}</h2>
        </div>
        <span className={`rounded border px-3 py-1 text-xs font-black uppercase ${colors.chip}`}>{colors.label}</span>
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
      <h3 className="font-black text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[#c4c4d4]">{detail}</p>
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
        <h2 className="text-xl font-black text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function LocalizedSopsPage({ language }: { language: Exclude<Language, "zh"> }) {
  const copy = localizedSopContent[language];

  return (
    <AppShell>
      <div data-i18n-skip>
        <PageTitle title={copy.title} eyebrow={copy.eyebrow} />

        <section className="rounded-xl border border-[#2a2a4a] bg-[#0d0d1a] p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase text-[#8b5cf6]">{copy.mapEyebrow}</div>
              <h2 className="text-2xl font-black text-white">{copy.mapTitle}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#c4c4d4]">{copy.mapDescription}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center md:grid-cols-3">
              {[5, 1, 3].map((value, index) => (
                <div key={copy.counters[index]} className="rounded-lg border border-[#2a2a4a] bg-[#111827] px-4 py-3">
                  <div className="text-2xl font-black text-white">{value}</div>
                  <div className="text-xs font-black uppercase text-[#8b8ba3]">{copy.counters[index]}</div>
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
                  <h3 className="mt-2 text-lg font-black text-white">{category.name}</h3>
                  <p className="mt-1 text-xs font-black uppercase text-[#8b8ba3]">{category.owner}</p>
                  <p className="mt-3 text-sm leading-6 text-[#c4c4d4]">{category.scope}</p>
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

        <SectionShell id="localized-data" title={copy.data.title} eyebrow={copy.data.eyebrow} tone="data">
          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-lg border border-[#1f5f78] bg-[#081d28] p-5">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge value="D-1 Import" />
                <Badge value="99 Data Source" />
                <Badge value="OL Operations" />
              </div>
              <p className="text-sm leading-6 text-[#c4c4d4]">{copy.data.paragraph}</p>
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {copy.data.flow.map(([title, detail], index) => (
                  <SmallCard key={title} title={title} detail={detail} meta={`Step ${index + 1}`} tone="data" />
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-[#1f5f78] bg-[#081d28] p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-black text-white">
                <BookOpen size={18} />
                Training video
              </div>
              <video className="aspect-video w-full rounded-lg border border-[#2a2a4a] bg-black" controls preload="metadata">
                <source src="/sop-assets/pontosys-training-video.mp4" type="video/mp4" />
              </video>
              <p className="mt-3 text-sm leading-6 text-[#a9a9bd]">{copy.data.video}</p>
            </div>
          </div>
        </SectionShell>

        <SectionShell id="localized-rider" title={copy.rider.title} eyebrow="Daily rider SOP" tone="rider">
          <p className="mb-4 text-sm leading-6 text-[#c4c4d4]">{copy.rider.description}</p>
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

        <SectionShell id="localized-recruitment" title={copy.recruitment.title} eyebrow="Recruitment funnel" tone="recruitment">
          <div className="grid gap-3 lg:grid-cols-6">
            {copy.recruitment.pipeline.map(([stage, title, detail]) => (
              <SmallCard key={`${stage}-${title}`} title={title} detail={detail} meta={stage} tone="recruitment" />
            ))}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {copy.recruitment.kpis.map(([name, target, detail]) => (
              <div key={name} className="rounded-lg border border-[#5542a0] bg-[#1d1738] p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-black text-white">{name}</h3>
                  <span className="rounded border border-[#06d6a0]/30 bg-[#06251a] px-2 py-1 text-xs font-black text-[#8ff5c2]">{target}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#a9a9bd]">{detail}</p>
              </div>
            ))}
          </div>
        </SectionShell>

        <SectionShell id="localized-site" title={copy.site.title} eyebrow="Site execution" tone="site">
          <div className="grid gap-3 md:grid-cols-2">
            {copy.site.staffing.map(([title, detail]) => (
              <SmallCard key={title} title={title} detail={detail} tone="site" />
            ))}
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-5">
            {copy.site.timeline.map(([time, title, detail]) => (
              <SmallCard key={`${time}-${title}`} title={title} detail={detail} meta={time} tone="site" />
            ))}
          </div>
        </SectionShell>

        <SectionShell id="localized-inspection" title={copy.inspection.title} eyebrow="HQ inspection" tone="inspection">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {copy.inspection.actions.map(([stage, cadence, detail]) => (
              <SmallCard key={`${stage}-${cadence}`} title={stage} detail={detail} meta={cadence} tone="inspection" />
            ))}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {copy.inspection.metrics.map(([name, target, detail]) => (
              <SmallCard key={name} title={`${name}: ${target}`} detail={detail} tone="inspection" />
            ))}
          </div>
        </SectionShell>

        <section className="mt-5 rounded-xl border border-[#46556b] bg-[#111827] p-5">
          <div className="mb-4">
            <div className="text-xs font-black uppercase text-[#cbd5e1]">{copy.sourceTitle}</div>
            <h2 className="text-2xl font-black text-white">{copy.sourceDescription}</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {sourceDocs.map((doc) => (
              <a key={doc.href} href={doc.href} className="rounded-lg border border-[#46556b] bg-[#162033] p-4 transition hover:-translate-y-0.5">
                <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-[#cbd5e1]">
                  <FileText size={15} />
                  Document
                </div>
                <h3 className="font-black text-white">{doc.title}</h3>
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
      <PageTitle title="meponto PontoSys SOP Center" eyebrow="全职骑手 / 招聘 / 站点运营" />

      <section className="rounded-xl border border-[#2a2a4a] bg-[#0d0d1a] p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase text-[#8b5cf6]">SOP category map</div>
            <h2 className="text-2xl font-black text-white">当前共有 5 个正式 SOP</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#c4c4d4]">
              资料库只作为 PDF、视频和品牌/沟通来源，不计入正式 SOP。正式 SOP 按“总部数据、骑手执行、招聘转化、站点运营、总部巡查”五类管理。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center md:grid-cols-3">
            <div className="rounded-lg border border-[#2a2a4a] bg-[#111827] px-4 py-3">
              <div className="text-2xl font-black text-white">5</div>
              <div className="text-xs font-black uppercase text-[#8b8ba3]">正式 SOP</div>
            </div>
            <div className="rounded-lg border border-[#2a2a4a] bg-[#111827] px-4 py-3">
              <div className="text-2xl font-black text-white">1</div>
              <div className="text-xs font-black uppercase text-[#8b8ba3]">资料库</div>
            </div>
            <div className="rounded-lg border border-[#2a2a4a] bg-[#111827] px-4 py-3">
              <div className="text-2xl font-black text-white">3</div>
              <div className="text-xs font-black uppercase text-[#8b8ba3]">执行角色</div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-5">
          {sopCategories.map((category) => {
            const colors = sectionTones[category.tone as SectionTone];
            return (
              <Link key={category.code} href={category.href} className={`rounded-xl border ${colors.border} ${colors.bg} p-4 transition hover:-translate-y-0.5`}>
                <div className={`text-xs font-black uppercase ${colors.accent}`}>{category.code}</div>
                <h3 className="mt-2 text-lg font-black text-white">{category.name}</h3>
                <p className="mt-1 text-xs font-black uppercase text-[#8b8ba3]">{category.owner}</p>
                <p className="mt-3 text-sm leading-6 text-[#c4c4d4]">{category.scope}</p>
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
          <p className="mt-3 max-w-4xl text-sm leading-6 text-[#c4c4d4]">
            PontoSys 不直接替代 99 后台数据源作为原始系统。总部每天从 99 后台导出前一天数据，再导入 PontoSys 做站点运营、骑手管理、财务对账、风险提醒和 SOP 执行追踪。
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {dataFlow.map(([title, detail], index) => (
              <div key={title} className="rounded-lg border border-[#1f5f78] bg-[#0b2430] p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-[#38bdf8]">
                  <Database size={15} />
                  Step {index + 1}
                </div>
                <h3 className="font-black text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#a9a9bd]">{detail}</p>
              </div>
            ))}
          </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-[#1f5f78] bg-[#081d28] p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-black text-white">
            <BookOpen size={18} />
            Training video
          </div>
          <video className="aspect-video w-full rounded-lg border border-[#2a2a4a] bg-black" controls preload="metadata">
            <source src="/sop-assets/pontosys-training-video.mp4" type="video/mp4" />
          </video>
          <p className="mt-3 text-sm leading-6 text-[#a9a9bd]">视频作为 PontoSys 操作培训资料，配合 PDF 手册用于站点经理和 Leader 培训。</p>
          </div>
        </div>
      </SectionShell>

      <SectionShell id="rider-daily" title="全职骑手每日执行流" eyebrow="Daily rider SOP" tone="rider">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm leading-6 text-[#c4c4d4]">用绿色标记骑手每日必须完成的动作和现场要求。</p>
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
            <div className="text-xs font-black uppercase text-[#8b5cf6]">Recruitment funnel</div>
            <h2 className="text-2xl font-black text-white">招聘骑手转化流程</h2>
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
              <h3 className="mt-2 font-black text-white">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#a9a9bd]">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-5 grid gap-4 xl:grid-cols-[1fr_0.8fr]">
        <div className="rounded-xl border border-[#5542a0] bg-[#151129] p-5">
          <div className="mb-4">
            <div className="text-xs font-black uppercase text-[#8b5cf6]">Recruitment actions</div>
            <h2 className="text-2xl font-black text-white">招聘动作清单</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recruitmentActions.map(([stage, detail]) => (
              <div key={stage} className="rounded-lg border border-[#5542a0] bg-[#1d1738] p-4">
                <div className="text-xs font-black uppercase text-[#a78bfa]">{stage}</div>
                <p className="mt-2 text-sm leading-6 text-[#c4c4d4]">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#5542a0] bg-[#151129] p-5">
          <div className="mb-4">
            <div className="text-xs font-black uppercase text-[#8b5cf6]">Ownership</div>
            <h2 className="text-2xl font-black text-white">负责人矩阵</h2>
          </div>
          <div className="space-y-3">
            {recruitmentOwners.map(([owner, detail]) => (
              <div key={owner} className="rounded-lg border border-[#5542a0] bg-[#1d1738] p-4">
                <h3 className="font-black text-white">{owner}</h3>
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
              <div className="text-xs font-black uppercase text-[#8b5cf6]">Recruitment KPI</div>
              <h2 className="text-2xl font-black text-white">招聘考核规则</h2>
            </div>
            <Badge value="Funnel quality" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {recruitmentKpis.map(([name, target, detail]) => (
              <div key={name} className="rounded-lg border border-[#5542a0] bg-[#1d1738] p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-black text-white">{name}</h3>
                  <span className="rounded border border-[#06d6a0]/30 bg-[#06251a] px-2 py-1 text-xs font-black text-[#8ff5c2]">{target}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#a9a9bd]">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#5542a0] bg-[#151129] p-5">
          <div className="mb-4">
            <div className="text-xs font-black uppercase text-[#8b5cf6]">Decision rules</div>
            <h2 className="text-2xl font-black text-white">通过 / 待观察 / 淘汰</h2>
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
              <div className="text-xs font-black uppercase text-[#8b5cf6]">Site staffing</div>
              <h2 className="text-2xl font-black text-white">每站 2 人配置</h2>
            </div>
            <Badge value="2 people / Ponto" />
          </div>
          <div className="space-y-3">
            {siteStaffingModel.map(([role, detail]) => (
              <div key={role} className="rounded-lg border border-[#7a4d10] bg-[#2c1f0b] p-4">
                <h3 className="font-black text-white">{role}</h3>
                <p className="mt-2 text-sm leading-6 text-[#a9a9bd]">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#7a4d10] bg-[#211707] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase text-[#8b5cf6]">HQ data support</div>
              <h2 className="text-2xl font-black text-white">总部数据支持</h2>
            </div>
            <Badge value="D-1 99 Data" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {hqDataSupport.map(([name, detail]) => (
              <div key={name} className="rounded-lg border border-[#7a4d10] bg-[#2c1f0b] p-4">
                <h3 className="font-black text-white">{name}</h3>
                <p className="mt-2 text-sm leading-6 text-[#a9a9bd]">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-5 rounded-xl border border-[#7a4d10] bg-[#211707] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase text-[#8b5cf6]">Site daily flow</div>
            <h2 className="text-2xl font-black text-white">站点每日运营流</h2>
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
              <h3 className="mt-2 font-black text-white">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#a9a9bd]">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="inspection" className="mt-5 rounded-xl border border-[#74303c] bg-[#240d14] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase text-[#8b5cf6]">HQ inspection actions</div>
            <h2 className="text-2xl font-black text-white">SOP 落地执行动作表</h2>
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
                  <td className="px-3 py-4 font-black text-white">{item.stage}</td>
                  <td className="px-3 py-4 leading-6 text-[#c4c4d4]">{item.action}</td>
                  <td className="px-3 py-4 text-[#c4c4d4]">{item.owner}</td>
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
            <div className="mt-2 text-3xl font-black text-white">{target}</div>
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
          <div className="mb-3 flex items-center gap-2 text-sm font-black text-white">
            <Clock3 size={18} />
            Daily cadence
          </div>
          <div className="space-y-3 text-sm leading-6 text-[#c4c4d4]">
            <p><strong className="text-white">08:00</strong> 导入 D-1 99 Data 数据，生成异常和付款差异。</p>
            <p><strong className="text-white">10:00</strong> Ponto/Leader 晨会，确认招聘缺口、排班和风险骑手。</p>
            <p><strong className="text-white">14:00</strong> 检查 PontoSys 排班计划、班次注册和 rider group。</p>
            <p><strong className="text-white">18:00</strong> 晚高峰/夜班上线检查，处理事故和投诉。</p>
            <p><strong className="text-white">22:00</strong> 复盘 TSH、AR、订单、延迟、付款和次日排班。</p>
          </div>
        </div>

        <div className="panel p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-black text-white">
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

      <section id="library" className="mt-5 rounded-xl border border-[#46556b] bg-[#111827] p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-black text-white">
          <FileText size={18} />
          Source library
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {sourceDocs.map((doc) => (
            <Link key={doc.href} href={doc.href} className="rounded-lg border border-[#46556b] bg-[#162033] p-4 transition hover:border-[#94a3b8]">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#18182b] text-[#8b5cf6]">
                <Users size={18} />
              </div>
              <h3 className="font-black text-white">{doc.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#a9a9bd]">{doc.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
