"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Megaphone,
  Settings,
  Zap,
  Bot,
  Menu,
  X,
  MessageCircle,
  BarChart3,
  Terminal,
  Flame,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/ai-campaign", label: "AI Campaign", icon: Bot },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/hot-leads", label: "Hot Leads", icon: Flame },
  { href: "/messages", label: "Messaggi", icon: MessageSquare },
  { href: "/outreach", label: "Outreach", icon: MessageCircle },
  { href: "/campaigns", label: "Campagne", icon: Megaphone },
  { href: "/jobs", label: "Esegui Job", icon: Terminal },
  { href: "/usage", label: "Utilizzo AI", icon: BarChart3 },
  { href: "/settings", label: "Impostazioni", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close sidebar on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
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
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 h-screen w-64 bg-[var(--card)] border-r border-[var(--border)] flex flex-col z-50 transition-transform duration-200 ease-in-out ${
        open ? "translate-x-0" : "-translate-x-full"
      } lg:translate-x-0`}>
        <div className="p-6 border-b border-[var(--border)]">
          <Link href="/" className="flex items-center gap-2">
            <Zap className="w-7 h-7 text-[var(--primary)]" />
            <span className="text-xl font-bold text-[var(--foreground)]">
              Lead Finder
            </span>
          </Link>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">by Bitora</p>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]"
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[var(--border)]">
          <p className="text-xs text-[var(--muted-foreground)]">
            © {new Date().getFullYear()} Bitora.it
          </p>
        </div>
      </aside>
    </>
  );
}
