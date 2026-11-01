"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useCart } from "@/context/CartContext";
import { getCurrentUser } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

export default function StoreHeader() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { itemCount, isLoaded, clearCart } = useCart();

  const [loggingOut, setLoggingOut] = useState(false);

  const [error, setError] = useState("");

  // =====================================
  // CHECK AUTHENTICATION
  // =====================================
  const {
    data: user,
    isPending,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["me"],
    queryFn: getCurrentUser,
    retry: false,
    staleTime: 0,

    // Recheck when header mounts.
    refetchOnMount: "always",

    // Recheck when the customer returns
    // to the browser tab.
    refetchOnWindowFocus: "always",

    // Recheck when internet reconnects.
    refetchOnReconnect: "always",

    // Recheck logged-in sessions every
    // 15 seconds while the tab is active.
    refetchInterval: (query) => (query.state.data ? 15_000 : false),

    refetchIntervalInBackground: false,
  });

  // =====================================
  // RECHECK AFTER LOGIN OR SIGNUP
  // =====================================
  useEffect(() => {
    function handleAuthChanged() {
      void queryClient.invalidateQueries({
        queryKey: ["me"],
      });
    }

    window.addEventListener("ecom-auth-changed", handleAuthChanged);

    return () => {
      window.removeEventListener("ecom-auth-changed", handleAuthChanged);
    };
  }, [queryClient]);

  // =====================================
  // LOGOUT
  // =====================================

  async function handleLogout() {
    if (loggingOut) return;

    setError("");
    setLoggingOut(true);

    try {
      // Step 1: Log out from the backend.
      // Revoke the session and clear auth cookies.
      await apiFetch("/auth/logout", {
        method: "POST",
      });

      // Step 2: Clear shopping cart data.
      // Remove items from React state and localStorage.
      clearCart();

      // Step 3: Stop existing API queries.
      await queryClient.cancelQueries();

      // Step 4: Remove cached customer information.
      queryClient.clear();

      // Step 5: Update the header immediately.
      // Show Login and Sign Up instead of Logout.
      queryClient.setQueryData(["me"], null);

      // Step 6: Return to the Shop homepage.
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logout failed");

      // Recheck authentication if logout fails.
      void queryClient.invalidateQueries({
        queryKey: ["me"],
      });
    } finally {
      setLoggingOut(false);
    }
  }

  // =====================================
  // HEADER
  // =====================================
  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5">
        <Link href="/" className="text-2xl font-bold">
          E-Commerce Store
        </Link>

        <nav className="flex flex-wrap items-center gap-4 text-sm font-medium">
          <Link href="/">Shop</Link>

          {/* Guests can browse and use the cart. */}
          <Link
            href="/cart"
            className="rounded-lg bg-blue-50 px-3 py-2 text-blue-700"
          >
            Cart ({isLoaded ? itemCount : "..."})
          </Link>

          {isPending || (isFetching && !user) ? (
            <span className="text-gray-500">Checking account...</span>
          ) : isError ? (
            <>
              <span className="text-red-600">
                Account temporarily unavailable
              </span>

              <button
                type="button"
                onClick={() => void refetch()}
                className="rounded-lg border px-3 py-2"
              >
                Retry
              </button>
            </>
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
