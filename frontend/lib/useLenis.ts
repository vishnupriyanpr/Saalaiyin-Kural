"use client";

import { useEffect } from "react";
import { frame, cancelFrame } from "framer-motion";

/**
 * Lenis smooth scroll, scoped to the component that calls it (mount → init,
 * unmount → destroy) so it never touches the app's internal scroll areas
 * (Leaflet maps, modals, admin tables) on other routes.
 *
 * Driven by framer-motion's single frame loop (frame.update) instead of its own
 * requestAnimationFrame — this keeps Lenis and Motion's scroll values on the
 * exact same tick, which is what prevents scroll-linked jank.
 *
 * SSR-safe; skips Lenis entirely under prefers-reduced-motion (native scroll).
 */
export function useLenis(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let lenis: any;
    let update: ((data: { timestamp: number }) => void) | null = null;
    let onClick: ((e: MouseEvent) => void) | null = null;
    let cancelled = false;

    import("lenis").then(({ default: Lenis }) => {
      if (cancelled) return;
      lenis = new Lenis({
        lerp: 0.1,            // smooth but responsive
        wheelMultiplier: 1,
        smoothWheel: true,
        syncTouch: false,     // keep native momentum on touch devices
      });

      update = (data) => lenis.raf(data.timestamp);
      frame.update(update, true); // keepAlive: run on every Motion frame

      // Upgrade in-page anchor links to a smooth Lenis scroll past the sticky header.
      onClick = (e: MouseEvent) => {
        const anchor = (e.target as HTMLElement)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
        if (!anchor) return;
        const href = anchor.getAttribute("href");
        if (!href || href === "#") return;
        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          lenis.scrollTo(target as HTMLElement, { offset: -68, duration: 1.15 });
        }
      };
      document.addEventListener("click", onClick);
    });

    return () => {
      cancelled = true;
      if (update) cancelFrame(update);
      if (onClick) document.removeEventListener("click", onClick);
      if (lenis) lenis.destroy();
    };
  }, [enabled]);
}
