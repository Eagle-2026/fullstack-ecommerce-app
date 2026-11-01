import "dotenv/config";

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";

import app from "../src/app";
import User from "../src/models/User";
import Session from "../src/models/Session";

import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  SESSION_MS,
  hashToken,
} from "../src/utils/authTokens";

// =====================================
// TEST CONFIGURATION
// =====================================

let mongoServer: MongoMemoryServer | undefined;

const frontendOrigin = new URL(
  process.env.CLIENT_URL || "http://localhost:3000",
).origin;

// Use a fresh secret only for these tests.
// Never print it.
process.env.JWT_SECRET = randomBytes(48).toString("hex");

// =====================================
// START ISOLATED MONGODB
// =====================================

before(async () => {
  // Create a new temporary MongoDB server.
  mongoServer = await MongoMemoryServer.create();

  const testUri = mongoServer.getUri();

  // Safety check: never connect these tests to
  // MongoDB Atlas or an external database.
  if (!testUri.startsWith("mongodb://127.0.0.1:")) {
    await mongoServer.stop();

    throw new Error("Integration tests require isolated local MongoDB");
  }

  // Override any MongoDB URI loaded from .env
  // inside this TEST PROCESS ONLY.
  process.env.MONGODB_URI = testUri;

  // Do NOT call the application's connectDB().
  // It has a fixed ecommerce database name.
  await mongoose.connect(testUri, {
    dbName: "ecommerce_auth_test",
  });
});

// =====================================
// STOP TEMPORARY MONGODB
// =====================================

after(async () => {
  await mongoose.disconnect();

  if (mongoServer) {
    await mongoServer.stop();
  }
});

// =====================================
// EXTRACT A TEST COOKIE
// =====================================

function getCookie(
  response: {
    headers: Record<string, unknown>;
  },
  name: string,
): string {
  const headers = response.headers["set-cookie"];

  if (!Array.isArray(headers)) {
    throw new Error(`Expected authentication cookie: ${name}`);
  }

  const cookie = headers.find(
    (value: unknown) =>
      typeof value === "string" && value.startsWith(`${name}=`),
  );

  if (typeof cookie !== "string") {
    throw new Error(`Authentication cookie not found: ${name}`);
  }

  return cookie.split(";")[0];
}

// =====================================
// CREATE A TEMPORARY TEST CUSTOMER
// =====================================

async function loginTestCustomer() {
  const email = `session-${randomUUID()}@example.com`;

  const password = "TestPassword123!";

  // This customer exists only in the
  // temporary in-memory database.
  const user = await User.create({
    name: "Session Test Customer",
    email,
    password,
  });

  const response = await request(app)
    .post("/api/v1/auth/login")
    .set("Origin", frontendOrigin)
    .send({
      email,
      password,
    });

  assert.equal(
    response.status,
    200,
    "Test customer should log in successfully",
  );

  return {
    user,
    accessCookie: getCookie(response, ACCESS_COOKIE),
    refreshCookie: getCookie(response, REFRESH_COOKIE),
  };
}

// =====================================
// TEST 1: LOGIN CREATES MONGODB SESSION
// =====================================

test("Login creates a real MongoDB session", async () => {
  const login = await loginTestCustomer();

  const session = await Session.findOne({
    user: login.user._id,
  });

  assert.ok(session);
  assert.equal(session.revoked, false);

  const sessionDuration =
    session.expiresAt.getTime() - session.createdAt.getTime();

  // Allow a small timestamp difference.
  assert.ok(sessionDuration > SESSION_MS - 5000);
  assert.ok(sessionDuration <= SESSION_MS);

  // Protected API must accept the valid JWT.
  const response = await request(app)
    .get("/api/v1/auth/me")
    .set("Cookie", login.accessCookie);

  assert.equal(response.status, 200);
});

// =====================================
// TEST 2: REFRESH TOKEN ROTATION
// =====================================

test("Refreshing rotates token and rejects old token", async () => {
  const login = await loginTestCustomer();

  const originalSession = await Session.findOne({
    user: login.user._id,
  });

  assert.ok(originalSession);

  const originalDeadline = originalSession.expiresAt.getTime();

  // Use the current refresh token.
  const refreshResponse = await request(app)
    .post("/api/v1/auth/refresh")
    .set("Origin", frontendOrigin)
    .set("Cookie", login.refreshCookie);

  assert.equal(refreshResponse.status, 200);

  const newRefreshCookie = getCookie(refreshResponse, REFRESH_COOKIE);

  assert.notEqual(newRefreshCookie, login.refreshCookie);

  // The session deadline must not move.
  const updatedSession = await Session.findById(originalSession._id);

  assert.ok(updatedSession);

  assert.equal(updatedSession.expiresAt.getTime(), originalDeadline);

  // Confirm MongoDB stores the NEW token hash.
  const newRawToken = newRefreshCookie.slice(`${REFRESH_COOKIE}=`.length);

  assert.equal(updatedSession.refreshTokenHash, hashToken(newRawToken));

  // The previously used refresh token
  // must no longer be accepted.
  const reuseResponse = await request(app)
    .post("/api/v1/auth/refresh")
    .set("Origin", frontendOrigin)
    .set("Cookie", login.refreshCookie);

  assert.equal(reuseResponse.status, 401);
});

// =====================================
// TEST 3: LOGOUT REVOKES SESSION
// =====================================

test("Logout revokes session and rejects old JWT", async () => {
  const login = await loginTestCustomer();

  const logoutResponse = await request(app)
    .post("/api/v1/auth/logout")
    .set("Origin", frontendOrigin)
    .set("Cookie", `${login.accessCookie}; ${login.refreshCookie}`);

  assert.equal(logoutResponse.status, 200);

  const session = await Session.findOne({
    user: login.user._id,
  });

  assert.ok(session);
  assert.equal(session.revoked, true);

  // Reuse the OLD access cookie deliberately.
  // It must fail even though the JWT
  // has not reached its own expiration.
  const response = await request(app)
    .get("/api/v1/auth/me")
    .set("Cookie", login.accessCookie);

  assert.equal(response.status, 401);

  // The old refresh token must also fail.
  const refreshResponse = await request(app)
    .post("/api/v1/auth/refresh")
    .set("Origin", frontendOrigin)
    .set("Cookie", login.refreshCookie);

  assert.equal(refreshResponse.status, 401);
});

// =====================================
// TEST 4: ABSOLUTE ONE-HOUR DEADLINE
// =====================================

test("Old session is rejected even with valid JWT", async () => {
  const login = await loginTestCustomer();

  const session = await Session.findOne({
    user: login.user._id,
  });

  assert.ok(session);

  // Simulate an original login time
  // older than one hour.
  //
  // IMPORTANT: This changes only a record
  // in our temporary in-memory database.
  const oldLoginTime = new Date(Date.now() - SESSION_MS - 10_000);

  await Session.collection.updateOne(
    {
      _id: session._id,
    },
    {
      $set: {
        createdAt: oldLoginTime,
      },
    },
  );

  // Even though the access JWT is recent,
  // the backend must enforce the session age.
  const meResponse = await request(app)
    .get("/api/v1/auth/me")
    .set("Cookie", login.accessCookie);

  assert.equal(meResponse.status, 401);

  // Refresh must not extend the old session.
  const refreshResponse = await request(app)
    .post("/api/v1/auth/refresh")
    .set("Origin", frontendOrigin)
    .set("Cookie", login.refreshCookie);

  assert.equal(refreshResponse.status, 401);
});
