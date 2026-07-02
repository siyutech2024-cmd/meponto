"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";

/**
 * /liuming — Ming Liu's digital business card (standalone premium page).
 * Same functions as the original e-card: tri-lingual switcher, WhatsApp QR
 * modal, tel/mail/site/maps links, vCard download, Web Share, QR codes.
 * Brand-matched to the marketing homepage (#0b0e14 · #FFD400).
 */

type Lang = "pt" | "zh" | "en";

const CONTACT = {
  nameZh: "刘鸣",
  nameEn: "Ming Liu",
  email: "ming.liu@meponto.com",
  phone: "+86 18686514086",
  whatsappUrl: "https://wa.me/qr/X664AQ52MOPHL1",
  site: "https://www.meponto.com/",
  addressText: "Av. Paulista, 2537 · Bela Vista, São Paulo",
  addressUrl:
    "https://www.google.com/maps/search/?api=1&query=Av.+Paulista+2537+Bela+Vista+Sao+Paulo+SP+01311-300",
};

const VCARD = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "N:Liu;Ming;;;",
  "FN:Ming Liu",
  "ORG:meponto",
  "TITLE:Fundador",
  `TEL;TYPE=CELL:${CONTACT.phone.replace(/\s/g, "")}`,
  `EMAIL;TYPE=WORK:${CONTACT.email}`,
  `URL:${CONTACT.site}`,
  "ADR;TYPE=WORK:;;Av. Paulista, 2537 - Bela Vista;São Paulo;SP;01311-300;Brasil",
  "NOTE:O ponto de quem entrega",
  "END:VCARD",
].join("\r\n");

const copy: Record<Lang, {
  role: string;
  vision: [string, string];
  waVal: string;
  wxLab: string;
  emailLab: string;
  siteLab: string;
  addrLab: string;
  save: string;
  share: string;
  wcCap: string;
  vcCap: string;
  waTip: string;
  waOpen: string;
  linkCopied: string;
  saved: string;
}> = {
  pt: {
    role: "Fundador · meponto",
    vision: ["Um ", " para cada motoboy."],
    waVal: "Adicionar",
    wxLab: "WeChat / Telefone",
    emailLab: "E-mail",
    siteLab: "Site",
    addrLab: "Endereço",
    save: "Salvar contato",
    share: "Compartilhar cartão",
    wcCap: "Escaneie para me adicionar no WeChat",
    vcCap: "Escaneie para salvar o contato",
    waTip: "Escaneie para me adicionar",
    waOpen: "Abrir no WhatsApp",
    linkCopied: "Link copiado ✓",
    saved: "vCard ✓",
  },
  zh: {
    role: "创始人 · meponto",
    vision: ["让每个 motoboy 都有一个 ", "。"],
    waVal: "添加好友",
    wxLab: "微信 / 电话",
    emailLab: "邮箱",
    siteLab: "官网",
    addrLab: "地址",
    save: "保存到通讯录",
    share: "分享名片",
    wcCap: "扫码添加我的微信",
    vcCap: "扫码保存联系人",
    waTip: "扫码添加我的 WhatsApp",
    waOpen: "打开 WhatsApp",
    linkCopied: "链接已复制 ✓",
    saved: "已生成名片 ✓",
  },
  en: {
    role: "Founder · meponto",
    vision: ["A ", " for every motoboy."],
    waVal: "Add me",
    wxLab: "WeChat / Phone",
    emailLab: "Email",
    siteLab: "Site",
    addrLab: "Address",
    save: "Save contact",
    share: "Share card",
    wcCap: "Scan to add me on WeChat",
    vcCap: "Scan to save contact",
    waTip: "Scan to add me on WhatsApp",
    waOpen: "Open in WhatsApp",
    linkCopied: "Link copied ✓",
    saved: "vCard ✓",
  },
};

const ICONS = {
  whatsapp: (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.4 2 11.9c0 1.9.5 3.6 1.5 5.2L2 22l5.1-1.4c1.5.8 3.2 1.3 4.9 1.3 5.5 0 10-4.4 10-9.9C22 6.4 17.5 2 12 2Zm5.6 14.1c-.2.6-1.2 1.2-1.9 1.3-.5.1-1.1.1-1.8-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5.1-4.5-.1-.2-1.2-1.6-1.2-3.1 0-1.5.8-2.2 1-2.5.2-.3.5-.4.7-.4h.5c.2 0 .4 0 .6.5.2.6.7 2 .8 2.1.1.1.1.3 0 .5-.4.8-.8 1-.5 1.5.9 1.6 2 2.1 3.4 2.8.3.1.5.1.7-.1.2-.3.8-.9 1-1.2.2-.3.4-.2.7-.1l1.9 1c.3.1.5.2.6.3.1.2.1.9-.1 1.5Z"/></svg>
  ),
  wechat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9.5 8c0-2.2 2-3.8 4.6-3.8 3.6 0 6.4 2.4 6.4 5.6 0 2-1.2 3.7-3 4.7l.4 2-2.2-1.1c-.5.1-1 .1-1.6.1M9.5 8c-3.6 0-6.5 2.5-6.5 5.7 0 1.9 1.1 3.6 2.7 4.6l-.4 2.1 2.5-1.2c.7.2 1.5.3 2.3.3.5 0 1-.1 1.5-.1"/><circle cx="9.2" cy="12.5" r="0.9" fill="currentColor"/><circle cx="13.3" cy="12.5" r="0.9" fill="currentColor"/></svg>
  ),
  mail: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5 12 12.5 20.5 6.5"/></svg>
  ),
  globe: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.7 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.7-3.8-9S9.5 5.5 12 3Z"/></svg>
  ),
  pin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/></svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
  ),
  share: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5 15.4 17.5M15.4 6.5 8.6 10.5"/></svg>
  ),
};

export default function LiumingPage() {
  const [lang, setLang] = useState<Lang>("pt");
  const [waOpen, setWaOpen] = useState(false);
  const [toast, setToast] = useState("");
  const t = copy[lang];

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 1700);
    return () => clearTimeout(timer);
  }, [toast]);

  const saveContact = () => {
    const blob = new Blob([VCARD], { type: "text/vcard;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Ming-Liu-meponto.vcf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast(t.saved);
  };

  const shareCard = async () => {
    const data = { title: "Ming Liu · meponto", text: "O ponto de quem entrega — meponto", url: window.location.href };
    if (navigator.share) {
      try { await navigator.share(data); } catch { /* cancelled */ }
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(window.location.href);
      setToast(t.linkCopied);
    }
  };

  const tiles = [
    { icon: ICONS.whatsapp, label: "WhatsApp", value: t.waVal, onClick: () => setWaOpen(true) },
    { icon: ICONS.wechat, label: t.wxLab, value: CONTACT.phone, href: `tel:${CONTACT.phone.replace(/\s/g, "")}` },
    { icon: ICONS.mail, label: t.emailLab, value: CONTACT.email, href: `mailto:${CONTACT.email}` },
    { icon: ICONS.globe, label: t.siteLab, value: "meponto.com", href: CONTACT.site, external: true },
    { icon: ICONS.pin, label: t.addrLab, value: CONTACT.addressText, href: CONTACT.addressUrl, external: true, wide: true },
  ];

  return (
    <main data-i18n-skip className="relative flex min-h-screen items-start justify-center overflow-hidden px-4 py-8 md:items-center md:py-14" style={{ background: "#0b0e14", color: "#fff7ef", fontFamily: "Outfit, Inter, system-ui, sans-serif" }}>
      <style>{`
        .lm ::selection { background:#FFD400; color:#0b0e14; }
        @keyframes lmRise { from { opacity:0; transform:translateY(26px) } to { opacity:1; transform:translateY(0) } }
        @keyframes lmGlow { 0%,100%{opacity:.5} 50%{opacity:.9} }
        .lm-rise { animation: lmRise .8s cubic-bezier(.22,.8,.26,1) both; }
        .lm-rise-2 { animation: lmRise .8s .12s cubic-bezier(.22,.8,.26,1) both; }
        .lm-rise-3 { animation: lmRise .8s .24s cubic-bezier(.22,.8,.26,1) both; }
        .lm-rise-4 { animation: lmRise .8s .36s cubic-bezier(.22,.8,.26,1) both; }
        @media (prefers-reduced-motion: reduce) { .lm * { animation: none !important; transition: none !important; } }
      `}</style>

      {/* ambient glow */}
      <div className="pointer-events-none fixed inset-0" aria-hidden>
        <div className="absolute -top-32 left-1/2 h-96 w-[560px] -translate-x-1/2 rounded-full" style={{ background: "radial-gradient(ellipse, rgba(255,212,0,.14), transparent 70%)", animation: "lmGlow 7s ease-in-out infinite" }} />
        <div className="absolute -bottom-40 left-1/2 h-96 w-[640px] -translate-x-1/2 rounded-full" style={{ background: "radial-gradient(ellipse, rgba(255,212,0,.07), transparent 70%)" }} />
      </div>

      <div className="lm relative w-full max-w-[420px]">
        {/* card with gradient border */}
        <div className="lm-rise rounded-[30px] p-px" style={{ background: "linear-gradient(160deg, rgba(255,212,0,.65), rgba(255,212,0,.12) 38%, rgba(255,255,255,.08) 70%, rgba(255,212,0,.3))" }}>
          <div className="overflow-hidden rounded-[29px]" style={{ background: "#11141f" }}>
            {/* yellow header */}
            <div className="relative px-7 py-7" style={{ background: "#FFD400", color: "#0b0e14" }}>
              {/* language switcher — sliding-thumb pill, header top-right */}
              <div className="absolute right-5 top-5 z-10">
                <div className="relative flex rounded-full p-[3px]" style={{ background: "rgba(11,14,20,.15)", boxShadow: "inset 0 1px 3px rgba(11,14,20,.2)" }}>
                  <span
                    aria-hidden
                    className="absolute left-[3px] top-[3px] h-[calc(100%-6px)] w-8 rounded-full transition-transform duration-300"
                    style={{
                      background: "#0b0e14",
                      transform: `translateX(${(["pt", "zh", "en"] as Lang[]).indexOf(lang) * 32}px)`,
                      transitionTimingFunction: "cubic-bezier(.22,.9,.24,1)",
                      boxShadow: "0 2px 8px rgba(11,14,20,.35)",
                    }}
                  />
                  {(["pt", "zh", "en"] as Lang[]).map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setLang(code)}
                      className="relative z-10 w-8 rounded-full py-[5px] text-center text-[10px] font-black uppercase tracking-wide transition-colors duration-300"
                      style={{ color: lang === code ? "#FFD400" : "rgba(11,14,20,.62)" }}
                    >
                      {code === "zh" ? "中" : code}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <img
                  src="/contact/ming-liu.jpg"
                  alt="Ming Liu"
                  className="h-[76px] w-[76px] rounded-full border-[3px] object-cover"
                  style={{ borderColor: "#0b0e14", boxShadow: "0 4px 14px rgba(11,14,20,.3)" }}
                />
                <div>
                  <div className="text-[32px] font-black italic leading-none tracking-tight">
                    <span>me</span><span style={{ color: "#fff" }}>ponto</span>
                  </div>
                  <div className="mt-1.5 text-[11px] font-bold">O ponto de quem entrega</div>
                </div>
              </div>
              {/* speed lines */}
              <div className="absolute bottom-6 right-6 flex flex-col items-end gap-1.5" aria-hidden>
                <i className="block h-[3.5px] w-8 rounded" style={{ background: "#0b0e14", opacity: 0.85 }} />
                <i className="block h-[3.5px] w-5 rounded" style={{ background: "#0b0e14", opacity: 0.5 }} />
                <i className="block h-[3.5px] w-3 rounded" style={{ background: "#0b0e14", opacity: 0.3 }} />
              </div>
            </div>

            {/* body */}
            <div className="flex flex-col gap-6 px-7 pb-8 pt-6">
              <div className="lm-rise-2">
                <div className="text-[26px] font-black leading-none">{CONTACT.nameZh}</div>
                <div className="mt-2 text-[12px] font-black uppercase tracking-[0.14em]" style={{ color: "#FFD400" }}>{CONTACT.nameEn}</div>
                <div className="mt-1.5 text-[11px] font-bold" style={{ color: "rgba(255,255,255,.55)" }}>{t.role}</div>
              </div>

              <div className="lm-rise-2 border-l-[2.5px] pl-3.5 text-[17px] font-bold italic leading-snug" style={{ borderColor: "#FFD400" }}>
                {t.vision[0]}<span style={{ color: "#FFD400" }}>meponto</span>{t.vision[1]}
              </div>

              {/* action tiles */}
              <div className="lm-rise-3 grid grid-cols-2 gap-2.5">
                {tiles.map((tile) => {
                  const inner = (
                    <>
                      <span className="h-[19px] w-[19px] flex-none" style={{ color: "#FFD400" }}>{tile.icon}</span>
                      <span className="flex min-w-0 flex-col text-left">
                        <span className="text-[8.5px] font-black uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,.45)" }}>{tile.label}</span>
                        <span className="truncate text-[11.5px] font-bold" style={{ color: "rgba(255,255,255,.9)" }}>{tile.value}</span>
                      </span>
                    </>
                  );
                  const cls = `flex items-center gap-2.5 rounded-2xl border px-3.5 py-3 transition-all hover:-translate-y-px hover:border-[#FFD400] active:scale-[0.97]${tile.wide ? " col-span-2" : ""}`;
                  const sty = { borderColor: "rgba(255,255,255,.09)", background: "rgba(255,255,255,.035)" };
                  return tile.href ? (
                    <a key={tile.label} href={tile.href} target={tile.external ? "_blank" : undefined} rel={tile.external ? "noopener noreferrer" : undefined} className={cls} style={sty}>
                      {inner}
                    </a>
                  ) : (
                    <button key={tile.label} type="button" onClick={tile.onClick} className={cls} style={sty}>
                      {inner}
                    </button>
                  );
                })}
              </div>

              {/* save */}
              <button
                type="button"
                onClick={saveContact}
                className="lm-rise-3 flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 text-[14px] font-black transition-transform hover:scale-[1.015] active:scale-[0.98]"
                style={{ background: "#FFD400", color: "#0b0e14", boxShadow: "0 10px 30px -10px rgba(255,212,0,.45)" }}
              >
                <span className="h-[18px] w-[18px]">{ICONS.plus}</span>
                {t.save}
              </button>

              {/* QR duo */}
              <div className="lm-rise-4 flex justify-center gap-4">
                {[
                  { src: "/contact/wechat-qr.png", title: "WeChat · 微信", cap: t.wcCap },
                  { src: "/contact/vcard-qr.png", title: "vCard", cap: t.vcCap },
                ].map((qr) => (
                  <div key={qr.title} className="flex max-w-[160px] flex-1 flex-col items-center gap-2">
                    <div className="w-full rounded-2xl bg-white p-2" style={{ boxShadow: "0 6px 20px -8px rgba(0,0,0,.5)" }}>
                      <img src={qr.src} alt={qr.title} className="aspect-square w-full object-contain" />
                    </div>
                    <div className="text-center leading-tight">
                      <div className="text-[10px] font-black" style={{ color: "#fff" }}>{qr.title}</div>
                      <div className="mt-0.5 text-[9px] font-bold" style={{ color: "rgba(255,255,255,.5)" }}>{qr.cap}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* share */}
              <div className="lm-rise-4 flex justify-center">
                <button type="button" onClick={shareCard} className="flex items-center gap-2 px-3 py-1.5 text-[12.5px] font-black transition-colors hover:opacity-80" style={{ color: "#FFD400" }}>
                  <span className="h-[15px] w-[15px]">{ICONS.share}</span>
                  {t.share}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="lm-rise-4 pt-5 text-center text-[9.5px] font-bold uppercase tracking-[0.2em]" style={{ color: "rgba(255,255,255,.3)" }}>
          meponto · O ponto de quem entrega
        </div>
      </div>

      {/* WhatsApp modal */}
      {waOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(8,9,18,.74)", backdropFilter: "blur(4px)" }}
          onClick={(event) => { if (event.target === event.currentTarget) setWaOpen(false); }}
        >
          <div className="relative w-full max-w-[320px] rounded-3xl bg-white p-6 text-center" style={{ color: "#0b0e14" }}>
            <button
              type="button"
              onClick={() => setWaOpen(false)}
              className="absolute right-3.5 top-3 grid h-7 w-7 place-items-center rounded-full text-[16px] leading-none"
              style={{ background: "#f0f0f3", color: "#6b6f80" }}
              aria-label="Close"
            >
              ×
            </button>
            <h3 className="text-[17px] font-black">WhatsApp</h3>
            <p className="mt-0.5 text-[11.5px] font-medium" style={{ color: "#6b6f80" }}>{t.waTip}</p>
            <div className="mx-auto mt-4 w-[210px]">
              <img src="/contact/whatsapp-qr.png" alt="WhatsApp QR" className="aspect-square w-full object-contain" />
            </div>
            <a
              href={CONTACT.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex w-full items-center justify-center rounded-xl py-3 text-[13px] font-black"
              style={{ background: "#0b0e14", color: "#fff" }}
            >
              {t.waOpen}
            </a>
          </div>
        </div>
      )}

      {/* toast */}
      <div
        className="fixed bottom-8 left-1/2 z-[60] -translate-x-1/2 rounded-xl px-4.5 py-3 text-[13px] font-black transition-all duration-200"
        style={{ background: "#fff", color: "#0b0e14", boxShadow: "0 8px 24px rgba(0,0,0,.3)", opacity: toast ? 1 : 0, transform: `translateX(-50%) translateY(${toast ? 0 : 16}px)`, pointerEvents: "none", padding: "11px 18px" }}
      >
        {toast}
      </div>
    </main>
  );
}
