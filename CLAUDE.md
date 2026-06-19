# CLAUDE.md — MePonto Harness Engineering Manual / Agent 脚手架工程手册

> Bilingual (中英对照). This file is the **agent operating harness** for the MePonto
> repository (PontoSys operations system + PontoMall mall/redemption system).
> 本文件是 MePonto 仓库(PontoSys 运营系统 + PontoMall 积分商城系统)的 **agent 工作脚手架**。
>
> Read order / 阅读顺序: `CLAUDE.md` (this file, *how* an agent works here) →
> `AGENTS.md` (the hard rules) → the Required Reading docs.
> 本文件讲"agent 在这里**怎么干活**",`AGENTS.md` 讲"硬规则",再看必读文档。

---

## 0. What "Harness Engineering" Means Here / 什么是脚手架工程

**EN.** As models improve, the bottleneck shifts from the model to the *harness* —
the context, tools, commands, guardrails, and feedback loops that surround the agent.
Harness engineering is the deliberate practice of building that scaffolding so an AI
agent can work on MePonto **reliably, reversibly, and verifiably** instead of guessing.
A good harness makes the right action easy and the wrong action hard.

**中文.** 模型越来越强,瓶颈就从"模型本身"转移到了"脚手架(harness)"——也就是围绕 agent
的上下文、工具、命令、护栏和反馈回路。脚手架工程就是有意识地把这层支撑搭好,让 AI agent 在
MePonto 上**稳定、可回滚、可验证**地工作,而不是靠猜。好的脚手架让正确的事容易做、错误的事难做。

The harness has five pillars / 脚手架的五大支柱:

1. **Context / 上下文** — the agent knows the product, boundaries, and where truth lives.
2. **Commands / 命令** — every check is a single runnable command, not a manual ritual.
3. **Guardrails / 护栏** — feature flags, RBAC, ledgers, module boundaries stop blast radius.
4. **Feedback / 反馈** — preflight, smoke, and guards give fast pass/fail signals.
5. **Reversibility / 可回滚** — small diffs, one module per branch, deployable `main`.

---

## 1. Product Context / 产品上下文

- **Brand / 品牌:** MePonto.
- **Operations system / 运营系统:** PontoSys — console, franchise, leaders, riders, pontos,
  finance, risk, SOP, analytics. 控制台、加盟、队长、骑手、网点、财务、风控、SOP、分析。
- **Mall system / 商城系统:** PontoMall — points-based catalog, redemption, stock reserve,
  order fulfillment. 积分商品目录、兑换、库存预留、订单履约。Live at `mall.meponto.com`.
- **Languages / 语言:** Chinese (`zh`), English (`en`), Portuguese (`pt`). Default review
  language is Chinese; Brazil-facing copy is Portuguese. 默认评审语言中文,面向巴西用户用葡语。
- **Mindset / 思维:** Build an **ecosystem OS**, not isolated pages. 按"生态 OS"设计,不是孤立页面。

Stack / 技术栈: Next.js 16 (App Router) · React 19 · TypeScript · Zustand · TanStack Query ·
Supabase · Tailwind v4. Routes and APIs are catalogued in `README.md`.

---

## 2. The Command Harness / 命令脚手架

**EN.** Never invent a verification ritual. Every signal an agent needs already exists as an
npm script. Run the smallest sufficient command, then the broadest required one before done.

**中文.** 不要自创验证流程。agent 需要的每个信号都已经是一个 npm 脚本。先跑"够用的最小命令",
完成前再跑"必须的最广命令"。

| Command / 命令 | What it does / 作用 | When / 何时用 |
| --- | --- | --- |
| `npm run dev` | Start dev server on `:3000` / 本地开发 | While iterating / 迭代时 |
| `npm run module:guard` | Enforce module boundaries / 校验模块边界 | Before any module change / 改模块前后 |
| `npm run build` | Production build (type + compile) / 生产构建 | Before every commit / 每次提交前 |
| `npm run codex:preflight` | module:guard + build / 标准预检 | Definition of Done / 完成定义 |
| `npm run codex:preflight:full` | preflight + `check` smoke / 完整预检 | Release & high-risk / 发版与高风险 |
| `npm run check` | Full smoke suite / 完整冒烟 | Deep verification / 深度验证 |
| `npm run smoke` / `workflow:smoke` / `a11y:smoke` | Targeted smoke / 定向冒烟 | Touch flows, workflows, a11y |
| `npm run verify:persistence` | Persistence check / 持久化校验 | Touching stored state / 改存储状态 |
| `npm run lint` | ESLint (next) / 代码规范 | Anytime / 随时 |

**Golden rule / 黄金法则:** a change is **not done** until `npm run codex:preflight` passes
(and `:full` for release or high-risk work). 不跑过预检,就不算完成。

---

## 3. Guardrails — Hard Rules the Harness Enforces / 护栏:脚手架强制的硬规则

These mirror `AGENTS.md §Hard Rules`. The harness exists to make breaking them *hard*.
下列与 `AGENTS.md` 硬规则一致;脚手架的作用就是让"违反它们"变难。

1. **Module Registry first / 先注册模块** — new modules register through the Module Registry
   before going active. 新模块先经模块注册再激活。
2. **No private cross-reads / 不跨读私有数据** — a module must not read/write another module's
   private data. Use **API / event / read model / Integration Gateway**. 跨模块只走契约。
3. **Feature-flag new capability / 新能力先上 flag** — default disabled or beta. 默认关闭或灰度。
4. **Ledger-style records / 账本式记录** — money, points, incentives, inventory, settlement,
   gamification economy changes must be append-only ledger records. 资金/积分/库存/结算用账本。
5. **Unified RBAC/scope / 统一权限** — permission-sensitive features use the shared RBAC/scope
   model. No bespoke auth, no second login system. 权限敏感功能走统一 RBAC,不另起登录。
6. **Versioned events / 事件版本化** — e.g. `marketplace.order.created.v1`. 事件必须带版本。
7. **Tri-lingual user-facing text / 用户可见文案三语** — `zh` + `en` + `pt` via the i18n
   structure; don't mix languages inside one label. 用户可见文本三语齐全,单标签不混语言。
8. **Don't rename / 不擅自改名** — MePonto, PontoSys, PontoMall stay unless product decides.

> If a task forces a temporary single-language or flag-off-by-default exception, the PR must
> **state why** and list the follow-up. 临时例外必须在 PR 写明原因与后续补全项。

---

## 4. Module Boundaries / 模块边界

Ownership areas mirror `AGENTS.md §Module Ownership`. Paths marked *(planned)* are owned per
`AGENTS.md` but not yet in the tree — create them under their owner's scope, not ad hoc.
责任区与 `AGENTS.md` 一致;标注 *(planned)* 的目录尚未建立,需在对应责任区内新建,勿随意散落。

- `app/riders`, `app/rider-app`, `app/rider-monitor`, `app/dispatch`, *(planned)* `app/leaders` / `app/mobile`
  — rider & leader experience / 骑手与队长体验。
- `app/franchise`, `app/finance`, `app/wallet`, `app/points-economy` — business model & economy / 商业模式与积分经济。
- `app/mall`, `app/marketplace`, `app/store`, `app/mall-insights` — **PontoMall** redemption & catalog / 商城兑换与目录。
- `docs`, `public/sop-assets`, *(planned)* `app/sops` — SOP & training content / SOP 与培训内容。
- `app/lib`, `app/api`, `app/components` — **shared platform code; change with extra care** / 共享平台代码,谨慎改动。

**Rule / 规则:** edits to `app/lib`, `app/api`, `app/components` ripple everywhere — keep them
minimal, justify them in the PR, and request the area owner's review. 共享代码牵一发动全身。

---

## 5. The Agent Loop / Agent 工作循环

Run this loop for every task / 每个任务都走这个循环:

1. **Orient / 定位.** Read `AGENTS.md`, this file, and the relevant Required Reading doc.
   Identify the owning module and its boundary. 找准所属模块与边界。
2. **Scope small / 缩小范围.** One module per branch (`codex/<module-or-task>`). No drive-by
   refactors. 一支一模块,不顺手大改。
3. **Plan against guardrails / 对照护栏规划.** Which flag? Which events? Ledger needed? RBAC
   scope? i18n keys? 先想清楚 flag/事件/账本/权限/三语。
4. **Implement / 实现.** Smallest reversible diff that satisfies the contract. 最小可回滚改动。
5. **Verify / 验证.** `module:guard` → `build` → `codex:preflight` (`:full` if release/high-risk).
   Fix until green. Never mark done on a red signal. 跑到绿,红灯不算完成。
6. **Document / 记录.** Update events/API contracts when applicable; check `zh/en/pt` completeness;
   complete `docs/pr-checklist.md`. 更新契约、查三语、走 PR 清单。
7. **Hand off / 交付.** Stage **only** task-related files. Commit **only when the developer asks**.
   只暂存相关文件,且仅在开发者要求时提交。

---

## 6. Definition of Done / 完成定义

A change is done only when all hold / 全部满足才算完成:

- [ ] Module boundary is clear and respected / 模块边界清晰且未越界。
- [ ] Permissions checked via unified RBAC/scope / 已用统一 RBAC 校验权限。
- [ ] `zh` / `en` / `pt` user-facing text complete / 用户可见文案三语齐全。
- [ ] Events & API contracts documented (versioned) when applicable / 事件与 API 契约已记录并版本化。
- [ ] Economy changes use ledger records / 经济类改动用账本记录。
- [ ] New capability behind a feature flag / 新能力在 flag 后。
- [ ] `npm run codex:preflight` passes (`:full` for release/high-risk) / 预检通过。
- [ ] `docs/pr-checklist.md` completed / PR 清单完成。

---

## 7. Required Reading / 必读文档

Before adding or changing a module, read / 改模块前必读:

- `docs/meponto-ecosystem-development-standard-v2.md` — ecosystem standard / 生态开发标准。
- `docs/design-system.md` — design tokens & components / 设计系统。
- `docs/meponto-ecosystem-os-v2-diagram.md` — system map / 系统全景图。
- `docs/module-development-playbook.md` — how to build a module / 模块开发手册。
- `docs/module-contract-template.md` — contract template / 模块契约模板。
- `docs/pr-checklist.md` — the gate before merge / 合并前清单。
- `docs/codex-team-collaboration-manual.md` — team workflow / 协作手册。
- `docs/meponto-points-economy-standard.md` — ledger & points economy / 积分经济与账本标准。
- `docs/architecture.md`, `docs/api.md`, `docs/integrations.md`, `docs/quality.md` — reference.

---

## 8. Anti-Patterns / 反模式(不要这么做)

- ❌ Inventing a custom verification instead of running the npm scripts. 自创验证流程。
- ❌ Reaching into another module's private state. 直接读别的模块私有状态。
- ❌ Shipping new capability without a feature flag. 新能力不挂 flag 直接上。
- ❌ Mutating points/money/inventory without a ledger record. 不走账本改积分/资金/库存。
- ❌ Leaving a user-facing label in only one language. 用户可见文案只有一种语言。
- ❌ Broad refactors bundled into a narrow task. 把大重构塞进小任务。
- ❌ Committing without being asked, or staging unrelated files. 未经要求提交、暂存无关文件。
- ❌ A second login system for a sub-system. 给子系统另起一套登录。

---

*Keep `main` deployable. Small reversible diffs. Green preflight. Tri-lingual. Ledgered.*
*保持 main 可部署 · 小步可回滚 · 预检全绿 · 三语齐全 · 经济上账本。*
