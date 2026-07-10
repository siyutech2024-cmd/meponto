"use client";

import { useState } from "react";
import { useMallAdmin } from "./context";

/** 分类与营销（分类 / Banner / 优惠券）— mechanical move from app/mall/page.tsx (wave 1). */

export default function MerchTab() {
  const { ops, post, t } = useMallAdmin();
  const [categoryName, setCategoryName] = useState("");
  const [bannerDraft, setBannerDraft] = useState({ title: "", imageUrl: "", href: "" });
  const [couponDraft, setCouponDraft] = useState({ title: "", type: "points_off", value: "", minPoints: "", minTier: "member", perRiderLimit: "", expiresAt: "" });

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="panel p-5">
        <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">商品分类</div>
        <div className="mb-3 flex gap-2">
          <input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="新分类名，如 Equipamento" className="h-10 flex-1 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
          <button type="button" disabled={!categoryName.trim()} onClick={() => void post("/api/mall/ops", { action: "addCategory", name: categoryName.trim() }, "分类已添加").then(() => setCategoryName(""))} className="h-10 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-bold text-[var(--accent-ink)] disabled:opacity-50">添加</button>
        </div>
        <div className="space-y-2">
          {(ops?.categories ?? []).map((category) => (
            <div key={category.id} className="flex items-center gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2">
              <span className="flex-1 text-sm font-bold" style={{ opacity: category.active ? 1 : 0.45 }}>{category.name}</span>
              <button type="button" onClick={() => void post("/api/mall/ops", { action: "updateCategory", categoryId: category.id, active: !category.active })} className="tag">{category.active ? "停用" : "启用"}</button>
              <button type="button" onClick={() => void post("/api/mall/ops", { action: "deleteCategory", categoryId: category.id })} className="text-xs font-bold text-[var(--danger)]">删除</button>
            </div>
          ))}
          {(ops?.categories ?? []).length === 0 && <div className="py-4 text-center text-xs font-bold text-[var(--muted)]">未配置分类时，门面按商品自带分类自动归组。</div>}
        </div>
      </div>

      <div className="panel p-5">
        <div className="mb-3 text-xs font-black uppercase text-[var(--muted)]">门面 Banner</div>
        <div className="mb-3 grid gap-2">
          <input value={bannerDraft.title} onChange={(e) => setBannerDraft((prev) => ({ ...prev, title: e.target.value }))} placeholder="标题（无图时直接展示标题）" className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
          <div className="flex gap-2">
            <input value={bannerDraft.imageUrl} onChange={(e) => setBannerDraft((prev) => ({ ...prev, imageUrl: e.target.value }))} placeholder="图片 URL（可选，建议 1600×500）" className="h-10 flex-1 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
            <input value={bannerDraft.href} onChange={(e) => setBannerDraft((prev) => ({ ...prev, href: e.target.value }))} placeholder="点击跳转（可选）" className="h-10 flex-1 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
            <button type="button" disabled={!bannerDraft.title.trim()} onClick={() => void post("/api/mall/ops", { action: "addBanner", ...bannerDraft }, "Banner 已添加").then(() => setBannerDraft({ title: "", imageUrl: "", href: "" }))} className="h-10 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-bold text-[var(--accent-ink)] disabled:opacity-50">添加</button>
          </div>
        </div>
        <div className="space-y-2">
          {(ops?.banners ?? []).map((banner) => (
            <div key={banner.id} className="flex items-center gap-3 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {banner.imageUrl ? <img src={banner.imageUrl} alt="" className="h-10 w-20 rounded object-cover" /> : <div className="grid h-10 w-20 place-items-center rounded bg-[var(--line)] text-[10px] font-bold text-[var(--muted)]">文字</div>}
              <span className="flex-1 truncate text-sm font-bold" style={{ opacity: banner.active ? 1 : 0.45 }}>{banner.title}</span>
              <button type="button" onClick={() => void post("/api/mall/ops", { action: "updateBanner", bannerId: banner.id, active: !banner.active })} className="tag">{banner.active ? "停用" : "启用"}</button>
              <button type="button" onClick={() => void post("/api/mall/ops", { action: "deleteBanner", bannerId: banner.id })} className="text-xs font-bold text-[var(--danger)]">删除</button>
            </div>
          ))}
        </div>
      </div>

      {/* ---- 优惠券 ---- */}
      <div className="panel p-5 lg:col-span-2">
        <div className="mb-1 text-xs font-black uppercase text-[var(--muted)]">优惠券（兑换时按等级自动抵扣最优券）</div>
        <div className="mb-3 text-[11px] font-bold text-[var(--muted)]">满减券：消耗满「门槛」积分可用；折扣券：按抵扣后积分价百分比。按会员等级发放，每人可限用次数。</div>
        <div className="mb-3 grid gap-2 md:grid-cols-7">
          <input value={couponDraft.title} onChange={(e) => setCouponDraft((p) => ({ ...p, title: e.target.value }))} placeholder="券名" className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)] md:col-span-2" />
          <select value={couponDraft.type} onChange={(e) => setCouponDraft((p) => ({ ...p, type: e.target.value }))} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]">
            <option value="points_off">满减(积分)</option>
            <option value="percent_off">折扣(%)</option>
          </select>
          <input value={couponDraft.value} onChange={(e) => setCouponDraft((p) => ({ ...p, value: e.target.value.replace(/[^0-9]/g, "") }))} placeholder={couponDraft.type === "percent_off" ? "折扣% (1-100)" : "立减积分"} inputMode="numeric" className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
          <input value={couponDraft.minPoints} onChange={(e) => setCouponDraft((p) => ({ ...p, minPoints: e.target.value.replace(/[^0-9]/g, "") }))} placeholder="门槛积分(可空)" inputMode="numeric" className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
          <select value={couponDraft.minTier} onChange={(e) => setCouponDraft((p) => ({ ...p, minTier: e.target.value }))} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)]">
            <option value="member">全员</option>
            <option value="bronze">铜牌+</option>
            <option value="prata">银牌+</option>
            <option value="ouro">金牌+</option>
            <option value="diamante">钻石</option>
          </select>
          <input value={couponDraft.perRiderLimit} onChange={(e) => setCouponDraft((p) => ({ ...p, perRiderLimit: e.target.value.replace(/[^0-9]/g, "") }))} placeholder="每人限(0不限)" inputMode="numeric" className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
        </div>
        <div className="mb-3 flex gap-2">
          <input type="date" value={couponDraft.expiresAt} onChange={(e) => setCouponDraft((p) => ({ ...p, expiresAt: e.target.value }))} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)]" />
          <button type="button" disabled={!couponDraft.title.trim() || !(Number(couponDraft.value) > 0)} onClick={() => void post("/api/mall/ops", { action: "addCoupon", title: couponDraft.title.trim(), type: couponDraft.type, value: Number(couponDraft.value), minPoints: Number(couponDraft.minPoints) || 0, minTier: couponDraft.minTier, perRiderLimit: Number(couponDraft.perRiderLimit) || 0, expiresAt: couponDraft.expiresAt || undefined }, "优惠券已创建").then(() => setCouponDraft({ title: "", type: "points_off", value: "", minPoints: "", minTier: "member", perRiderLimit: "", expiresAt: "" }))} className="h-10 rounded-[8px] bg-[var(--accent)] px-4 text-xs font-bold text-[var(--accent-ink)] disabled:opacity-50">创建券</button>
        </div>
        <div className="space-y-2">
          {(ops?.coupons ?? []).map((coupon) => (
            <div key={coupon.id} className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2" style={{ opacity: coupon.active ? 1 : 0.5 }}>
              <span className="text-sm font-bold">{coupon.title}</span>
              <span className="rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[11px] font-bold text-[var(--accent)]">{coupon.type === "percent_off" ? t("dynPctOff", { v: coupon.value }) : t("dynPtsOff", { v: coupon.value })}</span>
              <span className="text-[11px] font-bold text-[var(--muted)]">{t("dynCouponMeta", { min: coupon.minPoints, tier: ({ member: t("dynTierAll"), bronze: t("dynTierBronze"), prata: t("dynTierSilver"), ouro: t("dynTierGold"), diamante: t("dynTierDiamond") } as Record<string, string>)[coupon.minTier], limit: coupon.perRiderLimit === 0 ? t("dynLimitNone") : coupon.perRiderLimit, until: coupon.expiresAt ? t("dynUntil", { d: coupon.expiresAt }) : "" })}</span>
              <button type="button" onClick={() => void post("/api/mall/ops", { action: "updateCoupon", couponId: coupon.id, active: !coupon.active })} className="tag ml-auto">{coupon.active ? "停用" : "启用"}</button>
              <button type="button" onClick={() => void post("/api/mall/ops", { action: "deleteCoupon", couponId: coupon.id })} className="text-xs font-bold text-[var(--danger)]">删除</button>
            </div>
          ))}
          {(ops?.coupons ?? []).length === 0 && <div className="py-4 text-center text-xs font-bold text-[var(--muted)]">暂无优惠券。创建后骑手兑换时自动按等级匹配最优券抵扣。</div>}
        </div>
      </div>
    </div>
  );
}
