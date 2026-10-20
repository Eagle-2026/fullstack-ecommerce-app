
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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

  const [customer, setCustomer] = useState<Customer | null>(
    null
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const loadCustomer = async () => {
      try {
        const response = await apiFetch<MeResponse>(
          "/auth/me"
        );

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

  async function handleLogout() {
    setError("");

    try {
      await apiFetch("/auth/logout", {
        method: "POST",
      });

      router.replace("/login");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Logout failed"
      );
    }
  }

  if (loading || !customer) {
    return (
      <main className="p-10 text-gray-900">
        Checking your account...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-xl rounded-2xl bg-white p-8 shadow">
        <h1 className="text-3xl font-bold text-gray-900">
          My Account
        </h1>

        <p className="mt-4 text-gray-700">
          Welcome, {customer.name}!
        </p>

        <p className="mt-2 text-gray-700">
          Email: {customer.email}
        </p>

        <p className="mt-2 text-gray-700">
          Role: {customer.role}
        </p>

        <p className="mt-6 text-sm text-gray-500">
          Your orders and account settings will appear here
          as we continue building the store.
        </p>

        {error && (
          <p role="alert" className="mt-4 text-red-600">
            {error}
          </p>
        )}

        <div className="mt-8 flex gap-4">
          <Link
            href="/"
            className="rounded-lg border p-3 text-gray-900"
          >
            Home
          </Link>

          <button
            onClick={handleLogout}
            className="rounded-lg bg-gray-900 px-6 py-3 text-white"
          >
            Logout
          </button>
        </div>
      </div>
    </main>
  );
}