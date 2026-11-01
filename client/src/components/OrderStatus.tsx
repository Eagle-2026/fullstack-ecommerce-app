"use client";

import { useEffect, useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import Link from "next/link";

import {
  getMyOrderById,
  verifyMyOrderPayment,
  finishCheckoutAttempt,
} from "@/lib/orders";

import { ApiRequestError } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { useCart } from "@/context/CartContext";

type Props = {
  orderId: string;
};

export default function OrderStatus({ orderId }: Props) {
  const { items, clearCart, isLoaded } = useCart();

  const queryClient = useQueryClient();

  // Prevent handling the same final order status twice.
  const finalStatusHandled = useRef<string | null>(null);

  // Prevent repeated verification POSTs
  // for the same order during this mount.
  const verificationRequestedFor = useRef<string | null>(null);

  const [verificationWarning, setVerificationWarning] = useState("");

  const validOrderId = /^[a-fA-F0-9]{24}$/.test(orderId);

  // =====================================
  // GET ORDER FROM TRUSTED BACKEND
  // =====================================

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["order", orderId],

    queryFn: () => getMyOrderById(orderId),

    enabled: validOrderId,

    retry: 1,

    // Keep checking while payment is pending.
    refetchInterval: (query) => {
      const status = query.state.data?.data.order.status;

      return status === "pending" ? 3000 : false;
    },
  });

  const order = data?.data.order;

  // =====================================
  // VERIFY PENDING PAYMENT WITH STRIPE
  // =====================================

  useEffect(() => {
    if (
      !validOrderId ||
      order?.status !== "pending" ||
      verificationRequestedFor.current === orderId
    ) {
      return;
    }

    verificationRequestedFor.current = orderId;

    // The backend checks Stripe directly.
    // This is a fallback to the Stripe webhook.
    void verifyMyOrderPayment(orderId)
      .then(() => {
        // Retrieve the latest order status.
        void queryClient.invalidateQueries({
          queryKey: ["order", orderId],
        });
      })
      .catch((err: unknown) => {
        // Never assume payment succeeded
        // when verification fails.
        if (err instanceof ApiRequestError && err.status === 409) {
          setVerificationWarning(
            "Payment details could not be verified. Please check your orders before trying again.",
          );
        }

        // The regular GET polling can still
        // receive updates from the webhook.
      });
  }, [validOrderId, orderId, order?.status, queryClient]);

  // =====================================
  // HANDLE CONFIRMED FINAL ORDER STATUS
  // =====================================

  useEffect(() => {
    // Wait until the shopping cart has loaded.
    if (!order || !isLoaded) {
      return;
    }

    // Do not finish checkout while the order
    // is still pending.
    if (order.status === "pending") {
      return;
    }

    // Handle paid, failed, or expired orders.
    const finalStatusKey = `${order._id}:${order.status}`;

    if (finalStatusHandled.current === finalStatusKey) {
      return;
    }

    finalStatusHandled.current = finalStatusKey;

    // The helper checks whether this order
    // belongs to the saved checkout attempt.
    //
    // It also checks whether the current cart
    // still matches the checkout cart.
    const shouldClearCart = finishCheckoutAttempt(
      order._id,
      order.status,
      items.map((item) => ({
        slug: item.slug,
        quantity: item.quantity,
      })),
    );

    // Clear only after confirmed payment
    // AND a matching checkout attempt.
    if (shouldClearCart) {
      clearCart();
    }
  }, [order, isLoaded, items, clearCart]);

  // =====================================
  // INVALID ORDER ID
  // =====================================

  if (!validOrderId) {
    return <p className="text-red-600">Invalid order ID.</p>;
  }

  // =====================================
  // LOADING
  // =====================================

  if (isLoading) {
    return <p role="status">Checking payment status...</p>;
  }

  // =====================================
  // ERROR
  // =====================================

  if (isError) {
    return (
      <p role="alert" className="text-red-600">
        {error instanceof Error ? error.message : "Unable to load order"}
      </p>
    );
  }

  if (!order) {
    return <p className="text-red-600">Order not found.</p>;
  }

  // =====================================
  // ORDER STATUS DISPLAY
  // =====================================

  return (
    <div className="mx-auto max-w-2xl rounded-xl bg-white p-8 shadow">
      <h1 className="text-2xl font-bold text-gray-900">Order Status</h1>

      <p className="mt-3 text-gray-600">Order ID: {order._id}</p>

      <p className="mt-2 text-lg font-semibold text-gray-900">
        Total: {formatPrice(order.totalCents)}
      </p>

      {verificationWarning && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-red-700">
          {verificationWarning}
        </p>
      )}

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
