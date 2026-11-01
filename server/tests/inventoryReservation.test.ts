import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import Product, { type IProduct } from "../src/models/Product";
import Order from "../src/models/Order";

import {
  reserveOrderInventory,
  releaseOrderInventory,
  commitOrderInventory,
  confirmVerifiedOrderPayment,
  InventoryUnavailableError,
  InventoryOrderError,
} from "../src/services/inventoryService";

// =====================================
// TEMPORARY TEST DATABASE
// =====================================

let replSet: MongoMemoryReplSet | undefined;

before(async () => {
  // Start an isolated local replica set.
  replSet = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
    },
  });

  const uri = replSet.getUri();

  // Safety: never connect to Atlas.
  if (!/^mongodb:\/\/127\.0\.0\.1:\d+\//.test(uri)) {
    await replSet.stop();

    throw new Error("Tests require temporary local MongoDB");
  }

  await mongoose.connect(uri, {
    dbName: "inventory_reservation_test",
  });
});

after(async () => {
  await mongoose.disconnect();

  if (replSet) {
    await replSet.stop();
  }
});

// =====================================
// CREATE TEST PRODUCTS
// =====================================

async function makeProduct(stock: number): Promise<IProduct> {
  const slug = `test-${randomUUID().replace(/-/g, "")}`;

  return Product.create({
    name: "Test Laptop",
    slug,
    description: "Temporary inventory test product",
    priceCents: 1000,
    category: "Testing",
    stock,
    isActive: true,
  });
}

// =====================================
// CREATE TEST ORDER
// =====================================

async function makeOrder(
  entries: Array<{
    product: IProduct;
    quantity: number;
  }>,
) {
  return Order.create({
    user: new Types.ObjectId(),

    items: entries.map(({ product, quantity }) => ({
      product: product._id,
      name: product.name,
      slug: product.slug,
      priceCents: product.priceCents,
      quantity,
    })),

    totalCents: entries.reduce(
      (total, entry) => total + entry.product.priceCents * entry.quantity,
      0,
    ),

    currency: "usd",
    status: "pending",
  });
}

// =====================================
// TEST 1: RESERVE AVAILABLE STOCK
// =====================================

test("Reservation deducts available stock", async () => {
  const product = await makeProduct(5);

  const order = await makeOrder([{ product, quantity: 2 }]);

  const reserved = await reserveOrderInventory(order._id);

  assert.equal(reserved, true);

  const updatedProduct = await Product.findById(product._id);

  const updatedOrder = await Order.findById(order._id);

  assert.equal(updatedProduct?.stock, 3);
  assert.equal(updatedOrder?.inventoryState, "reserved");
  assert.ok(updatedOrder?.inventoryReservedAt);
});

// =====================================
// TEST 2: DO NOT RESERVE TWICE
// =====================================

test("Repeated reservation does not deduct twice", async () => {
  const product = await makeProduct(5);

  const order = await makeOrder([{ product, quantity: 2 }]);

  const first = await reserveOrderInventory(order._id);

  const second = await reserveOrderInventory(order._id);

  const updatedProduct = await Product.findById(product._id);

  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(updatedProduct?.stock, 3);
});

// =====================================
// TEST 3: REJECT INSUFFICIENT STOCK
// =====================================

test("Insufficient stock leaves inventory unchanged", async () => {
  const product = await makeProduct(1);

  const order = await makeOrder([{ product, quantity: 2 }]);

  await assert.rejects(
    reserveOrderInventory(order._id),
    InventoryUnavailableError,
  );

  const updatedProduct = await Product.findById(product._id);

  const updatedOrder = await Order.findById(order._id);

  assert.equal(updatedProduct?.stock, 1);
  assert.equal(updatedOrder?.inventoryState, undefined);
});

// =====================================
// TEST 4: ROLLBACK MULTI-PRODUCT CART
// =====================================

test("Failed cart reservation rolls back all products", async () => {
  const laptop = await makeProduct(3);
  const mouse = await makeProduct(0);

  const order = await makeOrder([
    { product: laptop, quantity: 1 },
    { product: mouse, quantity: 1 },
  ]);

  await assert.rejects(
    reserveOrderInventory(order._id),
    InventoryUnavailableError,
  );

  const updatedLaptop = await Product.findById(laptop._id);

  const updatedMouse = await Product.findById(mouse._id);

  const updatedOrder = await Order.findById(order._id);

  assert.equal(updatedLaptop?.stock, 3);
  assert.equal(updatedMouse?.stock, 0);
  assert.equal(updatedOrder?.inventoryState, undefined);
});

// =====================================
// TEST 5: TWO CUSTOMERS, ONE ITEM
// =====================================

test("Concurrent reservations cannot oversell one item", async () => {
  const product = await makeProduct(1);

  const orderA = await makeOrder([{ product, quantity: 1 }]);

  const orderB = await makeOrder([{ product, quantity: 1 }]);

  // Separate orders compete for the
  // same last available product.
  const results = await Promise.allSettled([
    reserveOrderInventory(orderA._id),
    reserveOrderInventory(orderB._id),
  ]);

  const successful = results.filter(
    (result) => result.status === "fulfilled" && result.value === true,
  );

  const rejected = results.filter((result) => result.status === "rejected");

  const updatedProduct = await Product.findById(product._id);

  const updatedOrders = await Order.find({
    _id: {
      $in: [orderA._id, orderB._id],
    },
    inventoryState: "reserved",
  });

  assert.equal(successful.length, 1);
  assert.equal(rejected.length, 1);

  assert.equal(updatedProduct?.stock, 0);
  assert.equal(updatedOrders.length, 1);
});


 // =====================================
 // TEST 6: EXPIRED CHECKOUT RESTORES STOCK
 // =====================================

test(
  "Expired checkout restores reserved stock",
  async () => {
    const product = await makeProduct(5);

    const order = await makeOrder([
      { product, quantity: 2 },
    ]);

    await reserveOrderInventory(order._id);

    const released = await releaseOrderInventory(
      order._id,
      "expired",
    );

    const updatedProduct = await Product.findById(
      product._id,
    );

    const updatedOrder = await Order.findById(
      order._id,
    );

    assert.equal(released, true);
    assert.equal(updatedProduct?.stock, 5);
    assert.equal(updatedOrder?.status, "expired");
    assert.equal(
      updatedOrder?.inventoryState,
      "released",
    );
  },
);

// =====================================
// TEST 7: FAILED PAYMENT RESTORES STOCK
// =====================================

test(
  "Failed payment restores reserved stock",
  async () => {
    const product = await makeProduct(4);

    const order = await makeOrder([
      { product, quantity: 3 },
    ]);

    await reserveOrderInventory(order._id);

    const released = await releaseOrderInventory(
      order._id,
      "failed",
    );

    const updatedProduct = await Product.findById(
      product._id,
    );

    const updatedOrder = await Order.findById(
      order._id,
    );

    assert.equal(released, true);
    assert.equal(updatedProduct?.stock, 4);
    assert.equal(updatedOrder?.status, "failed");
    assert.equal(
      updatedOrder?.inventoryState,
      "released",
    );
  },
);

// =====================================
// TEST 8: DO NOT RESTORE TWICE
// =====================================

test(
  "Repeated release cannot restore stock twice",
  async () => {
    const product = await makeProduct(5);

    const order = await makeOrder([
      { product, quantity: 2 },
    ]);

    await reserveOrderInventory(order._id);

    const first = await releaseOrderInventory(
      order._id,
      "expired",
    );

    const second = await releaseOrderInventory(
      order._id,
      "expired",
    );

    const updatedProduct = await Product.findById(
      product._id,
    );

    assert.equal(first, true);
    assert.equal(second, false);
    assert.equal(updatedProduct?.stock, 5);
  },
);

// =====================================
// TEST 9: DO NOT RESTORE OLD ORDERS
// =====================================

test(
  "Unreserved order cannot restore stock",
  async () => {
    const product = await makeProduct(5);

    const order = await makeOrder([
      { product, quantity: 2 },
    ]);

    await assert.rejects(
      releaseOrderInventory(
        order._id,
        "expired",
      ),
      InventoryOrderError,
    );

    const updatedProduct = await Product.findById(
      product._id,
    );

    assert.equal(updatedProduct?.stock, 5);
  },
);

// =====================================
// TEST 10: DO NOT RESTORE PAID ORDERS
// =====================================

test(
  "Committed inventory cannot be released",
  async () => {
    const product = await makeProduct(5);

    const order = await makeOrder([
      { product, quantity: 2 },
    ]);

    await reserveOrderInventory(order._id);

    const reservedOrder = await Order.findById(
      order._id,
    );

    assert.ok(reservedOrder);

    // Simulate an order already confirmed
    // by a trusted payment process.
    reservedOrder.status = "paid";
    reservedOrder.inventoryState = "committed";

    await reservedOrder.save();

    await assert.rejects(
      releaseOrderInventory(
        order._id,
        "expired",
      ),
      InventoryOrderError,
    );

    const updatedProduct = await Product.findById(
      product._id,
    );

    // The 2 sold items stay deducted.
    assert.equal(updatedProduct?.stock, 3);
  },
);


 // =====================================
 // TEST 11: COMMIT PAID ORDER
 // =====================================

test(
  "Paid order commits reserved inventory",
  async () => {
    const product = await makeProduct(5);

    const order = await makeOrder([
      { product, quantity: 2 },
    ]);

    await reserveOrderInventory(order._id);

    const committed = await commitOrderInventory(
      order._id,
    );

    const updatedOrder = await Order.findById(
      order._id,
    );

    const updatedProduct = await Product.findById(
      product._id,
    );

    assert.equal(committed, true);
    assert.equal(updatedOrder?.status, "paid");
    assert.equal(
      updatedOrder?.inventoryState,
      "committed",
    );
    assert.ok(updatedOrder?.paidAt);

    // Stock was deducted during reservation.
    // Commitment must not deduct it again.
    assert.equal(updatedProduct?.stock, 3);
  },
);

// =====================================
// TEST 12: DO NOT COMMIT TWICE
// =====================================

test(
  "Repeated payment confirmation does not commit twice",
  async () => {
    const product = await makeProduct(5);

    const order = await makeOrder([
      { product, quantity: 2 },
    ]);

    await reserveOrderInventory(order._id);

    const first = await commitOrderInventory(
      order._id,
    );

    const second = await commitOrderInventory(
      order._id,
    );

    const updatedProduct = await Product.findById(
      product._id,
    );

    assert.equal(first, true);
    assert.equal(second, false);
    assert.equal(updatedProduct?.stock, 3);
  },
);

// =====================================
// TEST 13: REJECT UNRESERVED ORDER
// =====================================

test(
  "Unreserved order cannot commit inventory",
  async () => {
    const product = await makeProduct(5);

    const order = await makeOrder([
      { product, quantity: 1 },
    ]);

    await assert.rejects(
      commitOrderInventory(order._id),
      InventoryOrderError,
    );

    const updatedOrder = await Order.findById(
      order._id,
    );

    const updatedProduct = await Product.findById(
      product._id,
    );

    assert.equal(updatedOrder?.status, "pending");
    assert.equal(
      updatedOrder?.inventoryState,
      undefined,
    );
    assert.equal(updatedProduct?.stock, 5);
  },
);

// =====================================
// TEST 14: REJECT RELEASED ORDER
// =====================================

test(
  "Released inventory cannot be committed",
  async () => {
    const product = await makeProduct(5);

    const order = await makeOrder([
      { product, quantity: 2 },
    ]);

    await reserveOrderInventory(order._id);

    await releaseOrderInventory(
      order._id,
      "expired",
    );

    await assert.rejects(
      commitOrderInventory(order._id),
      InventoryOrderError,
    );

    const updatedOrder = await Order.findById(
      order._id,
    );

    const updatedProduct = await Product.findById(
      product._id,
    );

    assert.equal(updatedOrder?.status, "expired");
    assert.equal(
      updatedOrder?.inventoryState,
      "released",
    );
    assert.equal(updatedProduct?.stock, 5);
  },
);

// =====================================
// TEST 15: CONCURRENT CONFIRMATIONS
// =====================================

test(
  "Concurrent confirmations commit an order only once",
  async () => {
    const product = await makeProduct(5);

    const order = await makeOrder([
      { product, quantity: 2 },
    ]);

    await reserveOrderInventory(order._id);

    const results = await Promise.all([
      commitOrderInventory(order._id),
      commitOrderInventory(order._id),
    ]);

    const updatedOrder = await Order.findById(
      order._id,
    );

    const updatedProduct = await Product.findById(
      product._id,
    );

    assert.equal(
      results.filter((value) => value === true).length,
      1,
    );

    assert.equal(
      results.filter((value) => value === false).length,
      1,
    );

    assert.equal(updatedOrder?.status, "paid");
    assert.equal(
      updatedOrder?.inventoryState,
      "committed",
    );

    assert.equal(updatedProduct?.stock, 3);
  },
);


// =====================================
// TEST 16: CONFIRM RESERVED ORDER
// =====================================

test(
  "Shared confirmation commits reserved stock",
  async () => {
    const product = await makeProduct(5);

    const order = await makeOrder([
      { product, quantity: 2 },
    ]);

    await reserveOrderInventory(order._id);

    const confirmed =
      await confirmVerifiedOrderPayment(order._id);

    const updatedOrder = await Order.findById(
      order._id,
    );

    const updatedProduct = await Product.findById(
      product._id,
    );

    assert.equal(confirmed, true);
    assert.equal(updatedOrder?.status, "paid");
    assert.equal(
      updatedOrder?.inventoryState,
      "committed",
    );
    assert.equal(updatedProduct?.stock, 3);
  },
);

// =====================================
// TEST 17: SUPPORT HISTORICAL ORDERS
// =====================================

test(
  "Historical unreserved order can be confirmed",
  async () => {
    const product = await makeProduct(5);

    const order = await makeOrder([
      { product, quantity: 2 },
    ]);

    const confirmed =
      await confirmVerifiedOrderPayment(order._id);

    const updatedOrder = await Order.findById(
      order._id,
    );

    const updatedProduct = await Product.findById(
      product._id,
    );

    assert.equal(confirmed, true);
    assert.equal(updatedOrder?.status, "paid");
    assert.equal(updatedOrder?.inventoryState, undefined);
    assert.ok(updatedOrder?.paidAt);

    // Old orders did not reserve stock.
    assert.equal(updatedProduct?.stock, 5);
  },
);

// =====================================
// TEST 18: REPEATED CONFIRMATION
// =====================================

test(
  "Repeated confirmation does not update twice",
  async () => {
    const product = await makeProduct(5);

    const order = await makeOrder([
      { product, quantity: 1 },
    ]);

    const first =
      await confirmVerifiedOrderPayment(order._id);

    const savedOrder = await Order.findById(
      order._id,
    );

    const originalPaidAt =
      savedOrder?.paidAt?.getTime();

    const second =
      await confirmVerifiedOrderPayment(order._id);

    const updatedOrder = await Order.findById(
      order._id,
    );

    assert.equal(first, true);
    assert.equal(second, false);
    assert.equal(
      updatedOrder?.paidAt?.getTime(),
      originalPaidAt,
    );
  },
);

// =====================================
// TEST 19: REJECT RELEASED ORDER
// =====================================

test(
  "Shared confirmation rejects released inventory",
  async () => {
    const product = await makeProduct(5);

    const order = await makeOrder([
      { product, quantity: 2 },
    ]);

    await reserveOrderInventory(order._id);

    await releaseOrderInventory(
      order._id,
      "expired",
    );

    await assert.rejects(
      confirmVerifiedOrderPayment(order._id),
      InventoryOrderError,
    );

    const updatedOrder = await Order.findById(
      order._id,
    );

    const updatedProduct = await Product.findById(
      product._id,
    );

    assert.equal(updatedOrder?.status, "expired");
    assert.equal(
      updatedOrder?.inventoryState,
      "released",
    );
    assert.equal(updatedProduct?.stock, 5);
  },
);

// =====================================
// TEST 20: CONCURRENT LEGACY CONFIRMATIONS
// =====================================

test(
  "Concurrent confirmations update old order once",
  async () => {
    const product = await makeProduct(5);

    const order = await makeOrder([
      { product, quantity: 1 },
    ]);

    const results = await Promise.all([
      confirmVerifiedOrderPayment(order._id),
      confirmVerifiedOrderPayment(order._id),
    ]);

    const updatedOrder = await Order.findById(
      order._id,
    );

    assert.equal(
      results.filter((value) => value === true).length,
      1,
    );

    assert.equal(
      results.filter((value) => value === false).length,
      1,
    );

    assert.equal(updatedOrder?.status, "paid");
    assert.equal(updatedOrder?.inventoryState, undefined);

    const updatedProduct = await Product.findById(
      product._id,
    );

    assert.equal(updatedProduct?.stock, 5);
  },
);
