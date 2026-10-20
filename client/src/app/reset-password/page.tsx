
"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

import { apiFetch } from "@/lib/api";

type MessageResponse = {
  message: string;
};

export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Token is carried in the URL fragment.
    const params = new URLSearchParams(
      window.location.hash.substring(1)
    );

    const value = params.get("token");

    if (value) {
      setToken(value);

      // Remove the secret from the visible URL.
      window.history.replaceState(
        null,
        "",
        "/reset-password"
      );
    } else {
      setToken((previous) => previous ?? "");
    }
  }, []);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setMessage("");
    setError("");

    if (!token) {
      setError("Missing reset token. Request a new link.");
      return;
    }

    setLoading(true);

    try {
      const response = await apiFetch<MessageResponse>(
        "/auth/reset-password",
        {
          method: "POST",
          body: JSON.stringify({
            token,
            password,
          }),
        }
      );

      setMessage(response.message);
      setToken("");
      setPassword("");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Password reset failed"
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
          Reset Password
        </h1>

        <p className="text-sm text-gray-600">
          Enter a new password for your account.
        </p>

        <div>
          <label
            htmlFor="password"
            className="text-sm text-gray-700"
          >
            New Password
          </label>

          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
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
          disabled={loading || token === null}
          className="w-full rounded-lg bg-gray-900 p-3 text-white disabled:opacity-50"
        >
          {loading ? "Updating..." : "Reset Password"}
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