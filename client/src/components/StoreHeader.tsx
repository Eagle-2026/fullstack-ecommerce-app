"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useCart } from "@/context/CartContext";
import { getCurrentUser } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

export default function StoreHeader() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { itemCount, isLoaded } = useCart();

  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");

  const { data: user, isPending } = useQuery({
    queryKey: ["me"],
    queryFn: getCurrentUser,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  async function handleLogout() {
    setError("");
    setLoggingOut(true);

    try {
      await apiFetch("/auth/logout", {
        method: "POST",
      });

      // Clear cached customer/admin information.
      queryClient.clear();

      // Update the header immediately.
      queryClient.setQueryData(["me"], null);

      router.replace("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logout failed");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5">
        <Link href="/" className="text-2xl font-bold">
          E-Commerce Store
        </Link>

        <nav className="flex flex-wrap items-center gap-4 text-sm font-medium">
          <Link href="/">Shop</Link>

          <Link
            href="/cart"
            className="rounded-lg bg-blue-50 px-3 py-2 text-blue-700"
          >
            Cart ({isLoaded ? itemCount : "..."})
          </Link>

          {isPending ? (
            <span className="text-gray-500">Checking account...</span>
          ) : user ? (
            <>
              <Link href="/account">My Account</Link>

              <Link href="/orders">My Orders</Link>

              {user.role === "admin" && (
                <Link href="/admin" className="font-semibold text-blue-700">
                  Admin Dashboard
                </Link>
              )}

              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="rounded-lg bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
              >
                {loggingOut ? "Logging out..." : "Logout"}
              </button>
            </>
          ) : (
            <>
              <Link href="/login">Login</Link>

              <Link
                href="/signup"
                className="rounded-lg bg-blue-600 px-4 py-2 text-white"
              >
                Sign Up
              </Link>
            </>
          )}
        </nav>
      </div>

      {error && (
        <p
          role="alert"
          className="mx-auto max-w-6xl px-4 pb-3 text-sm text-red-600"
        >
          {error}
        </p>
      )}
    </header>
  );
}
