"use client";

import { useState } from "react";
import Link from "next/link";

import { useCart } from "@/context/CartContext";
import { startCheckout } from "@/lib/orders";

export default function CheckoutButton() {
  const { items, isLoaded } = useCart();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [error, setError] = useState("");

  const handleCheckout = async () => {
    if (isSubmitting || !isLoaded || items.length === 0) {
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await startCheckout(
        items.map((item) => ({
          slug: item.slug,
          quantity: item.quantity,
        })),
      );

      // Redirect to the hosted Stripe page.
      window.location.assign(response.data.checkoutUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start checkout");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleCheckout}
        disabled={isSubmitting || !isLoaded || items.length === 0}
        className="w-full rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? "Preparing secure checkout..." : "Proceed to Checkout"}
      </button>

      <p className="text-sm text-gray-600">
        You must be logged in to place an order.{" "}
        <Link href="/login" className="font-medium text-blue-600 underline">
          Log in
        </Link>
      </p>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <p className="text-xs text-gray-500">
        Payments are processed through Stripe. This project currently uses test
        mode only.
      </p>
    </div>
  );
}
