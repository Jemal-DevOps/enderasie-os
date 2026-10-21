import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { auth } from "./lib/auth";
import Login from "./pages/Login";
import Layout from "./components/Layout";
import Inbox from "./pages/Inbox";
import Requests from "./pages/Requests";
import Contracts from "./pages/Contracts";
import Subcontracts from "./pages/Subcontracts";
import HR from "./pages/HR";
import Insights from "./pages/Insights";


function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return auth.isAuthenticated() ? <>{children}</> : <Navigate to="/login" replace />;
}

function DashboardHome() {
  const { t } = useTranslation();
  return (
    <div>
      <h2 className="font-display text-2xl font-bold text-text-primary mb-2">{t("dash.title")}</h2>
      <p className="text-text-secondary">{t("dash.subtitle")}</p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardHome />} />
          <Route path="approvals" element={<Inbox />} />
          <Route path="requests" element={<Requests />} />
          <Route path="contracts" element={<Contracts />} />
          <Route path="subcontracts" element={<Subcontracts />} />
          <Route path="hr" element={<HR />} />
          <Route path="insights" element={<Insights />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}