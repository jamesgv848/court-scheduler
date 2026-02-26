// src/pages/AuthPage.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState(null);
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (mounted && user) navigate("/", { replace: true });
      } catch (e) {
        console.error("getUser error", e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  // Handle magic-link redirect (tokens in URL fragment / query)
  useEffect(() => {
    let mounted = true;
    async function handleRedirect() {
      const href = window.location.href;
      if (
        !href.includes("access_token") &&
        !href.includes("refresh_token") &&
        !href.includes("type=magiclink") &&
        !href.includes("error")
      )
        return;

      setBusy(true);
      try {
        // Preferred: getSessionFromUrl
        if (typeof supabase?.auth?.getSessionFromUrl === "function") {
          const { error } = await supabase.auth.getSessionFromUrl({
            storeSession: true,
          });
          if (error) throw error;
          setInfo("Signed in — redirecting…");
          try {
            history.replaceState(null, "", window.location.pathname);
          } catch (e) {}
          setTimeout(() => navigate("/", { replace: true }), 700);
          return;
        }
        // Fallback: parse tokens manually
        function parseParams(str) {
          if (!str) return {};
          const s = str[0] === "#" || str[0] === "?" ? str.slice(1) : str;
          return s.split("&").reduce((acc, kv) => {
            const [k, v] = kv.split("=");
            if (!k) return acc;
            acc[decodeURIComponent(k)] = v ? decodeURIComponent(v) : "";
            return acc;
          }, {});
        }
        const params = Object.keys(parseParams(window.location.hash)).length
          ? parseParams(window.location.hash)
          : parseParams(window.location.search);
        const access_token = params["access_token"] || params["access-token"];
        const refresh_token =
          params["refresh_token"] || params["refresh-token"];
        if (
          access_token &&
          refresh_token &&
          typeof supabase.auth.setSession === "function"
        ) {
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (error) throw error;
          setInfo("Signed in — redirecting…");
          try {
            history.replaceState(null, "", window.location.pathname);
          } catch (e) {}
          setTimeout(() => navigate("/", { replace: true }), 700);
          return;
        }
        if (params["error"] || params["error_description"]) {
          throw new Error(
            params["error_description"] ||
              params["error"] ||
              "Auth redirect error",
          );
        }
      } catch (e) {
        if (mounted) setErr(e?.message || JSON.stringify(e));
      } finally {
        if (mounted) setBusy(false);
      }
    }
    handleRedirect();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  async function handleSendMagicLink(e) {
    e?.preventDefault?.();
    setInfo(null);
    setErr(null);
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      setErr("Enter a valid email.");
      return;
    }
    setBusy(true);
    try {
      const redirectTo = window.location.origin + "/auth";
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (!signInError) {
        setInfo("Magic link sent. Check your inbox (and spam).");
        setEmail("");
        return;
      }
      const { error: signUpError } = await supabase.auth.signUp(
        { email },
        { emailRedirectTo: redirectTo },
      );
      if (signUpError)
        setErr(signUpError.message || "Failed to send magic link.");
      else setInfo("Account created and magic link sent. Check your inbox.");
      setEmail("");
    } catch (error) {
      setErr(error?.message || JSON.stringify(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          borderRadius: 14,
          padding: 24,
          boxShadow: "0 8px 32px rgba(0,0,0,.10)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Logo / brand */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 22,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "linear-gradient(135deg,#e05a1c,#c44000)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
            }}
          >
            🏸
          </div>
          <div>
            <div
              style={{ fontWeight: 800, fontSize: 17, color: "var(--text)" }}
            >
              CourtSync
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>
              Badminton scheduling
            </div>
          </div>
        </div>

        <h2
          style={{
            margin: "0 0 6px",
            fontSize: 18,
            fontWeight: 800,
            color: "var(--text)",
          }}
        >
          Sign in
        </h2>
        <p style={{ margin: "0 0 18px", color: "var(--muted)", fontSize: 13 }}>
          Enter your email to receive a magic link. No password needed.
        </p>

        {busy && (
          <div
            style={{ color: "var(--muted)", marginBottom: 10, fontSize: 13 }}
          >
            Processing…
          </div>
        )}

        {info && (
          <div
            style={{
              marginBottom: 14,
              padding: "10px 12px",
              borderRadius: 8,
              background: "var(--success-dim)",
              border: "1px solid var(--success-border)",
              color: "var(--success)",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {info}
          </div>
        )}
        {err && (
          <div
            style={{
              marginBottom: 14,
              padding: "10px 12px",
              borderRadius: 8,
              background: "var(--danger-dim)",
              border: "1px solid var(--danger-border)",
              color: "var(--danger)",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {err}
          </div>
        )}

        <form onSubmit={handleSendMagicLink}>
          <label className="form-label">Email</label>
          <input
            className="auth-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            style={{ marginBottom: 14 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="submit"
              className="auth-btn"
              disabled={busy}
              style={{ flex: 1 }}
            >
              {busy ? "Sending…" : "Send magic link"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setEmail("");
                setInfo(null);
                setErr(null);
              }}
            >
              Clear
            </button>
          </div>
        </form>

        <hr
          style={{
            margin: "20px 0",
            borderColor: "var(--border)",
            borderTop: "none",
          }}
        />
        <div style={{ color: "var(--muted2)", fontSize: 12 }}>
          Redirect URL must be added in Supabase → Auth → URL Configuration:{" "}
          <code
            style={{
              background: "var(--surface2)",
              padding: "1px 4px",
              borderRadius: 4,
              fontSize: 11,
            }}
          >
            {typeof window !== "undefined"
              ? window.location.origin + "/auth"
              : "/auth"}
          </code>
        </div>
      </div>
    </div>
  );
}
