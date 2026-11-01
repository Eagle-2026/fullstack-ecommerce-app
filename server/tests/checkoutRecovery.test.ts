import "dotenv/config";

import test, { before, after } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import type Stripe from "stripe";

import Product from "../src/models/Product";
import Order, { type IOrder } from "../src/models/Order";
import { stripe } from "../src/config/stripe";

import { reserveOrderInventory } from "../src/services/inventoryService";

import {
  reconcilePendingCheckout,
  CheckoutRecoveryMismatchError,
} from "../src/services/checkoutRecoveryService";

// =====================================
// TEMPORARY TEST DATABASE
// =====================================

let replSet: MongoMemoryReplSet | undefined;

before(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  });

  const uri = replSet.getUri();

  if (!/^mongodb:\/\/127\.0\.0\.1:\d+\//.test(uri)) {
    await replSet.stop();
    throw new Error("Local MongoDB required");
  }

  await mongoose.connect(uri, {
    dbName: "checkout_recovery_test",
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

async function makeTestOrder() {
  const id = randomUUID().replace(/-/g, "");

  const product = await Product.create({
    name: "Checkout Recovery Product",
    slug: `recovery-${id}`,
    description: "Temporary product for recovery testing",
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

  await reserveOrderInventory(order._id);

  return { product, order };
}

// =====================================
// MOCK STRIPE SESSION RETRIEVAL
// =====================================

function mockStripeSession(
  t: TestContext,
  order: IOrder,
  overrides: Partial<Stripe.Checkout.Session> = {},
) {
  t.mock.method(
    stripe.checkout.sessions,
    "retrieve",
    async (sessionId: string) => {
      assert.equal(sessionId, order.stripeSessionId);

      return {
        id: order.stripeSessionId,
        object: "checkout.session",
        client_reference_id: order._id.toString(),
        metadata: {
          orderId: order._id.toString(),
        },
        mode: "payment",
        amount_total: order.totalCents,
        currency: order.currency,
        status: "complete",
        payment_status: "paid",
        payment_intent: "pi_test_recovered",
        ...overrides,
      } as unknown as Stripe.Response<Stripe.Checkout.Session>;
    },
  );
}

// =====================================
// TEST 1: RECOVER MISSED PAID WEBHOOK
// =====================================

test("Missed paid webhook can be reconciled", async (t) => {
  const { product, order } = await makeTestOrder();

  mockStripeSession(t, order);

  const result = await reconcilePendingCheckout(order._id);

  const savedOrder = await Order.findById(order._id);
  const savedProduct = await Product.findById(product._id);

  assert.equal(result, "paid");
  assert.equal(savedOrder?.status, "paid");
  assert.equal(savedOrder?.inventoryState, "committed");
  assert.equal(savedProduct?.stock, 3);
});

// =====================================
// TEST 2: RECOVER MISSED EXPIRATION
// =====================================

test("Missed expiration webhook restores stock", async (t) => {
  const { product, order } = await makeTestOrder();

  mockStripeSession(t, order, {
    status: "expired",
    payment_status: "unpaid",
    payment_intent: null,
  });

  const result = await reconcilePendingCheckout(order._id);

  const savedOrder = await Order.findById(order._id);
  const savedProduct = await Product.findById(product._id);

  assert.equal(result, "expired");
  assert.equal(savedOrder?.status, "expired");
  assert.equal(savedOrder?.inventoryState, "released");
  assert.equal(savedProduct?.stock, 5);
});

// =====================================
// TEST 3: OPEN SESSION
// =====================================

test("Open Checkout Session keeps stock reserved", async (t) => {
  const { product, order } = await makeTestOrder();

  mockStripeSession(t, order, {
    status: "open",
    payment_status: "unpaid",
    payment_intent: null,
  });

  const result = await reconcilePendingCheckout(order._id);

  const savedOrder = await Order.findById(order._id);
  const savedProduct = await Product.findById(product._id);

  assert.equal(result, "waiting");
  assert.equal(savedOrder?.status, "pending");
  assert.equal(savedOrder?.inventoryState, "reserved");
  assert.equal(savedProduct?.stock, 3);
});

// =====================================
// TEST 4: DELAYED PAYMENT
// =====================================

test("Completed but unpaid Checkout stays reserved", async (t) => {
  const { product, order } = await makeTestOrder();

  mockStripeSession(t, order, {
    status: "complete",
    payment_status: "unpaid",
    payment_intent: "pi_test_processing",
  });

  const result = await reconcilePendingCheckout(order._id);

  const savedOrder = await Order.findById(order._id);
  const savedProduct = await Product.findById(product._id);

  assert.equal(result, "waiting");
  assert.equal(savedOrder?.status, "pending");
  assert.equal(savedOrder?.inventoryState, "reserved");
  assert.equal(savedProduct?.stock, 3);
});

// =====================================
// TEST 5: MISSING SESSION ID
// =====================================

test("Missing Stripe Session ID requires manual review", async (t) => {
  const { product, order } = await makeTestOrder();

  await Order.updateOne(
    { _id: order._id },
    { $unset: { stripeSessionId: "" } },
  );

  // Stripe must not be contacted without
  // a known Session ID.
  t.mock.method(stripe.checkout.sessions, "retrieve", async () => {
    throw new Error("Stripe must not be called");
  });

  const result = await reconcilePendingCheckout(order._id);

  const savedOrder = await Order.findById(order._id);
  const savedProduct = await Product.findById(product._id);

  assert.equal(result, "manual_review");
  assert.equal(savedOrder?.status, "pending");
  assert.equal(savedOrder?.inventoryState, "reserved");
  assert.equal(savedProduct?.stock, 3);
});

// =====================================
// TEST 6: WRONG STRIPE DATA
// =====================================

test("Mismatched Stripe data cannot change inventory", async (t) => {
  const { product, order } = await makeTestOrder();

  mockStripeSession(t, order, {
    amount_total: 100,
  });

  await assert.rejects(
    reconcilePendingCheckout(order._id),
    CheckoutRecoveryMismatchError,
  );

  const savedOrder = await Order.findById(order._id);
  const savedProduct = await Product.findById(product._id);

  assert.equal(savedOrder?.status, "pending");
  assert.equal(savedOrder?.inventoryState, "reserved");
  assert.equal(savedProduct?.stock, 3);
});

// =====================================
// TEST 7: STRIPE UNAVAILABLE
// =====================================

test("Stripe retrieval failure does not release stock", async (t) => {
  const { product, order } = await makeTestOrder();

  t.mock.method(stripe.checkout.sessions, "retrieve", async () => {
    throw new Error("Simulated Stripe unavailable");
  });

  await assert.rejects(
    reconcilePendingCheckout(order._id),
    /Simulated Stripe unavailable/,
  );

  const savedOrder = await Order.findById(order._id);
  const savedProduct = await Product.findById(product._id);

  assert.equal(savedOrder?.status, "pending");
  assert.equal(savedOrder?.inventoryState, "reserved");
  assert.equal(savedProduct?.stock, 3);
});
