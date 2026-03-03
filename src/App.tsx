import { useState, useEffect, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { supabase } from "./lib/supabase";
import { Sidebar } from "./components/layout/Sidebar";
import LoginPage from "./pages/Login";
import HomePage from "./pages/Home";
import ClientsPage from "./pages/Clients";
import ClientDetailPage from "./pages/ClientDetail";
import RepDetailPage from "./pages/RepDetail";
import CallReviewPage from "./pages/CallReview";
import ARREnginePage from "./pages/ARREngine";
import AssessmentPage from "./pages/Assessment";
import AdminPage from "./pages/Admin";
import type { CallReview, WorkspaceSettings, ClientAssessment } from "./types";

const DEFAULT_CLIENTS = ["11x", "Arc", "Diio", "Factor", "Nauta", "Planimatik", "Xepelin"];

// ── Call detail read-only view ────────────────────────────────────────────────
function CallDetailRouter({
  savedCalls,
  onEdit,
}: {
  savedCalls: CallReview[];
  onEdit: (call: CallReview) => void;
}) {
  const { callId } = useParams<{ callId: string }>();
  const navigate = useNavigate();
  const call = savedCalls.find(c => c.id === callId);

  if (!call) {
    return (
      <div className="max-w-xl mx-auto px-6 py-16 text-center">
        <div className="text-4xl mb-3">🔍</div>
        <h2 className="text-lg font-bold text-slate-700">Call not found</h2>
        <button onClick={() => navigate(-1)} className="mt-4 text-sm text-brand-500 font-medium">
          ← Go back
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate(-1)} className="text-sm text-slate-400 hover:text-slate-600 flex items-center gap-1">
          ← Back
        </button>
        <button
          onClick={() => onEdit(call)}
          className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold rounded-lg transition-colors"
        >
          Edit Review
        </button>
      </div>
      <CallReviewPage
        existingCall={call}
        onSaved={() => navigate(-1)}
        onCancel={() => navigate(-1)}
      />
    </div>
  );
}

// ── Authenticated shell ───────────────────────────────────────────────────────
function AppShell() {
  const { session, profile, getValidToken } = useAuth();
  const navigate = useNavigate();

  const [savedCalls, setSavedCalls] = useState<CallReview[]>(() => {
    try { return JSON.parse(localStorage.getItem("cuota_saved_calls") ?? "[]"); } catch { return []; }
  });
  const [wsSettings, setWsSettings] = useState<WorkspaceSettings | undefined>();
  const [assessments, setAssessments] = useState<ClientAssessment[]>([]);
  const [showNewReview, setShowNewReview] = useState(false);
  const [newReviewClient, setNewReviewClient] = useState<string | undefined>();
  const [editingCall, setEditingCall] = useState<CallReview | undefined>();

  // Persist locally
  useEffect(() => {
    localStorage.setItem("cuota_saved_calls", JSON.stringify(savedCalls));
  }, [savedCalls]);

  const loadCalls = useCallback(async () => {
    const t = await getValidToken();
    if (!t || !profile) return;
    try {
      const calls = await supabase
        .table("call_reviews", t)
        .selectWhere<CallReview>("*", `org_id=eq.${profile.org_id}&order=call_date.desc`);
      setSavedCalls(calls);
    } catch { /* keep local */ }
  }, [getValidToken, profile]);

  const loadSettings = useCallback(async () => {
    const t = await getValidToken();
    if (!t || !profile) return;
    try {
      const rows = await supabase
        .table("workspace_settings", t)
        .selectWhere<WorkspaceSettings>("*", `org_id=eq.${profile.org_id}`);
      if (rows.length > 0) setWsSettings(rows[0]);
    } catch { /* first use */ }
  }, [getValidToken, profile]);

  const loadAssessments = useCallback(async () => {
    const t = await getValidToken();
    if (!t || !profile) return;
    try {
      const rows = await supabase
        .table("client_assessments", t)
        .selectWhere<ClientAssessment>("*", `org_id=eq.${profile.org_id}&order=assessed_at.desc`);
      setAssessments(rows);
    } catch { /* first use */ }
  }, [getValidToken, profile]);

  useEffect(() => {
    if (session) { loadCalls(); loadSettings(); loadAssessments(); }
  }, [session, loadCalls, loadSettings, loadAssessments]);

  // Sidebar client entries with avg score
  const clientEntries = DEFAULT_CLIENTS.map(name => {
    const cc = savedCalls.filter(c => c.category_scores?.client === name);
    const avg = cc.length
      ? Math.round(cc.reduce((s, c) => s + (c.overall_score ?? 0), 0) / cc.length)
      : undefined;
    return { name, avgScore: avg };
  });

  function startNewReview(client?: string) {
    setNewReviewClient(client);
    setEditingCall(undefined);
    setShowNewReview(true);
  }

  function handleSaved(call: CallReview) {
    setSavedCalls(prev => {
      const idx = prev.findIndex(c => c.id === call.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = call; return next; }
      return [call, ...prev];
    });
    setShowNewReview(false);
    setEditingCall(undefined);
    const clientName = call.category_scores?.client;
    if (clientName) navigate(`/clients/${encodeURIComponent(clientName)}`);
    else navigate("/clients");
  }

  if (!session) {
    return (
      <LoginPage
        onLogin={(sess, prof) => {
          localStorage.setItem("cuota_session", JSON.stringify(sess));
          localStorage.setItem("cuota_access_token", sess.access_token);
          localStorage.setItem("cuota_profile", JSON.stringify(prof));
          window.location.href = "/";
        }}
      />
    );
  }

  if (showNewReview) {
    return (
      <div className="min-h-screen bg-slate-50">
        <CallReviewPage
          defaultClient={newReviewClient}
          existingCall={editingCall}
          onSaved={handleSaved}
          onCancel={() => { setShowNewReview(false); setEditingCall(undefined); }}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar clients={clientEntries} onNewReview={() => startNewReview()} />

      <main className="flex-1 min-w-0 overflow-x-hidden">
        <Routes>
          <Route
            path="/"
            element={
              <HomePage
                savedCalls={savedCalls}
                clients={DEFAULT_CLIENTS}
                wsSettings={wsSettings}
                onNewReview={() => startNewReview()}
              />
            }
          />
          <Route
            path="/clients"
            element={<ClientsPage savedCalls={savedCalls} onNewReview={() => startNewReview()} />}
          />
          <Route
            path="/clients/:clientId"
            element={
              <ClientDetailPage
                savedCalls={savedCalls}
                assessments={assessments}
                onNewReview={client => startNewReview(client)}
              />
            }
          />
          <Route
            path="/clients/:clientId/reps/:repId"
            element={<RepDetailPage savedCalls={savedCalls} />}
          />
          <Route
            path="/clients/:clientId/calls/:callId"
            element={
              <CallDetailRouter
                savedCalls={savedCalls}
                onEdit={call => { setEditingCall(call); setShowNewReview(true); }}
              />
            }
          />
          <Route path="/arr-engine" element={<ARREnginePage />} />
          <Route path="/assessments/:assessmentType" element={<AssessmentPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}
