
"use client";

import Link from "next/link";
import { useState, type SubmitEvent  } from "react";

import { apiFetch } from "@/lib/api";

type MessageResponse = {
  message: string;
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

async function handleSubmit(
  event: SubmitEvent<HTMLFormElement>
) {
  event.preventDefault();

    setMessage("");
    setError("");
    setLoading(true);

    try {
      const response = await apiFetch<MessageResponse>(
        "/auth/forgot-password",
        {
          method: "POST",
          body: JSON.stringify({ email }),
        }
      );

      setMessage(response.message);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Request failed"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-5 rounded-2xl bg-white p-8 shadow"
      >
        <h1 className="text-3xl font-bold text-gray-900">
          Forgot Password
        </h1>

        <p className="text-sm text-gray-600">
          Enter your email to request a password reset.
        </p>

        <div>
          <label htmlFor="email" className="text-sm text-gray-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-lg border p-3 text-gray-900"
          />
        </div>

        {message && (
          <p role="status" className="text-sm text-green-700">
            {message}
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-gray-900 p-3 text-white disabled:opacity-50"
        >
          {loading ? "Submitting..." : "Request Reset"}
        </button>

        <Link
          href="/login"
          className="block text-center text-sm text-gray-700 underline"
        >
          Back to Login
        </Link>
      </form>
    </main>
  );
}
