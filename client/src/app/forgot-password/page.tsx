"use client";

import Link from "next/link";
import { useState, type SubmitEvent } from "react";

import { apiFetch } from "@/lib/api";
import AccountBackNavigation from "@/components/AccountBackNavigation";

type MessageResponse = {
  message: string;
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // =====================================
  // REQUEST PASSWORD RESET
  // =====================================

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) return;

    setMessage("");
    setError("");
    setLoading(true);

    try {
      const response = await apiFetch<MessageResponse>(
        "/auth/forgot-password",
        {
          method: "POST",
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
          }),
        },
      );

      setMessage(response.message);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  // =====================================
  // FORGOT PASSWORD PAGE
  // =====================================

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-md">
        {/* BACK NAVIGATION */}
        <AccountBackNavigation />

        {/* PASSWORD RESET FORM */}
        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Forgot Password
            </h1>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              Enter your email address and we will send you instructions to
              reset your password.
            </p>
          </div>

          {/* EMAIL FIELD */}
          <div>
            <label
              htmlFor="email"
              className="text-sm font-medium text-slate-700"
            >
              Email Address
            </label>

            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              disabled={loading}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Enter your email"
              className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
            />
          </div>

          {/* SUCCESS MESSAGE */}
          {message && (
            <p
              role="status"
              className="rounded-lg bg-green-50 p-4 text-sm text-green-800"
            >
              {message}
            </p>
          )}

          {/* ERROR MESSAGE */}
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 p-4 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          {/* SUBMIT BUTTON */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 p-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Submitting..." : "Request Password Reset"}
          </button>

          {/* LOGIN NAVIGATION */}
          <div className="border-t border-slate-100 pt-5 text-center">
            <p className="text-sm text-slate-600">Remember your password?</p>

            <Link
              href="/login"
              className="mt-2 inline-block text-sm font-semibold text-blue-600 hover:underline"
            >
              ← Back to Login
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
