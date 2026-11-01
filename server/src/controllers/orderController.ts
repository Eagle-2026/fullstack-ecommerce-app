import {
  confirmVerifiedOrderPayment,
  reserveOrderInventory,
  InventoryUnavailableError,
} from "../services/inventoryService";
import type { Request, Response } from "express";
import { Types } from "mongoose";

import Product from "../models/Product";
import Order, { type IOrder } from "../models/Order";

import { stripe } from "../config/stripe";

import { asyncHandler } from "../utils/asyncHandler";

import type { CreateCheckoutInput } from "../validators/orderValidators";

// ===================================
// CHECKOUT IDEMPOTENCY HELPERS
// ===================================

type CheckoutItems = CreateCheckoutInput["items"];

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

function matchesPreviousCart(order: IOrder, items: CheckoutItems): boolean {
  if (order.items.length !== items.length) {
    return false;
  }

  const requested = new Map(items.map((item) => [item.slug, item.quantity]));

  return order.items.every(
    (item) => requested.get(item.slug) === item.quantity,
  );
}

async function respondToExistingCheckout(
  res: Response,
  order: IOrder,
  items: CheckoutItems,
): Promise<void> {
  // The same key must never be used for a different cart.
  if (!matchesPreviousCart(order, items)) {
    res.status(409).json({
      message:
        "This checkout attempt belongs to a different cart. Start a new checkout attempt.",
    });
    return;
  }

  // Never create a second order or reserve stock again.
  if (order.status !== "pending") {
    res.status(409).json({
      message:
        "This checkout attempt is already finished. Start a new checkout attempt if needed.",
    });
    return;
  }

  // A concurrent request may arrive before the first one
  // has finished reserving stock or creating its session.
  if (order.inventoryState !== "reserved" || !order.stripeSessionId) {
    res.status(409).json({
      message:
        "Checkout is being prepared or needs review. Please try again shortly.",
    });
    return;
  }

  // Do not trust a saved URL forever. Ask Stripe for the
  // current session before reusing the checkout.
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
  } catch {
    res.status(503).json({
      message:
        "Unable to verify the existing checkout. Please try again later.",
    });
    return;
  }

  const validSession =
    session.id === order.stripeSessionId &&
    session.client_reference_id === order._id.toString() &&
    session.metadata?.orderId === order._id.toString() &&
    session.mode === "payment" &&
    session.amount_total === order.totalCents &&
    session.currency?.toLowerCase() === order.currency.toLowerCase();

  if (!validSession) {
    // A mismatch is not permission to create a new order.
    res.status(409).json({
      message: "Existing checkout details require review.",
    });
    return;
  }

  if (
    session.status !== "open" ||
    session.payment_status !== "unpaid" ||
    !session.url ||
    (typeof session.expires_at === "number" &&
      session.expires_at <= Math.floor(Date.now() / 1000))
  ) {
    res.status(409).json({
      message:
        "This checkout session is no longer available. Start a new checkout attempt.",
    });
    return;
  }

  res.status(200).json({
    status: "success",
    data: {
      orderId: order._id.toString(),
      checkoutUrl: session.url,
    },
  });
}

// ===================================
// CREATE ORDER AND STRIPE CHECKOUT
// ===================================

export const createCheckout = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.auth?.userId;

    // Step 1: Require authentication.
    if (!userId) {
      res.status(401).json({
        message: "Please log in before checkout",
      });
      return;
    }

    // Step 2: Read checkout items.
    const { items } = req.body as CreateCheckoutInput;

    // Step 3: Validate cart structure and quantities.
    if (
      !Array.isArray(items) ||
      items.length === 0 ||
      items.length > 20 ||
      items.some(
        (item) =>
          !item ||
          typeof item.slug !== "string" ||
          item.slug.length > 120 ||
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug) ||
          !Number.isSafeInteger(item.quantity) ||
          item.quantity < 1 ||
          item.quantity > 20,
      )
    ) {
      res.status(400).json({
        message: "Invalid checkout items",
      });
      return;
    }

    // Step 4: Reject duplicate product entries.
    const slugs = items.map((item) => item.slug);
    if (new Set(slugs).size !== slugs.length) {
      res.status(400).json({
        message: "Duplicate products in checkout",
      });
      return;
    }

    // Step 5: Read the checkout attempt ID from a request header.
    // Optional during migration so existing clients/tests still work.
    // We will require it after the frontend is updated.
    const suppliedAttemptId = req.get("Idempotency-Key");
    const checkoutAttemptId = suppliedAttemptId?.trim().toLowerCase();

    if (
      suppliedAttemptId !== undefined &&
      (!checkoutAttemptId || !UUID_V4.test(checkoutAttemptId))
    ) {
      res.status(400).json({
        message: "Invalid checkout attempt ID",
      });
      return;
    }

    // IMPORTANT: Check for a retry BEFORE checking current stock.
    // The original checkout may have already reserved that stock.
    if (checkoutAttemptId) {
      const previousOrder = await Order.findOne({
        user: userId,
        checkoutAttemptId,
      });

      if (previousOrder) {
        await respondToExistingCheckout(res, previousOrder, items);
        return;
      }
    }

    // Step 6: Read trusted products.
    const products = await Product.find({
      slug: { $in: slugs },
      isActive: true,
    });

    const productMap = new Map(
      products.map((product) => [product.slug, product]),
    );

    const orderItems = [];
    let totalCents = 0;

    // Step 7: Build the order from trusted product data.
    for (const item of items) {
      const product = productMap.get(item.slug);

      if (!product) {
        res.status(400).json({
          message: `Product unavailable: ${item.slug}`,
        });
        return;
      }

      if (product.stock < item.quantity) {
        res.status(400).json({
          message: `Not enough stock for ${product.name}`,
        });
        return;
      }

      if (
        !Number.isSafeInteger(product.priceCents) ||
        product.priceCents <= 0
      ) {
        res.status(400).json({
          message: `Invalid price for ${product.name}`,
        });
        return;
      }

      orderItems.push({
        product: product._id,
        name: product.name,
        slug: product.slug,
        priceCents: product.priceCents,
        quantity: item.quantity,
      });

      totalCents += product.priceCents * item.quantity;
    }

    if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
      res.status(400).json({
        message: "Invalid order total",
      });
      return;
    }

    // Step 8: Create the pending order.
    // The verified MongoDB unique index handles concurrent requests
    // with the same customer and attempt ID.
    let order;
    try {
      order = await Order.create({
        user: userId,
        items: orderItems,
        totalCents,
        currency: "usd",
        status: "pending",
        ...(checkoutAttemptId ? { checkoutAttemptId } : {}),
      });
    } catch (error) {
      if (checkoutAttemptId && isDuplicateKeyError(error)) {
        // Another request may have inserted the same attempt first.
        const previousOrder = await Order.findOne({
          user: userId,
          checkoutAttemptId,
        });

        if (previousOrder) {
          await respondToExistingCheckout(res, previousOrder, items);
          return;
        }
      }
      throw error;
    }

    // Step 9: Reserve inventory atomically.
    try {
      await reserveOrderInventory(order._id);
    } catch (error) {
      if (error instanceof InventoryUnavailableError) {
        await Order.deleteOne({
          _id: order._id,
          status: "pending",
          inventoryState: { $exists: false },
          stripeSessionId: { $exists: false },
        });

        res.status(409).json({
          message:
            "Some products are no longer available in the requested quantity",
        });
        return;
      }

      // Unknown transaction results require investigation.
      throw error;
    }

    // Step 10: Create Stripe Checkout.
    const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
    const expiresAt = Math.floor(Date.now() / 1000) + 45 * 60;

    let stripeSession;
    try {
      stripeSession = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          line_items: orderItems.map((item) => ({
            price_data: {
              currency: "usd",
              unit_amount: item.priceCents,
              product_data: {
                name: item.name,
              },
            },
            quantity: item.quantity,
          })),
          client_reference_id: order._id.toString(),
          metadata: {
            orderId: order._id.toString(),
          },
          expires_at: expiresAt,
          success_url:
            `${clientUrl}/checkout/success` +
            `?orderId=${order._id.toString()}` +
            `&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url:
            `${clientUrl}/checkout/cancel` + `?orderId=${order._id.toString()}`,
        },
        {
          // Separate from the customer's attempt key.
          // This key protects Stripe retries for this order.
          idempotencyKey: `checkout-${order._id.toString()}`,
        },
      );
    } catch {
      // A network error does not prove Stripe failed.
      // Never release stock without verified Stripe information.
      console.error("Stripe checkout creation uncertain", {
        orderId: order._id.toString(),
      });

      res.status(503).json({
        message: "Checkout is temporarily unavailable. Please try again later.",
      });
      return;
    }

    // Step 11: Save Stripe Session ID BEFORE checking its URL.
    order.stripeSessionId = stripeSession.id;
    await order.save();

    if (!stripeSession.url) {
      console.error("Stripe checkout URL missing", {
        orderId: order._id.toString(),
      });
      res.status(502).json({
        message: "Unable to open checkout at this time",
      });
      return;
    }

    res.status(201).json({
      status: "success",
      data: {
        orderId: order._id.toString(),
        checkoutUrl: stripeSession.url,
      },
    });
  },
);

// ===================================
// GET MY ORDERS
// ===================================

export const getMyOrders = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.auth?.userId;

    // Step 1: Require authentication.
    if (!userId) {
      res.status(401).json({
        message: "Authentication required",
      });
      return;
    }

    // Step 2: Return only the current user's orders.
    const orders = await Order.find({
      user: userId,
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .select("items totalCents currency status createdAt paidAt");

    res.status(200).json({
      status: "success",
      data: {
        orders,
      },
    });
  },
);

// ===================================
// GET ONE OF MY ORDERS
// ===================================

export const getMyOrderById = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.auth?.userId;
    const orderId = req.params.orderId;

    // Step 1: Require authentication.
    if (!userId) {
      res.status(401).json({
        message: "Authentication required",
      });
      return;
    }

    // Step 2: Validate order ID.
    if (typeof orderId !== "string" || !Types.ObjectId.isValid(orderId)) {
      res.status(400).json({
        message: "Invalid order ID",
      });
      return;
    }

    // Step 3: Search only orders belonging
    // to the authenticated customer.
    const order = await Order.findOne({
      _id: orderId,
      user: userId,
    }).select("items totalCents currency status createdAt paidAt");

    if (!order) {
      res.status(404).json({
        message: "Order not found",
      });
      return;
    }

    res.status(200).json({
      status: "success",
      data: {
        order,
      },
    });
  },
);

// ===================================
// VERIFY MY ORDER PAYMENT
// ===================================

export const verifyMyOrderPayment = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.auth?.userId;
    const orderId = req.params.orderId;

    // Step 1: Require authentication.
    if (!userId) {
      res.status(401).json({
        message: "Authentication required",
      });
      return;
    }

    // Step 2: Validate the order ID.
    if (typeof orderId !== "string" || !Types.ObjectId.isValid(orderId)) {
      res.status(400).json({
        message: "Invalid order ID",
      });
      return;
    }

    // Step 3: Find only this customer's order.
    const order = await Order.findOne({
      _id: orderId,
      user: userId,
    });

    if (!order) {
      res.status(404).json({
        message: "Order not found",
      });
      return;
    }

    // Step 4: Return an existing final status.
    if (order.status !== "pending") {
      res.status(200).json({
        status: "success",
        data: {
          orderId: order._id.toString(),
          orderStatus: order.status,
        },
      });
      return;
    }

    // Step 5: Check whether checkout was saved.
    if (!order.stripeSessionId) {
      res.status(202).json({
        status: "processing",
        data: {
          orderId: order._id.toString(),
          orderStatus: "pending",
        },
      });
      return;
    }

    // Step 6: Ask Stripe about the payment.
    const session = await stripe.checkout.sessions.retrieve(
      order.stripeSessionId,
    );

    // Step 7: Verify trusted payment details.
    // Never trust payment status from the browser.
    const validSession =
      session.id === order.stripeSessionId &&
      session.client_reference_id === order._id.toString() &&
      session.metadata?.orderId === order._id.toString() &&
      session.mode === "payment" &&
      session.amount_total === order.totalCents &&
      session.currency?.toLowerCase() === order.currency.toLowerCase();

    if (!validSession) {
      console.error("Stripe order verification mismatch", {
        orderId: order._id.toString(),
      });

      res.status(409).json({
        message: "Payment details do not match the order",
      });
      return;
    }

    // Step 8: Confirm verified successful payment.
    if (
      session.status === "complete" &&
      session.payment_status === "paid" &&
      Boolean(session.payment_intent)
    ) {
      // Uses the same confirmation service
      // as the Stripe webhook.
      //
      // Reserved stock becomes committed.
      // Historical orders remain supported.
      // Repeated confirmation does not deduct twice.
      await confirmVerifiedOrderPayment(order._id);

      res.status(200).json({
        status: "success",
        data: {
          orderId: order._id.toString(),
          orderStatus: "paid",
        },
      });
      return;
    }

    // Step 9: Payment is not confirmed yet.
    res.status(202).json({
      status: "processing",
      data: {
        orderId: order._id.toString(),
        orderStatus: "pending",
      },
    });
  },
);
