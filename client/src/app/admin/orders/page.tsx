"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getAdminOrders, type AdminOrderFilter } from "@/lib/admin";

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export default function AdminOrdersPage() {
  const [page, setPage] = useState(1);

  const [status, setStatus] = useState<AdminOrderFilter>("all");

  const { data, isPending, isError } = useQuery({
    queryKey: ["admin-orders", page, status],
    queryFn: () => getAdminOrders(page, status),
    retry: false,
    staleTime: 5000,
  });

  const orders = data?.data.orders ?? [];
  const pagination = data?.data.pagination;

  return (
    <main className="mx-auto max-w-6xl p-6">
      <Link href="/admin" className="text-blue-600">
        Back to Dashboard
      </Link>

      <h1 className="mt-4 text-3xl font-bold">Customer Orders</h1>

      <p className="mt-2 text-gray-600">
        Review orders and their verified payment status.
      </p>

      <div className="mt-6 rounded-xl border bg-white p-5">
        <label htmlFor="order-status" className="block text-sm font-medium">
          Filter by Payment Status
        </label>

        <select
          id="order-status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as AdminOrderFilter);
            setPage(1);
          }}
          className="mt-2 w-full max-w-xs rounded-lg border p-3"
        >
          <option value="all">All Orders</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      {isPending ? (
        <p className="mt-6">Loading orders...</p>
      ) : isError ? (
        <p className="mt-6 text-red-600">Unable to load orders.</p>
      ) : orders.length === 0 ? (
        <p className="mt-6">No orders found for this filter.</p>
      ) : (
        <div className="mt-6 space-y-5">
          {orders.map((order) => (
            <article
              key={order._id}
              className="rounded-xl border bg-white p-6 shadow-sm"
            >
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  <h2 className="font-semibold">Order</h2>

                  <p className="mt-1 break-all text-sm text-gray-600">
                    {order._id}
                  </p>

                  <p className="mt-3">
                    Customer: {order.user?.name ?? "Customer unavailable"}
                  </p>

                  {order.user?.email && (
                    <p className="text-sm text-gray-600">{order.user.email}</p>
                  )}

                  <p className="mt-2 text-sm text-gray-600">
                    Date:{" "}
                    {new Date(order.createdAt).toLocaleDateString("en-US")}
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <p className="text-xl font-bold">
                    {formatMoney(order.totalCents, order.currency)}
                  </p>

                  <p className="mt-2 text-sm capitalize">
                    Payment: {order.status}
                  </p>

                  {order.paidAt && (
                    <p className="mt-2 text-xs text-gray-500">
                      Paid: {new Date(order.paidAt).toLocaleDateString("en-US")}
                    </p>
                  )}
                </div>
              </div>

              <details className="mt-5 border-t pt-4">
                <summary className="cursor-pointer font-medium">
                  View Purchased Products
                </summary>

                <div className="mt-4 space-y-3">
                  {order.items.map((item) => (
                    <div
                      key={`${item.product}-${item.slug}`}
                      className="flex justify-between gap-4 border-b pb-3"
                    >
                      <div>
                        <p className="font-medium">{item.name}</p>

                        <p className="text-sm text-gray-500">
                          Quantity: {item.quantity}
                        </p>
                      </div>

                      <p>
                        {formatMoney(
                          item.priceCents * item.quantity,
                          order.currency,
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
            </article>
          ))}
        </div>
      )}

      {pagination && (
        <div className="mt-8 flex items-center gap-4">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((previous) => previous - 1)}
            className="rounded-lg border px-4 py-2 disabled:opacity-40"
          >
            Previous
          </button>

          <span>
            Page {page} of {Math.max(1, pagination.pages)}
          </span>

          <button
            type="button"
            disabled={page >= pagination.pages}
            onClick={() => setPage((previous) => previous + 1)}
            className="rounded-lg border px-4 py-2 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </main>
  );
}
