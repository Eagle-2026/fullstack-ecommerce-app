import type { Request, Response } from "express";
import type Stripe from "stripe";
import mongoose from "mongoose";

import Order from "../models/Order";
import { stripe } from "../config/stripe";

export const stripeWebhook = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const signature = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // Step 1: Validate the required webhook information.
  if (
    typeof signature !== "string" ||
    !webhookSecret ||
    !Buffer.isBuffer(req.body)
  ) {
    res.status(400).json({
      message: "Invalid webhook request",
    });
    return;
  }

  let event: Stripe.Event;

  // Step 2: Verify the Stripe signature.
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch {
    res.status(400).json({
      message: "Invalid webhook signature",
    });
    return;
  }

  try {
    const supportedEvents = [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "checkout.session.expired",
    ];

    // Step 3: Ignore unrelated Stripe events.
    if (!supportedEvents.includes(event.type)) {
      res.status(200).json({ received: true });
      return;
    }

    const session = event.data.object as Stripe.Checkout.Session;

    const orderId = session.metadata?.orderId;

    // Ignore Checkout Sessions not linked to our orders.
    if (!orderId || !mongoose.isValidObjectId(orderId)) {
      res.status(200).json({
        received: true,
        ignored: true,
      });
      return;
    }

    // Step 4: Find the exact order and Stripe Session.
    const order = await Order.findOne({
      _id: orderId,
      stripeSessionId: session.id,
    });

    if (!order) {
      throw new Error("Order not found for Stripe Checkout Session");
    }

    // Step 5: Verify all important payment details.
    const validCheckout =
      session.client_reference_id === order._id.toString() &&
      session.mode === "payment" &&
      session.amount_total === order.totalCents &&
      session.currency?.toLowerCase() === order.currency.toLowerCase();

    if (!validCheckout) {
      throw new Error("Stripe payment details do not match the order");
    }

    // Step 6: Handle successful payments.
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      if (session.payment_status === "paid" && session.status === "complete") {
        await Order.updateOne(
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
      }

      // For delayed payments, wait for actual success.
    }

    // Step 7: Handle failed asynchronous payments.
    if (event.type === "checkout.session.async_payment_failed") {
      await Order.updateOne(
        {
          _id: order._id,
          stripeSessionId: session.id,
          status: "pending",
        },
        {
          $set: {
            status: "failed",
          },
        },
      );
    }

    // Step 8: Handle expired Checkout Sessions.
    if (event.type === "checkout.session.expired") {
      await Order.updateOne(
        {
          _id: order._id,
          stripeSessionId: session.id,
          status: "pending",
        },
        {
          $set: {
            status: "expired",
          },
        },
      );
    }

    // Step 9: Tell Stripe the event was handled.
    res.status(200).json({
      received: true,
    });
  } catch (error) {
    console.error("Stripe webhook processing failed:", error);

    // A server error allows Stripe to retry delivery.
    res.status(500).json({
      message: "Webhook processing failed",
    });
  }
};
