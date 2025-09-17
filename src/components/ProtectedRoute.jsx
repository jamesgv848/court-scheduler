// src/components/ProtectedRoute.jsx
import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function ProtectedRoute({ children }) {
  const { user } = useAuth();

  // If user is null we don't know yet; show nothing (or a spinner). Once falsy, redirect.
  // Adjust if you want to allow unauthenticated access briefly.
  if (user === null) return null;

  return user ? children : <Navigate to="/auth" replace />;
}
