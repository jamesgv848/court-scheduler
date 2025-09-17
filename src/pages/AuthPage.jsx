// src/pages/AuthPage.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

/**
 * Simple magic-link page:
 * - Enter email -> sends magic link
 * - Shows status and current signed-in user (if any)
 * - Listens to auth state changes so returning via magic link updates UI
 */
export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [user, setUser] = useState(null);

  useEffect(() => {
    // On mount: check if there's an active session
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setUser(data.session?.user ?? null);
    })();

    // Listen for auth state changes (sign in via magic link will trigger this)
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // event: 'SIGNED_IN', 'SIGNED_OUT', etc.
        setUser(session?.user ?? null);
      }
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleSendMagicLink(e) {
    e && e.preventDefault();
    setStatus("");
    if (!email) {
      setStatus("Please enter an email.");
      return;
    }
    setStatus("Sending magic link...");
    try {
      const redirectTo = window.location.origin; // user returns to this origin after clicking link
      const { data, error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      setStatus(
        "Magic link sent — check your email. Click the link to complete sign-in."
      );
      setEmail("");
    } catch (err) {
      console.error(err);
      setStatus("Error sending magic link: " + (err.message || err));
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
  }

  return (
    <div
      style={{
        minHeight: "70vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 420,
          padding: 20,
          borderRadius: 12,
          boxShadow: "0 8px 28px rgba(15,23,42,0.12)",
          background: "#fff",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Sign in — Magic Link</h2>

        {user ? (
          <div>
            <p style={{ marginTop: 6 }}>
              Signed in as <strong>{user.email}</strong>
            </p>
            <button className="btn" onClick={signOut} style={{ marginTop: 12 }}>
              Sign out
            </button>
          </div>
        ) : (
          <form onSubmit={handleSendMagicLink}>
            <label style={{ display: "block", marginBottom: 8, fontSize: 13 }}>
              Email
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              type="email"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #ddd",
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn" type="submit">
                Send magic link
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setEmail("");
                  setStatus("");
                }}
              >
                Reset
              </button>
            </div>
            {status && (
              <div style={{ marginTop: 10, color: "#333", fontSize: 13 }}>
                {status}
              </div>
            )}
            <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
              We will email a magic sign-in link. Click it to sign in (link
              returns to this app).
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
