import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { api } from "../lib/api";

interface Approval {
  id: string;
  title: string;
  status: string;
  estimatedCost: string;
  projectName: string;
  createdAt: string;
  requiredAction: string;
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
      let endpoint = `/api/requests/${id}/${action}`;
      let body = {};

      // Handle special payloads for specific actions
      if (action === "issue") body = { issuedQty: 100, shortQty: 0 }; // Mocking full stock issue for UI demo
      if (action === "void" || action === "return") body = { reason: "Processed via UI" };

      await api(endpoint, { method: "POST", body: JSON.stringify(body) });
      await fetchInbox(); // Refresh inbox after action
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setProcessing(null);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-brand-orange" size={32} /></div>;

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="font-display text-2xl font-bold text-text-primary mb-6">{t("inbox.title")}</h2>

      {approvals.length === 0 ? (
        <div className="bg-white rounded-xl border border-surface-border p-12 text-center">
          <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
          <p className="text-text-secondary">{t("inbox.empty")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {approvals.map((item) => (
            <div key={item.id} className="bg-white rounded-xl border border-surface-border p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-semibold text-lg text-text-primary">{item.title}</h3>
                  <p className="text-sm text-text-secondary">{item.projectName} · {new Date(item.createdAt).toLocaleDateString()}</p>
                </div>
                <span className="px-3 py-1 rounded-full bg-brand-amber/20 text-brand-orangeHover text-xs font-bold uppercase">
                  {t(`status.${item.status}`)}
                </span>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-surface-border">
                <div className="text-sm text-text-secondary">
                  {t("labels.cost")}: <span className="font-semibold text-text-primary">{Number(item.estimatedCost).toLocaleString()} ETB</span>
                </div>
                
                <button
                  onClick={() => handleAction(item.id, item.requiredAction)}
                  disabled={processing === item.id}
                  className="flex items-center gap-2 bg-brand-orange hover:bg-brand-orangeHover text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {processing === item.id ? <Loader2 size={16} className="animate-spin" /> : <AlertCircle size={16} />}
                  {t(`actions.${item.requiredAction}`) || item.requiredAction}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}