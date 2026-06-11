"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Bike, Building2, CheckCircle2, Clock4, Coins, Headset, MapPinned, ShieldCheck, Store, Users, Warehouse } from "lucide-react";

type Lang = "pt" | "zh" | "en";

const copy = {
  pt: {
    nav: { rider: "Entregadores", franchise: "Franquia", contact: "Contato" },
    hero: {
      eyebrow: "Conectar · Apoiar · Entregar",
      title: "A rede de pontos que profissionaliza a última milha no Brasil",
      subtitle:
        "Pontos de apoio físicos, líderes locais, escala transparente e pontos que viram benefícios reais. Estamos recrutando entregadores e franqueados.",
      ctaFranchise: "Quero ser franqueado",
      ctaRider: "Quero ser entregador",
      stats: [
        { value: "São Paulo", label: "Operação em expansão" },
        { value: "24/7", label: "Operação dia e noite" },
        { value: "100%", label: "Escala transparente no app" },
        { value: "3 idiomas", label: "PT · EN · 中文" },
      ],
    },
    rider: {
      eyebrow: "Recrutamento de entregadores",
      title: "Mais que corridas: estrutura, pontos e respeito",
      bullets: [
        "Ponto de apoio físico com líder, água, banheiro e segurança",
        "Escala semanal transparente direto no app",
        "Pontos por entrega trocáveis em produtos e serviços",
        "Descontos reais em oficinas e postos parceiros",
        "Cobertura noturna organizada com adicional",
      ],
      cta: "Acessar o app do entregador",
      cards: [
        { icon: "map", title: "Ponto de apoio", text: "Base física no seu bairro" },
        { icon: "clock", title: "Escala semanal", text: "Você escolhe seus turnos" },
        { icon: "coins", title: "Pontos", text: "Cada entrega vira benefício" },
        { icon: "shield", title: "Segurança", text: "Líder e rede de apoio 24/7" },
      ],
    },
    franchise: {
      eyebrow: "Recrutamento de franqueados",
      title: "Opere um território com um sistema completo",
      bullets: [
        "Modelo validado: receita por ponto e por serviços",
        "Sistema completo de operação, finanças, escala e auditoria",
        "Treinamento, SOPs e suporte da rede MePonto",
        "Simulador de lucro por cenário incluído",
        "Território exclusivo com rede de entregadores ativa",
      ],
      cta: "Receber proposta de franquia",
    },
    form: {
      title: "Quero ser franqueado",
      subtitle: "Deixe seus dados — resposta em até 1 dia útil.",
      name: "Nome completo",
      phone: "WhatsApp / telefone",
      email: "E-mail (opcional)",
      city: "Cidade",
      message: "Conte rapidamente seu interesse",
      submit: "Enviar",
      sending: "Enviando...",
      success: "Recebido! Nossa equipe vai falar com você em breve.",
      error: "Não foi possível enviar. Tente novamente.",
      required: "Preencha nome e telefone.",
    },
    footer: {
      contact: "Contato",
      rights: "MePonto · Conectar · Apoiar · Entregar",
      systems: "Acesso aos sistemas",
      support: "Atendimento",
      supportText: "Entregadores e franqueados: abra um chamado direto no seu app/painel — resposta da central.",
      links: [
        { label: "App do Entregador", href: "https://app.meponto.com" },
        { label: "Painel da Franquia", href: "https://franchise.meponto.com" },
        { label: "Painel da Estação", href: "https://ponto.meponto.com" },
        { label: "PontoSys (Matriz)", href: "https://sys.meponto.com" },
      ],
      privacy: "Política de privacidade",
    },
  },
  zh: {
    nav: { rider: "骑手招募", franchise: "加盟招募", contact: "联系我们" },
    hero: {
      eyebrow: "Conectar · Apoiar · Entregar",
      title: "让巴西末端配送专业化的站点网络",
      subtitle: "实体站点、本地站长、透明排班、积分变真实福利。我们正在招募骑手与加盟商。",
      ctaFranchise: "我要加盟",
      ctaRider: "我要成为骑手",
      stats: [
        { value: "圣保罗", label: "运营持续扩张" },
        { value: "24/7", label: "日夜运营" },
        { value: "100%", label: "App 内透明排班" },
        { value: "3 种语言", label: "PT · EN · 中文" },
      ],
    },
    rider: {
      eyebrow: "骑手招募",
      title: "不只是接单：有据点、有积分、有尊重",
      bullets: [
        "实体站点：站长、饮水、卫生间与安全保障",
        "App 内透明的每周排班",
        "每单积分，可兑换商品与服务",
        "合作维修店、加油站真实折扣",
        "夜班有组织、有补贴",
      ],
      cta: "进入骑手 App",
      cards: [
        { icon: "map", title: "支持站点", text: "你所在街区的实体基地" },
        { icon: "clock", title: "每周排班", text: "自己选择班次" },
        { icon: "coins", title: "积分", text: "每一单都变成福利" },
        { icon: "shield", title: "安全", text: "站长与 24/7 支持网络" },
      ],
    },
    franchise: {
      eyebrow: "加盟商招募",
      title: "用一套完整系统运营一个区域",
      bullets: [
        "经过验证的模式：站点收入 + 服务收入",
        "运营、财务、排班、审计系统完备",
        "MePonto 网络提供培训、SOP 与支持",
        "内置多场景利润模拟器",
        "独家区域 + 活跃骑手网络",
      ],
      cta: "获取加盟方案",
    },
    form: {
      title: "申请加盟",
      subtitle: "留下信息，1 个工作日内回复。",
      name: "姓名",
      phone: "WhatsApp / 电话",
      email: "邮箱（选填）",
      city: "城市",
      message: "简单说明你的需求",
      submit: "提交",
      sending: "提交中...",
      success: "已收到！我们会尽快与你联系。",
      error: "提交失败，请重试。",
      required: "请填写姓名和电话。",
    },
    footer: {
      contact: "联系方式",
      rights: "MePonto · Conectar · Apoiar · Entregar",
      systems: "系统入口",
      support: "客服支持",
      supportText: "骑手/加盟商：在各自 App/后台直接提交工单，总部统一处理回复。",
      links: [
        { label: "骑手 App", href: "https://app.meponto.com" },
        { label: "加盟商后台", href: "https://franchise.meponto.com" },
        { label: "站点后台", href: "https://ponto.meponto.com" },
        { label: "PontoSys 主后台", href: "https://sys.meponto.com" },
      ],
      privacy: "隐私政策",
    },
  },
  en: {
    nav: { rider: "Riders", franchise: "Franchise", contact: "Contact" },
    hero: {
      eyebrow: "Conectar · Apoiar · Entregar",
      title: "The support-point network professionalizing last-mile delivery in Brazil",
      subtitle:
        "Physical support points, local leaders, transparent shifts and points that become real benefits. We are recruiting riders and franchisees.",
      ctaFranchise: "Become a franchisee",
      ctaRider: "Become a rider",
      stats: [
        { value: "São Paulo", label: "Expanding operation" },
        { value: "24/7", label: "Day and night operation" },
        { value: "100%", label: "Transparent shifts in-app" },
        { value: "3 languages", label: "PT · EN · 中文" },
      ],
    },
    rider: {
      eyebrow: "Rider recruitment",
      title: "More than gigs: structure, points and respect",
      bullets: [
        "Physical support point with leader, water, restroom and safety",
        "Transparent weekly shifts in the app",
        "Points per delivery, redeemable for products and services",
        "Real discounts at partner shops and stations",
        "Organized night coverage with extra pay",
      ],
      cta: "Open the rider app",
      cards: [
        { icon: "map", title: "Support point", text: "A physical base in your area" },
        { icon: "clock", title: "Weekly shifts", text: "You pick your slots" },
        { icon: "coins", title: "Points", text: "Every delivery becomes a benefit" },
        { icon: "shield", title: "Safety", text: "Leader and 24/7 support network" },
      ],
    },
    franchise: {
      eyebrow: "Franchisee recruitment",
      title: "Run a territory with a complete system",
      bullets: [
        "Validated model: revenue per point and per service",
        "Full operations, finance, shifts and audit stack",
        "Training, SOPs and support from the MePonto network",
        "Scenario-based profit simulator included",
        "Exclusive territory with an active rider network",
      ],
      cta: "Get the franchise deck",
    },
    form: {
      title: "Become a franchisee",
      subtitle: "Leave your details — reply within 1 business day.",
      name: "Full name",
      phone: "WhatsApp / phone",
      email: "E-mail (optional)",
      city: "City",
      message: "Briefly describe your interest",
      submit: "Send",
      sending: "Sending...",
      success: "Received! Our team will contact you soon.",
      error: "Could not send. Please try again.",
      required: "Name and phone are required.",
    },
    footer: {
      contact: "Contact",
      rights: "MePonto · Conectar · Apoiar · Entregar",
      systems: "System access",
      support: "Support",
      supportText: "Riders and franchisees: open a ticket inside your app/panel — HQ replies centrally.",
      links: [
        { label: "Rider App", href: "https://app.meponto.com" },
        { label: "Franchise Panel", href: "https://franchise.meponto.com" },
        { label: "Station Panel", href: "https://ponto.meponto.com" },
        { label: "PontoSys (HQ)", href: "https://sys.meponto.com" },
      ],
      privacy: "Privacy policy",
    },
  },
} as const;

const cardIcons = { map: MapPinned, clock: Clock4, coins: Coins, shield: ShieldCheck } as const;
const systemIcons = [Bike, Store, Warehouse, Building2];


/**
 * Active Theory-style ambient particle field: drifting points connected by
 * lines, gently attracted to the cursor. Plain canvas 2D — zero dependencies.
 */
function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let raf = 0;
    const mouse = { x: -9999, y: -9999 };
    const DPR = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * DPR;
      canvas.height = height * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();

    const COUNT = Math.min(110, Math.floor((width * height) / 16000));
    const particles = Array.from({ length: COUNT }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.6 + 0.6,
      gold: Math.random() < 0.35,
    }));

    const onMove = (event: MouseEvent) => {
      mouse.x = event.clientX;
      mouse.y = event.clientY;
    };
    const onLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
    };

    const tick = () => {
      ctx.clearRect(0, 0, width, height);
      for (const particle of particles) {
        // Gentle cursor attraction, Active Theory style.
        const dx = mouse.x - particle.x;
        const dy = mouse.y - particle.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 220 && dist > 0.001) {
          particle.vx += (dx / dist) * 0.012;
          particle.vy += (dy / dist) * 0.012;
        }
        particle.vx *= 0.985;
        particle.vy *= 0.985;
        particle.x += particle.vx;
        particle.y += particle.vy;
        if (particle.x < -20) particle.x = width + 20;
        if (particle.x > width + 20) particle.x = -20;
        if (particle.y < -20) particle.y = height + 20;
        if (particle.y > height + 20) particle.y = -20;

        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
        ctx.fillStyle = particle.gold ? "rgba(255,216,77,0.55)" : "rgba(120,170,255,0.45)";
        ctx.fill();
      }
      // Constellation lines between close particles.
      for (let i = 0; i < particles.length; i += 1) {
        for (let j = i + 1; j < particles.length; j += 1) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 110 * 110) {
            const alpha = 0.14 * (1 - d2 / (110 * 110));
            ctx.strokeStyle = `rgba(140,180,255,${alpha.toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0" aria-hidden="true" />;
}

/** Per-card 3D tilt with a moving glare highlight — pure CSS transforms. */
function Tilt3D({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className={`relative will-change-transform ${className}`}
      style={{ transformStyle: "preserve-3d", transition: "transform .18s ease-out", ...style }}
      onMouseMove={(event) => {
        const node = ref.current;
        if (!node) return;
        const rect = node.getBoundingClientRect();
        const px = (event.clientX - rect.left) / rect.width - 0.5;
        const py = (event.clientY - rect.top) / rect.height - 0.5;
        node.style.transform = `perspective(800px) rotateY(${(px * 14).toFixed(2)}deg) rotateX(${(-py * 14).toFixed(2)}deg) translateZ(10px)`;
        const glare = glareRef.current;
        if (glare) {
          glare.style.opacity = "1";
          glare.style.background = `radial-gradient(280px circle at ${((px + 0.5) * 100).toFixed(1)}% ${((py + 0.5) * 100).toFixed(1)}%, rgba(255,255,255,0.16), transparent 60%)`;
        }
      }}
      onMouseLeave={() => {
        const node = ref.current;
        if (node) node.style.transform = "perspective(800px) rotateY(0deg) rotateX(0deg) translateZ(0)";
        if (glareRef.current) glareRef.current.style.opacity = "0";
      }}
    >
      {children}
      <div ref={glareRef} className="pointer-events-none absolute inset-0 rounded-2xl opacity-0" style={{ transition: "opacity .25s ease" }} aria-hidden="true" />
    </div>
  );
}


/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Full WebGL scene (Active Theory style): an undulating point-cloud "city
 * grid", glowing delivery arcs with travelling light pulses, and station
 * beacons. Three.js r128 is loaded from CDN at runtime — zero build deps.
 * Falls back to the 2D particle field on mobile or when WebGL fails.
 */
function Scene3D() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.innerWidth < 768) {
      setFallback(true);
      return;
    }

    let disposed = false;
    let cleanup: (() => void) | undefined;

    const boot = (THREE: any) => {
      const mount = mountRef.current;
      if (!mount || disposed) return;
      let renderer: any;
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
      } catch {
        setFallback(true);
        return;
      }
      const DPR = Math.min(window.devicePixelRatio || 1, 1.75);
      renderer.setPixelRatio(DPR);
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.domElement.style.position = "fixed";
      renderer.domElement.style.inset = "0";
      renderer.domElement.style.zIndex = "0";
      renderer.domElement.style.pointerEvents = "none";
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x070a14, 0.028);
      const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 200);
      camera.position.set(0, 5.2, 20);

      // --- 1. Undulating point-cloud terrain (the "city grid") ---
      const COLS = 110;
      const ROWS = 56;
      const SPACING = 0.62;
      const count = COLS * ROWS;
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const gold = new THREE.Color(0xffd84d);
      const blue = new THREE.Color(0x3f6fff);
      let k = 0;
      for (let i = 0; i < COLS; i += 1) {
        for (let j = 0; j < ROWS; j += 1) {
          positions[k * 3] = (i - COLS / 2) * SPACING;
          positions[k * 3 + 1] = 0;
          positions[k * 3 + 2] = (j - ROWS / 2) * SPACING;
          const mix = Math.random() * 0.25 + (j / ROWS) * 0.4;
          const color = blue.clone().lerp(gold, mix);
          colors[k * 3] = color.r;
          colors[k * 3 + 1] = color.g;
          colors[k * 3 + 2] = color.b;
          k += 1;
        }
      }
      const gridGeo = new THREE.BufferGeometry();
      gridGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      gridGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const gridMat = new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false });
      const grid = new THREE.Points(gridGeo, gridMat);
      grid.position.y = -3.4;
      scene.add(grid);

      // --- 2. Station beacons (light pillars) ---
      const beaconGroup = new THREE.Group();
      const beaconSpots: Array<[number, number]> = [[-12, -6], [-5, -10], [3, -7], [10, -11], [-9, -14], [7, -4], [14, -8], [0, -13]];
      for (const [x, z] of beaconSpots) {
        const height = 2.2 + Math.random() * 2.4;
        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.16, height, 8, 1, true),
          new THREE.MeshBasicMaterial({ color: 0xffc62e, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
        );
        pillar.position.set(x, -3.4 + height / 2, z);
        beaconGroup.add(pillar);
        const base = new THREE.Mesh(
          new THREE.SphereGeometry(0.16, 12, 12),
          new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.95 }),
        );
        base.position.set(x, -3.32, z);
        beaconGroup.add(base);
      }
      scene.add(beaconGroup);

      // --- 3. Delivery arcs with travelling pulses ---
      const arcGroup = new THREE.Group();
      const pulses: Array<{ sprite: any; curve: any; t: number; speed: number }> = [];
      const makePulseTexture = () => {
        const cv = document.createElement("canvas");
        cv.width = 64;
        cv.height = 64;
        const c = cv.getContext("2d")!;
        const grad = c.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, "rgba(255,235,160,1)");
        grad.addColorStop(0.35, "rgba(255,200,60,0.85)");
        grad.addColorStop(1, "rgba(255,200,60,0)");
        c.fillStyle = grad;
        c.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(cv);
      };
      const pulseTexture = makePulseTexture();
      for (let a = 0; a < 7; a += 1) {
        const from = beaconSpots[a % beaconSpots.length];
        const to = beaconSpots[(a + 3) % beaconSpots.length];
        const start = new THREE.Vector3(from[0], -3.2, from[1]);
        const end = new THREE.Vector3(to[0], -3.2, to[1]);
        const mid = start.clone().add(end).multiplyScalar(0.5);
        mid.y += 2.2 + Math.random() * 2.6;
        const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
        const arc = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 48, 0.015, 6, false),
          new THREE.MeshBasicMaterial({ color: 0x69a8ff, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        arcGroup.add(arc);
        for (let pIdx = 0; pIdx < 2; pIdx += 1) {
          const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: pulseTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
          sprite.scale.set(0.55, 0.55, 1);
          arcGroup.add(sprite);
          pulses.push({ sprite, curve, t: Math.random(), speed: 0.0016 + Math.random() * 0.0022 });
        }
      }
      scene.add(arcGroup);

      // --- 4. Floating dust particles ---
      const DUST = 260;
      const dustPos = new Float32Array(DUST * 3);
      for (let i = 0; i < DUST; i += 1) {
        dustPos[i * 3] = (Math.random() - 0.5) * 46;
        dustPos[i * 3 + 1] = Math.random() * 14 - 3;
        dustPos[i * 3 + 2] = (Math.random() - 0.5) * 30;
      }
      const dustGeo = new THREE.BufferGeometry();
      dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
      const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0x8fb4ff, size: 0.05, transparent: true, opacity: 0.5, depthWrite: false }));
      scene.add(dust);

      // --- Interaction & loop ---
      const mouse = { x: 0, y: 0 };
      const onMove = (event: MouseEvent) => {
        mouse.x = (event.clientX / window.innerWidth - 0.5) * 2;
        mouse.y = (event.clientY / window.innerHeight - 0.5) * 2;
      };
      const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("resize", onResize);

      let raf = 0;
      const clock = new THREE.Clock();
      const pos = gridGeo.attributes.position;
      const animate = () => {
        const t = clock.getElapsedTime();
        // Terrain waves.
        for (let i = 0; i < count; i += 1) {
          const x = pos.array[i * 3];
          const z = pos.array[i * 3 + 2];
          pos.array[i * 3 + 1] = Math.sin(x * 0.32 + t * 0.9) * 0.45 + Math.cos(z * 0.38 + t * 0.7) * 0.4;
        }
        pos.needsUpdate = true;
        // Travelling pulses.
        for (const pulse of pulses) {
          pulse.t = (pulse.t + pulse.speed) % 1;
          const point = pulse.curve.getPoint(pulse.t);
          pulse.sprite.position.copy(point);
        }
        // Camera drift toward the cursor + slow orbital sway.
        camera.position.x += (mouse.x * 3.2 - camera.position.x) * 0.04;
        camera.position.y += (5.2 - mouse.y * 1.6 - camera.position.y) * 0.04;
        camera.lookAt(0, -0.5, 0);
        dust.rotation.y = t * 0.012;
        renderer.render(scene, camera);
        raf = requestAnimationFrame(animate);
      };
      raf = requestAnimationFrame(animate);

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("resize", onResize);
        renderer.dispose();
        gridGeo.dispose();
        dustGeo.dispose();
        pulseTexture.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      };
    };

    const existing = (window as any).THREE;
    if (existing) {
      boot(existing);
    } else {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
      script.async = true;
      script.onload = () => boot((window as any).THREE);
      script.onerror = () => setFallback(true);
      document.head.appendChild(script);
    }

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  if (fallback) return <ParticleField />;
  return <div ref={mountRef} aria-hidden="true" />;
}

export default function MarketingHomePage() {
  const [lang, setLang] = useState<Lang>("pt");
  const [form, setForm] = useState({ name: "", phone: "", email: "", city: "", message: "" });
  const [state, setState] = useState<"idle" | "sending" | "ok" | "fail" | "invalid">("idle");
  const rootRef = useRef<HTMLElement>(null);
  const t = copy[lang];

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.querySelectorAll(".rv").forEach((el) => el.classList.add("rv-in"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("rv-in");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.18, rootMargin: "0px 0px -40px 0px" },
    );
    root.querySelectorAll(".rv").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [lang]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      setState("invalid");
      return;
    }
    setState("sending");
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "franchise", language: lang, ...form }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setState("ok");
      setForm({ name: "", phone: "", email: "", city: "", message: "" });
    } catch {
      setState("fail");
    }
  }

  const input =
    "h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-bold text-white outline-none backdrop-blur placeholder:text-white/40 focus:border-[#ffd84d]/60 focus:bg-white/10";
  const glass = "rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl";
  const gradBtn =
    "inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-[#ffd84d] to-[#ff9d2e] px-6 text-sm font-black uppercase text-[#1a1405] shadow-[0_8px_30px_rgba(255,196,46,0.35)] transition-transform hover:scale-[1.04]";
  const ghostBtn =
    "inline-flex h-12 items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-6 text-sm font-black uppercase text-white backdrop-blur transition-all hover:scale-[1.04] hover:border-[#4dd9ff]/60 hover:text-[#4dd9ff]";

  return (
    <main
      ref={rootRef}
      className="min-h-screen overflow-x-clip text-white"
      style={{
        background:
          "radial-gradient(900px 540px at 12% -6%, rgba(98,54,255,0.32), transparent 55%), radial-gradient(820px 520px at 92% 4%, rgba(13,118,255,0.26), transparent 55%), radial-gradient(700px 500px at 50% 110%, rgba(255,170,40,0.14), transparent 60%), linear-gradient(180deg, #070a14 0%, #0a0e1d 50%, #070a14 100%)",
      }}
    >
      <Scene3D />
      <style>{`
        .rv { opacity: 0; transform: perspective(900px) rotateX(10deg) translateY(34px); transition: opacity .7s ease, transform .7s cubic-bezier(.16,1,.3,1); transition-delay: var(--d, 0ms); will-change: opacity, transform; }
        .rv-in { opacity: 1; transform: perspective(900px) rotateX(0deg) translateY(0); }
        @keyframes mp-float { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(-40px,30px,0) scale(1.12); } }
        @keyframes mp-float2 { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(50px,-24px,0) scale(.92); } }
        .mp-glow { animation: mp-float 14s ease-in-out infinite; }
        .mp-glow2 { animation: mp-float2 18s ease-in-out infinite; }
        .mp-grid { background-image: linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px); background-size: 44px 44px; mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 78%); }
        .mp-gtext { background: linear-gradient(92deg, #ffffff 0%, #ffd84d 45%, #4dd9ff 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
        @media (prefers-reduced-motion: reduce) { .rv { transition: none; } .mp-glow, .mp-glow2 { animation: none; } }
      `}</style>

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[rgba(7,10,20,0.7)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/meponto-logo.png" alt="MePonto" translate="no" className="h-10 w-auto" />
          <nav className="hidden items-center gap-6 text-xs font-black uppercase tracking-wide text-white/60 md:flex">
            <a href="#rider" className="transition-colors hover:text-[#ffd84d]">{t.nav.rider}</a>
            <a href="#franchise" className="transition-colors hover:text-[#ffd84d]">{t.nav.franchise}</a>
            <a href="#contact" className="transition-colors hover:text-[#ffd84d]">{t.nav.contact}</a>
          </nav>
          <div translate="no" className="flex overflow-hidden rounded-xl border border-white/15 bg-white/5 backdrop-blur">
            {(["pt", "en", "zh"] as Lang[]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                className={`px-2.5 py-1.5 text-[11px] font-black uppercase transition-colors ${lang === code ? "bg-gradient-to-r from-[#ffd84d] to-[#ff9d2e] text-[#1a1405]" : "text-white/50 hover:text-white"}`}
              >
                {code === "zh" ? "中文" : code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 overflow-hidden">
        <div className="mp-grid pointer-events-none absolute inset-0" />
        <div className="mp-glow pointer-events-none absolute -top-36 right-[-12%] h-[460px] w-[460px] rounded-full bg-[rgba(120,80,255,0.28)] blur-3xl" />
        <div className="mp-glow2 pointer-events-none absolute bottom-[-30%] left-[-10%] h-96 w-96 rounded-full bg-[rgba(40,180,255,0.22)] blur-3xl" />
        <div
          className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-28"
          style={{ perspective: "1400px" }}
          onMouseMove={(event) => {
            const target = event.currentTarget.querySelector<HTMLElement>("[data-hero-stage]");
            if (!target) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const px = (event.clientX - rect.left) / rect.width - 0.5;
            const py = (event.clientY - rect.top) / rect.height - 0.5;
            target.style.transform = `rotateY(${(px * 5).toFixed(2)}deg) rotateX(${(-py * 5).toFixed(2)}deg)`;
          }}
          onMouseLeave={(event) => {
            const target = event.currentTarget.querySelector<HTMLElement>("[data-hero-stage]");
            if (target) target.style.transform = "rotateY(0deg) rotateX(0deg)";
          }}
        >
          <div data-hero-stage style={{ transformStyle: "preserve-3d", transition: "transform .25s ease-out" }}>
          <div className="rv inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-[11px] font-black uppercase tracking-widest text-[#ffd84d] backdrop-blur">
            <ShieldCheck size={14} /> <span translate="no">{t.hero.eyebrow}</span>
          </div>
          <h1 className="mp-gtext rv mt-6 max-w-4xl text-4xl font-black leading-tight md:text-6xl" style={{ ["--d" as never]: "90ms", transform: "translateZ(70px)" }}>
            {t.hero.title}
          </h1>
          <p className="rv mt-5 max-w-2xl text-base font-bold leading-7 text-white/70 md:text-lg" style={{ ["--d" as never]: "180ms", transform: "translateZ(40px)" }}>
            {t.hero.subtitle}
          </p>

          <div className="rv mt-8 flex flex-wrap gap-3" style={{ ["--d" as never]: "260ms", transform: "translateZ(55px)" }}>
            <a href="#contact" className={gradBtn}>
              <Building2 size={18} /> {t.hero.ctaFranchise} <ArrowRight size={16} />
            </a>
            <a href="https://app.meponto.com" className={ghostBtn}>
              <Bike size={18} /> {t.hero.ctaRider}
            </a>
          </div>

          <div className="mt-14 grid grid-cols-2 gap-3 md:grid-cols-4" style={{ transform: "translateZ(50px)" }}>
            {t.hero.stats.map((stat, index) => (
              <Tilt3D key={stat.label} className="rv" style={{ ["--d" as never]: `${320 + index * 90}ms` }}>
                <div className={`${glass} p-4`}>
                  <div className="text-xl font-black text-[#ffd84d]">{stat.value}</div>
                  <div className="mt-1 text-xs font-bold text-white/50">{stat.label}</div>
                </div>
              </Tilt3D>
            ))}
          </div>
          </div>
        </div>
      </section>

      {/* Rider recruitment */}
      <section id="rider" className="relative z-10 border-t border-white/10">
        <div className="pointer-events-none absolute left-[-8%] top-1/4 h-72 w-72 rounded-full bg-[rgba(255,170,40,0.12)] blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center md:py-24">
          <div>
            <div className="rv text-[11px] font-black uppercase tracking-widest text-[#4dd9ff]">{t.rider.eyebrow}</div>
            <h2 className="rv mt-3 text-3xl font-black md:text-4xl" style={{ ["--d" as never]: "80ms" }}>{t.rider.title}</h2>
            <ul className="mt-6 space-y-3">
              {t.rider.bullets.map((bullet, index) => (
                <li key={bullet} className="rv flex items-start gap-3 text-sm font-bold leading-6 text-white/75" style={{ ["--d" as never]: `${140 + index * 70}ms` }}>
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[#ffd84d]" /> {bullet}
                </li>
              ))}
            </ul>
            <a href="https://app.meponto.com" className={`rv mt-8 ${gradBtn}`} style={{ ["--d" as never]: "500ms" }}>
              <Bike size={18} /> {t.rider.cta} <ArrowRight size={16} />
            </a>
          </div>
          <div className="grid grid-cols-2 gap-3" style={{ perspective: "1000px" }}>
            {t.rider.cards.map((card, index) => {
              const Icon = cardIcons[card.icon as keyof typeof cardIcons];
              return (
                <Tilt3D key={card.title} className="rv" style={{ ["--d" as never]: `${120 + index * 110}ms` }}>
                  <div className={`${glass} p-5 hover:border-[#4dd9ff]/40`}>
                    <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[#ffd84d]/25 to-[#4dd9ff]/20 text-[#ffd84d]" style={{ transform: "translateZ(30px)" }}>
                      <Icon size={22} />
                    </div>
                    <div className="mt-4 text-base font-black" style={{ transform: "translateZ(20px)" }}>{card.title}</div>
                    <p className="mt-1 text-xs font-bold leading-5 text-white/55">{card.text}</p>
                  </div>
                </Tilt3D>
              );
            })}
          </div>
        </div>
      </section>

      {/* Franchise recruitment */}
      <section id="franchise" className="relative z-10 border-t border-white/10">
        <div className="pointer-events-none absolute right-[-8%] top-1/3 h-72 w-72 rounded-full bg-[rgba(120,80,255,0.16)] blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center md:py-24">
          <div className="order-2 lg:order-1">
            <div className={`rv ${glass} p-8`}>
              <Users size={56} className="text-[#ffd84d]" />
              <div className="mt-6 grid grid-cols-3 gap-3">
                {[68, 44, 84].map((height, index) => (
                  <div key={index} className="flex h-28 items-end rounded-xl border border-white/10 bg-white/[0.03] p-2">
                    <div className="w-full rounded-lg bg-gradient-to-t from-[#ffd84d]/60 to-[#4dd9ff]/40" style={{ height: `${height}%` }} />
                  </div>
                ))}
              </div>
              <div className="mt-4 h-2 w-2/3 rounded bg-gradient-to-r from-[#ffd84d]/50 to-transparent" />
              <div className="mt-2 h-2 w-1/2 rounded bg-white/10" />
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <div className="rv text-[11px] font-black uppercase tracking-widest text-[#4dd9ff]">{t.franchise.eyebrow}</div>
            <h2 className="rv mt-3 text-3xl font-black md:text-4xl" style={{ ["--d" as never]: "80ms" }}>{t.franchise.title}</h2>
            <ul className="mt-6 space-y-3">
              {t.franchise.bullets.map((bullet, index) => (
                <li key={bullet} className="rv flex items-start gap-3 text-sm font-bold leading-6 text-white/75" style={{ ["--d" as never]: `${140 + index * 70}ms` }}>
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[#ffd84d]" /> {bullet}
                </li>
              ))}
            </ul>
            <a href="#contact" className={`rv mt-8 ${gradBtn}`} style={{ ["--d" as never]: "500ms" }}>
              <Building2 size={18} /> {t.franchise.cta} <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </section>

      {/* Franchise lead form */}
      <section id="contact" className="relative z-10 border-t border-white/10">
        <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-64 max-w-3xl rounded-full bg-[rgba(255,196,46,0.08)] blur-3xl" />
        <div className="relative mx-auto max-w-3xl px-4 py-16 sm:px-6 md:py-24">
          <h2 className="mp-gtext rv text-3xl font-black md:text-4xl">{t.form.title}</h2>
          <p className="rv mt-2 text-sm font-bold text-white/60" style={{ ["--d" as never]: "80ms" }}>{t.form.subtitle}</p>

          <form onSubmit={submit} className={`rv mt-8 space-y-4 ${glass} p-6 md:p-8`} style={{ ["--d" as never]: "160ms" }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <input className={input} placeholder={t.form.name} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input className={input} placeholder={t.form.phone} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <input className={input} placeholder={t.form.email} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <input className={input} placeholder={t.form.city} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <textarea
              className="min-h-28 w-full rounded-xl border border-white/10 bg-white/5 p-4 text-sm font-bold text-white outline-none backdrop-blur placeholder:text-white/40 focus:border-[#ffd84d]/60 focus:bg-white/10"
              placeholder={t.form.message}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
            />
            <input type="text" name="company_website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

            <button type="submit" disabled={state === "sending"} className={`${gradBtn} disabled:opacity-60`}>
              {state === "sending" ? t.form.sending : t.form.submit} <ArrowRight size={16} />
            </button>

            {state === "ok" && <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-sm font-black text-emerald-300">{t.form.success}</div>}
            {state === "fail" && <div className="rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm font-black text-red-300">{t.form.error}</div>}
            {state === "invalid" && <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm font-black text-amber-300">{t.form.required}</div>}
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 bg-[rgba(5,7,14,0.6)] backdrop-blur-xl">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/meponto-logo.png" alt="MePonto" translate="no" className="h-9 w-auto" />
            <p className="mt-3 text-xs font-bold text-white/40" translate="no">{t.footer.rights}</p>
            <a href="/privacy" className="mt-3 inline-block text-xs font-bold text-white/40 underline-offset-2 hover:text-[#ffd84d] hover:underline">
              {t.footer.privacy}
            </a>
          </div>

          <div>
            <div className="text-[11px] font-black uppercase tracking-widest text-[#4dd9ff]">{t.footer.systems}</div>
            <ul className="mt-3 space-y-2">
              {t.footer.links.map((link, index) => {
                const Icon = systemIcons[index] ?? Building2;
                return (
                  <li key={link.href}>
                    <a href={link.href} className="inline-flex items-center gap-2 text-sm font-bold text-white/60 transition-colors hover:text-[#ffd84d]">
                      <Icon size={15} className="text-[#ffd84d]/70" /> {link.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <div className="text-[11px] font-black uppercase tracking-widest text-[#4dd9ff]">{t.footer.support}</div>
            <p className="mt-3 max-w-xs text-xs font-bold leading-5 text-white/50">{t.footer.supportText}</p>
            <div className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-white/60" translate="no">
              <Headset size={15} className="text-[#ffd84d]/70" /> contato@meponto.com
            </div>
            <div className="text-sm font-bold text-white/40">São Paulo · Brasil</div>
          </div>
        </div>
      </footer>
    </main>
  );
}
