"use client";

import BusinessCard, { type EcardPerson } from "../components/business-card";

/** /liuming — Ming Liu's digital business card. */

const PHONE = "+86 18686514086";

const PERSON: EcardPerson = {
  nameZh: "刘鸣",
  nameEn: "Ming Liu",
  role: { pt: "Fundador · meponto", zh: "创始人 · meponto", en: "Founder · meponto" },
  email: "ming.liu@meponto.com",
  phone: PHONE,
  whatsappUrl: "https://wa.me/qr/X664AQ52MOPHL1",
  avatar: "/contact/ming-liu.jpg",
  wechatQr: "/contact/wechat-qr.png",
  whatsappQr: "/contact/whatsapp-qr.png",
  vcardQr: "/contact/vcard-qr.png",
  vcard: [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "N:Liu;Ming;;;",
    "FN:Ming Liu",
    "ORG:meponto",
    "TITLE:Fundador",
    `TEL;TYPE=CELL:${PHONE.replace(/\s/g, "")}`,
    "EMAIL;TYPE=WORK:ming.liu@meponto.com",
    "URL:https://www.meponto.com/",
    "ADR;TYPE=WORK:;;Av. Paulista, 2537 - Bela Vista;São Paulo;SP;01311-300;Brasil",
    "NOTE:O ponto de quem entrega",
    "END:VCARD",
  ].join("\r\n"),
  vcfFileName: "Ming-Liu-meponto.vcf",
};

export default function LiumingPage() {
  return <BusinessCard person={PERSON} />;
}
