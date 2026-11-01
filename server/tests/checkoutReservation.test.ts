import "dotenv/config";

import test, { before, after } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import type Stripe from "stripe";

import app from "../src/app";
import { stripe } from "../src/config/stripe";

import User from "../src/models/User";
import Product from "../src/models/Product";
import Order from "../src/models/Order";

import { ACCESS_COOKIE } from "../src/utils/authTokens";

// =====================================
// TEMPORARY DATABASE
// =====================================

let replSet: MongoMemoryReplSet | undefined;
let accessCookie = "";

const trustedOrigin = new URL(process.env.CLIENT_URL || "http://localhost:3000")
  .origin;

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
    dbName: "checkout_reservation_test",
  });

  // Make sure the unique checkout index exists
  // before testing duplicate requests.
  await Order.init();

  const password = "TestPassword123!";

  const user = await User.create({
    name: "Checkout Test Customer",
    email: `checkout-${randomUUID()}@example.com`,
    password,
  });

  const response = await request(app)
    .post("/api/v1/auth/login")
    .set("Origin", trustedOrigin)
    .send({
      email: user.email,
      password,
    });

  assert.equal(response.status, 200);

  const cookies = response.headers["set-cookie"];

  assert.ok(Array.isArray(cookies));

  const access = cookies.find((value: string) =>
    value.startsWith(`${ACCESS_COOKIE}=`),
  );

  assert.ok(access);

  accessCookie = access.split(";")[0];
});

after(async () => {
  await mongoose.disconnect();

  if (replSet) {
    await replSet.stop();
  }
});

// =====================================
// CREATE TEST PRODUCT
// =====================================

async function makeProduct(stock: number) {
  const slug = `checkout-${randomUUID().replace(/-/g, "")}`;

  return Product.create({
    name: "Test Laptop",
    slug,
    description: "Temporary checkout inventory test",
    priceCents: 2000,
    category: "Testing",
    stock,
    isActive: true,
  });
}

// =====================================
// CALL REAL CHECKOUT API
// =====================================

// Optional attemptId:
// Existing tests work without a key.
// New tests can send the same key twice.
function checkout(slug: string, quantity: number, attemptId?: string) {
  const apiRequest = request(app)
    .post("/api/v1/orders/checkout")
    .set("Origin", trustedOrigin)
    .set("Cookie", accessCookie);

  if (attemptId) {
    apiRequest.set("Idempotency-Key", attemptId);
  }

  return apiRequest.send({
    items: [{ slug, quantity }],
  });
}

// =====================================
// MOCK STRIPE SESSION CREATION
// =====================================

function mockStripeCreate(
  t: TestContext,
  options: {
    fail?: boolean;
    missingUrl?: boolean;
  } = {},
) {
  let callCount = 0;

  t.mock.method(stripe.checkout.sessions, "create", async () => {
    callCount += 1;

    if (options.fail) {
      throw new Error("Simulated Stripe timeout");
    }

    return {
      id: `cs_test_${randomUUID().replace(/-/g, "")}`,
      url: options.missingUrl ? null : "https://checkout.stripe.com/c/pay/test",
    } as Stripe.Response<Stripe.Checkout.Session>;
  });

  return {
    get calls() {
      return callCount;
    },
  };
}

// =====================================
// TEST 1: SUCCESSFUL CHECKOUT
// =====================================

test("Checkout reserves stock before returning Stripe URL", async (t) => {
  const product = await makeProduct(5);
  const stripeMock = mockStripeCreate(t);

  const response = await checkout(product.slug, 2);

  assert.equal(response.status, 201);
  assert.ok(response.body.data.orderId);
  assert.ok(response.body.data.checkoutUrl);
  assert.equal(stripeMock.calls, 1);

  const order = await Order.findById(response.body.data.orderId);

  const savedProduct = await Product.findById(product._id);

  assert.equal(order?.status, "pending");
  assert.equal(order?.inventoryState, "reserved");
  assert.ok(order?.inventoryReservedAt);
  assert.ok(order?.stripeSessionId);
  assert.equal(order?.totalCents, 4000);
  assert.equal(savedProduct?.stock, 3);
});

// =====================================
// TEST 2: OUT OF STOCK
// =====================================

test("Out-of-stock checkout does not contact Stripe", async (t) => {
  const product = await makeProduct(0);
  const stripeMock = mockStripeCreate(t);

  const response = await checkout(product.slug, 1);

  assert.equal(response.status, 400);
  assert.equal(stripeMock.calls, 0);

  const savedProduct = await Product.findById(product._id);

  assert.equal(savedProduct?.stock, 0);
});

// =====================================
// TEST 3: SIMULTANEOUS CHECKOUTS
// =====================================

test("Two checkout requests cannot reserve the last item twice", async (t) => {
  const product = await makeProduct(1);
  const stripeMock = mockStripeCreate(t);

  const responses = await Promise.all([
    checkout(product.slug, 1),
    checkout(product.slug, 1),
  ]);

  const successful = responses.filter((response) => response.status === 201);

  const unavailable = responses.filter(
    (response) => response.status === 400 || response.status === 409,
  );

  const savedProduct = await Product.findById(product._id);

  assert.equal(successful.length, 1);
  assert.equal(unavailable.length, 1);
  assert.equal(stripeMock.calls, 1);
  assert.equal(savedProduct?.stock, 0);
});

// =====================================
// TEST 4: UNCERTAIN STRIPE ERROR
// =====================================

test("Stripe timeout keeps reservation for reconciliation", async (t) => {
  const product = await makeProduct(5);

  mockStripeCreate(t, {
    fail: true,
  });

  const response = await checkout(product.slug, 2);

  assert.equal(response.status, 503);

  const order = await Order.findOne({
    "items.product": product._id,
  });

  const savedProduct = await Product.findById(product._id);

  // A Stripe network error does not prove
  // the payment session was never created.
  assert.equal(order?.status, "pending");
  assert.equal(order?.inventoryState, "reserved");
  assert.equal(savedProduct?.stock, 3);
});

// =====================================
// TEST 5: MISSING CHECKOUT URL
// =====================================

test("Missing Stripe URL preserves session for recovery", async (t) => {
  const product = await makeProduct(5);

  mockStripeCreate(t, {
    missingUrl: true,
  });

  const response = await checkout(product.slug, 2);

  assert.equal(response.status, 502);

  const order = await Order.findOne({
    "items.product": product._id,
  });

  const savedProduct = await Product.findById(product._id);

  assert.equal(order?.status, "pending");
  assert.equal(order?.inventoryState, "reserved");
  assert.ok(order?.stripeSessionId);
  assert.equal(savedProduct?.stock, 3);
});

// =====================================
// TEST 6: SAME CHECKOUT ATTEMPT
// =====================================

test("Retrying the same checkout does not create another order or reserve stock twice", async (t) => {
  // Only two units available.
  const product = await makeProduct(2);

  // One UUID identifies this checkout attempt.
  const attemptId = randomUUID();

  const stripeMock = mockStripeCreate(t);

  // First request creates an order and reserves stock.
  const firstResponse = await checkout(product.slug, 2, attemptId);

  assert.equal(firstResponse.status, 201);
  assert.equal(stripeMock.calls, 1);

  const firstOrder = await Order.findById(firstResponse.body.data.orderId);

  assert.ok(firstOrder);
  assert.ok(firstOrder.stripeSessionId);

  assert.equal(firstOrder.checkoutAttemptId, attemptId);

  // Mock Stripe's response when the backend
  // checks whether the existing session is open.
  t.mock.method(
    stripe.checkout.sessions,
    "retrieve",
    async (sessionId: string) => {
      assert.equal(sessionId, firstOrder.stripeSessionId);

      return {
        id: sessionId,
        client_reference_id: firstOrder._id.toString(),
        metadata: {
          orderId: firstOrder._id.toString(),
        },
        mode: "payment",
        amount_total: firstOrder.totalCents,
        currency: firstOrder.currency,
        status: "open",
        payment_status: "unpaid",
        expires_at: Math.floor(Date.now() / 1000) + 1200,
        url: firstResponse.body.data.checkoutUrl,
      } as unknown as Stripe.Response<Stripe.Checkout.Session>;
    },
  );

  // Retry with the SAME attempt ID and cart.
  const retryResponse = await checkout(product.slug, 2, attemptId);

  // Existing checkout should be reused.
  assert.equal(retryResponse.status, 200);

  assert.equal(
    retryResponse.body.data.orderId,
    firstResponse.body.data.orderId,
  );

  assert.equal(
    retryResponse.body.data.checkoutUrl,
    firstResponse.body.data.checkoutUrl,
  );

  // Stripe create must run only once.
  assert.equal(stripeMock.calls, 1);

  // There must be exactly one order.
  const matchingOrders = await Order.find({
    checkoutAttemptId: attemptId,
  });

  assert.equal(matchingOrders.length, 1);

  // Stock was 2, and exactly 2 were reserved.
  const savedProduct = await Product.findById(product._id);

  assert.equal(savedProduct?.stock, 0);
});

// =====================================
// TEST 7: SAME KEY, DIFFERENT CART
// =====================================

test("Reusing a checkout attempt ID with a different cart is rejected", async (t) => {
  const product = await makeProduct(5);
  const attemptId = randomUUID();

  const stripeMock = mockStripeCreate(t);

  // First checkout requests 1 item.
  const firstResponse = await checkout(product.slug, 1, attemptId);

  assert.equal(firstResponse.status, 201);
  assert.equal(stripeMock.calls, 1);

  // Same attempt ID, but quantity changes to 2.
  const secondResponse = await checkout(product.slug, 2, attemptId);

  // Same ID must not be used for a different cart.
  assert.equal(secondResponse.status, 409);

  // No second Stripe Checkout Session.
  assert.equal(stripeMock.calls, 1);

  // Only one order should exist for this attempt.
  const matchingOrders = await Order.find({
    checkoutAttemptId: attemptId,
  });

  assert.equal(matchingOrders.length, 1);

  // Only one item should be reserved.
  const savedProduct = await Product.findById(product._id);

  assert.equal(savedProduct?.stock, 4);
});
