import type { Request, Response } from "express";
import { Types } from "mongoose";

import Product from "../models/Product";
import Order from "../models/Order";

import { stripe } from "../config/stripe";

import { asyncHandler } from "../utils/asyncHandler";

import type { CreateCheckoutInput } from "../validators/orderValidators";

// ===================================
// CREATE ORDER AND STRIPE CHECKOUT
// ===================================

export const createCheckout = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.auth?.userId;

    if (!userId) {
      res.status(401).json({
        message: "Please log in before checkout",
      });
      return;
    }

    const { items } = req.body as CreateCheckoutInput;

    // Read trusted products from MongoDB.
    const slugs = items.map((item) => item.slug);

    const products = await Product.find({
      slug: { $in: slugs },
      isActive: true,
    });

    const productMap = new Map(
      products.map((product) => [product.slug, product]),
    );

    const orderItems = [];
    let totalCents = 0;

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

    // Create an order using trusted data.
    const order = await Order.create({
      user: userId,
      items: orderItems,
      totalCents,
      currency: "usd",
      status: "pending",
    });

    const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";

    // Create a hosted Stripe Checkout Session.
    const session = await stripe.checkout.sessions.create(
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

        success_url:
          `${clientUrl}/checkout/success` +
          `?orderId=${order._id.toString()}` +
          `&session_id={CHECKOUT_SESSION_ID}`,

        cancel_url:
          `${clientUrl}/checkout/cancel` + `?orderId=${order._id.toString()}`,
      },
      {
        idempotencyKey: `checkout-${order._id.toString()}`,
      },
    );

    if (!session.url) {
      throw new Error("Stripe did not return a Checkout URL");
    }

    // Save the connection between Stripe
    // and our MongoDB order.
    order.stripeSessionId = session.id;

    await order.save();

    res.status(201).json({
      status: "success",
      data: {
        orderId: order._id.toString(),
        checkoutUrl: session.url,
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

    if (!userId) {
      res.status(401).json({
        message: "Authentication required",
      });
      return;
    }

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

    if (!userId) {
      res.status(401).json({
        message: "Authentication required",
      });
      return;
    }

    if (typeof orderId !== "string" || !Types.ObjectId.isValid(orderId)) {
      res.status(400).json({
        message: "Invalid order ID",
      });
      return;
    }

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
