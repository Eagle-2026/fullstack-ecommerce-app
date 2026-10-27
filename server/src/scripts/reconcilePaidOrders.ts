import "dotenv/config";

import mongoose from "mongoose";

import { connectDB } from "../config/db";
import { stripe } from "../config/stripe";
import Order from "../models/Order";

// Get the order ID from the terminal command.
const orderId = process.argv[2];

// Only update MongoDB when --apply is provided.
const shouldApply = process.argv.includes("--apply");

const reconcileOrder = async (): Promise<void> => {
  // This script is only for our test environment.
  if (process.env.NODE_ENV === "production") {
    throw new Error("Do not run this script in production");
  }

  // Make sure we're using a Stripe test key.
  if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
    throw new Error("A Stripe test secret key is required");
  }

  // Check that the order ID is valid.
  if (!orderId || !mongoose.isValidObjectId(orderId)) {
    throw new Error("Provide a valid MongoDB order ID");
  }

  try {
    // Step 1: Connect to MongoDB.
    await connectDB();

    // Step 2: Find the existing order.
    const order = await Order.findById(orderId);

    if (!order) {
      console.log("Order not found");
      return;
    }

    console.log("Current order status:", order.status);

    // Do not update an order already paid.
    if (order.status === "paid") {
      console.log("Order is already paid");
      return;
    }

    if (order.status !== "pending") {
      console.log("Order is not pending");
      return;
    }

    // Make sure the order has a Stripe Checkout Session.
    if (
      !order.stripeSessionId ||
      !order.stripeSessionId.startsWith("cs_test_")
    ) {
      console.log("Valid test Checkout Session not found");
      return;
    }

    // Step 3: Ask Stripe about the real payment.
    const session = await stripe.checkout.sessions.retrieve(
      order.stripeSessionId,
    );

    // Step 4: Verify payment details.
    const validPayment =
      session.id === order.stripeSessionId &&
      session.client_reference_id === order._id.toString() &&
      session.metadata?.orderId === order._id.toString() &&
      session.mode === "payment" &&
      session.status === "complete" &&
      session.payment_status === "paid" &&
      session.livemode === false &&
      session.amount_total === order.totalCents &&
      session.currency?.toLowerCase() === order.currency.toLowerCase() &&
      Boolean(session.payment_intent);

    if (!validPayment) {
      console.log("Payment verification failed");
      console.log("Order was NOT updated");
      return;
    }

    console.log("Payment verified successfully");
    console.log("Amount:", session.amount_total);
    console.log("Currency:", session.currency);

    // Preview mode: do not modify MongoDB yet.
    if (!shouldApply) {
      console.log("PREVIEW ONLY: No changes were made");
      console.log("Run again with --apply to update the order");
      return;
    }

    // Step 5: Update only this verified pending order.
    const result = await Order.updateOne(
      {
        _id: order._id,
        stripeSessionId: session.id,
        status: "pending",
      },
      {
        $set: {
          status: "paid",
          paidAt: new Date(),
        },
      },
    );

    if (result.modifiedCount === 1) {
      console.log("SUCCESS: Order marked as PAID");
    } else {
      console.log("No update was necessary");
    }
  } finally {
    await mongoose.disconnect();
  }
};

reconcileOrder().catch((error: unknown) => {
  console.error("Reconciliation failed:", error);
  process.exitCode = 1;
});
