
import { Types } from "mongoose";

import Order from "../models/Order";
import { stripe } from "../config/stripe";

import {
  confirmVerifiedOrderPayment,
  finalizeVerifiedUnpaidOrder,
} from "./inventoryService";

// =====================================
// RECOVERY RESULTS
// =====================================

export type CheckoutRecoveryResult =
  | "paid"
  | "expired"
  | "waiting"
  | "manual_review"
  | "already_final";

export class CheckoutRecoveryMismatchError extends Error {
  constructor() {
    super("Stripe Checkout Session does not match the order");
    this.name = "CheckoutRecoveryMismatchError";
  }
}

// =====================================
// RECOVER ONE PENDING CHECKOUT
// =====================================

// This function checks Stripe directly.
//
// It does not trust payment information
// supplied by the browser.
//
// Missing Stripe Session IDs require review.
// Never release stock simply because
// a request timed out.

export const reconcilePendingCheckout = async (
  orderId: Types.ObjectId,
): Promise<CheckoutRecoveryResult> => {
  // Step 1: Find the order.
  const order = await Order.findById(orderId);

  if (!order) {
    throw new Error("Order not found for reconciliation");
  }

  // Step 2: Do not change a finalized order.
  if (order.status !== "pending") {
    return "already_final";
  }

  // Step 3: A missing Session ID is uncertain.
  //
  // Stripe may have created the Session,
  // even if our server never received the ID.
  //
  // Never return stock automatically here.
  if (!order.stripeSessionId) {
    return "manual_review";
  }

  // Step 4: Retrieve the saved Session from Stripe.
  const stripeSession =
    await stripe.checkout.sessions.retrieve(
      order.stripeSessionId,
    );

  // Step 5: Check that Stripe's information
  // matches our trusted MongoDB order.
  const validSession =
    stripeSession.id === order.stripeSessionId &&
    stripeSession.client_reference_id ===
      order._id.toString() &&
    stripeSession.metadata?.orderId ===
      order._id.toString() &&
    stripeSession.mode === "payment" &&
    stripeSession.amount_total === order.totalCents &&
    stripeSession.currency?.toLowerCase() ===
      order.currency.toLowerCase();

  if (!validSession) {
    throw new CheckoutRecoveryMismatchError();
  }

  // Step 6: Stripe confirms the payment.
  //
  // The shared service safely commits
  // already-reserved inventory.
  if (
    stripeSession.status === "complete" &&
    stripeSession.payment_status === "paid"
  ) {
    await confirmVerifiedOrderPayment(order._id);
    return "paid";
  }

  // Step 7: Stripe confirms checkout expiration.
  //
  // Reserved stock is returned exactly once.
  if (
    stripeSession.status === "expired" &&
    stripeSession.payment_status === "unpaid"
  ) {
    await finalizeVerifiedUnpaidOrder(
      order._id,
      "expired",
    );

    return "expired";
  }

  // Step 8: The Session is still open,
  // or a completed checkout is awaiting
  // asynchronous payment confirmation.
  //
  // Do not release stock yet.
  if (
    stripeSession.payment_status === "unpaid" &&
    (
      stripeSession.status === "open" ||
      stripeSession.status === "complete"
    )
  ) {
    return "waiting";
  }

  // Step 9: Unrecognized combinations need
  // investigation rather than guessing.
  return "manual_review";
};
