"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { getMyOrders } from "@/lib/orders";
import { formatPrice } from "@/lib/format";

export default function OrdersPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["my-orders"],
    queryFn: getMyOrders,
  });

  const orders = data?.data.orders ?? [];

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold text-gray-900">My Orders</h1>

      <p className="mt-2 text-gray-600">Your 20 most recent orders.</p>

      {isLoading && <p className="mt-6">Loading orders...</p>}

      {isError && (
        <p className="mt-6 text-red-600">
          {error instanceof Error ? error.message : "Unable to load orders"}
        </p>
      )}

      {!isLoading && !isError && orders.length === 0 && (
        <div className="mt-8 rounded-lg border p-6">
          <p>You have no orders yet.</p>

          <Link href="/" className="mt-4 inline-block text-blue-600 underline">
            Start Shopping
          </Link>
        </div>
      )}

      <div className="mt-8 space-y-5">
        {orders.map((order) => (
          <div
            key={order._id}
            className="rounded-xl border bg-white p-6 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold text-gray-900">
                  Order #{order._id.slice(-8)}
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  {new Date(order.createdAt).toLocaleDateString("en-US")}
                </p>
              </div>

              <span className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-900">
                {order.status.toUpperCase()}
              </span>
            </div>

            <div className="mt-4 space-y-2">
              {order.items.map((item) => (
                <p key={item.slug} className="text-sm text-gray-700">
                  {item.name} x {item.quantity}
                </p>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between border-t pt-4">
              <p className="font-bold text-gray-900">
                {formatPrice(order.totalCents)}
              </p>

              <Link
                href={`/checkout/success?orderId=${order._id}`}
                className="text-blue-600 underline"
              >
                View Status
              </Link>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
