import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LogIn, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { auth } from "../lib/auth";
import LanguageSwitcher from "../components/LanguageSwitcher";

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("dawit@enderasie.com");
  const [password, setPassword] = useState("Password123!");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await api<{ token: string; user: { id: string; email: string; fullName: string } }>(
        "/auth/login",
        { method: "POST", body: JSON.stringify({ email, password }) }
      );
      auth.setSession(data.token, data.user);
      navigate("/dashboard");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-muted p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-end mb-4">
          <LanguageSwitcher />
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-surface-border overflow-hidden">
          {/* Brand header */}
          <div className="bg-control-bg px-8 py-10 text-center">
            <h1 className="font-display text-3xl font-bold text-text-inverted">
              {t("app.name")}
            </h1>
            <p className="mt-2 text-sm text-slate-400">{t("auth.loginTitle")}</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-8 py-8 space-y-5">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                {t("auth.email")}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-surface-border px-4 py-2.5 text-text-primary focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/20 outline-none transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                {t("auth.password")}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-surface-border px-4 py-2.5 text-text-primary focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/20 outline-none transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand-orange hover:bg-brand-orangeHover disabled:opacity-60 px-4 py-3 text-white font-semibold transition-colors"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
              {t("auth.login")}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-text-secondary">
          © 2026 Enderasie OS · The Construction Operating System
        </p>
      </div>
    </div>
  );
}