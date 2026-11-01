import "dotenv/config";

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";

import app from "../src/app";
import { stripe } from "../src/config/stripe";
import Product from "../src/models/Product";
import Order, { type IOrder } from "../src/models/Order";

import {
  reserveOrderInventory,
  confirmVerifiedOrderPayment,
} from "../src/services/inventoryService";

// =====================================
// TEMPORARY TEST DATABASE
// =====================================

let replSet: MongoMemoryReplSet | undefined;

const webhookSecret = randomBytes(32).toString("hex");
process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;

before(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  });

  const uri = replSet.getUri();

  if (!/^mongodb:\/\/127\.0\.0\.1:\d+\//.test(uri)) {
    await replSet.stop();
    throw new Error("Local test database required");
  }

  await mongoose.connect(uri, {
    dbName: "stripe_failure_webhook_test",
  });
});

after(async () => {
  await mongoose.disconnect();

  if (replSet) {
    await replSet.stop();
  }
});

// =====================================
// CREATE TEST ORDER
// =====================================

async function createTestOrder() {
  const id = randomUUID().replace(/-/g, "");

  const product = await Product.create({
    name: "Webhook Failure Test Product",
    slug: `failure-${id}`,
    description: "Temporary test product for stock release",
    priceCents: 2000,
    category: "Testing",
    stock: 5,
    isActive: true,
  });

  const order = await Order.create({
    user: new Types.ObjectId(),
    items: [
      {
        product: product._id,
        name: product.name,
        slug: product.slug,
        priceCents: product.priceCents,
        quantity: 2,
      },
    ],
    totalCents: 4000,
    currency: "usd",
    status: "pending",
    stripeSessionId: `cs_test_${id}`,
  });

  return { product, order };
}

// =====================================
// SEND A SIGNED WEBHOOK
// =====================================

type FailureEvent =
  | "checkout.session.expired"
  | "checkout.session.async_payment_failed";

async function sendFailureEvent(
  order: IOrder,
  eventType: FailureEvent,
  validSignature = true,
) {
  const payload = JSON.stringify({
    id: `evt_test_${randomUUID().replace(/-/g, "")}`,
    object: "event",
    type: eventType,
    data: {
      object: {
        id: order.stripeSessionId,
        object: "checkout.session",
        metadata: {
          orderId: order._id.toString(),
        },
        client_reference_id: order._id.toString(),
        mode: "payment",
        amount_total: order.totalCents,
        currency: order.currency,
        payment_status: "unpaid",
        status:
          eventType === "checkout.session.expired" ? "expired" : "complete",
      },
    },
  });

  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: validSignature ? webhookSecret : "incorrect-test-secret",
  });

  return request(app)
    .post("/api/v1/stripe/webhook")
    .set("stripe-signature", signature)
    .set("Content-Type", "application/json")
    .send(payload);
}

// =====================================
// TEST 1: EXPIRED CHECKOUT
// =====================================

test("Expired webhook restores reserved stock", async () => {
  const { product, order } = await createTestOrder();

  await reserveOrderInventory(order._id);

  const response = await sendFailureEvent(order, "checkout.session.expired");

  const savedOrder = await Order.findById(order._id);
  const savedProduct = await Product.findById(product._id);

  assert.equal(response.status, 200);
  assert.equal(savedOrder?.status, "expired");
  assert.equal(savedOrder?.inventoryState, "released");
  assert.equal(savedProduct?.stock, 5);
});

// =====================================
// TEST 2: DELAYED PAYMENT FAILED
// =====================================

test("Failed payment webhook restores reserved stock", async () => {
  const { product, order } = await createTestOrder();

  await reserveOrderInventory(order._id);

  const response = await sendFailureEvent(
    order,
    "checkout.session.async_payment_failed",
  );

  const savedOrder = await Order.findById(order._id);
  const savedProduct = await Product.findById(product._id);

  assert.equal(response.status, 200);
  assert.equal(savedOrder?.status, "failed");
  assert.equal(savedOrder?.inventoryState, "released");
  assert.equal(savedProduct?.stock, 5);
});

// =====================================
// TEST 3: DUPLICATE EXPIRED EVENT
// =====================================

test("Duplicate expiration does not restore stock twice", async () => {
  const { product, order } = await createTestOrder();

  await reserveOrderInventory(order._id);

  const first = await sendFailureEvent(order, "checkout.session.expired");

  const second = await sendFailureEvent(order, "checkout.session.expired");

  const savedProduct = await Product.findById(product._id);
  const savedOrder = await Order.findById(order._id);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(savedProduct?.stock, 5);
  assert.equal(savedOrder?.inventoryState, "released");
});

// =====================================
// TEST 4: HISTORICAL ORDER
// =====================================

test("Historical failure does not add unreserved stock", async () => {
  const { product, order } = await createTestOrder();

  // No reservation: historical order.

  const response = await sendFailureEvent(
    order,
    "checkout.session.async_payment_failed",
  );

  const savedOrder = await Order.findById(order._id);
  const savedProduct = await Product.findById(product._id);

  assert.equal(response.status, 200);
  assert.equal(savedOrder?.status, "failed");
  assert.equal(savedOrder?.inventoryState, undefined);
  assert.equal(savedProduct?.stock, 5);
});

// =====================================
// TEST 5: PAID ORDER REMAINS PAID
// =====================================

test("Late failure event cannot release committed stock", async () => {
  const { product, order } = await createTestOrder();

  await reserveOrderInventory(order._id);

  // Simulate a payment already verified by
  // the trusted backend.
  await confirmVerifiedOrderPayment(order._id);

  const response = await sendFailureEvent(
    order,
    "checkout.session.async_payment_failed",
  );

  const savedOrder = await Order.findById(order._id);
  const savedProduct = await Product.findById(product._id);

  assert.equal(response.status, 200);
  assert.equal(savedOrder?.status, "paid");
  assert.equal(savedOrder?.inventoryState, "committed");
  assert.equal(savedProduct?.stock, 3);
});

// =====================================
// TEST 6: INVALID SIGNATURE
// =====================================

test("Invalid failure webhook cannot release stock", async () => {
  const { product, order } = await createTestOrder();

  await reserveOrderInventory(order._id);

  const response = await sendFailureEvent(
    order,
    "checkout.session.expired",
    false,
  );

  const savedOrder = await Order.findById(order._id);
  const savedProduct = await Product.findById(product._id);

  assert.equal(response.status, 400);
  assert.equal(savedOrder?.status, "pending");
  assert.equal(savedOrder?.inventoryState, "reserved");
  assert.equal(savedProduct?.stock, 3);
});
