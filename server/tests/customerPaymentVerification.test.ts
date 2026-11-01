import "dotenv/config";

import test, { before, after } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import type Stripe from "stripe";

import app from "../src/app";
import { stripe } from "../src/config/stripe";

import User from "../src/models/User";
import Product from "../src/models/Product";
import Order, { type IOrder } from "../src/models/Order";

import { ACCESS_COOKIE } from "../src/utils/authTokens";

import {
  reserveOrderInventory,
  releaseOrderInventory,
} from "../src/services/inventoryService";

// =====================================
// ISOLATED TEST CONFIGURATION
// =====================================

let replSet: MongoMemoryReplSet | undefined;
let ownerId: Types.ObjectId;
let accessCookie: string;

// Test-only JWT secret.
// Never print or save this value.
process.env.JWT_SECRET = randomBytes(48).toString("hex");

const trustedOrigin = new URL(process.env.CLIENT_URL || "http://localhost:3000")
  .origin;

// =====================================
// START TEMPORARY MONGODB
// =====================================

before(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  });

  const uri = replSet.getUri();

  // Protect against accidental Atlas connections.
  if (!/^mongodb:\/\/127\.0\.0\.1:\d+\//.test(uri)) {
    await replSet.stop();

    throw new Error("Local test database required");
  }

  process.env.MONGODB_URI = uri;

  await mongoose.connect(uri, {
    dbName: "customer_payment_verification_test",
  });

  // Create a temporary test customer.
  const user = await User.create({
    name: "Payment Test Customer",
    email: `payment-${randomUUID()}@example.com`,
    password: "TestPassword123!",
  });

  ownerId = user._id;

  // Log in through the real Express API.
  const loginResponse = await request(app)
    .post("/api/v1/auth/login")
    .set("Origin", trustedOrigin)
    .send({
      email: user.email,
      password: "TestPassword123!",
    });

  assert.equal(loginResponse.status, 200);

  const cookies = loginResponse.headers["set-cookie"];

  assert.ok(Array.isArray(cookies));

  const access = cookies.find((value: string) =>
    value.startsWith(`${ACCESS_COOKIE}=`),
  );

  assert.ok(access);

  accessCookie = access.split(";")[0];
});

// =====================================
// STOP TEMPORARY MONGODB
// =====================================

after(async () => {
  await mongoose.disconnect();

  if (replSet) {
    await replSet.stop();
  }
});

// =====================================
// CREATE TEST PRODUCT AND ORDER
// =====================================

async function createTestOrder(userId?: Types.ObjectId) {
  const uniqueId = randomUUID().replace(/-/g, "");

  const product = await Product.create({
    name: "Payment Verification Product",
    slug: `payment-${uniqueId}`,
    description: "Temporary product for payment testing",
    priceCents: 2000,
    category: "Testing",
    stock: 5,
    isActive: true,
  });

  const order = await Order.create({
    user: userId ?? ownerId,

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

    stripeSessionId: `cs_test_${uniqueId}`,
  });

  return { product, order };
}

// =====================================
// CREATE A MOCK STRIPE RESPONSE
// =====================================

// This simulates the values returned by Stripe.
// No external Stripe request is made.

function makeStripeSession(
  order: IOrder,
  overrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Response<Stripe.Checkout.Session> {
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
    payment_intent: "pi_test_verified",

    ...overrides,
  } as unknown as Stripe.Response<Stripe.Checkout.Session>;
}

// =====================================
// MOCK STRIPE RETRIEVAL FOR ONE TEST
// =====================================

function mockStripeRetrieve(
  t: TestContext,
  order: IOrder,
  overrides: Partial<Stripe.Checkout.Session> = {},
) {
  return t.mock.method(
    stripe.checkout.sessions,
    "retrieve",
    async (sessionId: string) => {
      assert.equal(sessionId, order.stripeSessionId);

      return makeStripeSession(order, overrides);
    },
  );
}

// =====================================
// CALL THE REAL API ENDPOINT
// =====================================

function verifyPayment(orderId: string) {
  return request(app)
    .post(`/api/v1/orders/${orderId}/verify-payment`)
    .set("Origin", trustedOrigin)
    .set("Cookie", accessCookie);
}

// =====================================
// TEST 1: SUCCESSFUL PAYMENT
// =====================================

test("Customer verification commits reserved inventory", async (t) => {
  const { product, order } = await createTestOrder();

  await reserveOrderInventory(order._id);

  mockStripeRetrieve(t, order);

  const response = await verifyPayment(order._id.toString());

  assert.equal(response.status, 200);
  assert.equal(response.body.data.orderStatus, "paid");

  const savedOrder = await Order.findById(order._id);
  const savedProduct = await Product.findById(product._id);

  assert.equal(savedOrder?.status, "paid");
  assert.equal(savedOrder?.inventoryState, "committed");
  assert.ok(savedOrder?.paidAt);

  // Stock was already deducted during reservation.
  assert.equal(savedProduct?.stock, 3);
});

// =====================================
// TEST 2: REPEATED VERIFICATION
// =====================================

test("Repeated verification cannot deduct stock twice", async (t) => {
  const { product, order } = await createTestOrder();

  await reserveOrderInventory(order._id);

  mockStripeRetrieve(t, order);

  const first = await verifyPayment(order._id.toString());

  const firstSavedOrder = await Order.findById(order._id);

  const originalPaidAt = firstSavedOrder?.paidAt?.getTime();

  const second = await verifyPayment(order._id.toString());

  const savedOrder = await Order.findById(order._id);

  const savedProduct = await Product.findById(product._id);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);

  assert.equal(savedOrder?.status, "paid");
  assert.equal(savedOrder?.paidAt?.getTime(), originalPaidAt);

  assert.equal(savedProduct?.stock, 3);
});

// =====================================
// TEST 3: ORDER OWNERSHIP
// =====================================

test("Customer cannot verify another customer's order", async (t) => {
  // Create an order belonging to someone else.
  const otherCustomerId = new Types.ObjectId();

  const { product, order } = await createTestOrder(otherCustomerId);

  await reserveOrderInventory(order._id);

  // Stripe must never be called for another
  // customer's order.
  t.mock.method(stripe.checkout.sessions, "retrieve", async () => {
    throw new Error("Stripe must not be called");
  });

  const response = await verifyPayment(order._id.toString());

  assert.equal(response.status, 404);

  const savedOrder = await Order.findById(order._id);

  const savedProduct = await Product.findById(product._id);

  assert.equal(savedOrder?.status, "pending");
  assert.equal(savedOrder?.inventoryState, "reserved");
  assert.equal(savedProduct?.stock, 3);
});

// =====================================
// TEST 4: PAYMENT AMOUNT MISMATCH
// =====================================

test("Incorrect Stripe payment amount is rejected", async (t) => {
  const { product, order } = await createTestOrder();

  await reserveOrderInventory(order._id);

  // Order total: 4000 cents.
  // Mock Stripe total: 100 cents.
  mockStripeRetrieve(t, order, {
    amount_total: 100,
  });

  const response = await verifyPayment(order._id.toString());

  assert.equal(response.status, 409);

  const savedOrder = await Order.findById(order._id);

  const savedProduct = await Product.findById(product._id);

  assert.equal(savedOrder?.status, "pending");
  assert.equal(savedOrder?.inventoryState, "reserved");
  assert.equal(savedProduct?.stock, 3);
});

// =====================================
// TEST 5: PAYMENT STILL PENDING
// =====================================

test("Unpaid Stripe Checkout remains pending", async (t) => {
  const { product, order } = await createTestOrder();

  await reserveOrderInventory(order._id);

  mockStripeRetrieve(t, order, {
    status: "open",
    payment_status: "unpaid",
    payment_intent: null,
  });

  const response = await verifyPayment(order._id.toString());

  assert.equal(response.status, 202);
  assert.equal(response.body.data.orderStatus, "pending");

  const savedOrder = await Order.findById(order._id);

  const savedProduct = await Product.findById(product._id);

  assert.equal(savedOrder?.status, "pending");
  assert.equal(savedOrder?.inventoryState, "reserved");

  assert.equal(savedProduct?.stock, 3);
});

// =====================================
// TEST 6: EXPIRED CHECKOUT
// =====================================

test("Expired order cannot be committed by customer verification", async (t) => {
  const { product, order } = await createTestOrder();

  await reserveOrderInventory(order._id);

  await releaseOrderInventory(order._id, "expired");

  // The controller should return the existing
  // final status without contacting Stripe.
  t.mock.method(stripe.checkout.sessions, "retrieve", async () => {
    throw new Error("Stripe must not be called");
  });

  const response = await verifyPayment(order._id.toString());

  assert.equal(response.status, 200);
  assert.equal(response.body.data.orderStatus, "expired");

  const savedOrder = await Order.findById(order._id);

  const savedProduct = await Product.findById(product._id);

  assert.equal(savedOrder?.status, "expired");
  assert.equal(savedOrder?.inventoryState, "released");

  assert.equal(savedProduct?.stock, 5);
});
