"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  ScrollText,
  Settings,
  Zap,
  Bot,
  Menu,
  X,
  MessageCircle,
  BarChart3,
  Terminal,
  Flame,
  Smartphone,
} from "lucide-react";

const NAV_GROUPS = [
  {
    label: "Operativo",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/leads", label: "Leads", icon: Users },
      { href: "/hot-leads", label: "Hot Leads", icon: Flame },
      { href: "/messages", label: "Messaggi", icon: MessageSquare },
      { href: "/outreach", label: "Outreach", icon: MessageCircle },
    ],
  },
  {
    label: "Automazione",
    items: [
      { href: "/ai-campaign", label: "AI Campaign", icon: Bot },
      { href: "/campaigns", label: "Campagne", icon: Zap },
      { href: "/jobs", label: "Esegui Job", icon: Terminal },
      { href: "/whatsapp", label: "Chat WhatsApp", icon: Smartphone },
    ],
  },
  {
    label: "Analisi",
    items: [
      { href: "/usage", label: "Utilizzo AI", icon: BarChart3 },
      { href: "/logs", label: "Log", icon: ScrollText },
    ],
  },
  {
    label: "Config",
    items: [
      { href: "/settings", label: "Impostazioni", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 h-14 bg-[var(--card)] border-b border-[var(--border)] flex items-center px-4 gap-3 z-50 lg:hidden">
        <button
          onClick={() => setOpen(!open)}
          className="p-1.5 rounded-lg hover:bg-[var(--muted)] text-[var(--foreground)]"
          aria-label="Toggle menu"
        >
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
        <Link href="/" className="flex items-center gap-2">
          <Zap className="w-6 h-6 text-[var(--primary)]" />
          <span className="text-lg font-bold text-[var(--foreground)]">Lead Finder</span>
        </Link>
      </div>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 h-screen w-64 bg-[var(--card)] border-r border-[var(--border)] flex flex-col z-50 transition-transform duration-200 ease-in-out ${
        open ? "translate-x-0" : "-translate-x-full"
      } lg:translate-x-0`}>
        <div className="p-5 border-b border-[var(--border)]">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--primary)] flex items-center justify-center">
              <Zap className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <span className="text-base font-bold text-[var(--foreground)] block leading-tight">Lead Finder</span>
              <span className="text-[10px] text-[var(--muted-foreground)] leading-none">by Bitora</span>
            </div>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)] px-3 mb-1.5">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/" && pathname.startsWith(item.href));
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[0.8rem] font-medium transition-all duration-150 ${
                        isActive
                          ? "bg-[var(--primary)] text-white shadow-md shadow-[var(--primary)]/20"
                          : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-[var(--border)]">
          <p className="text-[10px] text-[var(--muted-foreground)] text-center">
            © {new Date().getFullYear()} Bitora.it
          </p>
        </div>
      </aside>
    </>
  );
}
