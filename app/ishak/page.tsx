"use client";

import BusinessCard, { type EcardPerson } from "../components/business-card";

/** /ishak — Ishak Ma's digital business card. */

const PHONE = "+86 17888843533";

const PERSON: EcardPerson = {
  nameZh: "马强",
  nameEn: "Ishak Ma",
  role: { pt: "Responsável Comercial · meponto", zh: "商业化负责人 · meponto", en: "Head of Commercial · meponto" },
  email: "ishak.ma@meponto.com",
  phone: PHONE,
  whatsappUrl: "https://wa.me/8617888843533",
  avatar: "/contact/ishak-ma.jpg",
  wechatQr: "/contact/ishak-wechat-qr.png",
  whatsappQr: "/contact/ishak-whatsapp-qr.png",
  vcardQr: "/contact/ishak-vcard-qr.png",
  vcard: [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "N:Ma;Ishak;;;",
    "FN:Ishak Ma",
    "ORG:meponto",
    "TITLE:Responsável Comercial",
    `TEL;TYPE=CELL:${PHONE.replace(/\s/g, "")}`,
    "EMAIL;TYPE=WORK:ishak.ma@meponto.com",
    "URL:https://www.meponto.com/",
    "ADR;TYPE=WORK:;;Av. Paulista, 2537 - Bela Vista;São Paulo;SP;01311-300;Brasil",
    "NOTE:O ponto de quem entrega",
    "END:VCARD",
  ].join("\r\n"),
  vcfFileName: "Ishak-Ma-meponto.vcf",
};

export default function IshakPage() {
  return <BusinessCard person={PERSON} />;
}
