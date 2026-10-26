"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type SubmitEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";
import type { AuthUser } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      // Step 1: Send login details to the backend.
      const response = await apiFetch<{
        status: string;
        data: {
          user: AuthUser;
        };
      }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
        }),
      });

      // Step 2: Clear cached data from any previous user.
      queryClient.clear();

      // Step 3: Update the shared authentication state.
      // The StoreHeader will now recognize the logged-in user.
      queryClient.setQueryData(["me"], response.data.user);

      // Step 4: Redirect to the account page.
      router.replace("/account");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Login failed");
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
        <h1 className="text-3xl font-bold text-gray-900">Customer Login</h1>

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

        <div>
          <label htmlFor="password" className="text-sm text-gray-700">
            Password
          </label>

          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-lg border p-3 text-gray-900"
          />
        </div>

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
          {loading ? "Logging in..." : "Login"}
        </button>

        <Link
          href="/forgot-password"
          className="block text-center text-sm text-blue-700 underline"
        >
          Forgot your password?
        </Link>

        <p className="text-center text-sm text-gray-600">
          No account?{" "}
          <Link href="/signup" className="underline">
            Register
          </Link>
        </p>
      </form>
    </main>
  );
}
