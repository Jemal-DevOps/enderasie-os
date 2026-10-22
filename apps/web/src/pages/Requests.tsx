import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X, Loader2 } from "lucide-react";
import { api } from "../lib/api";

interface RequestRow {
  id: string; title: string; status: string; estimatedCost: string | null;
  projectName: string; createdAt: string;
}
interface ProjectOption { id: string; code: string; name: string; status: string; }

const statusColors: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-blue-100 text-blue-700",
  eng_verified: "bg-indigo-100 text-indigo-700",
  pm_approved: "bg-amber-100 text-amber-800",
  procurement_pending: "bg-purple-100 text-purple-700",
  store_issued: "bg-teal-100 text-teal-700",
  delivered: "bg-green-100 text-green-700",
  voided: "bg-red-100 text-red-700",
  returned: "bg-red-100 text-red-700",
  rejected: "bg-red-100 text-red-700",
  fulfilled: "bg-green-100 text-green-700",
};

export default function Requests() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ projectId: "", title: "", description: "", estimatedCost: "" });

  const load = async () => {
    try {
      const [reqData, projData] = await Promise.all([
        api<{ requests: RequestRow[] }>("/api/requests"),
        api<{ projects: ProjectOption[] }>("/api/projects"),
      ]);
      setRows(reqData.requests);
      setProjects(projData.projects);
      setForm((f) => ({ ...f, projectId: f.projectId || projData.projects[0]?.id || "" }));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const createDraft = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/requests", { method: "POST", body: JSON.stringify(form) });
      setShowForm(false);
      setForm((f) => ({ ...f, title: "", description: "", estimatedCost: "" }));
      await load();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const submitDraft = async (id: string) => {
    try {
      await api(`/api/requests/${id}/submit`, { method: "POST" });
      await load();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  if (loading) return <div className="flex justify-center h-64 items-center"><Loader2 className="animate-spin text-brand-orange" size={32} /></div>;

  const statusCounts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="w-full">
      {/* PAGE HEADER */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-text-primary">{t("requests.title")}</h2>
          <p className="text-sm text-text-secondary mt-1">
            {rows.length} {t("requests.total", "total requests")}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-brand-orange hover:bg-brand-orangeHover text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus size={16} /> {t("requests.new")}
        </button>
      </div>

      {/* STATUS COUNT CHIPS */}
      {rows.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(statusCounts).map(([status, count]) => (
            <span key={status} className="px-3 py-1 rounded-full bg-white border border-surface-border text-xs font-semibold text-text-secondary">
              <span className="font-bold text-text-primary">{count}</span> · {t(`status.${status}`)}
            </span>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-surface-border p-12 text-center text-text-secondary">
          {t("requests.empty")}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-surface-border overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-text-secondary text-left text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5 font-semibold">{t("labels.title")}</th>
                <th className="px-6 py-3.5 font-semibold">{t("labels.project")}</th>
                <th className="px-6 py-3.5 font-semibold">{t("inbox.col.date", "Date")}</th>
                <th className="px-6 py-3.5 font-semibold">{t("labels.status")}</th>
                <th className="px-6 py-3.5 font-semibold text-right">{t("labels.cost")}</th>
                <th className="px-6 py-3.5 font-semibold text-right">{t("inbox.col.actions", "Actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-muted/50 transition-colors">
                  <td className="px-6 py-4 font-semibold text-text-primary">{r.title}</td>
                  <td className="px-6 py-4 text-text-secondary">{r.projectName}</td>
                  <td className="px-6 py-4 text-text-secondary">{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusColors[r.status] || "bg-slate-100 text-slate-700"}`}>
                      {t(`status.${r.status}`)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-semibold text-text-primary tabular-nums">
                    {r.estimatedCost ? `${Number(r.estimatedCost).toLocaleString()} ETB` : "—"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {r.status === "draft" && (
                      <button
                        onClick={() => submitDraft(r.id)}
                        className="text-brand-orange hover:underline text-sm font-semibold"
                      >
                        {t("actions.submit")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CREATE MODAL */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 text-left">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-display text-lg font-bold text-text-primary">{t("requests.new")}</h3>
              <button onClick={() => setShowForm(false)} className="text-text-secondary hover:text-text-primary"><X size={20} /></button>
            </div>
            <form onSubmit={createDraft} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">{t("requests.form.project")}</label>
                <select
                  value={form.projectId}
                  onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
                  required
                  className="w-full rounded-lg border border-surface-border px-4 py-2.5 outline-none focus:border-brand-orange bg-white"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">{t("labels.title")}</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  required
                  minLength={3}
                  className="w-full rounded-lg border border-surface-border px-4 py-2.5 outline-none focus:border-brand-orange"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">{t("requests.form.description")}</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-surface-border px-4 py-2.5 outline-none focus:border-brand-orange"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">{t("labels.cost")}</label>
                <input
                  type="number"
                  value={form.estimatedCost}
                  onChange={(e) => setForm((f) => ({ ...f, estimatedCost: e.target.value }))}
                  className="w-full rounded-lg border border-surface-border px-4 py-2.5 outline-none focus:border-brand-orange"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="w-full bg-brand-orange hover:bg-brand-orangeHover disabled:opacity-60 text-white px-4 py-3 rounded-lg font-semibold transition-colors"
              >
                {saving ? <Loader2 className="animate-spin mx-auto" size={20} /> : t("requests.form.submit")}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}