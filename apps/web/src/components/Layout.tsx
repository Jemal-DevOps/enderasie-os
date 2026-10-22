import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, Inbox, ClipboardList, FileText, HardHat, Users, BarChart3, LogOut, Languages, ChevronRight } from "lucide-react";

const NAV_GROUPS = [
  {
    label: "Operations",
    items: [
      { to: "/", icon: LayoutDashboard, labelKey: "nav.dashboard" },
      { to: "/approvals", icon: Inbox, labelKey: "nav.approvals" },
      { to: "/requests", icon: ClipboardList, labelKey: "nav.requests" },
    ],
  },
  {
    label: "Commercial",
    items: [
      { to: "/contracts", icon: FileText, labelKey: "nav.contracts" },
      { to: "/subcontracts", icon: HardHat, labelKey: "nav.subcontracts" },
    ],
  },
  {
    label: "People",
    items: [{ to: "/hr", icon: Users, labelKey: "nav.hr" }],
  },
  {
    label: "Intelligence",
    items: [{ to: "/insights", icon: BarChart3, labelKey: "nav.insights" }],
  },
];

const TITLES: Record<string, string> = {
  "/": "nav.dashboard",
  "/approvals": "nav.approvals",
  "/requests": "nav.requests",
  "/contracts": "nav.contracts",
  "/subcontracts": "nav.subcontracts",
  "/hr": "nav.hr",
  "/insights": "nav.insights",
};

export default function Layout() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const titleKey = TITLES[location.pathname] ?? "nav.dashboard";
  const isProd = window.location.hostname.includes("vercel.app");

  let storedUser: { fullName?: string; email?: string } | null = null;
  try { storedUser = JSON.parse(localStorage.getItem("enderasie_user") || "null"); } catch { storedUser = null; }

  const logout = () => {
    localStorage.removeItem("enderasie_token");
    localStorage.removeItem("enderasie_user");
    window.location.href = "/login";
  };

  const initials = (storedUser?.fullName || "EO").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="flex h-screen bg-surface-muted/40">
      {/* SIDEBAR */}
      <aside className="w-64 shrink-0 flex flex-col bg-[#0B1220] border-r border-white/5">
        <div className="px-6 h-16 flex items-center justify-between border-b border-white/5">
          <span className="font-display text-lg font-bold text-brand-orange">Enderasie OS</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60 font-mono">v1.5</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
          {NAV_GROUPS.map((g) => (
            <div key={g.label}>
              <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-white/40">{g.label}</p>
              <div className="space-y-1">
                {g.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        isActive ? "bg-brand-orange text-white shadow-sm" : "text-white/60 hover:bg-white/5 hover:text-white"
                      }`
                    }
                  >
                    <item.icon size={17} /> {t(item.labelKey)}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-white/5">
          {storedUser && (
            <div className="flex items-center gap-3 px-2 py-2">
              <span className="w-8 h-8 rounded-full bg-brand-orange/20 text-brand-orange flex items-center justify-center text-xs font-bold">{initials}</span>
              <div className="min-w-0">
                <p className="text-sm text-white truncate">{storedUser.fullName}</p>
                <p className="text-[11px] text-white/40 truncate">{storedUser.email}</p>
              </div>
            </div>
          )}
          <button onClick={logout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/60 hover:bg-white/5 hover:text-white">
            <LogOut size={17} /> {t("nav.logout", "Log out")}
          </button>
        </div>
      </aside>

      {/* MAIN COLUMN */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 shrink-0 bg-white border-b border-surface-border flex items-center justify-between px-6 lg:px-8">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text-secondary">Enderasie OS</span>
            <ChevronRight size={14} className="text-text-secondary/50" />
            <span className="font-semibold text-text-primary">{t(titleKey)}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-[10px] font-bold px-2 py-1 rounded ${isProd ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
              {isProd ? "PRODUCTION" : "LOCAL"}
            </span>
            <button
              onClick={() => i18n.changeLanguage(i18n.language === "en" ? "am" : "en")}
              className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary border border-surface-border rounded-lg px-3 py-1.5"
            >
              <Languages size={15} /> {i18n.language === "en" ? "አማርኛ" : "English"}
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
                    <div className="w-full p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}