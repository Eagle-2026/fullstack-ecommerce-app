import type { Request, Response } from "express";
import type Stripe from "stripe";
import mongoose from "mongoose";

import Order from "../models/Order";
import {
  confirmVerifiedOrderPayment,
  finalizeVerifiedUnpaidOrder,
} from "../services/inventoryService";
import { stripe } from "../config/stripe";
import { logger } from "../utils/logger";

// =====================================
// STRIPE WEBHOOK CONTROLLER
// =====================================

export const stripeWebhook = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const signature = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // =====================================
  // STEP 1: CHECK REQUIRED INFORMATION
  // =====================================

  if (
    typeof signature !== "string" ||
    !webhookSecret ||
    !Buffer.isBuffer(req.body)
  ) {
    logger.warn(
      {
        event: "stripe.webhook_rejected",
        reason: "invalid_webhook_request",
      },
      "Stripe webhook rejected",
    );

    res.status(400).json({
      message: "Invalid webhook request",
    });
    return;
  }

  let event: Stripe.Event;

  // =====================================
  // STEP 2: VERIFY STRIPE SIGNATURE
  // =====================================

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch {
    // Never log the signature or raw body.
    logger.warn(
      {
        event: "stripe.signature_invalid",
      },
      "Invalid Stripe webhook signature",
    );

    res.status(400).json({
      message: "Invalid webhook signature",
    });
    return;
  }

  // =====================================
  // STEP 3: PROCESS VERIFIED EVENT
  // =====================================

  try {
    const supportedEvents = [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "checkout.session.expired",
    ];

    if (!supportedEvents.includes(event.type)) {
      logger.info(
        {
          event: "stripe.webhook_ignored",
          stripeEventId: event.id,
          eventType: event.type,
        },
        "Unrelated Stripe event ignored",
      );

      res.status(200).json({
        received: true,
      });
      return;
    }

    const session = event.data.object as Stripe.Checkout.Session;

    const orderId = session.metadata?.orderId;

    // =====================================
    // STEP 4: VALIDATE ORDER IDENTIFIER
    // =====================================

    if (!orderId || !mongoose.isValidObjectId(orderId)) {
      logger.info(
        {
          event: "stripe.order_reference_missing",
          stripeEventId: event.id,
          eventType: event.type,
        },
        "Checkout event has no valid order reference",
      );

      res.status(200).json({
        received: true,
        ignored: true,
      });
      return;
    }

    // =====================================
    // STEP 5: FIND MATCHING ORDER
    // =====================================

    const order = await Order.findOne({
      _id: orderId,
      stripeSessionId: session.id,
    });

    if (!order) {
      throw new Error("Order not found for Stripe Checkout Session");
    }

    // =====================================
    // STEP 6: VERIFY PAYMENT DETAILS
    // =====================================

    const validCheckout =
      session.client_reference_id === order._id.toString() &&
      session.mode === "payment" &&
      session.amount_total === order.totalCents &&
      session.currency?.toLowerCase() === order.currency.toLowerCase();

    if (!validCheckout) {
      logger.error(
        {
          event: "stripe.payment_mismatch",
          stripeEventId: event.id,
          orderId: order._id.toString(),
        },
        "Stripe payment verification mismatch",
      );

      throw new Error("Stripe payment details do not match the order");
    }

    // =====================================
    // STEP 7: HANDLE SUCCESSFUL PAYMENT
    // =====================================

    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      if (session.payment_status === "paid" && session.status === "complete") {
        // The Stripe signature and order details
        // were verified above.
        //
        // Use the shared payment confirmation logic.
        // Reserved inventory becomes committed.
        // Historical unreserved orders still work.
        //
        // Repeated events do not confirm twice.
        const newlyConfirmed = await confirmVerifiedOrderPayment(order._id);

        logger.info(
          {
            event: "stripe.payment_confirmed",
            stripeEventId: event.id,
            orderId: order._id.toString(),
            orderUpdated: newlyConfirmed,
          },
          "Stripe payment confirmed",
        );
      } else {
        // Some payment methods finish later.
        logger.info(
          {
            event: "stripe.payment_pending",
            stripeEventId: event.id,
            orderId: order._id.toString(),
          },
          "Waiting for payment confirmation",
        );
      }
    }

    // =====================================
    // STEP 8: ASYNCHRONOUS PAYMENT FAILED
    // =====================================

    if (event.type === "checkout.session.async_payment_failed") {
      if (session.payment_status !== "paid") {
        const changed = await finalizeVerifiedUnpaidOrder(order._id, "failed");

        logger.info(
          {
            event: "stripe.payment_failed",
            stripeEventId: event.id,
            orderId: order._id.toString(),
            orderUpdated: changed,
          },
          "Stripe asynchronous payment failed",
        );
      }
    }

    // =====================================
    // STEP 9: CHECKOUT SESSION EXPIRED
    // =====================================

    if (event.type === "checkout.session.expired") {
      if (session.status === "expired" && session.payment_status !== "paid") {
        const changed = await finalizeVerifiedUnpaidOrder(order._id, "expired");

        logger.info(
          {
            event: "stripe.checkout_expired",
            stripeEventId: event.id,
            orderId: order._id.toString(),
            orderUpdated: changed,
          },
          "Stripe checkout expired",
        );
      }
    }

    // =====================================
    // STEP 10: ACKNOWLEDGE EVENT
    // =====================================

    res.status(200).json({
      received: true,
    });
  } catch (error) {
    // Log safe metadata only.
    // Do not log the entire Stripe event,
    // raw request body, or error object.
    logger.error(
      {
        event: "stripe.webhook_processing_failed",
        stripeEventId: event.id,
        eventType: event.type,
        errorType: error instanceof Error ? error.name : "UnknownError",
      },
      "Stripe webhook processing failed",
    );

    // HTTP 500 allows Stripe to retry.
    res.status(500).json({
      message: "Webhook processing failed",
    });
  }
};
