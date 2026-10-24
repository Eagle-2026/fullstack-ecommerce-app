import type { Request, Response } from "express";
import type Stripe from "stripe";

import Order from "../models/Order";

import { stripe } from "../config/stripe";
import { asyncHandler } from "../utils/asyncHandler";

export const stripeWebhook = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const signature = req.headers["stripe-signature"];

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (
      typeof signature !== "string" ||
      !webhookSecret ||
      !webhookSecret.startsWith("whsec_") ||
      !Buffer.isBuffer(req.body)
    ) {
      res.status(400).json({
        message: "Invalid webhook request",
      });
      return;
    }

    let event: Stripe.Event;

    // Check that the request really came
    // from Stripe and was not modified.
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        webhookSecret,
      );
    } catch {
      res.status(400).json({
        message: "Invalid Stripe signature",
      });
      return;
    }

    const relevantEvents = [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "checkout.session.expired",
    ];

    if (!relevantEvents.includes(event.type)) {
      res.status(200).json({
        received: true,
      });
      return;
    }

    const session = event.data.object as Stripe.Checkout.Session;

    const orderId = session.metadata?.orderId;

    if (!orderId) {
      throw new Error("Stripe session is missing the order ID");
    }

    // Match the verified Stripe event
    // to the exact order and session.
    const order = await Order.findOne({
      _id: orderId,
      stripeSessionId: session.id,
    });

    if (!order) {
      throw new Error("Stripe Checkout order was not found");
    }

    // Verify our saved amount and currency.
    if (
      session.mode !== "payment" ||
      session.currency !== order.currency ||
      session.amount_total !== order.totalCents
    ) {
      throw new Error("Stripe payment details do not match the order");
    }

    // Handle successful payments.
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      if (session.payment_status === "paid") {
        // Update only pending orders.
        // Repeated webhook events won't mark
        // the same order paid twice.
        await Order.updateOne(
          {
            _id: order._id,
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
    }

    // Handle failed asynchronous payments.
    if (event.type === "checkout.session.async_payment_failed") {
      await Order.updateOne(
        {
          _id: order._id,
          status: "pending",
        },
        {
          $set: {
            status: "failed",
          },
        },
      );
    }

    // Handle expired Checkout Sessions.
    if (event.type === "checkout.session.expired") {
      await Order.updateOne(
        {
          _id: order._id,
          status: "pending",
        },
        {
          $set: {
            status: "expired",
          },
        },
      );
    }

    res.status(200).json({
      received: true,
    });
  },
);
