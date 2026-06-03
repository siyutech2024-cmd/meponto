# MePonto Design Language

## Product Naming

- **MePonto** is the brand.
- **PontoSys** is the operations system: control console, franchise workflows, rider system, Leader workspace, SOP, risk, finance, analytics, and admin tools.
- **PontoMall** is the mall system: catalog, points redemption, inventory reserve, orders, and fulfillment.

## UI Principle

The interface is an operating system, not a marketing site. Every module should help users scan, decide, and act quickly.

1. Keep screens dense but calm.
2. Use dark mode by default with high text contrast.
3. Prefer tables, queues, status chips, drawers, and compact workflow panels.
4. Avoid hero sections, decorative backgrounds, gradient cards, nested cards, and oversized copy.
5. Every function must remain reachable; simplification means fewer steps, not fewer capabilities.

## Dark Theme Tokens

| Token | Use |
| --- | --- |
| `--background` | App canvas |
| `--surface` | Sidebar and header |
| `--surface-raised` | Inputs, table headers, field blocks |
| `--surface-hover` | Row and navigation hover |
| `--line` | Borders and separators |
| `--text` | Primary text |
| `--text-soft` | Table cells and secondary readable text |
| `--muted` | Eyebrows and labels |
| `--accent` | MePonto yellow primary action/accent |
| `--ok` | Success/available |
| `--warning` | Pending/medium risk |
| `--danger` | Critical/risk/open incident |

## Layout Standard

```txt
Left navigation -> grouped by system area
Top bar -> region, notifications, language, role, logout
Page title -> short product/module title + operational eyebrow
Summary row -> 3 to 5 compact metrics
Work area -> table, queue, workflow, map, or catalog
Detail/action -> drawer, inline form, or right-side focused panel
```

## Direction Mockups

![PontoSys operations console](design-assets/pontosys-operations-console.png)

![PontoSys franchise and rider workflow](design-assets/pontosys-franchise-rider-workflow.png)

![PontoMall catalog workspace](design-assets/pontomall-catalog-workspace.png)

## Component Rules

- Radius is `8px` or less.
- Buttons use icons when the action is common or tool-like.
- Primary actions use MePonto yellow.
- Destructive/risk actions use red only.
- Status must use `Badge`.
- Repeated records must use `DataTable` or a compact queue list.
- Avoid cards inside cards.
- Text must not rely on low contrast, blur, glow, or gradients.
- Long tables may scroll horizontally, but row height should stay compact.

## Module Logic Diagram

```mermaid
flowchart TB
  Brand["MePonto Brand"]

  Brand --> Sys["PontoSys"]
  Brand --> Mall["PontoMall"]

  Sys --> Console["Operations Console"]
  Sys --> Franchise["Franchise System"]
  Sys --> Rider["Rider System"]
  Sys --> Leader["Leader Workspace"]
  Sys --> SOP["SOP / Training"]
  Sys --> Risk["Risk / Incidents"]
  Sys --> Finance["Finance / Settlement"]
  Sys --> Analytics["Reports / Analytics"]

  Mall --> Catalog["Catalog"]
  Mall --> Redeem["Points Redemption"]
  Mall --> Inventory["Inventory Reserve"]
  Mall --> Orders["Orders / Fulfillment"]
  Mall --> PartnerMall["Partner Redemption"]
  Mall --> RiderMall["Rider Redemption"]

  Console --> Design["Unified Design System"]
  Franchise --> Design
  Rider --> Design
  Leader --> Design
  Risk --> Design
  Mall --> Design

  Design --> Tokens["Tokens: color, type, spacing"]
  Design --> Components["Components: button, table, badge, drawer"]
  Design --> Layouts["Layouts: shell, queue, detail, workflow"]
  Design --> States["States: success, pending, risk, disabled"]
```

## Page Simplification Checklist

- Can the user complete the primary action in one visible work area?
- Are filters grouped into one compact toolbar?
- Are metrics limited to the few numbers needed for that workflow?
- Is detail shown in a drawer or side panel instead of sending the user away?
- Are table actions clear and short?
- Are empty, loading, disabled, success, pending, and risk states visible?
- Does the page still work on mobile without text overlap?
