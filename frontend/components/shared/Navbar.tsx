"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Menu, X, LogOut, Award, Shield, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { TOKEN_KEY } from "@/lib/useAuth";
import { useNotifications } from "@/lib/useNotifications";
import dynamic from "next/dynamic";
import GooeyNav from "./GooeyNav";

const Lanyard = dynamic(() => import("./Lanyard"), { ssr: false });

interface NavbarProps {
  portal: "admin" | "civilian";
  userId?: string;
  userName?: string;
  userPoints?: number;
}

const navItemVariants = {
  hidden: { opacity: 0, y: -8 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } },
};

export default function Navbar({ portal, userId, userName, userPoints }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { notifications, unreadCount: unread, markRead, markAllRead } = useNotifications();
  const [showNotifs, setShowNotifs] = useState(false);
  const [points, setPoints] = useState(userPoints ?? 0);
  const [prevPoints, setPrevPoints] = useState(userPoints ?? 0);
  const [pointsFlash, setPointsFlash] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    localStorage.setItem("theme", "light");
    document.documentElement.classList.remove("dark");
  }, []);

  useEffect(() => {
    if (userPoints !== undefined) setPoints(userPoints);
  }, [userPoints]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifs(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleNotifClick = (id: string, complaintId?: string | null) => {
    markRead(id);
    if (complaintId) {
      setShowNotifs(false);
      router.push(`/civilian/track?id=${complaintId}`);
    }
  };

  const logout = () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem("saalaikural_user");
    } catch { /* noop */ }
    // Hard redirect (not router.push) so all in-memory/WS state is torn down and
    // we reliably land on /login even from a deeply nested protected route.
    window.location.href = "/login";
  };

  const civilianLinks = [
    { name: "Dashboard", href: "/civilian/dashboard" },
    { name: "Report", href: "/civilian/report" },
    { name: "Map View", href: "/civilian/map" },
    { name: "Eco Store", href: "/civilian/rewards" },
    { name: "Chatbot", href: "/civilian/chat" },
    { name: "Civic Jobs", href: "/civilian/work" },
    { name: "Budget", href: "/civilian/budget" },
  ];

  const adminLinks = [
    { name: "Dashboard", href: "/admin/dashboard" },
    { name: "Complaints", href: "/admin/complaints" },
    { name: "Map Engine", href: "/admin/map" },
    { name: "Traffic", href: "/admin/traffic" },
    { name: "Kanban", href: "/admin/progress" },
    { name: "Work Allocation", href: "/admin/work" },
    { name: "Rewards", href: "/admin/rewards" },
    { name: "Budget", href: "/admin/budget" },
  ];

  const links = portal === "admin" ? adminLinks : civilianLinks;

  // Modal rendered via portal — escapes the sticky nav stacking context
  const modal = mounted && showProfile
    ? createPortal(
        <AnimatePresence>
          {showProfile && (
            <motion.div
              key="lanyard-modal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 9999,
                background: "rgba(15,23,42,0.60)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onClick={() => setShowProfile(false)}
            >
              {/* Close button */}
              <button
                onClick={() => setShowProfile(false)}
                style={{
                  position: "absolute",
                  top: 20,
                  right: 20,
                  zIndex: 10000,
                  width: 40,
                  height: 40,
                  background: "rgba(255,255,255,0.15)",
                  border: "none",
                  borderRadius: "50%",
                  cursor: "pointer",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={20} />
              </button>

              {/* Hint */}
              <div
                style={{
                  position: "absolute",
                  bottom: 28,
                  left: "50%",
                  transform: "translateX(-50%)",
                  color: "rgba(255,255,255,0.35)",
                  fontSize: 10,
                  fontFamily: "monospace",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  pointerEvents: "none",
                  userSelect: "none",
                  whiteSpace: "nowrap",
                }}
              >
                Drag ID card to play
              </div>

              {/* Full-viewport canvas wrapper */}
              <div
                style={{ position: "fixed", inset: 0, cursor: "grab" }}
                onClick={(e) => e.stopPropagation()}
              >
                <Lanyard
                  userData={{
                    name: userName || (portal === "admin" ? "Admin Officer" : "Citizen"),
                    role: portal === "admin" ? "State Govt Official" : "Civic Reporter",
                    phone: "+91 98765 43210",
                    points: portal === "civilian" ? points : undefined,
                  }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )
    : null;

  return (
    <>
      <motion.nav
        initial={{ y: -64, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 28 }}
        className="sticky top-0 z-50 px-4 py-3 md:px-8 flex justify-between items-center bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-sm"
      >
        {/* Brand */}
        <Link href={portal === "admin" ? "/admin/dashboard" : "/civilian/dashboard"} className="flex items-center space-x-3">
          <motion.div
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400 }}
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          >
            <img src="/tn-logo.png" alt="Tamil Nadu Government" className="w-10 h-10 object-contain drop-shadow-md" />
          </motion.div>
          <div className="hidden sm:block">
            <span className="font-display font-bold text-lg tracking-tight block text-[#1A3A5C]">
              சாலையின் குரல் <span className="text-primary font-tamil font-medium text-sm ml-1">தமிழ்நாடு</span>
            </span>
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block -mt-0.5">
              {portal === "admin" ? "State Administration" : "Citizen Engagement Portal"}
            </span>
          </div>
        </Link>

        {/* Desktop nav */}
        <div className="hidden xl:block relative">
          <GooeyNav items={links.map((l) => ({ label: l.name, href: l.href }))} />
        </div>

        {/* Right utilities */}
        <div className="flex items-center space-x-2 md:space-x-3">
          {/* Points badge */}
          {portal === "civilian" && (
            <motion.div
              animate={pointsFlash ? { scale: [1, 1.25, 1], backgroundColor: ["#fff7ed", "#ff6b2c", "#fff7ed"] } : {}}
              transition={{ duration: 0.55 }}
              className="bg-primary/10 border border-primary/20 px-2.5 sm:px-3 py-1 rounded-full flex items-center space-x-1 sm:space-x-1.5 shrink-0"
            >
              <motion.span animate={{ rotate: [0, 15, -10, 0] }} transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 3 }}>
                <Award className="w-4 h-4 text-primary" />
              </motion.span>
              <span className="font-mono text-xs font-bold text-primary whitespace-nowrap">
                {points.toLocaleString()}<span className="hidden sm:inline"> PTS</span>
              </span>
            </motion.div>
          )}

          {/* Notifications */}
          <div ref={notifRef} className="relative">
            <motion.button
              onClick={() => setShowNotifs(!showNotifs)}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition relative"
            >
              <Bell className="w-5 h-5" />
              <AnimatePresence>
                {unread > 0 && (
                  <motion.span
                    key="badge"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={{ type: "spring", stiffness: 500 }}
                    className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center"
                  >
                    {unread}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>

            <AnimatePresence>
              {showNotifs && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 380, damping: 28 }}
                  className="absolute right-0 mt-3 w-[calc(100vw-2rem)] max-w-xs sm:w-80 max-h-[70vh] sm:max-h-96 overflow-y-auto rounded-xl bg-white border border-slate-200 shadow-2xl p-4 z-50"
                >
                  <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-100">
                    <span className="font-bold text-sm text-slate-800">Notifications</span>
                    {unread > 0 && (
                      <button
                        onClick={markAllRead}
                        className="text-xs text-primary font-mono hover:underline"
                      >
                        Mark all read ({unread})
                      </button>
                    )}
                  </div>
                  <motion.div
                    variants={{ show: { transition: { staggerChildren: 0.05 } } }}
                    initial="hidden"
                    animate="show"
                    className="space-y-2"
                  >
                    {notifications.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">No notifications yet</p>
                    ) : (
                      notifications.map((notif) => (
                        <motion.div
                          key={notif.id}
                          variants={{ hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0 } }}
                          onClick={() => handleNotifClick(notif.id, notif.complaint_id)}
                          whileHover={{ x: 2 }}
                          className={`p-2.5 rounded-lg text-xs cursor-pointer transition-colors ${
                            notif.read
                              ? "bg-slate-50 text-slate-500"
                              : "bg-primary/5 border-l-2 border-primary text-slate-800 font-semibold"
                          }`}
                        >
                          <div className="flex justify-between items-start mb-0.5">
                            <span className="font-bold text-slate-700">{notif.title}</span>
                            <span className="text-[9px] text-slate-400 font-mono">
                              {new Date(notif.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <p className="text-[11px] leading-relaxed">{notif.message}</p>
                        </motion.div>
                      ))
                    )}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* User pill */}
          <div className="hidden sm:flex items-center space-x-2 border-l border-slate-200 pl-3">
            <motion.button
              onClick={() => setShowProfile(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center space-x-2 p-1.5 rounded-xl hover:bg-slate-100 transition text-left"
            >
              <div className="w-8 h-8 rounded-full bg-[#1A3A5C] flex items-center justify-center shrink-0">
                {portal === "admin" ? <Shield className="w-4 h-4 text-orange-400" /> : <User className="w-4 h-4 text-primary" />}
              </div>
              <div className="leading-none max-w-[110px]">
                <span className="text-xs font-bold block truncate text-slate-700">
                  {userName || (portal === "admin" ? "Admin Officer" : "Citizen")}
                </span>
                <span className="text-[9px] font-mono text-slate-400 uppercase tracking-tight">
                  {portal === "admin" ? "Govt Staff" : "Contributor"}
                </span>
              </div>
            </motion.button>
          </div>

          {/* Logout */}
          <motion.button
            onClick={logout}
            whileHover={{ scale: 1.1, color: "#ef4444" }}
            whileTap={{ scale: 0.92 }}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 transition"
            title="Sign Out"
          >
            <LogOut className="w-5 h-5" />
          </motion.button>

          {/* Mobile hamburger */}
          <motion.button
            onClick={() => setMobileOpen(!mobileOpen)}
            whileTap={{ scale: 0.9 }}
            className="xl:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition"
          >
            <AnimatePresence mode="wait">
              {mobileOpen ? (
                <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
                  <X className="w-5 h-5" />
                </motion.span>
              ) : (
                <motion.span key="menu" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}>
                  <Menu className="w-5 h-5" />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="xl:hidden absolute top-full left-0 w-full bg-white border-b border-slate-200 shadow-xl overflow-hidden z-40"
            >
              <motion.div
                variants={{ show: { transition: { staggerChildren: 0.05 } } }}
                initial="hidden"
                animate="show"
                className="p-4 flex flex-col space-y-1"
              >
                {links.map((link) => {
                  const isActive = pathname === link.href;
                  return (
                    <motion.div key={link.href} variants={navItemVariants}>
                      <Link
                        href={link.href}
                        onClick={() => setMobileOpen(false)}
                        className={`block px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                          isActive ? "bg-primary text-white" : "text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {link.name}
                      </Link>
                    </motion.div>
                  );
                })}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>

      {/* Portal modal — renders directly on document.body, fully outside the nav stacking context */}
      {modal}
    </>
  );
}
