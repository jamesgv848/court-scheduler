// src/components/ConfirmModal.jsx
import React from "react";
import PropTypes from "prop-types";

/**
 * App-wide confirm modal — light theme bottom sheet.
 * Props: open, title, message (string|node), onConfirm, onCancel,
 *        confirmLabel, cancelLabel, loading
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
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.35)",
        display: "flex",
        alignItems: "flex-end",
        zIndex: 2000,
        padding: 0,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          background: "#fff",
          borderRadius: "16px 16px 0 0",
          padding: 20,
          boxShadow: "0 -8px 32px rgba(0,0,0,.12)",
          border: "1px solid var(--border)",
          maxWidth: 600,
          margin: "0 auto",
        }}
      >
        {/* Drag handle */}
        <div
          style={{
            width: 36,
            height: 3,
            background: "var(--border2)",
            borderRadius: 2,
            margin: "0 auto 16px",
          }}
        />

        {/* Title */}
        <h3
          style={{
            margin: "0 0 8px",
            fontSize: 17,
            fontWeight: 800,
            color: "var(--text)",
          }}
        >
          {title}
        </h3>

        {/* Message */}
        {message && (
          <div
            style={{
              marginBottom: 20,
              color: "var(--muted)",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            {message}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: "9px 16px",
              borderRadius: 8,
              cursor: "pointer",
              border: "1px solid var(--border)",
              background: "var(--surface2)",
              color: "var(--text)",
              fontWeight: 600,
              fontSize: 13,
              fontFamily: "inherit",
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              padding: "9px 16px",
              borderRadius: 8,
              cursor: "pointer",
              border: "none",
              background: "var(--primary)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              fontFamily: "inherit",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Please wait…" : confirmLabel}
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
