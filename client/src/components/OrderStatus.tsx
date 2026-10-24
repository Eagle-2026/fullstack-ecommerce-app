"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { getMyOrderById } from "@/lib/orders";
import { formatPrice } from "@/lib/format";
import { useCart } from "@/context/CartContext";

type Props = {
  orderId: string;
};

export default function OrderStatus({ orderId }: Props) {
  const { clearCart, isLoaded } = useCart();

  const cartCleared = useRef(false);

  const validOrderId = /^[a-fA-F0-9]{24}$/.test(orderId);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => getMyOrderById(orderId),
    enabled: validOrderId,
    retry: 1,
    refetchInterval: (query) => {
      const status = query.state.data?.data.order.status;

      return status === "pending" ? 3000 : false;
    },
  });

  const order = data?.data.order;

  // Clear cart only after our backend
  // confirms that the order is paid.
  useEffect(() => {
    if (order?.status === "paid" && isLoaded && !cartCleared.current) {
      cartCleared.current = true;
      clearCart();
    }
  }, [order?.status, isLoaded, clearCart]);

  if (!validOrderId) {
    return <p className="text-red-600">Invalid order ID.</p>;
  }

  if (isLoading) {
    return <p>Checking payment status...</p>;
  }

  if (isError) {
    return (
      <p className="text-red-600">
        {error instanceof Error ? error.message : "Unable to load order"}
      </p>
    );
  }

  if (!order) {
    return <p>Order not found.</p>;
  }

  return (
    <div className="mx-auto max-w-2xl rounded-xl bg-white p-8 shadow">
      <h1 className="text-2xl font-bold text-gray-900">Order Status</h1>

      <p className="mt-3 text-gray-600">Order ID: {order._id}</p>

      <p className="mt-2 text-lg font-semibold text-gray-900">
        Total: {formatPrice(order.totalCents)}
      </p>

      {order.status === "paid" ? (
        <div className="mt-5 rounded-lg bg-green-50 p-4 text-green-800">
          Payment confirmed! Your order was successfully paid in Stripe test
          mode.
        </div>
      ) : order.status === "pending" ? (
        <div className="mt-5 rounded-lg bg-yellow-50 p-4 text-yellow-800">
          Payment verification is pending. This page checks your order status
          automatically every few seconds. Do not assume payment failed or retry
          until you check your order.
        </div>
      ) : (
        <div className="mt-5 rounded-lg bg-red-50 p-4 text-red-700">
          Payment status: {order.status}.
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-4">
        <Link
          href="/orders"
          className="rounded-lg bg-blue-600 px-5 py-3 text-white"
        >
          View My Orders
        </Link>

        <Link href="/" className="rounded-lg border px-5 py-3 text-gray-900">
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}
