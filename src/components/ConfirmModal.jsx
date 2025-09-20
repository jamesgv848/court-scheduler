// src/components/ConfirmModal.jsx
import React from "react";
import PropTypes from "prop-types";

/**
 * Simple confirm modal used across the app.
 * Props:
 *  - open: boolean
 *  - title: string
 *  - message: string (can be JSX)
 *  - onConfirm: fn
 *  - onCancel: fn
 *  - confirmLabel, cancelLabel, loading
 */
export default function ConfirmModal({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = "Yes",
  cancelLabel = "Cancel",
  loading = false,
}) {
  if (!open) return null;
  return (
    <div style={backdrop}>
      <div style={modal}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h3 style={{ margin: 0, fontSize: 18 }}>{title}</h3>
          <button onClick={onCancel} style={closeBtn} aria-label="Close">
            ✕
          </button>
        </div>
        <div style={{ marginTop: 12, color: "#444", fontSize: 14 }}>
          {message}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 16,
          }}
        >
          <button onClick={onCancel} style={cancelStyle} disabled={loading}>
            {cancelLabel}
          </button>
          <button onClick={onConfirm} style={confirmStyle} disabled={loading}>
            {loading ? "Please wait..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

ConfirmModal.propTypes = {
  open: PropTypes.bool,
  title: PropTypes.string,
  message: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  onConfirm: PropTypes.func,
  onCancel: PropTypes.func,
  confirmLabel: PropTypes.string,
  cancelLabel: PropTypes.string,
  loading: PropTypes.bool,
};

/* small inline styles (move to CSS if you prefer) */
const backdrop = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2000,
  padding: 16,
};
const modal = {
  width: 420,
  maxWidth: "100%",
  background: "#fff",
  borderRadius: 12,
  padding: 18,
  boxShadow: "0 12px 48px rgba(0,0,0,0.16)",
};
const closeBtn = {
  border: "none",
  background: "transparent",
  fontSize: 18,
  cursor: "pointer",
};
const cancelStyle = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "#fff",
  cursor: "pointer",
};
const confirmStyle = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "none",
  background: "#0b71d0",
  color: "#fff",
  cursor: "pointer",
};
