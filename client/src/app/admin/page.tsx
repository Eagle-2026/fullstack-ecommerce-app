"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { getAdminSummary } from "@/lib/admin";

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default function AdminDashboardPage() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["admin-summary"],
    queryFn: getAdminSummary,
    staleTime: 10000,
    retry: false,
  });

  if (isPending) {
    return <main className="mx-auto max-w-6xl p-6">Loading dashboard...</main>;
  }

  if (isError) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="text-2xl font-bold">Dashboard unavailable</h1>
        <p className="mt-3 text-red-600">
          Unable to retrieve administrator statistics.
        </p>
      </main>
    );
  }

  const summary = data.data.summary;

  const cards = [
    {
      label: "Customers",
      value: summary.totalCustomers,
    },
    {
      label: "Total Products",
      value: summary.totalProducts,
    },
    {
      label: "Active Products",
      value: summary.activeProducts,
    },
    {
      label: "Low Stock Products",
      value: summary.lowStockProducts,
    },
    {
      label: "Total Orders",
      value: summary.totalOrders,
    },
    {
      label: "Paid Orders",
      value: summary.paidOrders,
    },
    {
      label: "Pending Orders",
      value: summary.pendingOrders,
    },
    {
      label: "Paid Order Total (Test)",
      value: formatMoney(summary.paidTotalCents),
    },
  ];

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-3xl font-bold">Admin Dashboard</h1>

      <p className="mt-2 text-gray-600">
        Manage your store and review its activity.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border bg-white p-5 shadow-sm"
          >
            <p className="text-sm font-medium text-gray-500">{card.label}</p>

            <p className="mt-3 text-2xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <Link
          href="/admin/products"
          className="rounded-xl border bg-white p-6 shadow-sm hover:border-blue-500"
        >
          <h2 className="text-xl font-semibold">Manage Products</h2>

          <p className="mt-2 text-gray-600">
            Add products, edit prices, update stock, and manage availability.
          </p>
        </Link>

        <Link
          href="/admin/orders"
          className="rounded-xl border bg-white p-6 shadow-sm hover:border-blue-500"
        >
          <h2 className="text-xl font-semibold">Customer Orders</h2>

          <p className="mt-2 text-gray-600">
            Review customer purchases and verified payment statuses.
          </p>
        </Link>
      </div>
    </main>
  );
}
