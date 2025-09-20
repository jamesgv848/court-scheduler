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

  // If user already logged in, redirect away
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!mounted) return;
        if (user) {
          navigate("/", { replace: true });
        }
      } catch (e) {
        console.error("getUser error", e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  // On load, attempt to parse magic-link session (only runs if fragment/query present)
  useEffect(() => {
    let mounted = true;
    async function handleRedirect() {
      // quick guard: check for expected fragments / query params
      const href = window.location.href;
      if (
        !href.includes("access_token") &&
        !href.includes("refresh_token") &&
        !href.includes("type=magiclink") &&
        !href.includes("provider_token") &&
        !href.includes("error")
      ) {
        return; // nothing to do
      }

      setBusy(true);
      setInfo(null);
      setErr(null);

      try {
        // 1) Preferred: if supabase client has getSessionFromUrl, use it (available in some versions)
        if (
          supabase?.auth?.getSessionFromUrl &&
          typeof supabase.auth.getSessionFromUrl === "function"
        ) {
          const { data, error: exchangeError } =
            await supabase.auth.getSessionFromUrl({ storeSession: true });
          if (exchangeError) throw exchangeError;
          // success: session stored by the client
          setInfo("Signed in successfully — redirecting...");
          // clear url fragment/query to avoid re-processing if user refreshes
          try {
            history.replaceState(null, "", window.location.pathname);
          } catch (e) {}
          setTimeout(() => navigate("/", { replace: true }), 700);
          return;
        }

        // 2) Fallback: manually parse tokens from URL (works for supabase-js v2 when getSessionFromUrl not present)
        // parse both window.location.hash (fragment) and search (query)
        function parseParams(str) {
          if (!str) return {};
          // remove leading '#' or '?'
          const s = str[0] === "#" || str[0] === "?" ? str.substring(1) : str;
          return s.split("&").reduce((acc, kv) => {
            const [k, v] = kv.split("=");
            if (!k) return acc;
            acc[decodeURIComponent(k)] = v ? decodeURIComponent(v) : "";
            return acc;
          }, {});
        }

        const hashParams = parseParams(window.location.hash);
        const queryParams = parseParams(window.location.search);

        // Prefer hash params (supabase usually puts tokens in the hash)
        const params = Object.keys(hashParams).length
          ? hashParams
          : queryParams;
        const access_token =
          params["access_token"] ||
          params["access-token"] ||
          params["accessToken"];
        const refresh_token =
          params["refresh_token"] ||
          params["refresh-token"] ||
          params["refreshToken"];
        // sometimes jwt is present as "provider_token" etc; supabase-js expects access + refresh

        if (access_token && refresh_token) {
          // use setSession to store tokens in client (v2)
          if (
            supabase?.auth?.setSession &&
            typeof supabase.auth.setSession === "function"
          ) {
            const { data, error: setErr } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (setErr) throw setErr;
            setInfo("Signed in successfully — redirecting...");
            try {
              history.replaceState(null, "", window.location.pathname);
            } catch (e) {}
            setTimeout(() => navigate("/", { replace: true }), 700);
            return;
          } else {
            // older clients might not have setSession, fallback to storing nothing (can't proceed)
            throw new Error(
              "Supabase client does not support programmatic session set. Please upgrade @supabase/supabase-js."
            );
          }
        }

        // if we get here, there's no recognizable tokens — maybe an error parameter is present
        if (params["error"] || params["error_description"]) {
          const msg =
            params["error_description"] ||
            params["error"] ||
            "Unknown authentication error from redirect";
          throw new Error(msg);
        }

        // nothing to handle
      } catch (e) {
        console.error("getSessionFromUrl / redirect handling error", e);
        setErr(e?.message || JSON.stringify(e));
      } finally {
        setBusy(false);
      }
    }

    handleRedirect();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  // Main handler: send magic link (sign-in) and fallback to sign-up if needed
  async function handleSendMagicLink(e) {
    e?.preventDefault?.();
    setInfo(null);
    setErr(null);

    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      setErr("Please enter a valid email address.");
      return;
    }

    setBusy(true);
    try {
      const redirectTo = window.location.origin + "/auth";

      // Try sign-in with magic link first
      const { data: signInData, error: signInError } =
        await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo },
        });

      if (!signInError) {
        setInfo("Magic link sent. Check your email (and spam).");
        setEmail("");
        return;
      }

      // If sign-in fails in a way that requires creating an account, attempt signUp
      console.debug(
        "signInWithOtp error, attempting signUp fallback:",
        signInError
      );
      const { data: signUpData, error: signUpError } =
        await supabase.auth.signUp({ email }, { emailRedirectTo: redirectTo });

      if (signUpError) {
        console.error("signUp fallback error:", signUpError);
        setErr(signUpError.message || "Failed to send magic link. Try again.");
      } else {
        setInfo(
          "Account created (if new) and magic link sent. Check your email."
        );
        setEmail("");
      }
    } catch (error) {
      console.error("Unexpected auth error:", error);
      setErr(error?.message || JSON.stringify(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 560, marginTop: 28 }}>
      <div className="card" style={{ padding: 20 }}>
        <h2 style={{ marginTop: 0 }}>Sign in / Sign up</h2>

        <p style={{ color: "#555", marginTop: 0 }}>
          Enter your email and we'll send you a magic link. Clicking it will
          sign you in (or create an account if you're new).
        </p>

        {/* Feedback */}
        {busy && (
          <div style={{ color: "#666", marginBottom: 8 }}>Processing…</div>
        )}
        {info && (
          <div
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 8,
              background: "#ecfdf5",
              color: "#065f46",
            }}
          >
            {info}
          </div>
        )}
        {err && (
          <div
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 8,
              background: "#fff1f2",
              color: "#991b1b",
            }}
          >
            {err}
          </div>
        )}

        <form onSubmit={handleSendMagicLink} style={{ marginTop: 14 }}>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 700 }}>
            Email
          </label>
          <input
            className="date-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            style={{ width: "100%", marginBottom: 10 }}
          />

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn generate" type="submit" disabled={busy}>
              {busy ? "Sending…" : "Send magic link"}
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setEmail("");
                setInfo(null);
                setErr(null);
              }}
              disabled={busy}
            >
              Clear
            </button>
          </div>
        </form>

        <hr style={{ margin: "16px 0", borderColor: "rgba(15,23,36,0.06)" }} />

        <div style={{ color: "#666", fontSize: 13 }}>
          Need help? Make sure the redirect URL{" "}
          <code
            style={{
              background: "#f3f4f6",
              padding: "2px 6px",
              borderRadius: 6,
            }}
          >
            {window.location.origin + "/auth"}
          </code>{" "}
          is added to your Supabase project's Redirect URLs.
        </div>
      </div>
    </div>
  );
}
