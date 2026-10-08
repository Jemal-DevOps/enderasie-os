import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, Inbox, ClipboardList, LogOut } from "lucide-react";
import { auth } from "../lib/auth";
import LanguageSwitcher from "./LanguageSwitcher";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, labelKey: "nav.dashboard" },
  { to: "/approvals", icon: Inbox, labelKey: "nav.approvals" },
  { to: "/requests", icon: ClipboardList, labelKey: "nav.requests" },
];

export default function Layout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = auth.getUser();

  const handleLogout = () => {
    auth.clear();
    navigate("/login");
  };

  return (
    <div className="flex h-screen bg-surface-muted">
      {/* Navy Sidebar */}
      <aside className="w-64 bg-control-bg text-text-inverted flex flex-col border-r border-control-border">
        <div className="px-6 py-8 border-b border-control-border">
          <h1 className="font-display text-xl font-bold text-brand-orange">{t("app.name")}</h1>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? "bg-brand-orange text-white" : "text-slate-300 hover:bg-control-surface hover:text-white"
                }`
              }
            >
              <item.icon size={18} />
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-control-border">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-slate-300 hover:bg-control-surface hover:text-white transition-colors"
          >
            <LogOut size={18} />
            {t("nav.logout")}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-surface-border flex items-center justify-between px-8">
          <div className="text-sm text-text-secondary">
  {t("topbar.welcome")} <span className="font-semibold text-text-primary">{user?.fullName}</span>
</div>
          <LanguageSwitcher />
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}