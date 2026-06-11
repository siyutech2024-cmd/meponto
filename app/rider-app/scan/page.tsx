"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, QrCode, ScanLine } from "lucide-react";

/**
 * In-app QR scanner (rider): point the camera at a partner QR (validates the
 * partner → partner earns points) or at an invite QR. Uses the native
 * BarcodeDetector when available; falls back to manual code entry.
 */

/** Map decoded QR text to an in-app route. */
function resolveQr(text: string): string | null {
  const raw = text.trim();
  try {
    const url = new URL(raw);
    const partner = url.searchParams.get("partner");
    const ref = url.searchParams.get("ref");
    if (partner) return `/scan?partner=${encodeURIComponent(partner)}`;
    if (ref) return `/scan?ref=${encodeURIComponent(ref)}`;
    return null;
  } catch {
    if (/^crm-/i.test(raw)) return `/scan?partner=${encodeURIComponent(raw)}`;
    if (/^r-/i.test(raw)) return `/scan?ref=${encodeURIComponent(raw)}`;
    return null;
  }
}

export default function RiderScanPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [phase, setPhase] = useState<"starting" | "scanning" | "unsupported" | "denied">("starting");
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPhase("unsupported");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      } catch {
        setPhase("denied");
        return;
      }
      if (stop) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => undefined);

      const DetectorCtor = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
      if (!DetectorCtor) {
        setPhase("unsupported");
        return;
      }
      const detector = new DetectorCtor({ formats: ["qr_code"] });
      setPhase("scanning");
      timer = setInterval(async () => {
        if (stop || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const value = codes[0]?.rawValue;
          if (value) {
            const target = resolveQr(value);
            if (target) {
              stop = true;
              if (timer) clearInterval(timer);
              window.location.href = target;
            } else {
              setError("QR não reconhecido — use um QR MePonto (parceiro ou convite).");
            }
          }
        } catch {
          /* keep scanning */
        }
      }, 600);
    }

    void start();
    return () => {
      stop = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function submitManual() {
    const target = resolveQr(manual);
    if (!target) {
      setError("Código inválido. Exemplos: crm-001 (parceiro) ou r-1002 (convite).");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="min-h-screen bg-[#101010]" style={{ fontFamily: "Poppins, Inter, system-ui, sans-serif" }}>
      <div className="mx-auto min-h-screen w-full max-w-[430px] bg-[#f3f2ee] pb-10">
        <header className="flex items-center gap-3 px-4 pb-3 pt-4">
          <Link href="/" className="grid h-10 w-10 place-items-center rounded-[8px] bg-white text-[#050505] shadow-[0_8px_20px_rgba(0,0,0,0.08)]"><ArrowLeft size={18} /></Link>
          <h1 className="flex items-center gap-2 text-lg font-black text-[#050505]"><ScanLine size={18} className="text-[#ff7a00]" /> Escanear QR</h1>
        </header>

        <section className="px-4">
          <div className="overflow-hidden rounded-[8px] bg-[#050505] shadow-[0_18px_42px_rgba(0,0,0,0.22)]">
            <div className="relative aspect-square w-full">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
              <div className="pointer-events-none absolute inset-10 rounded-[8px] border-2 border-[#ff7a00]/80" />
              {phase !== "scanning" && (
                <div className="absolute inset-0 grid place-items-center bg-black/70 px-6 text-center text-sm font-bold text-white">
                  {phase === "starting" && "Abrindo a câmera..."}
                  {phase === "denied" && "Permita o acesso à câmera nas configurações do navegador, ou digite o código abaixo."}
                  {phase === "unsupported" && "Câmera/leitor não disponível neste aparelho — digite o código abaixo."}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 p-3 text-xs font-bold text-white/65">
              <Camera size={14} className="shrink-0 text-[#ff7a00]" />
              Aponte para o QR do parceiro (ele ganha pontos) ou de um convite.
            </div>
          </div>
        </section>

        {error && <div className="mx-4 mt-3 rounded-[8px] bg-[#ffe5e3] px-3 py-2 text-xs font-black text-[#e53935]">{error}</div>}

        <section className="px-4 pt-4">
          <div className="rounded-[8px] bg-white p-4 shadow-[0_12px_26px_rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-2 text-sm font-black text-[#050505]"><QrCode size={15} className="text-[#ff7a00]" /> Ou digite o código</div>
            <div className="mt-2 flex gap-2">
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="ex.: crm-001"
                className="h-11 min-w-0 flex-1 rounded-[8px] border border-[#e3e1da] bg-[#f3f2ee] px-3 text-sm font-bold text-[#050505] outline-none focus:border-[#ff7a00]"
              />
              <button type="button" onClick={submitManual} className="h-11 shrink-0 rounded-[8px] bg-[#ff7a00] px-4 text-sm font-black text-[#050505]">OK</button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
