import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "../lib/api";

interface Staff { id: string; name: string; role: string | null; type: "salaried" | "daily"; rate: string; }
interface PayrollRun { id: string; periodStart: string; periodEnd: string; totalNet: string; status: string; }
interface PayrollEntry { id: string; staffName: string; staffRole: string | null; type: string; basePay: string; overtimePay: string; netPay: string; }

export default function HR() {
  const { t } = useTranslation();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [staffForm, setStaffForm] = useState({ name: "", role: "", type: "daily", rate: "" });
  
  const [timeForm, setTimeForm] = useState({ staffId: "", date: new Date().toISOString().split("T")[0], hours: "8", overtimeHours: "0" });
  const [payrollForm, setPayrollForm] = useState({ periodStart: "", periodEnd: "" });

  const loadData = async () => {
    try {
      const [staffData, runsData] = await Promise.all([
        api<{ staff: Staff[] }>("/api/hr/staff"),
        api<{ runs: PayrollRun[] }>("/api/hr/payroll/runs"),
      ]);
      setStaff(staffData.staff);
      setRuns(runsData.runs);
      if (staffData.staff.length > 0 && !timeForm.staffId) {
        setTimeForm((f) => ({ ...f, staffId: staffData.staff[0].id }));
      }
    } catch (err) {
      console.error("loadData failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const createStaff = async (e: FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await api("/api/hr/staff", { method: "POST", body: JSON.stringify(staffForm) });
      setShowStaffModal(false);
      setStaffForm({ name: "", role: "", type: "daily", rate: "" });
      await loadData();
    } catch (err) { alert((err as Error).message); } 
    finally { setActionLoading(false); }
  };

  const logTime = async (e: FormEvent) => {
    e.preventDefault();
    if (!timeForm.staffId) return alert("Please select a staff member");
    setActionLoading(true);
    try {
      await api(`/api/hr/staff/${timeForm.staffId}/timesheets`, { method: "POST", body: JSON.stringify(timeForm) });
      alert("Timesheet logged!");
    } catch (err) { alert((err as Error).message); } 
    finally { setActionLoading(false); }
  };

  const runPayroll = async (e: FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const res = await api<{ message: string, entries: number }>("/api/hr/payroll/run", { method: "POST", body: JSON.stringify(payrollForm) });
      alert(`${res.message}. Entries generated: ${res.entries}`);
      setPayrollForm({ periodStart: "", periodEnd: "" });
      await loadData();
    } catch (err) { alert((err as Error).message); } 
    finally { setActionLoading(false); }
  };

  const toggleRun = async (runId: string) => {
    if (expandedRun === runId) {
      setExpandedRun(null);
      setEntries([]);
    } else {
      setExpandedRun(runId);
      try {
        const data = await api<{ entries: PayrollEntry[] }>(`/api/hr/payroll/runs/${runId}/entries`);
        setEntries(data.entries);
      } catch (err) { console.error(err); }
    }
  };

  if (loading) return <div className="flex justify-center h-64 items-center"><Loader2 className="animate-spin text-brand-orange" size={32} /></div>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-display text-2xl font-bold text-text-primary">{t("hr.title")}</h2>
        <button onClick={() => setShowStaffModal(true)} className="flex items-center gap-2 bg-brand-orange hover:bg-brand-orangeHover text-white px-4 py-2 rounded-lg text-sm font-semibold">
          <Plus size={16} /> {t("hr.add_staff")}
        </button>
      </div>

      {/* STAFF REGISTRY */}
      <div className="bg-white rounded-xl border border-surface-border overflow-hidden mb-8">
        <div className="px-6 py-3 bg-surface-muted border-b border-surface-border">
          <h3 className="font-semibold text-text-primary">{t("hr.staff_registry")} ({staff.length})</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="text-text-secondary text-left">
            <tr>
              <th className="px-6 py-3 font-medium">{t("hr.name")}</th>
              <th className="px-6 py-3 font-medium">{t("hr.role")}</th>
              <th className="px-6 py-3 font-medium">{t("hr.type")}</th>
              <th className="px-6 py-3 font-medium">{t("hr.rate")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {staff.map((s) => (
              <tr key={s.id}>
                <td className="px-6 py-4 font-semibold text-text-primary">{s.name}</td>
                <td className="px-6 py-4 text-text-secondary">{s.role || "-"}</td>
                <td className="px-6 py-4">
                  <span className={`text-xs px-2 py-1 rounded-full font-bold ${s.type === "daily" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                    {t(`hr.type_${s.type}`)}
                  </span>
                </td>
                <td className="px-6 py-4 text-text-primary">{parseFloat(s.rate).toLocaleString()} ETB</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* LOG TIMESHEET */}
        <div className="bg-white rounded-xl border border-surface-border p-6 shadow-sm">
          <h3 className="font-display text-lg font-bold text-text-primary mb-4">{t("hr.log_time")}</h3>
          <form onSubmit={logTime} className="space-y-3">
            <select value={timeForm.staffId} onChange={(e) => setTimeForm({ ...timeForm, staffId: e.target.value })} required className="w-full rounded-lg border border-surface-border px-4 py-2.5 text-sm">
              <option value="">{t("hr.select_staff")}</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.role || s.type})</option>)}
            </select>
            <input type="date" value={timeForm.date} onChange={(e) => setTimeForm({ ...timeForm, date: e.target.value })} required className="w-full rounded-lg border border-surface-border px-4 py-2.5 text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <input type="number" step="0.5" placeholder={t("hr.hours")} value={timeForm.hours} onChange={(e) => setTimeForm({ ...timeForm, hours: e.target.value })} required className="w-full rounded-lg border border-surface-border px-4 py-2.5 text-sm" />
              <input type="number" step="0.5" placeholder={t("hr.overtime")} value={timeForm.overtimeHours} onChange={(e) => setTimeForm({ ...timeForm, overtimeHours: e.target.value })} required className="w-full rounded-lg border border-surface-border px-4 py-2.5 text-sm" />
            </div>
            <button type="submit" disabled={actionLoading} className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold text-sm disabled:opacity-50">
              {actionLoading ? <Loader2 className="animate-spin mx-auto" size={18} /> : t("hr.log_time")}
            </button>
          </form>
        </div>

        {/* RUN PAYROLL */}
        <div className="bg-white rounded-xl border border-surface-border p-6 shadow-sm">
          <h3 className="font-display text-lg font-bold text-text-primary mb-4">{t("hr.run_payroll")}</h3>
          <form onSubmit={runPayroll} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input type="date" placeholder={t("hr.period_start")} value={payrollForm.periodStart} onChange={(e) => setPayrollForm({ ...payrollForm, periodStart: e.target.value })} required className="w-full rounded-lg border border-surface-border px-4 py-2.5 text-sm" />
              <input type="date" placeholder={t("hr.period_end")} value={payrollForm.periodEnd} onChange={(e) => setPayrollForm({ ...payrollForm, periodEnd: e.target.value })} required className="w-full rounded-lg border border-surface-border px-4 py-2.5 text-sm" />
            </div>
            <button type="submit" disabled={actionLoading} className="w-full bg-green-600 text-white py-2.5 rounded-lg font-semibold text-sm disabled:opacity-50">
              {actionLoading ? <Loader2 className="animate-spin mx-auto" size={18} /> : t("hr.run_payroll")}
            </button>
          </form>
        </div>
      </div>

      {/* PAYROLL RUNS */}
      <div className="bg-white rounded-xl border border-surface-border overflow-hidden">
        <div className="px-6 py-3 bg-surface-muted border-b border-surface-border">
          <h3 className="font-semibold text-text-primary">{t("hr.past_runs")}</h3>
        </div>
        <div className="divide-y divide-surface-border">
          {runs.length === 0 ? (
            <p className="p-6 text-center text-text-secondary text-sm">No payroll runs yet.</p>
          ) : runs.map((r) => (
            <div key={r.id}>
              <button onClick={() => toggleRun(r.id)} className="w-full px-6 py-4 flex justify-between items-center hover:bg-surface-muted/50 text-left">
                <div>
                  <p className="font-semibold text-text-primary">{r.periodStart} → {r.periodEnd}</p>
                  <p className="text-xs text-text-secondary">{t("hr.total_net")}: {parseFloat(r.totalNet).toLocaleString()} ETB</p>
                </div>
                {expandedRun === r.id ? <ChevronUp size={20} className="text-text-secondary" /> : <ChevronDown size={20} className="text-text-secondary" />}
              </button>
              {expandedRun === r.id && (
                <div className="px-6 pb-4">
                  <table className="w-full text-sm">
                    <thead className="text-text-secondary text-left border-b border-surface-border">
                      <tr>
                        <th className="pb-2 font-medium">{t("hr.name")}</th>
                        <th className="pb-2 font-medium">{t("hr.base_pay")}</th>
                        <th className="pb-2 font-medium">{t("hr.ot_pay")}</th>
                        <th className="pb-2 font-medium">{t("hr.total_net")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border">
                      {entries.map((e) => (
                        <tr key={e.id}>
                          <td className="py-2 text-text-primary">{e.staffName} <span className="text-xs text-text-secondary">({e.staffRole})</span></td>
                          <td className="py-2">{parseFloat(e.basePay).toLocaleString()}</td>
                          <td className="py-2">{parseFloat(e.overtimePay).toLocaleString()}</td>
                          <td className="py-2 font-bold text-green-700">{parseFloat(e.netPay).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ADD STAFF MODAL */}
      {showStaffModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-display text-lg font-bold text-text-primary">{t("hr.add_staff")}</h3>
              <button onClick={() => setShowStaffModal(false)} className="text-text-secondary"><X size={20} /></button>
            </div>
            <form onSubmit={createStaff} className="space-y-4">
              <input placeholder={t("hr.name")} value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })} required className="w-full rounded-lg border border-surface-border px-4 py-2.5" />
              <input placeholder={t("hr.role")} value={staffForm.role} onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })} className="w-full rounded-lg border border-surface-border px-4 py-2.5" />
              <select value={staffForm.type} onChange={(e) => setStaffForm({ ...staffForm, type: e.target.value as "daily" | "salaried" })} required className="w-full rounded-lg border border-surface-border px-4 py-2.5">
                <option value="daily">{t("hr.type_daily")}</option>
                <option value="salaried">{t("hr.type_salaried")}</option>
              </select>
              <input type="number" placeholder={t("hr.rate")} value={staffForm.rate} onChange={(e) => setStaffForm({ ...staffForm, rate: e.target.value })} required className="w-full rounded-lg border border-surface-border px-4 py-2.5" />
              <button type="submit" disabled={actionLoading} className="w-full bg-brand-orange text-white py-3 rounded-lg font-semibold disabled:opacity-50">
                {actionLoading ? <Loader2 className="animate-spin mx-auto" size={20} /> : t("hr.add_staff")}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}