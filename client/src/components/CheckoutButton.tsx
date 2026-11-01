
"use client";

import { useRef, useState } from "react";
import Link from "next/link";

import {
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { useCart } from "@/context/CartContext";
import { getCurrentUser } from "@/lib/auth";
import {
  ApiRequestError,
} from "@/lib/api";
import { startCheckout } from "@/lib/orders";

export default function CheckoutButton() {
  const { items, isLoaded } = useCart();

  const queryClient = useQueryClient();

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [error, setError] = useState("");

  // Prevent rapid duplicate clicks before
  // React has updated the button's state.
  const submittingRef = useRef(false);

  // =====================================
  // CHECK CURRENT LOGIN STATUS
  // =====================================

  const {
    data: user,
    isPending: checkingAuth,
    isFetching: refreshingAuth,
    isError: authError,
    refetch,
  } = useQuery({
    queryKey: ["me"],
    queryFn: getCurrentUser,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: "always",
  });

  // =====================================
  // START SECURE CHECKOUT
  // =====================================

  const handleCheckout = async () => {
    if (
      submittingRef.current ||
      !isLoaded ||
      items.length === 0 ||
      !user
    ) {
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setError("");

    try {
      // Send only product slugs and quantities.
      // The backend determines actual prices,
      // stock, customer ID, and order status.
      const response = await startCheckout(
        items.map((item) => ({
          slug: item.slug,
          quantity: item.quantity,
        }))
      );

      // Redirect to Stripe-hosted checkout.
      window.location.assign(
        response.data.checkoutUrl
      );
    } catch (err) {
      if (
        err instanceof ApiRequestError &&
        err.status === 401
      ) {
        setError(
          "Your login has expired. Please log in again."
        );

        // Recheck the current customer.
        await queryClient.invalidateQueries({
          queryKey: ["me"],
        });
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to start checkout"
        );
      }

      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  // =====================================
  // RENDER CHECKOUT CONTROLS
  // =====================================

  return (
    <div className="space-y-3">

      {checkingAuth || refreshingAuth ? (
        <button
          type="button"
          disabled
          className="w-full cursor-not-allowed rounded-lg bg-gray-400 px-5 py-3 font-semibold text-white"
        >
          Checking account...
        </button>

      ) : authError ? (
        <div className="space-y-2">
          <p
            role="alert"
            className="text-sm text-red-700"
          >
            Unable to verify your login.
          </p>

          <button
            type="button"
            onClick={() => void refetch()}
            className="w-full rounded-lg border border-gray-300 px-5 py-3 font-semibold"
          >
            Retry
          </button>
        </div>

      ) : !user ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            You can browse and add products
            without logging in. Please log
            in before checkout.
          </p>

          <Link
            href="/login"
            className="block w-full rounded-lg bg-blue-600 px-5 py-3 text-center font-semibold text-white hover:bg-blue-700"
          >
            Log in to Checkout
          </Link>
        </div>

      ) : (
        <button
          type="button"
          onClick={handleCheckout}
          disabled={
            isSubmitting ||
            !isLoaded ||
            items.length === 0
          }
          className="w-full rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting
            ? "Preparing secure checkout..."
            : "Proceed to Checkout"}
        </button>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <p className="text-xs text-gray-500">
        Payments are processed securely
        through Stripe. This project
        currently uses TEST mode only.
      </p>
    </div>
  );
}
