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

import { reserveOrderInventory } from "../src/services/inventoryService";

// =====================================
// ISOLATED TEST DATABASE
// =====================================

let replSet: MongoMemoryReplSet | undefined;

const webhookSecret = randomBytes(32).toString("hex");

// Test-only secret, in this test process.
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
    dbName: "stripe_webhook_integration_test",
  });
});

after(async () => {
  await mongoose.disconnect();

  if (replSet) {
    await replSet.stop();
  }
});

// =====================================
// CREATE TEMPORARY PRODUCT AND ORDER
// =====================================

async function createTestOrder() {
  const slug = `webhook-${randomUUID().replace(/-/g, "")}`;

  const product = await Product.create({
    name: "Webhook Test Product",
    slug,
    description: "Temporary product for webhook tests",
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
    stripeSessionId: `cs_test_${randomUUID().replace(/-/g, "")}`,
  });

  return { product, order };
}

// =====================================
// SIMULATE SIGNED STRIPE WEBHOOK
// =====================================

async function sendPaidWebhook(order: IOrder, validSignature = true) {
  const payload = JSON.stringify({
    id: `evt_test_${randomUUID().replace(/-/g, "")}`,
    object: "event",
    type: "checkout.session.completed",
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
        payment_status: "paid",
        status: "complete",
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
// TEST 1: RESERVED STOCK IS COMMITTED
// =====================================

test("Verified webhook commits reserved inventory", async () => {
  const { product, order } = await createTestOrder();

  await reserveOrderInventory(order._id);

  const response = await sendPaidWebhook(order);

  assert.equal(response.status, 200);

  const savedOrder = await Order.findById(order._id);
  const savedProduct = await Product.findById(product._id);

  assert.equal(savedOrder?.status, "paid");
  assert.equal(savedOrder?.inventoryState, "committed");

  assert.equal(savedProduct?.stock, 3);
});

// =====================================
// TEST 2: HISTORICAL ORDER STILL WORKS
// =====================================

test("Verified webhook supports historical order", async () => {
  const { product, order } = await createTestOrder();

  // Do not reserve inventory.
  // This represents an older order.

  const response = await sendPaidWebhook(order);

  assert.equal(response.status, 200);

  const savedOrder = await Order.findById(order._id);
  const savedProduct = await Product.findById(product._id);

  assert.equal(savedOrder?.status, "paid");
  assert.equal(savedOrder?.inventoryState, undefined);

  // No inventory was reserved for this order.
  assert.equal(savedProduct?.stock, 5);
});

// =====================================
// TEST 3: REPEATED WEBHOOK
// =====================================

test("Repeated paid webhook does not deduct twice", async () => {
  const { product, order } = await createTestOrder();

  await reserveOrderInventory(order._id);

  const first = await sendPaidWebhook(order);

  const paidOrder = await Order.findById(order._id);
  const originalPaidAt = paidOrder?.paidAt?.getTime();

  const second = await sendPaidWebhook(order);

  const savedOrder = await Order.findById(order._id);
  const savedProduct = await Product.findById(product._id);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);

  assert.equal(savedOrder?.status, "paid");
  assert.equal(savedOrder?.paidAt?.getTime(), originalPaidAt);
  assert.equal(savedProduct?.stock, 3);
});

// =====================================
// TEST 4: INVALID SIGNATURE
// =====================================

test("Invalid Stripe signature cannot confirm payment", async () => {
  const { product, order } = await createTestOrder();

  await reserveOrderInventory(order._id);

  const response = await sendPaidWebhook(order, false);

  assert.equal(response.status, 400);

  const savedOrder = await Order.findById(order._id);
  const savedProduct = await Product.findById(product._id);

  assert.equal(savedOrder?.status, "pending");
  assert.equal(savedOrder?.inventoryState, "reserved");

  assert.equal(savedProduct?.stock, 3);
});
