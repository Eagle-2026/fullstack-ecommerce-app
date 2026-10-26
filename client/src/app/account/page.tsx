"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";

type Customer = {
  id: string;
  name: string;
  email: string;
  role: "customer" | "admin";
};

type MeResponse = {
  status: string;
  data: {
    user: Customer;
  };
};

export default function AccountPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [customer, setCustomer] = useState<Customer | null>(null);

  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");

  // =====================================
  // LOAD CURRENT LOGGED-IN CUSTOMER
  // =====================================

  useEffect(() => {
    let active = true;

    const loadCustomer = async () => {
      try {
        const response = await apiFetch<MeResponse>("/auth/me");

        if (active) {
          setCustomer(response.data.user);
        }
      } catch {
        if (active) {
          router.replace("/login");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadCustomer();

    return () => {
      active = false;
    };
  }, [router]);

  // =====================================
  // LOGOUT CUSTOMER
  // =====================================

  async function handleLogout() {
    setError("");
    setLoggingOut(true);

    try {
      // Step 1: Ask backend to log out.
      // Backend revokes the session and clears cookies.
      await apiFetch("/auth/logout", {
        method: "POST",
      });

      // Step 2: Clear cached data from React Query.
      queryClient.clear();

      // Step 3: Update shared authentication state.
      // StoreHeader will now show Login and Sign Up.
      queryClient.setQueryData(["me"], null);

      // Step 4: Clear customer information locally.
      setCustomer(null);

      // Step 5: Redirect to Login page.
      router.replace("/login");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Logout failed");
    } finally {
      setLoggingOut(false);
    }
  }

  // =====================================
  // LOADING STATE
  // =====================================

  if (loading || !customer) {
    return <main className="p-10 text-gray-900">Checking your account...</main>;
  }

  // =====================================
  // ACCOUNT PAGE
  // =====================================

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-xl rounded-2xl bg-white p-8 shadow">
        <h1 className="text-3xl font-bold text-gray-900">My Account</h1>

        <p className="mt-4 text-gray-700">Welcome, {customer.name}!</p>

        <p className="mt-2 text-gray-700">Email: {customer.email}</p>

        <p className="mt-2 text-gray-700">Role: {customer.role}</p>

        <p className="mt-6 text-sm text-gray-500">
          View your orders and manage your account.
        </p>

        {error && (
          <p role="alert" className="mt-4 text-red-600">
            {error}
          </p>
        )}

        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/" className="rounded-lg border p-3 text-gray-900">
            Home
          </Link>

          <Link href="/orders" className="rounded-lg border p-3 text-gray-900">
            My Orders
          </Link>

          {customer.role === "admin" && (
            <Link href="/admin" className="rounded-lg border p-3 text-blue-700">
              Admin Dashboard
            </Link>
          )}

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="rounded-lg bg-gray-900 px-6 py-3 text-white disabled:opacity-50"
          >
            {loggingOut ? "Logging out..." : "Logout"}
          </button>
        </div>
      </div>
    </main>
  );
}
