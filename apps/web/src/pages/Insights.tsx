import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend, BarChart, Bar } from "recharts";
import { api } from "../lib/api";

interface Kpi { contracted: number; billed: number; collected: number; subcontracted: number; paidOut: number; payroll: number; netPosition: number; }
interface CashPoint { month: string; inflow: number; outflow: number; }

export default function Insights() {
  const { t } = useTranslation();
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [cashflow, setCashflow] = useState<CashPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api<{ kpi: Kpi; cashflow: CashPoint[] }>("/api/insights/overview");
        setKpi(data.kpi);
        setCashflow(data.cashflow);
      } catch (err) {
        console.error("loadData failed:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading || !kpi) return <div className="flex justify-center h-64 items-center"><Loader2 className="animate-spin text-brand-orange" size={32} /></div>;

  const costData = [
    { name: t("insights.collected"), value: kpi.collected },
    { name: t("insights.paid_out"), value: kpi.paidOut },
    { name: t("insights.payroll"), value: kpi.payroll },
    { name: t("insights.net"), value: kpi.netPosition },
  ];

  const cards = [
    { label: t("insights.contracted"), value: kpi.contracted, color: "text-text-primary" },
    { label: t("insights.billed"), value: kpi.billed, color: "text-blue-600" },
    { label: t("insights.collected"), value: kpi.collected, color: "text-green-600" },
    { label: t("insights.subcontracted"), value: kpi.subcontracted, color: "text-text-primary" },
    { label: t("insights.paid_out"), value: kpi.paidOut, color: "text-brand-orange" },
    { label: t("insights.payroll"), value: kpi.payroll, color: "text-amber-600" },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <h2 className="font-display text-2xl font-bold text-text-primary mb-6">{t("insights.title")}</h2>

      <div className={`p-6 rounded-xl border shadow-sm mb-6 ${kpi.netPosition >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
        <p className="text-sm text-text-secondary">{t("insights.net")}</p>
        <p className={`text-4xl font-bold ${kpi.netPosition >= 0 ? "text-green-700" : "text-red-700"}`}>
          {kpi.netPosition.toLocaleString()} <span className="text-base font-normal">ETB</span>
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="bg-white p-5 rounded-xl border border-surface-border shadow-sm">
            <p className="text-sm text-text-secondary">{c.label}</p>
            <p className={`text-xl font-bold mt-1 ${c.color}`}>{c.value.toLocaleString()} <span className="text-xs font-normal">ETB</span></p>
          </div>
        ))}
      </div>

      <div className="bg-white p-6 rounded-xl border border-surface-border shadow-sm mb-8">
        <h3 className="font-display text-lg font-bold text-text-primary mb-4">{t("insights.cashflow")}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={cashflow}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip formatter={(v) => Number(v).toLocaleString()} />
            <Legend />
            <Area type="monotone" dataKey="inflow" name={t("insights.inflow")} stroke="#16a34a" fill="#16a34a33" strokeWidth={2} />
            <Area type="monotone" dataKey="outflow" name={t("insights.outflow")} stroke="#ea580c" fill="#ea580c33" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white p-6 rounded-xl border border-surface-border shadow-sm">
        <h3 className="font-display text-lg font-bold text-text-primary mb-4">{t("insights.cost_structure")}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={costData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip formatter={(v) => Number(v).toLocaleString()} />
            <Bar dataKey="value" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}