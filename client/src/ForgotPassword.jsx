// src/ForgotPassword.jsx
import React, { useState } from "react";

export default function ForgotPassword({ onForgotPassword, onSwitchToLogin }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email) {
      setError("Inserisci la tua email.");
      return;
    }
    // Validazione semplice per il formato email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Email non valida.");
      return;
    }
    onForgotPassword(email);
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded shadow-md w-80">
        <h2 className="text-xl font-bold mb-4 text-center">Recupera Password</h2>
        {error && <p className="text-red-500 mb-2">{error}</p>}
        <div className="mb-4">
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Inserisci la tua email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 p-2 border rounded w-full"
            required
          />
        </div>
        <button type="submit" className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 transition-colors">
          Invia link di recupero
        </button>
        <p className="mt-4 text-center">
          <button type="button" onClick={onSwitchToLogin} className="text-blue-500 underline">
            Torna al Login
          </button>
        </p>
      </form>
    </div>
  );
}
