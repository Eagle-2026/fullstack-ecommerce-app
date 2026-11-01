import test from "node:test";
import assert from "node:assert/strict";
import mongoose, { Types } from "mongoose";

import Order from "../src/models/Order";

// ===================================
// CREATE TEST ORDER
// ===================================

// Creates a sample order in memory.
// No MongoDB connection is required.

const makeTestOrder = () => {
  return new Order({
    user: new Types.ObjectId(),

    items: [
      {
        product: new Types.ObjectId(),
        name: "Test Product",
        slug: "test-product",
        priceCents: 1999,
        quantity: 1,
      },
    ],

    totalCents: 1999,
    currency: "usd",
    status: "pending",
  });
};

// ===================================
// TEST 1: NO AUTOMATIC RESERVATION
// ===================================

test("New order does not reserve stock automatically", async () => {
  const order = makeTestOrder();

  assert.equal(order.inventoryState, undefined);

  assert.equal(order.inventoryReservedAt, undefined);

  // validate() replaces deprecated validateSync().
  await order.validate();
});

// ===================================
// TEST 2: VALID RESERVED STATE
// ===================================

test("Order accepts a valid inventory reservation", async () => {
  const order = makeTestOrder();

  order.inventoryState = "reserved";
  order.inventoryReservedAt = new Date();

  assert.equal(order.inventoryState, "reserved");

  assert.ok(order.inventoryReservedAt);

  // No error means validation passed.
  await order.validate();
});

// ===================================
// TEST 3: INVALID INVENTORY STATE
// ===================================

test("Order rejects an invalid inventory state", async () => {
  const order = makeTestOrder();

  order.set("inventoryState", "invalid_state");

  // An invalid value must cause
  // Mongoose validation to reject.
  await assert.rejects(order.validate(), (error: unknown) => {
    if (!(error instanceof mongoose.Error.ValidationError)) {
      return false;
    }

    return Boolean(error.errors.inventoryState);
  });
});
