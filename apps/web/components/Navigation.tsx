"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  Scale,
  ArrowRightLeft,
  Satellite,
  Radio,
  Leaf,
  Smartphone,
} from "lucide-react";

const navItems = [
  { href: "/",             label: "Dashboard",    icon: LayoutDashboard },
  { href: "/ledger",       label: "Ledger",       icon: Scale },
  { href: "/transactions", label: "Transactions", icon: ArrowRightLeft },
  { href: "/sentinel",     label: "Sentinel",     icon: Satellite },
  { href: "/activity",     label: "Activity",     icon: Radio },
  { href: "/mobile-demo",  label: "Field Agent",  icon: Smartphone },
] as const;

export function Navigation() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
      {/* Skip navigation for screen readers */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-white focus:outline-none"
      >
        Skip to main content
      </a>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
            aria-label="Finagra Unity — Investor Command Center home"
          >
            <Leaf className="h-7 w-7 text-brand-600" aria-hidden="true" />
            <div>
              <span className="text-lg font-bold text-gray-900">Finagra</span>
              <span className="ml-1 text-xs font-medium text-gray-600 hidden sm:inline">
                Investor CC
              </span>
            </div>
          </Link>

          {/* Nav */}
          <nav aria-label="Main navigation">
            <ul className="flex items-center gap-1" role="list">
              {navItems.map(({ href, label, icon: Icon }) => {
                const active =
                  href === "/" ? pathname === "/" : pathname.startsWith(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={clsx(
                        "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        "focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2",
                        active
                          ? "bg-brand-50 text-brand-700"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      <span className="hidden sm:inline">{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>
    </header>
  );
}
