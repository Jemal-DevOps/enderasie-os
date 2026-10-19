import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X, Loader2 } from "lucide-react";
//import { Plus, X, Loader2, FileText, DollarSign, CheckCircle } from "lucide-react";
import { api } from "../lib/api";
interface Contract { id: string; contractNumber: string; clientName: string; totalValue: string; retentionPercent: string; projectId: string; }
interface Project { id: string; name: string; code: string; }
interface Ipc { id: string; ipcNumber: string; claimedAmount: string; approvedAmount: string; status: string; contractId: string; }

export default function Contracts() {
  const { t } = useTranslation();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [ipcs, setIpcs] = useState<Ipc[]>([]);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [showContractModal, setShowContractModal] = useState(false);
  const [showIpcModal, setShowIpcModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [contractForm, setContractForm] = useState({ projectId: "", contractNumber: "", clientName: "", totalValue: "", retentionPercent: "5.00" });
  const [ipcForm, setIpcForm] = useState({ ipcNumber: "", claimedAmount: "" });
  const [receiptForm, setReceiptForm] = useState({ ipcId: "", amount: "" });

    const loadData = async () => {
    try {
      const [cData, pData] = await Promise.all([
        api<{ contracts: Contract[] }>("/api/finance/contracts"),
        api<{ projects: Project[] }>("/api/projects"),
      ]);
      setContracts(cData.contracts);
      setProjects(pData.projects);
      if (pData.projects.length > 0) {
        setContractForm((f) => ({ ...f, projectId: f.projectId || pData.projects[0].id }));
      }
      if (selectedContract) {
        const iData = await api<{ ipcs: Ipc[] }>(`/api/finance/contracts/${selectedContract.id}/ipcs`);
        setIpcs(iData.ipcs);
      }
    } catch (err) {
      console.error("loadData failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [selectedContract]);

  const createContract = async (e: FormEvent) => {
        if (!contractForm.projectId) {
      alert("Please select a project first.");
      return;
    }
    e.preventDefault(); setActionLoading(true);
    try {
      await api("/api/finance/contracts", { method: "POST", body: JSON.stringify(contractForm) });
      setShowContractModal(false); setContractForm({ ...contractForm, contractNumber: "", clientName: "", totalValue: "" });
      await loadData();
    } catch (err) { alert((err as Error).message); } finally { setActionLoading(false); }
  };

  const createIpc = async (e: FormEvent) => {
    e.preventDefault(); setActionLoading(true);
    try {
      await api(`/api/finance/contracts/${selectedContract?.id}/ipcs`, { method: "POST", body: JSON.stringify(ipcForm) });
      setShowIpcModal(false); setIpcForm({ ipcNumber: "", claimedAmount: "" });
      await loadData();
    } catch (err) { alert((err as Error).message); } finally { setActionLoading(false); }
  };

  const approveIpc = async (ipcId: string) => {
    setActionLoading(true);
    try {
      await api(`/api/finance/ipcs/${ipcId}/approve`, { method: "POST", body: JSON.stringify({}) });
      await loadData();
    } catch (err) { alert((err as Error).message); } finally { setActionLoading(false); }
  };

  const recordReceipt = async (e: React.FormEvent) => {
    e.preventDefault(); setActionLoading(true);
    try {
      await api(`/api/finance/ipcs/${receiptForm.ipcId}/receipts`, { method: "POST", body: JSON.stringify({ amount: receiptForm.amount }) });
      setReceiptForm({ ipcId: "", amount: "" });
      await loadData();
    } catch (err) { alert((err as Error).message); } finally { setActionLoading(false); }
  };

  if (loading) return <div className="flex justify-center h-64 items-center"><Loader2 className="animate-spin text-brand-orange" size={32} /></div>;

  const totalContracted = contracts.reduce((sum, c) => sum + parseFloat(c.totalValue || "0"), 0);
  const totalBilled = ipcs.reduce((sum, i) => sum + parseFloat(i.approvedAmount || "0"), 0);
  const activeRetention = selectedContract ? (totalBilled * (parseFloat(selectedContract.retentionPercent) / 100)) : 0;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-display text-2xl font-bold text-text-primary">{t("contracts.title")}</h2>
        <button onClick={() => setShowContractModal(true)} className="flex items-center gap-2 bg-brand-orange hover:bg-brand-orangeHover text-white px-4 py-2 rounded-lg text-sm font-semibold">
          <Plus size={16} /> {t("contracts.new")}
        </button>
      </div>

      {/* FINANCIAL HEALTH CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-5 rounded-xl border border-surface-border shadow-sm">
          <p className="text-sm text-text-secondary">{t("contracts.value")} (Contracted)</p>
          <p className="text-2xl font-bold text-text-primary mt-1">{totalContracted.toLocaleString()} <span className="text-sm font-normal">ETB</span></p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-surface-border shadow-sm">
          <p className="text-sm text-text-secondary">{t("contracts.billed")} (Approved IPCs)</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{totalBilled.toLocaleString()} <span className="text-sm font-normal">ETB</span></p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-surface-border shadow-sm">
          <p className="text-sm text-text-secondary">{t("contracts.retention")} Held</p>
          <p className="text-2xl font-bold text-brand-orange mt-1">{activeRetention.toLocaleString()} <span className="text-sm font-normal">ETB</span></p>
        </div>
      </div>

      {/* CONTRACTS LIST */}
      <div className="bg-white rounded-xl border border-surface-border overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-text-secondary text-left">
            <tr>
              <th className="px-6 py-3 font-medium">Contract #</th>
              <th className="px-6 py-3 font-medium">{t("contracts.client")}</th>
              <th className="px-6 py-3 font-medium">{t("contracts.value")}</th>
              <th className="px-6 py-3 font-medium">{t("contracts.retention")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {contracts.map((c) => (
              <tr key={c.id} onClick={() => setSelectedContract(c)} className={`cursor-pointer hover:bg-surface-muted/50 ${selectedContract?.id === c.id ? 'bg-blue-50' : ''}`}>
                <td className="px-6 py-4 font-semibold text-text-primary">{c.contractNumber}</td>
                <td className="px-6 py-4 text-text-secondary">{c.clientName}</td>
                <td className="px-6 py-4 text-text-primary">{parseFloat(c.totalValue).toLocaleString()} ETB</td>
                <td className="px-6 py-4 text-text-secondary">{c.retentionPercent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* IPCs FOR SELECTED CONTRACT */}
      {selectedContract && (
        <div className="bg-white rounded-xl border border-surface-border p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-display text-lg font-bold text-text-primary">{t("ipc.title")} - {selectedContract.contractNumber}</h3>
            <button onClick={() => setShowIpcModal(true)} className="text-sm flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">
              <Plus size={14} /> {t("ipc.new")}
            </button>
          </div>
          
          <div className="space-y-3">
            {ipcs.length === 0 ? <p className="text-text-secondary text-sm text-center py-4">No IPCs yet. Create the first one.</p> : ipcs.map((ipc) => (
              <div key={ipc.id} className="border border-surface-border rounded-lg p-4 flex justify-between items-center">
                <div>
                  <p className="font-semibold text-text-primary">{ipc.ipcNumber}</p>
                  <p className="text-xs text-text-secondary">Claimed: {parseFloat(ipc.claimedAmount).toLocaleString()} ETB | Approved: {parseFloat(ipc.approvedAmount).toLocaleString()} ETB</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-bold ${
                    ipc.status === 'draft' ? 'bg-slate-100 text-slate-700' :
                    ipc.status === 'approved' ? 'bg-blue-100 text-blue-700' :
                    ipc.status === 'partially_paid' ? 'bg-amber-100 text-amber-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {t(`ipc.status.${ipc.status}`)}
                  </span>
                  
                  {ipc.status === 'draft' && (
                    <button onClick={() => approveIpc(ipc.id)} disabled={actionLoading} className="text-xs bg-brand-orange text-white px-3 py-1.5 rounded hover:bg-brand-orangeHover disabled:opacity-50">
                      {t("actions.approve_ipc")}
                    </button>
                  )}

                                    {(ipc.status === 'approved' || ipc.status === 'partially_paid') && (
                    <form onSubmit={recordReceipt} className="flex gap-1">
                      <input
                        type="number"
                        placeholder="Amount"
                        value={receiptForm.ipcId === ipc.id ? receiptForm.amount : ""}
                        onChange={(e) => setReceiptForm({ ...receiptForm, ipcId: ipc.id, amount: e.target.value })}
                        className="w-24 text-xs border rounded px-2 py-1"
                        required
                      />
                      <button
                        type="submit"
                        disabled={actionLoading}
                        className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 disabled:opacity-50"
                      >
                        {t("receipt.record")}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CREATE CONTRACT MODAL */}
      {showContractModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-display text-lg font-bold text-text-primary">{t("contracts.new")}</h3>
              <button onClick={() => setShowContractModal(false)} className="text-text-secondary"><X size={20} /></button>
            </div>
            <form onSubmit={createContract} className="space-y-4">
              <select
  value={contractForm.projectId}
  onChange={(e) => setContractForm((f) => ({ ...f, projectId: e.target.value }))}
  required
  className="w-full rounded-lg border border-surface-border px-4 py-2.5"
>
  <option value="">Select Project</option>
  {projects.length === 0 && <option disabled>No projects found</option>}
  {projects.map((p) => (
    <option key={p.id} value={p.id}>{p.name}</option>
  ))}
</select>
              <input placeholder="Contract #" value={contractForm.contractNumber} onChange={e => setContractForm({...contractForm, contractNumber: e.target.value})} required className="w-full rounded-lg border border-surface-border px-4 py-2.5" />
              <input placeholder={t("contracts.client")} value={contractForm.clientName} onChange={e => setContractForm({...contractForm, clientName: e.target.value})} required className="w-full rounded-lg border border-surface-border px-4 py-2.5" />
              <input type="number" placeholder={t("contracts.value")} value={contractForm.totalValue} onChange={e => setContractForm({...contractForm, totalValue: e.target.value})} required className="w-full rounded-lg border border-surface-border px-4 py-2.5" />
              <input type="number" placeholder={t("contracts.retention")} value={contractForm.retentionPercent} onChange={e => setContractForm({...contractForm, retentionPercent: e.target.value})} className="w-full rounded-lg border border-surface-border px-4 py-2.5" />
              <button type="submit" disabled={actionLoading} className="w-full bg-brand-orange text-white py-3 rounded-lg font-semibold disabled:opacity-50">
                {actionLoading ? <Loader2 className="animate-spin mx-auto" size={20}/> : t("contracts.new")}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* CREATE IPC MODAL */}
      {showIpcModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-display text-lg font-bold text-text-primary">{t("ipc.new")}</h3>
              <button onClick={() => setShowIpcModal(false)} className="text-text-secondary"><X size={20} /></button>
            </div>
            <form onSubmit={createIpc} className="space-y-4">
              <input placeholder="IPC #" value={ipcForm.ipcNumber} onChange={e => setIpcForm({...ipcForm, ipcNumber: e.target.value})} required className="w-full rounded-lg border border-surface-border px-4 py-2.5" />
              <input type="number" placeholder={t("ipc.claimed") + " (ETB)"} value={ipcForm.claimedAmount} onChange={e => setIpcForm({...ipcForm, claimedAmount: e.target.value})} required className="w-full rounded-lg border border-surface-border px-4 py-2.5" />
              <button type="submit" disabled={actionLoading} className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold disabled:opacity-50">
                {actionLoading ? <Loader2 className="animate-spin mx-auto" size={20}/> : t("ipc.new")}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}