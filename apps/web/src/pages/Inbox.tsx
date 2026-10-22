import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle, Loader2, RefreshCw } from "lucide-react";
import { api } from "../lib/api";

interface Action {
  action: string;
  label: string;
}

interface Approval {
  id: string;
  title: string;
  status: string;
  estimatedCost: string;
  projectName: string;
  createdAt: string;
  availableActions: Action[];
}

export default function Inbox() {
  const { t } = useTranslation();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchInbox = async () => {
    try {
      const data = await api<{ approvals: Approval[] }>("/api/approvals/awaiting-me");
      setApprovals(data.approvals);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInbox(); }, []);

  const handleAction = async (id: string, action: string) => {
    setProcessing(id);
    try {
      const endpoint = `/api/requests/${id}/${action}`;
      let body = {};
      if (action === "issue") body = { issuedQty: 100, shortQty: 0 };
      if (action === "void" || action === "return") body = { reason: "Processed via UI" };
      await api(endpoint, { method: "POST", body: JSON.stringify(body) });
      await fetchInbox();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setProcessing(null);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-brand-orange" size={32} /></div>;

  const statusCounts = approvals.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="w-full">
      {/* PAGE HEADER */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-text-primary">{t("inbox.title")}</h2>
          <p className="text-sm text-text-secondary mt-1">
            {approvals.length} {t("inbox.awaiting", "request(s) awaiting your action")}
          </p>
        </div>
        <button onClick={fetchInbox} className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary border border-surface-border bg-white rounded-lg px-3 py-2">
          <RefreshCw size={15} /> {t("actions.refresh", "Refresh")}
        </button>
      </div>

      {/* STATUS COUNT CHIPS */}
      {approvals.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(statusCounts).map(([status, count]) => (
            <span key={status} className="px-3 py-1 rounded-full bg-white border border-surface-border text-xs font-semibold text-text-secondary">
              <span className="font-bold text-text-primary">{count}</span> · {t(`status.${status}`)}
            </span>
          ))}
        </div>
      )}

      {approvals.length === 0 ? (
        <div className="bg-white rounded-xl border border-surface-border p-12 text-center">
          <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
          <p className="text-text-secondary">{t("inbox.empty")}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-surface-border overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-text-secondary text-left text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5 font-semibold">{t("inbox.col.request", "Request")}</th>
                <th className="px-6 py-3.5 font-semibold">{t("inbox.col.project", "Project")}</th>
                <th className="px-6 py-3.5 font-semibold">{t("inbox.col.date", "Date")}</th>
                <th className="px-6 py-3.5 font-semibold text-right">{t("inbox.col.cost", "Est. Cost")}</th>
                <th className="px-6 py-3.5 font-semibold">{t("inbox.col.status", "Status")}</th>
                <th className="px-6 py-3.5 font-semibold text-right">{t("inbox.col.actions", "Actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {approvals.map((item) => (
                <tr key={item.id} className="hover:bg-surface-muted/50 transition-colors">
                  <td className="px-6 py-4 font-semibold text-text-primary">{item.title}</td>
                  <td className="px-6 py-4 text-text-secondary">{item.projectName}</td>
                  <td className="px-6 py-4 text-text-secondary">{new Date(item.createdAt).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-right font-semibold text-text-primary tabular-nums">{Number(item.estimatedCost).toLocaleString()} ETB</td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 rounded-full bg-brand-amber/20 text-brand-orangeHover text-xs font-bold uppercase">
                      {t(`status.${item.status}`)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2 justify-end">
                      {item.availableActions.map((action) => (
                        <button
                          key={action.action}
                          onClick={() => handleAction(item.id, action.action)}
                          disabled={processing === item.id}
                          className="flex items-center gap-1.5 bg-brand-orange hover:bg-brand-orangeHover text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                        >
                          {processing === item.id && <Loader2 size={14} className="animate-spin" />}
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}