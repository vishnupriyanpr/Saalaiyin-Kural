"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { Fraunces, Hanken_Grotesk, Anek_Tamil, Big_Shoulders } from "next/font/google";
import { LazyMotion, domAnimation, MotionConfig, m, useInView, useReducedMotion } from "framer-motion";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { db } from "@/lib/db";
import type { Stats } from "@/lib/types";
import { useLenis } from "@/lib/useLenis";

/* ── Type system: a four-role designer stack, self-hosted via next/font ──
   Fraunces             — engraved "old-style with attitude" display serif (English heads)
   Anek Tamil           — modern variable Tamil; the protagonist (hero wordmark + glosses)
   Hanken Grotesk       — clean humanist grotesque for all body / UI / labels
   Big Shoulders Display — tall condensed gothic, the numeral "awe engine"          */
const display = Fraunces({ subsets: ["latin"], weight: ["400", "500", "600"], style: ["normal", "italic"], display: "swap", variable: "--font-display" });
const tamil = Anek_Tamil({ subsets: ["tamil", "latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-tamil" });
const body = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-body" });
const numeral = Big_Shoulders({ subsets: ["latin"], weight: ["600", "700", "800"], display: "swap", variable: "--font-numeral" });

const F_DISPLAY = "var(--font-display), Georgia, serif";
const F_TAMIL = "var(--font-tamil), 'Noto Sans Tamil', sans-serif";
const F_BODY = "var(--font-body), system-ui, sans-serif";
const F_NUM = "var(--font-numeral), 'Arial Narrow', sans-serif";

/* ── Temple-material palette ── */
const PAPER = "#FAF6EE";
const PARCH = "#F3EDE0";
const INK = "#1A1008";
const INK_MUTE = "#6B5C4A";
const GOLD = "#C9A84C";
const GOLD_DK = "#B8933B";
const GOLD_INK = "#8A6A18";    // legible antique-gold for numerals/marks on paper (>=4.5:1)
const TERRA = "#C4603A";
const GREEN = "#197A3D";
const SAFFRON = "#FF9933";

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E\")";

const KOLAM: React.CSSProperties = {
  backgroundImage: `radial-gradient(${GOLD}33 1.1px, transparent 1.3px)`,
  backgroundSize: "26px 26px",
  contain: "paint",
};

const CoverageMap3D = dynamic(() => import("@/components/shared/TamilNadu3DMap"), {
  ssr: false,
  loading: () => null,
});

const EASE = [0.22, 1, 0.36, 1] as const;

/* ── Atoms ───────────────────────────────────────────────────────────── */
function Tricolour({ height = 3, className = "" }: { height?: number; className?: string }) {
  return (
    <span className={`flex ${className}`} style={{ height }} aria-hidden="true">
      <span className="h-full" style={{ width: "38%", background: SAFFRON }} />
      <span className="h-full flex-1" style={{ background: "#FBFAF6" }} />
      <span className="h-full" style={{ width: "38%", background: GREEN }} />
    </span>
  );
}
function TricolourTick() {
  return (
    <span className="inline-flex items-center gap-[3px]" aria-hidden="true">
      <span className="w-3.5 h-[3px]" style={{ background: SAFFRON }} />
      <span className="w-3.5 h-[3px]" style={{ background: "#CBBF9E" }} />
      <span className="w-3.5 h-[3px]" style={{ background: GREEN }} />
    </span>
  );
}
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center text-[11px] font-semibold uppercase"
      style={{ fontFamily: F_BODY, letterSpacing: "0.2em", color: INK_MUTE, fontVariant: "small-caps" }}
    >
      {children}
    </span>
  );
}
function SectionMark({ roman, label, labelTa }: { roman: string; label: string; labelTa?: string }) {
  return (
    <div className="flex items-baseline gap-3 sm:gap-4">
      <span style={{ fontFamily: F_DISPLAY, color: GOLD_INK, fontWeight: 600 }} className="text-2xl leading-none">{roman}</span>
      <span className="h-px w-8 sm:w-10" style={{ background: `${INK}2E` }} />
      <Eyebrow>{label}</Eyebrow>
      {labelTa && (
        <span lang="ta" className="text-[13px] leading-none" style={{ fontFamily: F_TAMIL, color: GOLD_INK }}>{labelTa}</span>
      )}
    </div>
  );
}

/* ── Count-up engine: writes to the DOM via rAF (no React re-render per frame),
      and draws an optional kolam-ring seal on the same beat. ── */
function useTally(value: number, prefix: string, suffix: string, dash: boolean, reduce: boolean) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const numRef = useRef<HTMLSpanElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const inView = useInView(wrapRef, { once: true, amount: 0.55 });

  useEffect(() => {
    const el = numRef.current;
    if (!el) return;
    const setRing = (off: number) => { if (ringRef.current) ringRef.current.style.strokeDashoffset = String(off); };
    const fmt = (n: number) => `${prefix}${Math.floor(n).toLocaleString("en-IN")}${suffix}`;
    if (dash) { el.textContent = "—"; setRing(0); return; }
    if (!inView) { setRing(1); return; }
    if (reduce) { el.textContent = fmt(value); setRing(0); return; }
    let raf = 0; let t0: number | null = null; const dur = 1700;
    const tick = (t: number) => {
      if (t0 === null) t0 = t;
      const p = Math.min((t - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(eased * value);
      setRing(1 - eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, dash, reduce, prefix, suffix]);

  return { wrapRef, numRef, ringRef };
}

/* A kolam (pulli) ring that draws closed on the count-up beat — the audited seal. */
function PulliSeal({ ringRef }: { ringRef: React.RefObject<SVGCircleElement | null> }) {
  const dots = [0, 90, 180, 270].map((a) => {
    const r = 47, rad = (a * Math.PI) / 180;
    return { x: 50 + r * Math.cos(rad), y: 50 + r * Math.sin(rad) };
  });
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true" style={{ overflow: "visible" }}>
      <circle cx="50" cy="50" r="47" fill="none" stroke={GOLD_INK} strokeWidth={0.5} opacity={0.16} />
      <circle ref={ringRef} cx="50" cy="50" r="47" pathLength={1} fill="none" stroke={GOLD_INK}
        strokeWidth={1} strokeLinecap="round" strokeDasharray="1" strokeDashoffset="1"
        transform="rotate(-90 50 50)" />
      {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r="1.7" fill={GOLD_INK} opacity={0.6} />)}
    </svg>
  );
}

/* One entry in the Transparency Register — hero account or ruled line-item. */
function RegisterEntry({
  entry, value, prefix = "", suffix = "", label, labelTa, unit, denom = "", caption, hero = false, dash, reduce,
}: {
  entry: string; value: number; prefix?: string; suffix?: string; label: string; labelTa: string;
  unit?: string; denom?: string; caption?: string; hero?: boolean; dash: boolean; reduce: boolean;
}) {
  const { wrapRef, numRef, ringRef } = useTally(value, prefix, suffix, dash, reduce);
  const finalText = dash ? "currently unavailable" : `${prefix}${value.toLocaleString("en-IN")}${suffix}${denom ? " " + denom : ""}`;
  const kicker = (
    <span className="text-[10.5px] font-semibold uppercase" style={{ fontFamily: F_BODY, letterSpacing: "0.2em", color: INK_MUTE }}>Entry No. {entry}</span>
  );

  if (hero) {
    return (
      <div ref={wrapRef} role="group" aria-label={`${label}: ${finalText}`} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-6 md:gap-12 items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">{kicker}<TricolourTick /></div>
          <h3 className="mt-3 text-[1.5rem] md:text-[1.75rem]" style={{ fontFamily: F_DISPLAY, fontWeight: 600, color: INK, lineHeight: 1.08, letterSpacing: "-0.01em" }}>{label}</h3>
          <p lang="ta" className="text-[15px] mt-0.5" style={{ fontFamily: F_TAMIL, color: GOLD_INK, fontWeight: 500 }}>{labelTa}</p>
          {caption && <p className="mt-2.5 text-[13px] max-w-xs" style={{ fontFamily: F_BODY, color: INK_MUTE, lineHeight: 1.6 }}>{caption}</p>}
        </div>
        <div className="relative flex items-end justify-start md:justify-end gap-3">
          {/* Number nested INSIDE the gold seal: the ring is absolutely centered
              behind the numeral so it frames it, not floats beside it. */}
          <div className="relative inline-flex items-center justify-center">
            {!dash && (
              <span aria-hidden className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-0 hidden sm:block pointer-events-none" style={{ width: "clamp(10rem,17vw,14rem)", height: "clamp(10rem,17vw,14rem)" }}>
                <PulliSeal ringRef={ringRef} />
              </span>
            )}
            <span ref={numRef} aria-hidden className="sk-letterpress relative z-10 px-4" style={{ fontFamily: F_NUM, fontWeight: 800, fontSize: "clamp(4.25rem,12vw,9rem)", lineHeight: 0.82, letterSpacing: "-0.01em", color: INK, fontVariantNumeric: "tabular-nums lining-nums" }}>{dash ? "—" : "0"}</span>
          </div>
          {unit && !dash && <span className="relative z-10 mb-3 self-end text-[12px] font-semibold uppercase whitespace-nowrap" style={{ fontFamily: F_BODY, letterSpacing: "0.12em", color: GOLD_INK }}>{unit}</span>}
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} role="group" aria-label={`${label}: ${finalText}`} className="reg-row">
      <div className="min-w-0">
        <span className="block mb-0.5 text-[10px] font-semibold uppercase" style={{ fontFamily: F_BODY, letterSpacing: "0.2em", color: INK_MUTE }}>Entry No. {entry}</span>
        <span className="text-[14.5px] font-semibold" style={{ fontFamily: F_BODY, color: INK }}>{label} </span>
        <span lang="ta" className="text-[13px]" style={{ fontFamily: F_TAMIL, color: GOLD_INK, fontWeight: 500 }}>{labelTa}</span>
        {caption && <span className="block text-[12px] mt-0.5" style={{ fontFamily: F_BODY, color: INK_MUTE }}>{caption}</span>}
      </div>
      <span aria-hidden className="reg-leader sk-underdraw" />
      <span className="reg-fig flex items-baseline justify-end gap-1.5 min-w-0">
        <span ref={numRef} aria-hidden style={{ fontFamily: F_NUM, fontWeight: 700, fontSize: "clamp(2.6rem,6vw,4.4rem)", lineHeight: 0.95, color: INK, fontVariantNumeric: "tabular-nums lining-nums" }}>{dash ? "—" : "0"}</span>
        {denom && !dash && <span className="text-[15px] font-semibold self-end mb-1.5" style={{ fontFamily: F_BODY, color: INK_MUTE }}>{denom}</span>}
      </span>
    </div>
  );
}

/* ── Portal card ─────────────────────────────────────────────────────── */
function PortalCard({
  href, tag, title, titleTamil, desc, points, cta, accent, lead, delay,
}: {
  href: string; tag: string; title: string; titleTamil: string; desc: string;
  points: string[]; cta: string; accent: string; lead?: boolean; delay: number;
}) {
  const accentInk = accent === GOLD ? GOLD_INK : accent;
  return (
    <m.div
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.6, delay, ease: EASE }}
      className={lead ? "lg:mt-0" : "lg:mt-10"}
    >
      <Link
        href={href}
        className="sk-portal group relative block h-full overflow-hidden"
        style={{ background: PAPER, border: `1px solid ${INK}1F`, borderRadius: 4 }}
      >
        <span className="absolute left-0 top-0 h-full w-[3px]" style={{ background: accent }} aria-hidden="true" />
        <div className={`flex flex-col h-full ${lead ? "p-8 md:p-10" : "p-7 md:p-9"}`}>
          <Eyebrow>{tag}</Eyebrow>
          <h3
            className={`mt-5 ${lead ? "text-3xl md:text-[2.35rem]" : "text-3xl"}`}
            style={{ fontFamily: F_DISPLAY, fontWeight: 600, color: INK, letterSpacing: "-0.015em", lineHeight: 1.05 }}
          >
            {title}
          </h3>
          <p lang="ta" className="text-[15px] mt-1.5" style={{ fontFamily: F_TAMIL, color: INK_MUTE, lineHeight: 1.6 }}>{titleTamil}</p>
          <p className="mt-4 text-[14.5px]" style={{ fontFamily: F_BODY, color: INK_MUTE, lineHeight: 1.65 }}>{desc}</p>
          <ul className="mt-6">
            {points.map((p, idx) => (
              <li key={p} className="flex items-center gap-3.5 py-2.5" style={{ fontFamily: F_BODY, color: INK, borderTop: idx === 0 ? "none" : `1px solid ${INK}12` }}>
                <span className="shrink-0 w-6 text-center tabular-nums" style={{ fontFamily: F_NUM, fontWeight: 700, fontSize: "1.1rem", lineHeight: 1, color: accentInk }}>{idx + 1}</span>
                <span className="text-[13.5px] font-medium">{p}</span>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-7 flex items-center justify-between" style={{ borderTop: `1px solid ${INK}14`, marginTop: "1.75rem" }}>
            <span className="text-sm font-bold" style={{ fontFamily: F_BODY, color: INK }}>{cta}</span>
            <span className="sk-portal-arrow inline-flex h-9 w-9 items-center justify-center" style={{ border: `1px solid ${INK}26`, color: INK, borderRadius: 2 }}>
              <ArrowUpRight className="w-4 h-4" strokeWidth={1.5} />
            </span>
          </div>
        </div>
      </Link>
    </m.div>
  );
}

/* ════════════════════════════════════════════════════════════════════ */
export default function HomePage() {
  const reduce = useReducedMotion() ?? false;
  useLenis(true);

  const [stats, setStats] = useState<Stats | null>(null);
  const [statsError, setStatsError] = useState(false);
  useEffect(() => {
    let off = false;
    db.getStats().then((s) => { if (!off) { setStats(s); setStatsError(false); } }).catch(() => { if (!off) setStatsError(true); });
    return () => { off = true; };
  }, []);

  const reportsFixed = stats?.reportsFixed ?? stats?.resolvedComplaints ?? 0;
  const districts = stats?.districts ?? 0;
  const budgetSavedPercent = stats?.budgetSavedPercent ?? 0;
  const totalCitizens = stats?.totalCitizens ?? 0;
  const totalSavings = stats?.totalSavings ?? 0;
  const dash = statsError && !stats;
  const en = (n: number) => n.toLocaleString("en-IN");

  const reveal = (delay = 0) => ({
    initial: { opacity: 0, y: 22 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.4 },
    transition: { duration: 0.65, delay, ease: EASE },
  });

  const ticker: { num?: string; label: string }[] = [
    { num: dash ? "—" : en(reportsFixed), label: "repairs completed" },
    { num: dash ? "—" : en(districts), label: "districts covered" },
    { num: dash ? "—" : en(totalCitizens), label: "citizens reporting" },
    { num: dash ? "—" : `₹${en(totalSavings)}`, label: "public funds optimised" },
    { label: "AI-verified at source" },
    { label: "Every rupee on the public ledger" },
  ];

  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
        <div
          className={`${display.variable} ${tamil.variable} ${body.variable} ${numeral.variable} min-h-screen overflow-x-hidden`}
          style={{ background: PAPER, color: INK, fontFamily: F_BODY }}
        >
          {/* paper grain — subliminal material weight */}
          <div aria-hidden className="pointer-events-none fixed inset-0 z-[60]" style={{ backgroundImage: GRAIN, opacity: 0.045 }} />

          <Tricolour height={4} />

          {/* ── Floating navbar — a detached pill that follows as you scroll ── */}
          <header className="sticky top-3 md:top-4 z-40 px-4 md:px-6">
            <nav
              className="max-w-5xl mx-auto h-14 md:h-[60px] pl-4 pr-2.5 md:pl-5 md:pr-3 flex items-center justify-between rounded-full"
              style={{ background: "rgba(250,246,238,0.82)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: `1px solid ${INK}1F`, boxShadow: "0 14px 36px -16px rgba(26,16,8,0.35)" }}
            >
              <Link href="/" className="flex items-center gap-2.5 min-w-0">
                <Image src="/tn-logo.png" alt="Government of Tamil Nadu emblem" width={32} height={32} priority className="object-contain shrink-0" />
                <span lang="ta" className="text-[15px] truncate" style={{ fontFamily: F_TAMIL, fontWeight: 600, color: INK }}>
                  சாலையின் குரல்<span className="hidden sm:inline" style={{ fontFamily: F_DISPLAY, fontWeight: 500, color: INK_MUTE }}> · Saalai Kural</span>
                </span>
              </Link>

              <div className="hidden md:flex items-center gap-8 text-[13px]" style={{ fontFamily: F_BODY, color: INK }}>
                {[["Mission", "#mission"], ["Portals", "#portals"], ["Platform", "#platform"], ["Coverage", "#coverage"]].map(([l, h]) => (
                  <a key={l} href={h} className="sk-navlink relative py-1">{l}</a>
                ))}
              </div>

              <Link href="/login" className="sk-btn inline-flex items-center gap-1.5 px-4 md:px-5 h-9 md:h-10 text-[12.5px] font-bold shrink-0" style={{ background: INK, color: PAPER, border: `1px solid ${GOLD}`, borderRadius: 9999, fontFamily: F_BODY }}>
                Enter Portal <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.8} />
              </Link>
            </nav>
          </header>

          {/* ════ HERO ════ */}
          <section className="relative">
            <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ ...KOLAM, opacity: 0.7, maskImage: "linear-gradient(to bottom, black 30%, transparent 92%)", WebkitMaskImage: "linear-gradient(to bottom, black 30%, transparent 92%)" }} />
            <div className="relative max-w-7xl mx-auto px-5 md:px-10 pt-14 md:pt-20 pb-16 md:pb-24">
              <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
                {/* Left */}
                <div className="lg:col-span-7">
                  <m.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="flex items-center gap-3">
                    <TricolourTick />
                    <Eyebrow>Public Works Department · Civic Road Intelligence</Eyebrow>
                  </m.div>

                  {/* Tamil is the protagonist — the largest voice on the page */}
                  <m.h1
                    lang="ta"
                    initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.85, delay: 0.06, ease: EASE }}
                    className="mt-6"
                    style={{ fontFamily: F_TAMIL, fontWeight: 600, color: INK, fontSize: "clamp(2.9rem,7.6vw,6rem)", lineHeight: 1.12, letterSpacing: "-0.01em" }}
                  >
                    சாலையின் குரல்
                  </m.h1>

                  {/* English, co-equal — the translation that completes the voice */}
                  <m.p
                    initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.16, ease: EASE }}
                    className="mt-3 sk-letterpress"
                    style={{ fontFamily: F_DISPLAY, fontWeight: 500, color: INK, fontSize: "clamp(1.55rem,3.4vw,2.7rem)", lineHeight: 1.12, letterSpacing: "-0.015em" }}
                  >
                    The Voice of the Road — <em style={{ fontStyle: "italic" }} className="relative whitespace-nowrap">
                      now it is heard
                      <span aria-hidden className="sk-underdraw absolute left-0 -bottom-0.5 h-[3px] w-full" style={{ background: GOLD }} />
                    </em>.
                  </m.p>

                  <m.p
                    initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.26 }}
                    className="mt-6 max-w-xl text-[16px] md:text-[18px]"
                    style={{ fontFamily: F_BODY, color: INK_MUTE, lineHeight: 1.7 }}
                  >
                    Every road now has a voice — and a public record. A citizen&apos;s photograph becomes
                    a tracked, costed, and openly audited repair, triaged by AI and resolved across all 38
                    districts of Tamil&nbsp;Nadu.
                  </m.p>

                  <m.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.32 }} className="mt-9 flex flex-wrap items-center gap-3.5">
                    <Link href="/login" className="sk-btn inline-flex items-center gap-2 px-7 h-[52px] text-sm font-bold" style={{ background: INK, color: PAPER, border: `1px solid ${GOLD}`, borderRadius: 2, fontFamily: F_BODY }}>
                      Report a Road Hazard <ArrowRight className="w-4 h-4" strokeWidth={1.8} />
                    </Link>
                    <Link href="/transparency" className="sk-btn-ghost inline-flex items-center gap-2 px-6 h-[52px] text-sm font-semibold" style={{ color: INK, border: `1px solid ${INK}2E`, borderRadius: 2, fontFamily: F_BODY }}>
                      Open the Public Ledger
                    </Link>
                  </m.div>
                </div>

                {/* Right — duotone press photo */}
                <m.div
                  initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.85, delay: 0.2, ease: EASE }}
                  className="lg:col-span-5"
                >
                  <figure className="relative">
                    <div className="relative w-full h-[300px] md:h-[440px] overflow-hidden" style={{ border: `1px solid ${INK}24`, borderRadius: 4 }}>
                      <Image
                        src="/tn-hero.png" alt="A state highway through the Tamil Nadu countryside"
                        fill priority sizes="(max-width: 1024px) 100vw, 42vw"
                        className="object-cover" style={{ objectPosition: "center 38%", filter: "grayscale(0.18) contrast(1.04)" }}
                      />
                      <span aria-hidden className="absolute inset-0" style={{ background: TERRA, mixBlendMode: "multiply", opacity: 0.22 }} />
                      <span aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(26,16,8,0.4), transparent 45%)" }} />
                      <Tricolour height={3} className="absolute bottom-0 left-0 w-full" />
                    </div>
                    <figcaption className="mt-3 flex items-center justify-between text-[11px] uppercase" style={{ fontFamily: F_BODY, letterSpacing: "0.14em", color: INK_MUTE }}>
                      <span>State Highways · Tamil&nbsp;Nadu</span>
                      <span style={{ fontFamily: F_DISPLAY, fontStyle: "italic", textTransform: "none", letterSpacing: 0, color: INK }}>Vol. I — MMXXVI</span>
                    </figcaption>
                  </figure>
                </m.div>
              </div>
            </div>

            {/* ── Marquee ticker ── */}
            <div aria-hidden="true" className="sk-marquee overflow-hidden" style={{ borderTop: `1px solid ${INK}14`, borderBottom: `1px solid ${INK}14`, background: PARCH }}>
              <div className="sk-marquee-track py-3">
                {[0, 1].map((dup) => (
                  <div key={dup} className="flex items-center gap-7 pr-7" aria-hidden={dup === 1}>
                    {ticker.map((t, i) => (
                      <span key={i} className="inline-flex items-baseline gap-2.5 whitespace-nowrap">
                        {t.num && (
                          <span style={{ fontFamily: F_NUM, fontWeight: 700, fontSize: "1.45rem", lineHeight: 1, color: INK, fontVariantNumeric: "tabular-nums lining-nums" }}>{t.num}</span>
                        )}
                        <span className="text-[11.5px] font-semibold uppercase" style={{ fontFamily: F_BODY, letterSpacing: "0.12em", color: t.num ? GOLD_INK : INK_MUTE }}>{t.label}</span>
                        <span className="inline-block w-1.5 h-1.5 rounded-full ml-5 self-center" style={{ background: GOLD }} aria-hidden />
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ════ MISSION ════ */}
          <section id="mission" className="relative max-w-7xl mx-auto px-5 md:px-10 pt-24 md:pt-32 pb-16 md:pb-24">
            <SectionMark roman="I" label="The Mission" labelTa="நோக்கம்" />
            <div className="mt-8 grid md:grid-cols-[1.25fr_1fr] gap-8 md:gap-16 items-start">
              <m.h2 {...reveal()} style={{ fontFamily: F_DISPLAY, fontWeight: 500, color: INK, fontSize: "clamp(2rem,4vw,3.4rem)", lineHeight: 1.08, letterSpacing: "-0.018em", ["textWrap" as any]: "balance" }}>
                Accountability you can see, on the roads you travel every day.
              </m.h2>
              <m.p {...reveal(0.1)} className="sk-dropcap text-[16px]" style={{ fontFamily: F_BODY, color: INK_MUTE, lineHeight: 1.75 }}>
                Defects are reported by the people who drive them, classified by computer vision,
                prioritised by severity, and bundled into cost-optimised repairs. Every rupee
                sanctioned and spent is published — so trust is earned in the open.
              </m.p>
            </div>

            {/* The Transparency Register — one audited statement of public accounts */}
            <m.div {...reveal(0.15)} className="mt-14" style={{ borderTop: `1px solid ${INK}1F`, paddingTop: "2.5rem" }}>
              <div className="flex items-center gap-4 mb-9">
                <span className="text-[11px] font-semibold uppercase whitespace-nowrap" style={{ fontFamily: F_BODY, letterSpacing: "0.22em", color: GOLD_INK }}>Statement of Public Accounts</span>
                <span className="h-px flex-1" style={{ background: `${INK}1F` }} />
                <span lang="ta" className="text-[13px] whitespace-nowrap" style={{ fontFamily: F_TAMIL, color: GOLD_INK, fontWeight: 500 }}>பொதுக் கணக்கு</span>
              </div>

              <RegisterEntry hero entry="I" value={reportsFixed} label="Road repairs completed" labelTa="பழுதுகள் சரிசெய்யப்பட்டன" unit="repairs resolved" caption="Verified end-to-end — from a citizen's photo to a closed contract." dash={dash} reduce={reduce} />
              <div className="mt-8" style={{ borderTop: `1px solid ${INK}2E` }} />

              <RegisterEntry entry="II" value={districts} denom="/ 38" label="Districts covered" labelTa="மாவட்டங்கள்" caption="live across the state" dash={dash} reduce={reduce} />
              <RegisterEntry entry="III" value={budgetSavedPercent} suffix="%" label="Budget optimised" labelTa="நிதிச் சிக்கனம்" caption="through bundled repairs" dash={dash} reduce={reduce} />
              <RegisterEntry entry="IV" value={totalCitizens} label="Active citizens" labelTa="பங்களிக்கும் குடிமக்கள்" caption="filing and verifying reports" dash={dash} reduce={reduce} />
            </m.div>
          </section>

          {/* ════ PORTALS ════ */}
          <section id="portals" className="relative" style={{ background: PARCH, borderTop: `1px solid ${INK}14`, borderBottom: `1px solid ${INK}14` }}>
            <div className="max-w-7xl mx-auto px-5 md:px-10 py-20 md:py-28">
              <SectionMark roman="II" label="Portals" labelTa="வாயில்கள்" />
              <m.h2 {...reveal()} className="mt-8 max-w-2xl" style={{ fontFamily: F_DISPLAY, fontWeight: 500, color: INK, fontSize: "clamp(2rem,4vw,3.2rem)", lineHeight: 1.08, letterSpacing: "-0.018em" }}>
                Whether you report or you repair, there is a door for you.
              </m.h2>

              <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-7">
                <PortalCard
                  href="/login" tag="For Citizens" title="Citizen Portal" titleTamil="குடிமக்கள் இணையதளம்"
                  desc="Photograph a hazard and let AI do the paperwork. Earn civic points, climb levels, and redeem eco-rewards — then watch the repair happen, live."
                  points={["One-tap AI photo reporting", "Live status & district heatmap", "Eco-reward store for points"]}
                  cta="Enter Citizen Portal" accent={GOLD} lead delay={0}
                />
                <PortalCard
                  href="/login" tag="For Officials" title="Officials Console" titleTamil="அதிகாரிகள் கன்சோல்"
                  desc="Triage AI-classified alerts, merge nearby reports into bundled repair zones, allocate field crews, and export audit-ready budget ledgers for the state."
                  points={["AI triage & duplicate detection", "Bulk repair-zone planning", "Auditable budget & PDF reports"]}
                  cta="Enter Officials Console" accent={GREEN} delay={0.12}
                />
              </div>
            </div>
          </section>

          {/* ════ PLATFORM ════ */}
          <section id="platform" className="relative max-w-7xl mx-auto px-5 md:px-10 py-24 md:py-32 grid md:grid-cols-[0.85fr_1.15fr] gap-12 md:gap-20">
            <div>
              <SectionMark roman="III" label="The Platform" labelTa="தளம்" />
              <m.h2 {...reveal()} className="mt-8" style={{ fontFamily: F_DISPLAY, fontWeight: 500, color: INK, fontSize: "clamp(1.9rem,3.4vw,2.9rem)", lineHeight: 1.1, letterSpacing: "-0.018em" }}>
                Five systems, one civic loop — camera to contractor, in public view.
              </m.h2>
              <m.p {...reveal(0.08)} className="mt-5 text-[15.5px] max-w-sm" style={{ fontFamily: F_BODY, color: INK_MUTE, lineHeight: 1.7 }}>
                No dashboards for their own sake. Each part exists to move a pothole from a photo to
                a finished, accounted-for repair.
              </m.p>
            </div>

            <div className="relative">
              {/* the civic loop — a continuous spine threading the five station numerals */}
              <span aria-hidden className="absolute top-8 bottom-8 w-px" style={{ left: "1.6rem", background: `${GOLD_INK}33` }} />
              {[
                { n: "01", t: "A living map of every district", d: "A real-time complaint heatmap across all 38 districts, colour-coded by severity." },
                { n: "02", t: "One photo, fully classified", d: "Computer vision reads defect type, depth, a severity score, and an estimated repair cost from a single image." },
                { n: "03", t: "Pothole maths that saves crores", d: "Nearby reports cluster into bundled repair zones, cutting duplicated dispatch and contractor cost." },
                { n: "04", t: "A ledger anyone can open", d: "Sanctioned and spent budgets are published per road — open to every citizen, no login required." },
                { n: "05", t: "Points that plant trees", d: "Civic points convert into saplings, seeds, and eco-goods — turning duty into a greener Tamil Nadu." },
              ].map((f, i) => (
                <m.div
                  key={f.n}
                  initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.5 }}
                  transition={{ duration: 0.5, delay: i * 0.06, ease: EASE }}
                  className="relative grid grid-cols-[3.2rem_1fr] gap-4 md:gap-6 py-6 items-start"
                >
                  <span className="relative z-10 flex justify-center">
                    <span className="tabular-nums" style={{ fontFamily: F_NUM, color: GOLD_INK, fontWeight: 700, fontSize: "clamp(2.1rem,3.4vw,3.1rem)", lineHeight: 0.85, background: PAPER, paddingBlock: "0.18rem", fontVariantNumeric: "tabular-nums lining-nums" }}>{f.n}</span>
                  </span>
                  <div className="pt-1">
                    <h3 className="text-[1.32rem]" style={{ fontFamily: F_DISPLAY, fontWeight: 600, color: INK, lineHeight: 1.12, letterSpacing: "-0.01em" }}>{f.t}</h3>
                    <p className="text-[14px] mt-1.5 max-w-md" style={{ fontFamily: F_BODY, color: INK_MUTE, lineHeight: 1.65 }}>{f.d}</p>
                  </div>
                </m.div>
              ))}
            </div>
          </section>

          {/* ════ COVERAGE — full-bleed borderless gold map ════ */}
          <section id="coverage" className="relative overflow-hidden" style={{ background: PAPER, borderTop: `1px solid ${INK}14` }}>
            <div className="max-w-7xl mx-auto px-5 md:px-10 py-20 md:py-28 grid md:grid-cols-2 gap-10 md:gap-6 items-center">
              <div className="md:pr-6">
                <SectionMark roman="IV" label="State Coverage" labelTa="பரப்பு" />
                <m.h2 {...reveal()} className="mt-8" style={{ fontFamily: F_DISPLAY, fontWeight: 500, color: INK, fontSize: "clamp(2rem,4vw,3.4rem)", lineHeight: 1.06, letterSpacing: "-0.02em" }}>
                  From Chennai<br />to Kanyakumari.
                </m.h2>
                <m.p {...reveal(0.08)} className="mt-5 text-[15.5px] max-w-md" style={{ fontFamily: F_BODY, color: INK_MUTE, lineHeight: 1.7 }}>
                  Coimbatore to Cuddalore, hill road to harbour front — every reported defect lands on
                  one living map of the state.
                </m.p>

                {/* realistic green highway distance sign */}
                <m.div {...reveal(0.14)} className="inline-block mt-9 p-5 text-left shadow-xl" style={{ background: "#0B5D2A", border: "2px solid rgba(255,255,255,0.92)", borderRadius: 4 }}>
                  {[
                    { en: "Chennai", ta: "சென்னை", km: "100" },
                    { en: "Madurai", ta: "மதுரை", km: "250" },
                    { en: "Coimbatore", ta: "கோயம்பத்தூர்", km: "330" },
                  ].map((r, i) => (
                    <div key={r.en} className={`flex items-center justify-between gap-10 sm:gap-16 ${i > 0 ? "pt-2.5 mt-2.5" : ""}`} style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.25)" : "none" }}>
                      <span className="text-white font-bold tracking-wide" style={{ fontFamily: F_BODY }}>
                        {r.en} <span lang="ta" className="font-medium text-white/85" style={{ fontFamily: F_TAMIL }}>{r.ta}</span>
                      </span>
                      <span className="text-white font-bold tabular-nums" style={{ fontFamily: F_BODY }}>{r.km} km ↑</span>
                    </div>
                  ))}
                </m.div>
              </div>

              {/* gold map — borderless, bleeds toward the viewport edge */}
              <div className="relative h-[360px] md:h-[560px] md:-mr-10 lg:-mr-24">
                <MapMount reduce={reduce} />
              </div>
            </div>
          </section>

          {/* ════ CLOSING / SLOGAN (dark plate) ════ */}
          <section className="relative" style={{ background: INK }}>
            <Tricolour height={3} />
            <div className="max-w-2xl mx-auto px-5 md:px-10 py-24 md:py-32 text-center">
              <m.div {...reveal()}>
                <Image src="/tn-logo.png" alt="Government of Tamil Nadu emblem" width={52} height={52} loading="lazy" className="object-contain mx-auto mb-6" />
              </m.div>
              <m.div {...reveal(0.04)} className="flex items-center justify-center gap-3 mb-5">
                <span className="h-px w-8" style={{ background: "rgba(201,168,76,0.5)" }} />
                <span className="text-[11px] font-semibold uppercase" style={{ fontFamily: F_BODY, letterSpacing: "0.22em", color: GOLD, fontVariant: "small-caps" }}>
                  In closing · <span lang="ta" style={{ fontFamily: F_TAMIL }}>நிறைவாக</span>
                </span>
                <span className="h-px w-8" style={{ background: "rgba(201,168,76,0.5)" }} />
              </m.div>
              <m.h2 {...reveal(0.05)} style={{ fontFamily: F_DISPLAY, fontWeight: 500, color: PAPER, fontSize: "clamp(2.2rem,5vw,3.8rem)", lineHeight: 1.05, letterSpacing: "-0.02em", ["textWrap" as any]: "balance" }}>
                Government and citizens,<br /><em style={{ fontStyle: "italic", color: GOLD }}>on the same road.</em>
              </m.h2>
              <m.p {...reveal(0.12)} className="mt-6 max-w-lg mx-auto text-[15.5px]" style={{ fontFamily: F_BODY, color: "#C9BFA9", lineHeight: 1.7 }}>
                <span lang="ta" style={{ fontFamily: F_TAMIL, color: "#EDE4CF" }}>சாலையின் குரல்</span> brings the
                Government of Tamil&nbsp;Nadu and its citizens together in one place — making every
                journey safer, one report at a time.<span aria-hidden style={{ color: GOLD, marginLeft: "0.4em" }}>■</span>
              </m.p>
              <m.div {...reveal(0.18)} className="mt-9 flex flex-wrap justify-center gap-3.5">
                <Link href="/login" className="sk-btn inline-flex items-center gap-2 px-8 h-[54px] text-sm font-bold" style={{ background: GOLD, color: INK, border: `1px solid ${GOLD}`, borderRadius: 2, fontFamily: F_BODY }}>
                  Enter the Portal <ArrowRight className="w-4 h-4" strokeWidth={1.8} />
                </Link>
                <Link href="/transparency" className="sk-btn-ghost-dark inline-flex items-center gap-2 px-7 h-[54px] text-sm font-semibold" style={{ color: PAPER, border: "1px solid rgba(250,246,238,0.3)", borderRadius: 2, fontFamily: F_BODY }}>
                  Browse Public Data
                </Link>
              </m.div>
            </div>
          </section>

          {/* ════ FOOTER ════ */}
          <footer style={{ background: "#120B05" }}>
            <div className="max-w-7xl mx-auto px-5 md:px-10 py-10">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-3">
                  <Image src="/tn-logo.png" alt="Government of Tamil Nadu emblem" width={36} height={36} loading="lazy" className="object-contain" />
                  <span className="leading-tight">
                    <span lang="ta" className="block text-[14px]" style={{ fontFamily: F_TAMIL, color: PAPER }}>சாலையின் குரல் <span style={{ fontFamily: F_DISPLAY, color: "#9A8E76" }}>· Saalai Kural</span></span>
                    <span className="block text-[11px]" style={{ fontFamily: F_BODY, color: "#8A7E66" }}>Highways &amp; Public Works Department</span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-7 gap-y-2 text-[12.5px]" style={{ fontFamily: F_BODY, color: "#9A8E76" }}>
                  <a href="#mission" className="hover:text-white/85 transition-colors">Mission</a>
                  <a href="#portals" className="hover:text-white/85 transition-colors">Portals</a>
                  <Link href="/transparency" className="hover:text-white/85 transition-colors">Transparency</Link>
                  <Link href="/login" className="hover:text-white/85 transition-colors">Sign in</Link>
                </div>
              </div>
              <div className="mt-8 pt-6 flex flex-col sm:flex-row justify-between gap-2 text-[11px]" style={{ borderTop: "1px solid rgba(255,255,255,0.08)", fontFamily: F_BODY, color: "#8A7C60" }}>
                <span>© 2026 Government of Tamil Nadu · A Digital India civic initiative</span>
                <span>Built for Tamil&nbsp;Nadu&apos;s government and its citizens — in one place</span>
              </div>
            </div>
          </footer>
        </div>
      </LazyMotion>
    </MotionConfig>
  );
}

/* Mount the WebGL map only when it scrolls near the viewport (defers three.js). */
function MapMount({ reduce }: { reduce: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "300px 0px" });
  return (
    <div ref={ref} className="w-full h-full">
      {inView ? <CoverageMap3D /> : null}
    </div>
  );
}
