"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getMyOrders } from "@/lib/orders";

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export default function OrdersPage() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["my-orders"],
    queryFn: getMyOrders,
    staleTime: 10000,
    retry: false,
  });

  if (isPending) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="text-3xl font-bold">My Orders</h1>

        <p className="mt-4">Loading your orders...</p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="text-3xl font-bold">My Orders</h1>

        <p className="mt-4 text-red-600">
          Unable to load orders. Please check that you are signed in.
        </p>
      </main>
    );
  }

  const orders = data.data.orders;

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-3xl font-bold">My Orders</h1>

      <p className="mt-2 text-gray-600">
        View your previous purchases and payment statuses.
      </p>

      {orders.length === 0 ? (
        <div className="mt-8 rounded-xl border p-6">
          <p>You have not placed any orders yet.</p>

          <Link href="/products" className="mt-4 inline-block text-blue-600">
            Browse Products
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {orders.map((order) => (
            <article
              key={order._id}
              className="rounded-xl border bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">Order</h2>

                  <p className="mt-1 break-all text-sm text-gray-600">
                    {order._id}
                  </p>

                  <p className="mt-2 text-sm text-gray-600">
                    {new Date(order.createdAt).toISOString().slice(0, 10)}
                  </p>

                  <p className="mt-2 text-sm">
                    {order.items.length} product line(s)
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-lg font-bold">
                    {formatMoney(order.totalCents, order.currency)}
                  </p>

                  <p className="mt-2 text-sm capitalize">
                    Status: {order.status}
                  </p>
                </div>
              </div>

              <Link
                href={`/orders/${order._id}`}
                className="mt-5 inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
              >
                View Order Details
              </Link>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
