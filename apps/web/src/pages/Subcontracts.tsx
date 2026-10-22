import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X, Loader2, Download } from "lucide-react";
import { api } from "../lib/api";

interface Subcontractor { id: string; name: string; trade: string | null; phone: string | null; status: string; }
interface Subcontract { id: string; contractNumber: string; totalValue: string; retentionPercent: string; subcontractorName: string; trade: string | null; }
interface Measurement { id: string; measurementNumber: string; claimedAmount: string; approvedAmount: string; status: string; }
interface Project { id: string; name: string; }

export default function Subcontracts() {
  const { t } = useTranslation();
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [subcontracts, setSubcontracts] = useState<Subcontract[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Subcontract | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showSubkModal, setShowSubkModal] = useState(false);
  const [showContractModal, setShowContractModal] = useState(false);
  const [showMeasureModal, setShowMeasureModal] = useState(false);

  const [subkForm, setSubkForm] = useState({ name: "", trade: "", phone: "" });
  const [contractForm, setContractForm] = useState({ projectId: "", subcontractorId: "", contractNumber: "", scope: "", totalValue: "", retentionPercent: "10.00" });
  const [measureForm, setMeasureForm] = useState({ measurementNumber: "", claimedAmount: "" });
  const [paymentForm, setPaymentForm] = useState({ measurementId: "", amount: "" });

  const loadData = async () => {
    try {
      const [sData, cData, pData] = await Promise.all([
        api<{ subcontractors: Subcontractor[] }>("/api/subcontracts/subcontractors"),
        api<{ subcontracts: Subcontract[] }>("/api/subcontracts"),
        api<{ projects: Project[] }>("/api/projects"),
      ]);
      setSubcontractors(sData.subcontractors);
      setSubcontracts(cData.subcontracts);
      setProjects(pData.projects);
      if (pData.projects.length > 0) setContractForm((f) => ({ ...f, projectId: f.projectId || pData.projects[0].id }));
      if (sData.subcontractors.length > 0) setContractForm((f) => ({ ...f, subcontractorId: f.subcontractorId || sData.subcontractors[0].id }));
      if (selected) {
        const mData = await api<{ measurements: Measurement[] }>(`/api/subcontracts/${selected.id}/measurements`);
        setMeasurements(mData.measurements);
      }
    } catch (err) {
      console.error("loadData failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [selected]);

  const createSubcontractor = async (e: FormEvent) => {
    e.preventDefault(); setActionLoading(true);
    try {
      await api("/api/subcontracts/subcontractors", { method: "POST", body: JSON.stringify(subkForm) });
      setShowSubkModal(false); setSubkForm({ name: "", trade: "", phone: "" });
      await loadData();
    } catch (err) { alert((err as Error).message); } finally { setActionLoading(false); }
  };

  const createSubcontract = async (e: FormEvent) => {
    e.preventDefault(); setActionLoading(true);
    try {
      await api("/api/subcontracts", { method: "POST", body: JSON.stringify(contractForm) });
      setShowContractModal(false);
      setContractForm((f) => ({ ...f, contractNumber: "", scope: "", totalValue: "" }));
      await loadData();
    } catch (err) { alert((err as Error).message); } finally { setActionLoading(false); }
  };

  const createMeasurement = async (e: FormEvent) => {
    e.preventDefault(); setActionLoading(true);
    try {
      await api(`/api/subcontracts/${selected?.id}/measurements`, { method: "POST", body: JSON.stringify(measureForm) });
      setShowMeasureModal(false); setMeasureForm({ measurementNumber: "", claimedAmount: "" });
      await loadData();
    } catch (err) { alert((err as Error).message); } finally { setActionLoading(false); }
  };

  const approveMeasurement = async (id: string) => {
    setActionLoading(true);
    try {
      await api(`/api/subcontracts/measurements/${id}/approve`, { method: "POST", body: JSON.stringify({}) });
      await loadData();
    } catch (err) { alert((err as Error).message); } finally { setActionLoading(false); }
  };

  const recordPayment = async (e: FormEvent) => {
    e.preventDefault(); setActionLoading(true);
    try {
      await api(`/api/subcontracts/measurements/${paymentForm.measurementId}/payments`, { method: "POST", body: JSON.stringify({ amount: paymentForm.amount }) });
      setPaymentForm({ measurementId: "", amount: "" });
      await loadData();
    } catch (err) { alert((err as Error).message); } finally { setActionLoading(false); }
  };

  const downloadMeasurementCert = async (mId: string, mNumber: string) => {
    setActionLoading(true);
    try {
      const token = localStorage.getItem("enderasie_token");
      const base = (import.meta.env.VITE_API_URL as string) || "http://localhost:4000";
      const res = await fetch(`${base}/api/subcontracts/measurements/${mId}/certificate`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to download certificate");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `MC_${mNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="flex justify-center h-64 items-center"><Loader2 className="animate-spin text-brand-orange" size={32} /></div>;

  const totalSubcontracted = subcontracts.reduce((s, c) => s + parseFloat(c.totalValue || "0"), 0);
  const totalMeasured = measurements.reduce((s, m) => s + parseFloat(m.approvedAmount || "0"), 0);
  const retentionHeld = selected ? totalMeasured * (parseFloat(selected.retentionPercent) / 100) : 0;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-display text-2xl font-bold text-text-primary">{t("subcontracts.title")}</h2>
        <div className="flex gap-2">
          
          <button onClick={() => setShowContractModal(true)} className="flex items-center gap-2 bg-brand-orange hover:bg-brand-orangeHover text-white px-4 py-2 rounded-lg text-sm font-semibold">
            <Plus size={16} /> {t("subcontracts.new")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-5 rounded-xl border border-surface-border shadow-sm">
          <p className="text-sm text-text-secondary">{t("subcontracts.subcontracted")}</p>
          <p className="text-2xl font-bold text-text-primary mt-1">{totalSubcontracted.toLocaleString()} <span className="text-sm font-normal">ETB</span></p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-surface-border shadow-sm">
          <p className="text-sm text-text-secondary">{t("subcontracts.measured")}</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{totalMeasured.toLocaleString()} <span className="text-sm font-normal">ETB</span></p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-surface-border shadow-sm">
          <p className="text-sm text-text-secondary">{t("subcontracts.retention_held")}</p>
          <p className="text-2xl font-bold text-brand-orange mt-1">{retentionHeld.toLocaleString()} <span className="text-sm font-normal">ETB</span></p>
        </div>
      </div>

            <div className="flex justify-between items-center mb-2">
        <p className="text-sm font-semibold text-text-secondary">{t("subcontracts.registry")}</p>
        <button onClick={() => setShowSubkModal(true)} className="flex items-center gap-1 text-sm text-brand-orange hover:underline font-semibold">
          <Plus size={14} /> {t("subcontracts.new_subcontractor")}
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mb-8">
        {subcontractors.length === 0 && <span className="text-sm text-text-secondary">—</span>}
        {subcontractors.map((s) => (
          <span key={s.id} className="px-3 py-1.5 bg-white border border-surface-border rounded-full text-sm text-text-secondary">
            🛠️ {s.name}{s.trade ? ` · ${s.trade}` : ""}
          </span>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-surface-border overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-text-secondary text-left">
            <tr>
              <th className="px-6 py-3 font-medium">Contract #</th>
              <th className="px-6 py-3 font-medium">Subcontractor</th>
              <th className="px-6 py-3 font-medium">{t("subcontracts.value")}</th>
              <th className="px-6 py-3 font-medium">{t("subcontracts.retention_held")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {subcontracts.map((c) => (
              <tr key={c.id} onClick={() => setSelected(c)} className={`cursor-pointer hover:bg-surface-muted/50 ${selected?.id === c.id ? "bg-blue-50" : ""}`}>
                <td className="px-6 py-4 font-semibold text-text-primary">{c.contractNumber}</td>
                <td className="px-6 py-4 text-text-secondary">{c.subcontractorName}{c.trade ? ` · ${c.trade}` : ""}</td>
                <td className="px-6 py-4 text-text-primary">{parseFloat(c.totalValue).toLocaleString()} ETB</td>
                <td className="px-6 py-4 text-text-secondary">{c.retentionPercent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="bg-white rounded-xl border border-surface-border p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-display text-lg font-bold text-text-primary">{t("measurement.title")} — {selected.contractNumber}</h3>
            <button onClick={() => setShowMeasureModal(true)} className="text-sm flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">
              <Plus size={14} /> {t("measurement.new")}
            </button>
          </div>
          <div className="space-y-3">
            {measurements.length === 0 ? (
              <p className="text-text-secondary text-sm text-center py-4">No measurements yet.</p>
            ) : measurements.map((m) => (
              <div key={m.id} className="border border-surface-border rounded-lg p-4 flex justify-between items-center">
                <div>
                  <p className="font-semibold text-text-primary">{m.measurementNumber}</p>
                  <p className="text-xs text-text-secondary">Claimed: {parseFloat(m.claimedAmount).toLocaleString()} ETB | Approved: {parseFloat(m.approvedAmount).toLocaleString()} ETB</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-bold ${
                    m.status === "draft" ? "bg-slate-100 text-slate-700" :
                    m.status === "approved" ? "bg-blue-100 text-blue-700" :
                    m.status === "partially_paid" ? "bg-amber-100 text-amber-700" :
                    "bg-green-100 text-green-700"
                  }`}>
                    {t(`measurement.status.${m.status}`)}
                  </span>
                  {m.status === "draft" && (
                    <button onClick={() => approveMeasurement(m.id)} disabled={actionLoading} className="text-xs bg-brand-orange text-white px-3 py-1.5 rounded hover:bg-brand-orangeHover disabled:opacity-50">
                      {t("measurement.approve")}
                    </button>
                  )}
                  {(m.status === "approved" || m.status === "partially_paid") && (
                    <form onSubmit={recordPayment} className="flex gap-1">
                      <input
                        type="number"
                        placeholder="Amount"
                        value={paymentForm.measurementId === m.id ? paymentForm.amount : ""}
                        onChange={(e) => setPaymentForm({ measurementId: m.id, amount: e.target.value })}
                        className="w-24 text-xs border rounded px-2 py-1"
                        required
                      />
                      <button type="submit" disabled={actionLoading} className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 disabled:opacity-50">
                        {t("payment.record")}
                      </button>
                    </form>
                  )}
                  {m.status !== "draft" && m.status !== "submitted" && (
                    <button
                      onClick={() => downloadMeasurementCert(m.id, m.measurementNumber)}
                      disabled={actionLoading}
                      className="text-xs bg-white border border-surface-border text-text-primary px-2 py-1 rounded hover:bg-surface-muted flex items-center gap-1 disabled:opacity-50"
                    >
                      <Download size={12} /> PDF
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showSubkModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-display text-lg font-bold text-text-primary">{t("subcontracts.new_subcontractor")}</h3>
              <button onClick={() => setShowSubkModal(false)} className="text-text-secondary"><X size={20} /></button>
            </div>
            <form onSubmit={createSubcontractor} className="space-y-4">
              <input placeholder={t("subcontracts.name")} value={subkForm.name} onChange={(e) => setSubkForm({ ...subkForm, name: e.target.value })} required className="w-full rounded-lg border border-surface-border px-4 py-2.5" />
              <input placeholder={t("subcontracts.trade")} value={subkForm.trade} onChange={(e) => setSubkForm({ ...subkForm, trade: e.target.value })} className="w-full rounded-lg border border-surface-border px-4 py-2.5" />
              <input placeholder={t("subcontracts.phone")} value={subkForm.phone} onChange={(e) => setSubkForm({ ...subkForm, phone: e.target.value })} className="w-full rounded-lg border border-surface-border px-4 py-2.5" />
              <button type="submit" disabled={actionLoading} className="w-full bg-brand-orange text-white py-3 rounded-lg font-semibold disabled:opacity-50">
                {actionLoading ? <Loader2 className="animate-spin mx-auto" size={20} /> : t("subcontracts.new_subcontractor")}
              </button>
            </form>
          </div>
        </div>
      )}

      {showContractModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-display text-lg font-bold text-text-primary">{t("subcontracts.new")}</h3>
              <button onClick={() => setShowContractModal(false)} className="text-text-secondary"><X size={20} /></button>
            </div>
            <form onSubmit={createSubcontract} className="space-y-4">
              <select value={contractForm.projectId} onChange={(e) => setContractForm((f) => ({ ...f, projectId: e.target.value }))} required className="w-full rounded-lg border border-surface-border px-4 py-2.5">
                <option value="">Select Project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={contractForm.subcontractorId} onChange={(e) => setContractForm((f) => ({ ...f, subcontractorId: e.target.value }))} required className="w-full rounded-lg border border-surface-border px-4 py-2.5">
                <option value="">Select Subcontractor</option>
                {subcontractors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input placeholder="Contract #" value={contractForm.contractNumber} onChange={(e) => setContractForm((f) => ({ ...f, contractNumber: e.target.value }))} required className="w-full rounded-lg border border-surface-border px-4 py-2.5" />
              <input placeholder={t("subcontracts.scope")} value={contractForm.scope} onChange={(e) => setContractForm((f) => ({ ...f, scope: e.target.value }))} className="w-full rounded-lg border border-surface-border px-4 py-2.5" />
              <input type="number" placeholder={t("subcontracts.value")} value={contractForm.totalValue} onChange={(e) => setContractForm((f) => ({ ...f, totalValue: e.target.value }))} required className="w-full rounded-lg border border-surface-border px-4 py-2.5" />
              <input type="number" placeholder="Retention %" value={contractForm.retentionPercent} onChange={(e) => setContractForm((f) => ({ ...f, retentionPercent: e.target.value }))} className="w-full rounded-lg border border-surface-border px-4 py-2.5" />
              <button type="submit" disabled={actionLoading} className="w-full bg-brand-orange text-white py-3 rounded-lg font-semibold disabled:opacity-50">
                {actionLoading ? <Loader2 className="animate-spin mx-auto" size={20} /> : t("subcontracts.new")}
              </button>
            </form>
          </div>
        </div>
      )}

      {showMeasureModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-display text-lg font-bold text-text-primary">{t("measurement.new")}</h3>
              <button onClick={() => setShowMeasureModal(false)} className="text-text-secondary"><X size={20} /></button>
            </div>
            <form onSubmit={createMeasurement} className="space-y-4">
              <input placeholder="Measurement #" value={measureForm.measurementNumber} onChange={(e) => setMeasureForm({ ...measureForm, measurementNumber: e.target.value })} required className="w-full rounded-lg border border-surface-border px-4 py-2.5" />
              <input type="number" placeholder={t("measurement.claimed") + " (ETB)"} value={measureForm.claimedAmount} onChange={(e) => setMeasureForm({ ...measureForm, claimedAmount: e.target.value })} required className="w-full rounded-lg border border-surface-border px-4 py-2.5" />
              <button type="submit" disabled={actionLoading} className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold disabled:opacity-50">
                {actionLoading ? <Loader2 className="animate-spin mx-auto" size={20} /> : t("measurement.new")}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}