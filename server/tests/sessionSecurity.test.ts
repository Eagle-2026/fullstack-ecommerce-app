import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";

import {
  ACCESS_MS,
  SESSION_MS,
  getSessionDeadline,
  createAccessToken,
  verifyAccessToken,
  newRefreshToken,
  hashToken,
} from "../src/utils/authTokens";

// Use a randomly generated TEST secret.
// Never use or print a real production secret.
process.env.JWT_SECRET = randomBytes(48).toString("hex");

const userId = "507f1f77bcf86cd799439011";
const sessionId = "507f191e810c19729de860ea";

// =====================================
// TEST 1: CORRECT SESSION DURATION
// =====================================

test("Session maximum is exactly 1 hour", () => {
  assert.equal(SESSION_MS, 60 * 60 * 1000);
  assert.equal(ACCESS_MS, 15 * 60 * 1000);
});

// =====================================
// TEST 2: ABSOLUTE EXPIRATION
// =====================================

test("Session never extends beyond original login", () => {
  const createdAt = new Date();

  // Even if the database expiry is later,
  // the original login time limits the session.
  const expiresAt = new Date(createdAt.getTime() + 3 * 60 * 60 * 1000);

  const deadline = getSessionDeadline({
    createdAt,
    expiresAt,
  });

  assert.equal(deadline.getTime(), createdAt.getTime() + SESSION_MS);
});

// =====================================
// TEST 3: EARLIER EXPIRATION IS RESPECTED
// =====================================

test("Stored earlier expiration is respected", () => {
  const createdAt = new Date();

  const expiresAt = new Date(createdAt.getTime() + 10 * 60 * 1000);

  const deadline = getSessionDeadline({
    createdAt,
    expiresAt,
  });

  assert.equal(deadline.getTime(), expiresAt.getTime());
});

// =====================================
// TEST 4: OLD SESSION MUST BE EXPIRED
// =====================================

test("A session older than 1 hour is expired", () => {
  const now = Date.now();

  const createdAt = new Date(now - SESSION_MS - 1000);

  const expiresAt = new Date(now + SESSION_MS);

  const deadline = getSessionDeadline({
    createdAt,
    expiresAt,
  });

  assert.ok(deadline.getTime() < now);

  assert.throws(() => {
    createAccessToken(userId, sessionId, 0, deadline);
  });
});

// =====================================
// TEST 5: JWT CANNOT OUTLIVE SESSION
// =====================================

test("Access token cannot exceed session deadline", () => {
  const sessionDeadline = new Date(Date.now() + 2 * 60 * 1000);

  const token = createAccessToken(userId, sessionId, 0, sessionDeadline);

  const decoded = jwt.decode(token);

  if (
    !decoded ||
    typeof decoded === "string" ||
    typeof decoded.exp !== "number"
  ) {
    throw new Error("Invalid test JWT");
  }

  assert.ok(decoded.exp * 1000 <= sessionDeadline.getTime());

  assert.ok(decoded.exp * 1000 > Date.now());
});

// =====================================
// TEST 6: VALID JWT VERIFICATION
// =====================================

test("Correctly signed JWT can be verified", () => {
  const token = createAccessToken(
    userId,
    sessionId,
    0,
    new Date(Date.now() + SESSION_MS),
  );

  const payload = verifyAccessToken(token);

  assert.equal(payload.userId, userId);
  assert.equal(payload.sessionId, sessionId);
  assert.equal(payload.authVersion, 0);
});

// =====================================
// TEST 7: WRONG JWT ALGORITHM REJECTED
// =====================================

test("JWT with unapproved algorithm is rejected", () => {
  const token = jwt.sign(
    {
      sub: userId,
      sid: sessionId,
      ver: 0,
    },
    process.env.JWT_SECRET as string,
    {
      algorithm: "HS384",
      issuer: "ecommerce-api",
      audience: "ecommerce-web",
      expiresIn: 300,
    },
  );

  assert.throws(() => {
    verifyAccessToken(token);
  });
});

// =====================================
// TEST 8: SECURE REFRESH TOKEN
// =====================================

test("Refresh tokens are random and hashable", () => {
  const firstToken = newRefreshToken();
  const secondToken = newRefreshToken();

  assert.match(firstToken, /^[a-f0-9]{64}$/);
  assert.match(secondToken, /^[a-f0-9]{64}$/);

  assert.notEqual(firstToken, secondToken);

  const firstHash = hashToken(firstToken);

  assert.match(firstHash, /^[a-f0-9]{64}$/);

  assert.notEqual(firstHash, firstToken);
});

// =====================================
// TEST 9: INVALID SESSION TIMESTAMPS
// =====================================

test("Invalid session timestamps are rejected", () => {
  assert.throws(() => {
    getSessionDeadline({
      createdAt: new Date(Number.NaN),
      expiresAt: new Date(),
    });
  });
});
