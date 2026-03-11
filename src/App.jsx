// src/App.jsx
import React, { useEffect, useState, useRef } from "react";
import {
  Routes,
  Route,
  useNavigate,
  useLocation,
  Navigate,
} from "react-router-dom";
import SchedulePage from "./pages/SchedulePage";
import ScoreboardPage from "./pages/ScoreboardPage";
import PlayersPage from "./pages/PlayersPage";
import AuthPage from "./pages/AuthPage";
import ProtectedRoute from "./components/ProtectedRoute";
import PairingStats from "./pages/PairingStats";
import FixedPairsSchedulePage from "./pages/FixedPairsSchedulePage";
import RegisterMatchPage from "./pages/RegisterMatchPage";
import ImportSchedulePage from "./pages/ImportSchedulePage";
import PlayerProfilePage from "./pages/PlayerProfilePage";
import { supabase } from "./supabaseClient";

// Bottom nav tabs — primary (always visible) and more (in popup)
const PRIMARY_TABS = [
  { path: "/", label: "Schedule", icon: "📅" },
  { path: "/scoreboard", label: "Scores", icon: "🏆" },
  { path: "/pairing-stats", label: "Pairing", icon: "🤝" },
  { path: "/import-schedule", label: "Import", icon: "📥" },
];
const MORE_TABS = [
  { path: "/players", label: "Players", icon: "👥" },
  { path: "/fixed-pairs", label: "Fixed Pairs", icon: "🔗" },
  { path: "/register-game", label: "Register", icon: "➕" },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);

  // Auth state
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const {
          data: { user: u },
        } = await supabase.auth.getUser();
        if (mounted) setUser(u ?? null);
      } catch (e) {
        /* ignore */
      }
    })();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      mounted = false;
      data?.subscription?.unsubscribe?.();
    };
  }, []);

  // Close more menu on outside click
  useEffect(() => {
    function h(e) {
      if (moreRef.current && !moreRef.current.contains(e.target))
        setMoreOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
      setUser(null);
    } catch (err) {
      console.error("signOut err", err);
    }
  }

  return (
    <div
      style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}
    >
      {/* ── Top header bar ── */}
      <header className="app-header">
        <div className="header-left">
          <div className="logo">🏸</div>
          <span className="brand-name">
            Court<span>Sync</span>
          </span>
        </div>
        <div className="header-right">
          {user ? (
            <>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  maxWidth: 140,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {user.email}
              </span>
              <button className="signout-btn" onClick={handleSignOut}>
                ⎋ Sign Out
              </button>
            </>
          ) : (
            <button
              className="auth-btn"
              style={{ fontSize: 12, padding: "5px 10px" }}
              onClick={() => setEmailModalOpen(true)}
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* ── Page content ── */}
      <main style={{ flex: 1 }}>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <SchedulePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scoreboard"
            element={
              <ProtectedRoute>
                <ScoreboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/players"
            element={
              <ProtectedRoute>
                <PlayersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/players/:playerId"
            element={
              <ProtectedRoute>
                <PlayerProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pairing-stats"
            element={
              <ProtectedRoute>
                <PairingStats />
              </ProtectedRoute>
            }
          />
          <Route
            path="/fixed-pairs"
            element={
              <ProtectedRoute>
                <FixedPairsSchedulePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/register-game"
            element={
              <ProtectedRoute>
                <RegisterMatchPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/import-schedule"
            element={
              <ProtectedRoute>
                <ImportSchedulePage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* ── Bottom nav ── */}
      {user && (
        <BottomNav
          moreOpen={moreOpen}
          setMoreOpen={setMoreOpen}
          moreRef={moreRef}
        />
      )}

      {/* ── Email / magic-link modal ── */}
      <EmailModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
      />
    </div>
  );
}

// ── Bottom navigation ──────────────────────────────────────────────────────
function BottomNav({ moreOpen, setMoreOpen, moreRef }) {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;
  const inMore = MORE_TABS.some((t) => t.path === currentPath);

  function go(path) {
    navigate(path);
    setMoreOpen(false);
  }

  return (
    <>
      {/* More menu overlay */}
      {moreOpen && (
        <div className="more-overlay" onClick={() => setMoreOpen(false)} />
      )}

      {/* More menu popup */}
      {moreOpen && (
        <div className="more-menu" ref={moreRef}>
          {MORE_TABS.map((t) => (
            <button
              key={t.path}
              className={`more-item${currentPath === t.path ? " active" : ""}`}
              onClick={() => go(t.path)}
            >
              <span style={{ fontSize: 16 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Bottom tab bar — FIX 1: inner div constrains tabs to max-width */}
      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          {PRIMARY_TABS.map((t) => (
            <button
              key={t.path}
              className={`bnav-btn${currentPath === t.path ? " active" : ""}`}
              onClick={() => go(t.path)}
            >
              <span className="bnav-icon">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}

          {/* More button */}
          <button
            className={`bnav-btn${inMore || moreOpen ? " active" : ""}`}
            onClick={() => setMoreOpen((o) => !o)}
          >
            <span className="bnav-icon">⋯</span>
            <span>More</span>
          </button>
        </div>
      </nav>
    </>
  );
}

// ── EmailModal ─────────────────────────────────────────────────────────────
function EmailModal({ open, onClose }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail("");
      setSent(false);
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  async function sendMagicLink(e) {
    e?.preventDefault?.();
    if (!email || !email.includes("@")) {
      alert("Please enter a valid email.");
      return;
    }
    try {
      setBusy(true);
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + "/auth" },
      });
      if (error) {
        alert("Failed: " + error.message);
        return;
      }
      setSent(true);
    } catch (err) {
      alert("Unexpected error: " + (err.message || err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        padding: 16,
      }}
    >
      <div
        style={{
          width: 400,
          maxWidth: "100%",
          background: "#fff",
          borderRadius: 12,
          padding: 20,
          boxShadow: "0 12px 48px rgba(0,0,0,.14)",
          border: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16 }}>Sign in</h3>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              fontSize: 18,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {!sent ? (
          <form onSubmit={sendMagicLink}>
            <label className="form-label">Email</label>
            <input
              type="email"
              className="auth-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
              style={{ marginBottom: 12 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="auth-btn" disabled={busy}>
                {busy ? "Sending…" : "Send magic link"}
              </button>
              <button type="button" className="btn" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div>
            <div style={{ marginBottom: 8 }}>
              Magic link sent to <strong>{email}</strong>.
            </div>
            <div
              style={{ color: "var(--muted)", marginBottom: 14, fontSize: 13 }}
            >
              Check your inbox and click the link to sign in.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="auth-btn" onClick={onClose}>
                Done
              </button>
              <button className="btn" onClick={() => setSent(false)}>
                Send again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
