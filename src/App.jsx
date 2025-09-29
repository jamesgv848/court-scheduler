// src/App.jsx
import React, { useEffect, useState } from "react";
import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import SchedulePage from "./pages/SchedulePage";
import ScoreboardPage from "./pages/ScoreboardPage";
import PlayersPage from "./pages/PlayersPage";
import AuthPage from "./pages/AuthPage";
import ProtectedRoute from "./components/ProtectedRoute";
import PairingStats from "./pages/PairingStats";
import { supabase } from "./supabaseClient";

import { Trophy } from "lucide-react"; // badminton shuttlecock icon

export default function App() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailModalInitial, setEmailModalInitial] = useState("");

  // Load initial user and subscribe to auth changes
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const {
          data: { user: u },
        } = await supabase.auth.getUser();
        if (mounted) setUser(u ?? null);
      } catch (e) {
        // ignore
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

  function openEmailModal(prefill = "") {
    setEmailModalInitial(prefill);
    setEmailModalOpen(true);
  }

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
      setUser(null);
    } catch (err) {
      console.error("signOut err", err);
      alert("Sign out failed");
    }
  }

  return (
    <div>
      <header className="app-header" style={{ padding: "8px 16px" }}>
        <div
          className="header-left"
          style={{ display: "flex", alignItems: "center", gap: 12 }}
        >
          <div
            className="logo"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "linear-gradient(135deg, #007bff, #0056d2)", // nice gradient blue
              boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            }}
          >
            <Trophy size={22} color="white" strokeWidth={2.2} />
          </div>
          {/* desktop nav */}
          <nav
            className="nav-buttons"
            style={{ display: "flex", gap: 8, alignItems: "center" }}
          >
            <NavLink
              to="/players"
              className={({ isActive }) =>
                `nav-button ${isActive ? "active" : ""}`
              }
            >
              Players
            </NavLink>
            <NavLink
              to="/schedule"
              className={({ isActive }) =>
                `nav-button ${isActive ? "active" : ""}`
              }
            >
              Schedule
            </NavLink>
            <NavLink
              to="/scoreboard"
              className={({ isActive }) =>
                `nav-button ${isActive ? "active" : ""}`
              }
            >
              Scoreboard
            </NavLink>
            <NavLink
              to="/pairing-stats"
              className={({ isActive }) =>
                `nav-button ${isActive ? "active" : ""}`
              }
            >
              Pairing Stats
            </NavLink>
          </nav>
        </div>

        <div
          className="header-right"
          style={{ display: "flex", alignItems: "center", gap: 10 }}
        >
          {user ? (
            <>
              <div style={{ color: "#333", fontSize: 13 }}>{user.email}</div>
              <button
                onClick={handleSignOut}
                className="btn danger signout-btn"
              >
                ⎋ Sign Out
              </button>
            </>
          ) : (
            <>
              {/* Single unified CTA — opens the email modal for both sign-up & sign-in */}
              <button className="auth-btn" onClick={() => openEmailModal("")}>
                Send Login Link
              </button>
              {/* Optional: keep a small "Sign In" link for direct navigation to /auth */}
              <NavLink
                to="/auth"
                className="nav-button"
                style={{ display: "none" }}
              >
                Sign In
              </NavLink>
            </>
          )}

          {/* mobile toggle - show via CSS on small screens */}
          <button
            onClick={() => setMobileOpen((s) => !s)}
            aria-label="toggle menu"
            style={{
              display: "none", // show via CSS media query if needed
              background: "transparent",
              border: "none",
              fontSize: 20,
              cursor: "pointer",
            }}
            id="mobile-nav-toggle"
          >
            ☰
          </button>
        </div>
      </header>

      <MobileNav
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        user={user}
        onOpenEmail={() => openEmailModal("")}
        onSignOut={handleSignOut}
      />

      <main style={{ padding: "12px 20px" }}>
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
            path="/pairing-stats"
            element={
              <ProtectedRoute>
                <PairingStats />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* email modal */}
      <EmailModal
        open={emailModalOpen}
        initialEmail={emailModalInitial}
        onClose={() => setEmailModalOpen(false)}
      />
    </div>
  );
}

/** MobileNav component */
function MobileNav({ open, onClose, user, onOpenEmail, onSignOut }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 64,
        background: "#fff",
        boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
        zIndex: 60,
        padding: 12,
      }}
    >
      <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <NavLink to="/players" onClick={onClose} className="nav-button">
          Players
        </NavLink>
        <NavLink to="/schedule" onClick={onClose} className="nav-button">
          Schedule
        </NavLink>
        <NavLink to="/scoreboard" onClick={onClose} className="nav-button">
          Scoreboard
        </NavLink>
        <NavLink to="/pairing-stats" onClick={onClose} className="nav-button">
          Pairing Stats
        </NavLink>
      </nav>

      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        {user ? (
          <button
            className="auth-btn secondary"
            onClick={() => {
              onSignOut();
              onClose();
            }}
          >
            Sign Out
          </button>
        ) : (
          <>
            <button
              className="auth-btn"
              onClick={() => {
                onOpenEmail();
                onClose();
              }}
            >
              Sign Up
            </button>
            <NavLink to="/auth" onClick={onClose} className="nav-button">
              Sign In
            </NavLink>
          </>
        )}
      </div>
    </div>
  );
}

/** EmailModal component */
function EmailModal({ open, initialEmail = "", onClose }) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    if (open) {
      setEmail(initialEmail || "");
      setSent(false);
      setBusy(false);
    }
  }, [open, initialEmail]);

  if (!open) return null;

  async function sendMagicLink(e) {
    e?.preventDefault?.();
    if (!email || !email.includes("@")) {
      alert("Please enter a valid email.");
      return;
    }
    try {
      setBusy(true);
      const redirectTo = window.location.origin + "/auth";
      const { data, error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) {
        console.error("signInWithOtp error", error);
        alert(
          "Failed to send magic link: " +
            (error.message || JSON.stringify(error))
        );
        setBusy(false);
        return;
      }
      setSent(true);
    } catch (err) {
      console.error("sendMagicLink unexpected", err);
      alert("Unexpected error: " + (err.message || err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" style={backdropStyle}>
      <div style={modalStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h3 style={{ margin: 0 }}>Send magic link</h3>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close">
            ✕
          </button>
        </div>

        {!sent ? (
          <form onSubmit={sendMagicLink} style={{ marginTop: 12 }}>
            <label style={{ display: "block", marginBottom: 8, fontSize: 13 }}>
              Email
            </label>
            <input
              autoFocus
              type="email"
              className="auth-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #ddd",
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button type="submit" className="auth-btn" disabled={busy}>
                {busy ? "Sending…" : "Send link"}
              </button>
              <button
                type="button"
                className="btn"
                onClick={onClose}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
            <div style={{ marginTop: 8, color: "#666", fontSize: 13 }}>
              You will receive a magic link via email. Redirect will return you
              to the app.
            </div>
          </form>
        ) : (
          <div style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 8 }}>
              Magic link sent to <strong>{email}</strong>.
            </div>
            <div style={{ color: "#666", marginBottom: 12 }}>
              Check your inbox (and spam) and click the link to sign in.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="auth-btn" onClick={onClose}>
                Done
              </button>
              <button
                className="btn"
                onClick={() => {
                  setSent(false);
                }}
              >
                Send again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Small styles used by the modal (you can move them to CSS) */
const backdropStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2000,
};
const modalStyle = {
  width: 420,
  maxWidth: "calc(100% - 24px)",
  background: "#fff",
  padding: 18,
  borderRadius: 12,
  boxShadow: "0 12px 48px rgba(0,0,0,0.16)",
};
const closeBtnStyle = {
  border: "none",
  background: "transparent",
  fontSize: 18,
  cursor: "pointer",
};
