"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getMyOrderById } from "@/lib/orders";

type OrderDetailsProps = {
  orderId: string;
};

function formatMoney(priceCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(priceCents / 100);
}

function formatDate(value: string): string {
  return (
    new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value)) + " UTC"
  );
}

export default function OrderDetails({ orderId }: OrderDetailsProps) {
  const validOrderId = /^[a-f0-9]{24}$/i.test(orderId);

  const { data, isPending, isError } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => getMyOrderById(orderId),
    enabled: validOrderId,
    retry: false,

    // Refresh while waiting for Stripe confirmation.
    refetchInterval: (query) => {
      const status = query.state.data?.data.order.status;

      return status === "pending" ? 3000 : false;
    },
  });

  if (!validOrderId) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="text-2xl font-bold">Invalid order ID</h1>

        <Link href="/orders" className="text-blue-600">
          Back to My Orders
        </Link>
      </main>
    );
  }

  if (isPending) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <p>Loading your order...</p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="text-2xl font-bold">Order unavailable</h1>

        <p className="mt-3 text-gray-600">
          Please sign in and check that this order belongs to your account.
        </p>

        <Link href="/orders" className="mt-4 inline-block text-blue-600">
          Back to My Orders
        </Link>
      </main>
    );
  }

  const order = data.data.order;

  const statusMessage =
    order.status === "paid"
      ? "Payment confirmed"
      : order.status === "pending"
        ? "Waiting for payment confirmation"
        : order.status === "failed"
          ? "Payment failed"
          : "Checkout session expired";

  return (
    <main className="mx-auto max-w-4xl p-6">
      <Link href="/orders" className="mb-6 inline-block text-blue-600">
        Back to My Orders
      </Link>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold">Order Details</h1>

        <p className="mt-3 break-all text-sm text-gray-600">
          Order ID: {order._id}
        </p>

        <p className="mt-2 text-sm text-gray-600">
          Placed: {formatDate(order.createdAt)}
        </p>

        <div className="mt-6 rounded-lg bg-gray-100 p-4">
          <p className="text-sm font-medium">Payment Status</p>

          <p className="mt-1 text-xl font-semibold capitalize">
            {order.status}
          </p>

          <p className="mt-1 text-sm text-gray-600">{statusMessage}</p>

          {order.paidAt && (
            <p className="mt-2 text-sm">Paid at: {formatDate(order.paidAt)}</p>
          )}
        </div>

        <h2 className="mt-8 text-xl font-semibold">Products</h2>

        <div className="mt-4 divide-y">
          {order.items.map((item) => (
            <div
              key={`${item.product}-${item.slug}`}
              className="flex items-start justify-between gap-4 py-4"
            >
              <div>
                <Link
                  href={`/products/${encodeURIComponent(item.slug)}`}
                  className="font-medium text-blue-600"
                >
                  {item.name}
                </Link>

                <p className="mt-1 text-sm text-gray-600">
                  Quantity: {item.quantity}
                </p>

                <p className="text-sm text-gray-600">
                  Unit price: {formatMoney(item.priceCents, order.currency)}
                </p>
              </div>

              <p className="font-semibold">
                {formatMoney(item.priceCents * item.quantity, order.currency)}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-between border-t pt-5">
          <span className="text-lg font-bold">Order Total</span>

          <span className="text-lg font-bold">
            {formatMoney(order.totalCents, order.currency)}
          </span>
        </div>
      </div>
    </main>
  );
}
