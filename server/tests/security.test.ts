import "dotenv/config";

import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import app from "../src/app";

import { signupSchema } from "../src/validators/authValidators";

import { createProductSchema } from "../src/validators/productValidators";

import { createCheckoutSchema } from "../src/validators/orderValidators";

const frontendOrigin = new URL(
  process.env.CLIENT_URL || "http://localhost:3000",
).origin;

// ======================================
// TEST 1 — HEALTH CHECK
// ======================================

test("Health endpoint returns 200", async () => {
  const response = await request(app).get("/api/health");

  assert.equal(response.status, 200);
});

// ======================================
// TEST 2 — ADMIN REQUIRES LOGIN
// ======================================

test("Guest cannot access admin summary", async () => {
  const response = await request(app).get("/api/v1/admin/summary");

  assert.equal(response.status, 401);
});

// ======================================
// TEST 3 — ORDERS REQUIRE LOGIN
// ======================================

test("Guest cannot view orders", async () => {
  const response = await request(app).get("/api/v1/orders");

  assert.equal(response.status, 401);
});

// ======================================
// TEST 4 — PRODUCT WRITES REQUIRE LOGIN
// ======================================

test("Guest cannot create a product", async () => {
  const response = await request(app)
    .post("/api/v1/products")
    .set("Origin", frontendOrigin)
    .send({ name: "Test Product" });

  assert.equal(response.status, 401);
});

// ======================================
// TEST 5 — INVALID SIGNUP REJECTED
// ======================================

test("Signup rejects a short password", async () => {
  const response = await request(app)
    .post("/api/v1/auth/signup")
    .set("Origin", frontendOrigin)
    .send({
      name: "Test Customer",
      email: "test@example.com",
      password: "123",
    });

  assert.equal(response.status, 400);
});

// ======================================
// TEST 6 — ADMIN ROLE INJECTION
// ======================================

test("Signup rejects submitted admin role", () => {
  const result = signupSchema.safeParse({
    name: "Test Customer",
    email: "test@example.com",
    password: "StrongPassword123!",
    role: "admin",
  });

  assert.equal(result.success, false);
});

// ======================================
// TEST 7 — NEGATIVE PRODUCT PRICE
// ======================================

test("Product rejects negative price", () => {
  const result = createProductSchema.safeParse({
    name: "Wireless Mouse",
    slug: "wireless-mouse",
    description: "A mouse for everyday use.",
    priceCents: -100,
    category: "Electronics",
    stock: 10,
  });

  assert.equal(result.success, false);
});

// ======================================
// TEST 8 — INVALID CHECKOUT QUANTITY
// ======================================

test("Checkout rejects quantity zero", () => {
  const result = createCheckoutSchema.safeParse({
    items: [
      {
        slug: "wireless-mouse",
        quantity: 0,
      },
    ],
  });

  assert.equal(result.success, false);
});

// ======================================
// TEST 9 — PRICE MANIPULATION
// ======================================

test("Checkout rejects submitted price", () => {
  const result = createCheckoutSchema.safeParse({
    items: [
      {
        slug: "wireless-mouse",
        quantity: 1,
        priceCents: 1,
      },
    ],
  });

  assert.equal(result.success, false);
});

// ======================================
// TEST 10 — DUPLICATE CHECKOUT ITEMS
// ======================================

test("Checkout rejects duplicate products", () => {
  const result = createCheckoutSchema.safeParse({
    items: [
      {
        slug: "wireless-mouse",
        quantity: 1,
      },
      {
        slug: "wireless-mouse",
        quantity: 2,
      },
    ],
  });

  assert.equal(result.success, false);
});

// ======================================
// TEST 11 — CROSS-SITE REQUEST
// ======================================

test("Cross-site request is rejected", async () => {
  const response = await request(app)
    .post("/api/v1/auth/login")
    .set("Origin", "https://malicious-example.com")
    .send({
      email: "test@example.com",
      password: "WrongPassword123!",
    });

  assert.equal(response.status, 403);
});

// ======================================
// TEST 12 — MISSING ORIGIN
// ======================================

test("POST without trusted origin is rejected", async () => {
  const response = await request(app).post("/api/v1/auth/login").send({
    email: "test@example.com",
    password: "WrongPassword123!",
  });

  assert.equal(response.status, 403);
});

// ======================================
// TEST 13 — FAKE STRIPE WEBHOOK
// ======================================

test("Unsigned Stripe webhook is rejected", async () => {
  const response = await request(app).post("/api/v1/stripe/webhook").send({
    type: "checkout.session.completed",
  });

  assert.equal(response.status, 400);
});

// ======================================
// TEST 14 — SECURITY HEADERS
// ======================================

test("Helmet adds a security header", async () => {
  const response = await request(app).get("/api/health");

  assert.equal(response.headers["x-content-type-options"], "nosniff");
});

// ======================================
// TEST 15 — UNKNOWN API ROUTE
// ======================================

test("Unknown API route returns 404", async () => {
  const response = await request(app).get("/api/v1/does-not-exist");

  assert.equal(response.status, 404);
});
