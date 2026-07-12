"use client";

import { useState } from "react";
import type { MallCoupon } from "../../lib/mall-ops";
import { DataTable, SectionCard, Skeleton, StatusBadge, type DataColumn } from "../kit";
import { useMallAdmin } from "./context";

/** 分类与营销 — 三张 SectionCard：商品分类（内联添加）/ 门面 Banner（展开式新增）/ 优惠券（DataTable + 展开式创建）。 */

const TIER_LABEL: Record<MallCoupon["minTier"], string> = { member: "全员", bronze: "铜牌+", prata: "银牌+", ouro: "金牌+", diamante: "钻石" };

// Shared class recipes (per design spec: 常规描边、危险红描边; heights set at call site).
const outlineBtn = "rounded-[8px] border border-[var(--line)] px-3.5 text-xs font-bold text-[var(--muted)] hover:border-[var(--accent)] disabled:opacity-50";
const primaryBtn = "rounded-[8px] bg-[var(--accent)] px-4 text-xs font-bold text-[var(--accent-ink)] disabled:opacity-50";
const smallOutlineBtn = "h-7 rounded-[6px] border border-[var(--line)] px-2.5 text-[11px] font-bold text-[var(--muted)] hover:border-[var(--accent)]";
const smallDangerBtn = "h-7 rounded-[6px] border border-[var(--danger)]/40 px-2.5 text-[11px] font-bold text-[var(--danger)] hover:border-[var(--danger)]";
const labelCls = "block text-[11px] font-bold text-[var(--muted)]";
const fieldCls = "mt-1 h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]";
const selectCls = "mt-1 h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]";

const EMPTY_COUPON = { title: "", type: "points_off" as MallCoupon["type"], value: "", minPoints: "", minTier: "member" as MallCoupon["minTier"], perRiderLimit: "", expiresAt: "" };

export default function MerchTab() {
  const { loading, ops, post } = useMallAdmin();
  /** First load still in flight — Skeleton bars, never fake "暂无" states. */
  const booting = loading && !ops;
  const [categoryName, setCategoryName] = useState("");
  const [bannerFormOpen, setBannerFormOpen] = useState(false);
  const [bannerDraft, setBannerDraft] = useState({ title: "", imageUrl: "", href: "" });
  const [couponFormOpen, setCouponFormOpen] = useState(false);
  const [couponDraft, setCouponDraft] = useState(EMPTY_COUPON);

  const categories = ops?.categories ?? [];
  const banners = ops?.banners ?? [];
  const coupons = ops?.coupons ?? [];

  function couponStatus(coupon: MallCoupon) {
    if (!coupon.active) return <StatusBadge tone="neutral" label="已停用" />;
    if (coupon.expiresAt && coupon.expiresAt < new Date().toISOString().slice(0, 10)) return <StatusBadge tone="danger" label="已过期" />;
    return <StatusBadge tone="success" label="生效中" />;
  }

  // ---- 优惠券 DataTable 列 ----
  const couponColumns: Array<DataColumn<MallCoupon>> = [
    { key: "title", label: "券名", render: (coupon) => <span className="font-black">{coupon.title}</span> },
    { key: "type", label: "类型", render: (coupon) => (coupon.type === "percent_off" ? <StatusBadge tone="warn" label="折扣券" /> : <StatusBadge tone="info" label="满减券" />) },
    { key: "value", label: "面值", align: "right", render: (coupon) => <span className="font-black">{coupon.type === "percent_off" ? `${coupon.value}%` : `${coupon.value.toLocaleString()} 分`}</span> },
    { key: "min", label: "门槛", align: "right", render: (coupon) => (coupon.minPoints > 0 ? `满 ${coupon.minPoints.toLocaleString()} 分` : "无门槛") },
    { key: "tier", label: "等级", render: (coupon) => TIER_LABEL[coupon.minTier] ?? coupon.minTier },
    { key: "limit", label: "限次", align: "right", render: (coupon) => (coupon.perRiderLimit === 0 ? "不限" : `${coupon.perRiderLimit} 次/人`) },
    { key: "expires", label: "有效期", render: (coupon) => coupon.expiresAt ?? "长期有效" },
    { key: "status", label: "状态", render: couponStatus },
    {
      key: "actions",
      label: "操作",
      align: "right",
      render: (coupon) => (
        <span className="inline-flex gap-2">
          <button type="button" onClick={() => void post("/api/mall/ops", { action: "updateCoupon", couponId: coupon.id, active: !coupon.active })} className={smallOutlineBtn}>{coupon.active ? "停用" : "启用"}</button>
          <button type="button" onClick={() => void post("/api/mall/ops", { action: "deleteCoupon", couponId: coupon.id })} className={smallDangerBtn}>删除</button>
        </span>
      ),
    },
  ];

  async function addCoupon() {
    const result = await post("/api/mall/ops", {
      action: "addCoupon",
      title: couponDraft.title.trim(),
      type: couponDraft.type,
      value: Number(couponDraft.value),
      minPoints: Number(couponDraft.minPoints) || 0,
      minTier: couponDraft.minTier,
      perRiderLimit: Number(couponDraft.perRiderLimit) || 0,
      expiresAt: couponDraft.expiresAt || undefined,
    }, "优惠券已创建");
    if (result !== null) { setCouponDraft(EMPTY_COUPON); setCouponFormOpen(false); }
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {/* ---- 1. 商品分类：紧凑列表行 + 顶部内联添加 ---- */}
      <SectionCard title="商品分类" desc="未配置分类时，门面按商品自带分类自动归组。">
        <div className="mb-3 flex gap-2">
          <input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="新分类名，如 Equipamento" className="h-10 min-w-0 flex-1 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
          <button type="button" disabled={!categoryName.trim()} onClick={() => void post("/api/mall/ops", { action: "addCategory", name: categoryName.trim() }, "分类已添加").then(() => setCategoryName(""))} className={`h-10 shrink-0 ${outlineBtn}`}>添加</button>
        </div>
        {booting ? <Skeleton rows={3} className="" /> : (
        <div className="divide-y divide-[var(--line)]">
          {categories.map((category) => (
            <div key={category.id} className="flex items-center gap-2 py-2">
              <span className={`min-w-0 flex-1 truncate text-sm font-bold ${category.active ? "" : "text-[var(--muted)]"}`}>{category.name}</span>
              <StatusBadge tone={category.active ? "success" : "neutral"} label={category.active ? "启用中" : "已停用"} />
              <button type="button" onClick={() => void post("/api/mall/ops", { action: "updateCategory", categoryId: category.id, active: !category.active })} className={smallOutlineBtn}>{category.active ? "停用" : "启用"}</button>
              <button type="button" onClick={() => void post("/api/mall/ops", { action: "deleteCategory", categoryId: category.id })} className={smallDangerBtn}>删除</button>
            </div>
          ))}
          {categories.length === 0 && <div className="py-4 text-center text-xs font-bold text-[var(--muted)]">暂无分类。</div>}
        </div>
        )}
      </SectionCard>

      {/* ---- 2. 门面 Banner：列表行带缩略图，新增表单收进展开区 ---- */}
      <SectionCard
        title="门面 Banner"
        desc="展示在商城门面顶部，可配点击跳转。"
        right={<button type="button" onClick={() => setBannerFormOpen((open) => !open)} className={`h-9 ${outlineBtn}`}>{bannerFormOpen ? "收起" : "新增 Banner"}</button>}
      >
        {bannerFormOpen && (
          <div className="mb-4 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className={labelCls}>标题（无图时直接展示标题）
                <input value={bannerDraft.title} onChange={(e) => setBannerDraft((prev) => ({ ...prev, title: e.target.value }))} className={fieldCls} />
              </label>
              <label className={labelCls}>点击跳转（可选）
                <input value={bannerDraft.href} onChange={(e) => setBannerDraft((prev) => ({ ...prev, href: e.target.value }))} placeholder="https://…" className={fieldCls} />
              </label>
              <label className={`${labelCls} md:col-span-2`}>图片 URL（可选，建议 1600×500）
                <input value={bannerDraft.imageUrl} onChange={(e) => setBannerDraft((prev) => ({ ...prev, imageUrl: e.target.value }))} placeholder="https://…" className={fieldCls} />
              </label>
            </div>
            <button
              type="button"
              disabled={!bannerDraft.title.trim()}
              onClick={() => void post("/api/mall/ops", { action: "addBanner", ...bannerDraft }, "Banner 已添加").then((result) => { if (result !== null) { setBannerDraft({ title: "", imageUrl: "", href: "" }); setBannerFormOpen(false); } })}
              className={`mt-3 h-9 ${outlineBtn}`}
            >添加 Banner</button>
          </div>
        )}
        {booting ? <Skeleton rows={3} className="" /> : (
        <div className="divide-y divide-[var(--line)]">
          {banners.map((banner) => (
            <div key={banner.id} className="flex items-center gap-3 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {banner.imageUrl ? <img src={banner.imageUrl} alt="" className="h-10 w-20 shrink-0 rounded-[6px] border border-[var(--line)] object-cover" /> : <div className="grid h-10 w-20 shrink-0 place-items-center rounded-[6px] border border-[var(--line)] bg-[var(--surface-raised)] text-[10px] font-bold text-[var(--muted)]">文字</div>}
              <span className={`min-w-0 flex-1 truncate text-sm font-bold ${banner.active ? "" : "text-[var(--muted)]"}`}>{banner.title}</span>
              <StatusBadge tone={banner.active ? "success" : "neutral"} label={banner.active ? "展示中" : "已停用"} />
              <button type="button" onClick={() => void post("/api/mall/ops", { action: "updateBanner", bannerId: banner.id, active: !banner.active })} className={smallOutlineBtn}>{banner.active ? "停用" : "启用"}</button>
              <button type="button" onClick={() => void post("/api/mall/ops", { action: "deleteBanner", bannerId: banner.id })} className={smallDangerBtn}>删除</button>
            </div>
          ))}
          {banners.length === 0 && <div className="py-4 text-center text-xs font-bold text-[var(--muted)]">暂无 Banner。</div>}
        </div>
        )}
      </SectionCard>

      {/* ---- 3. 优惠券：DataTable + 展开式创建表单（本视图唯一黄色主按钮） ---- */}
      <SectionCard
        title="优惠券"
        desc="满减券：消耗满「门槛」积分可用；折扣券：按抵扣后积分价百分比。兑换时按等级自动抵扣最优券。"
        right={couponFormOpen
          ? <button type="button" onClick={() => setCouponFormOpen(false)} className={`h-9 ${outlineBtn}`}>收起</button>
          : <button type="button" onClick={() => setCouponFormOpen(true)} className={`h-9 ${primaryBtn}`}>创建优惠券</button>}
        className="lg:col-span-2"
      >
        {couponFormOpen && (
          <div className="mb-4 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className={labelCls}>券名
                <input value={couponDraft.title} onChange={(e) => setCouponDraft((prev) => ({ ...prev, title: e.target.value }))} placeholder="如：新人立减 100 分" className={fieldCls} />
              </label>
              <label className={labelCls}>类型
                <select value={couponDraft.type} onChange={(e) => setCouponDraft((prev) => ({ ...prev, type: e.target.value as MallCoupon["type"] }))} className={selectCls}>
                  <option value="points_off">满减（积分）</option>
                  <option value="percent_off">折扣（%）</option>
                </select>
              </label>
              <label className={labelCls}>{couponDraft.type === "percent_off" ? "折扣 %（1-100）" : "立减积分"}
                <input value={couponDraft.value} onChange={(e) => setCouponDraft((prev) => ({ ...prev, value: e.target.value.replace(/[^0-9]/g, "") }))} inputMode="numeric" className={fieldCls} />
              </label>
              <label className={labelCls}>门槛积分（可空 = 无门槛）
                <input value={couponDraft.minPoints} onChange={(e) => setCouponDraft((prev) => ({ ...prev, minPoints: e.target.value.replace(/[^0-9]/g, "") }))} inputMode="numeric" className={fieldCls} />
              </label>
              <label className={labelCls}>发放等级
                <select value={couponDraft.minTier} onChange={(e) => setCouponDraft((prev) => ({ ...prev, minTier: e.target.value as MallCoupon["minTier"] }))} className={selectCls}>
                  {(Object.keys(TIER_LABEL) as Array<MallCoupon["minTier"]>).map((tier) => (
                    <option key={tier} value={tier}>{TIER_LABEL[tier]}</option>
                  ))}
                </select>
              </label>
              <label className={labelCls}>每人限用（0 = 不限）
                <input value={couponDraft.perRiderLimit} onChange={(e) => setCouponDraft((prev) => ({ ...prev, perRiderLimit: e.target.value.replace(/[^0-9]/g, "") }))} inputMode="numeric" className={fieldCls} />
              </label>
              <label className={labelCls}>有效期至（可空 = 长期有效）
                <input type="date" value={couponDraft.expiresAt} onChange={(e) => setCouponDraft((prev) => ({ ...prev, expiresAt: e.target.value }))} className={fieldCls} />
              </label>
            </div>
            <button type="button" disabled={!couponDraft.title.trim() || !(Number(couponDraft.value) > 0)} onClick={() => void addCoupon()} className={`mt-4 h-9 ${primaryBtn}`}>创建券</button>
          </div>
        )}
        {booting ? (
          <Skeleton rows={4} className="" />
        ) : (
          <DataTable
            columns={couponColumns}
            rows={coupons}
            rowKey={(coupon) => coupon.id}
            minWidth={860}
            empty="暂无优惠券。创建后骑手兑换时自动按等级匹配最优券抵扣。"
          />
        )}
      </SectionCard>
    </div>
  );
}
