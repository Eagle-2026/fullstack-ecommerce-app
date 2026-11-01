"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { getMyOrders } from "@/lib/orders";

import AccountBackNavigation from "@/components/AccountBackNavigation";

// =====================================
// FORMAT ORDER TOTAL
// =====================================

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

// =====================================
// MY ORDERS PAGE
// =====================================

export default function OrdersPage() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["my-orders"],
    queryFn: getMyOrders,
    staleTime: 10000,
    retry: false,
  });

  // =====================================
  // LOADING STATE
  // =====================================

  if (isPending) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-6xl">
          <AccountBackNavigation />

          <h1 className="text-3xl font-bold text-slate-900">My Orders</h1>

          <div
            role="status"
            className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 text-slate-600 shadow-sm"
          >
            Loading your orders...
          </div>
        </div>
      </main>
    );
  }

  // =====================================
  // ERROR STATE
  // =====================================

  if (isError) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-6xl">
          <AccountBackNavigation />

          <h1 className="text-3xl font-bold text-slate-900">My Orders</h1>

          <div className="mt-8 rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
            <p role="alert" className="text-red-700">
              Unable to load your orders. Please check your login or connection.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void refetch()}
                className="rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
              >
                Try Again
              </button>

              <Link
                href="/login"
                className="rounded-lg border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50"
              >
                Go to Login
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const orders = data.data.orders;

  // =====================================
  // ORDERS DASHBOARD
  // =====================================

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-6xl">
        {/* BACK NAVIGATION */}
        <AccountBackNavigation />

        {/* PAGE HEADER */}
        <section className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">
            Customer Dashboard
          </p>

          <h1 className="mt-2 text-3xl font-bold text-slate-950 sm:text-4xl">
            My Orders
          </h1>

          <p className="mt-3 text-slate-600">
            View your previous purchases, payment statuses, and order details.
          </p>
        </section>

        {/* ORDERS SUMMARY */}
        <div className="mb-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Recent Orders</p>

          <p className="mt-2 text-3xl font-bold text-slate-900">
            {orders.length}
          </p>

          <p className="mt-2 text-xs text-slate-500">
            Showing your most recent available orders.
          </p>
        </div>

        {/* EMPTY ORDERS STATE */}
        {orders.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">No Orders Yet</h2>

            <p className="mt-3 text-slate-600">
              You have not placed any orders yet. Start shopping to find your
              first product.
            </p>

            <Link
              href="/"
              className="mt-6 inline-flex rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
            >
              Browse Products
            </Link>
          </div>
        ) : (
          // =====================================
          // ORDER CARDS
          // =====================================

          <div className="space-y-5">
            {orders.map((order) => {
              const statusStyle =
                order.status === "paid"
                  ? "bg-green-50 text-green-700"
                  : order.status === "pending"
                    ? "bg-yellow-50 text-yellow-800"
                    : "bg-red-50 text-red-700";

              return (
                <article
                  key={order._id}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                    {/* ORDER INFORMATION */}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Order Number
                      </p>

                      <h2 className="mt-2 break-all font-semibold text-slate-900">
                        {order._id}
                      </h2>

                      <p className="mt-3 text-sm text-slate-500">
                        Placed on{" "}
                        {new Date(order.createdAt).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </p>

                      <p className="mt-2 text-sm text-slate-600">
                        {order.items.length} product
                        {order.items.length === 1 ? " line" : " lines"}
                      </p>
                    </div>

                    {/* TOTAL AND STATUS */}
                    <div className="sm:text-right">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Order Total
                      </p>

                      <p className="mt-2 text-2xl font-bold text-slate-900">
                        {formatMoney(order.totalCents, order.currency)}
                      </p>

                      <span
                        className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize ${statusStyle}`}
                      >
                        {order.status}
                      </span>
                    </div>
                  </div>

                  {/* ORDER DETAILS LINK */}
                  <div className="mt-6 border-t border-slate-100 pt-5">
                    <Link
                      href={`/orders/${order._id}`}
                      className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      View Order Details
                      <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* BOTTOM NAVIGATION */}
        <div className="mt-10 border-t border-slate-200 pt-6">
          <AccountBackNavigation />
        </div>
      </div>
    </main>
  );
}
