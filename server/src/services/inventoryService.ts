import mongoose, { Types } from "mongoose";

import Product from "../models/Product";
import Order from "../models/Order";

// =====================================
// INVENTORY ERRORS
// =====================================

export class InventoryUnavailableError extends Error {
  constructor() {
    super("Not enough available product stock");
    this.name = "InventoryUnavailableError";
  }
}

export class InventoryOrderError extends Error {
  constructor() {
    super("Order cannot reserve inventory");
    this.name = "InventoryOrderError";
  }
}

// =====================================
// RESERVE STOCK FOR ONE ORDER
// =====================================

// Returns true if stock was newly reserved.
// Returns false if this order was already reserved.
//
// This service does NOT call Stripe.
// We will connect it to checkout later.

export const reserveOrderInventory = async (
  orderId: Types.ObjectId,
): Promise<boolean> => {
  return mongoose.connection.transaction(async (session) => {
    // Step 1: Find the order inside the transaction.
    const order = await Order.findById(orderId).session(session);

    if (!order) {
      throw new InventoryOrderError();
    }

    // Step 2: Do not reserve twice.
    if (order.inventoryState === "reserved") {
      return false;
    }

    // Step 3: Only pending, unreserved orders
    // can reserve inventory.
    if (order.status !== "pending" || order.inventoryState !== undefined) {
      throw new InventoryOrderError();
    }

    // Step 4: Reserve every product.
    //
    // Operations run one at a time inside
    // the transaction.
    for (const item of order.items) {
      const result = await Product.updateOne(
        {
          _id: item.product,
          isActive: true,
          stock: {
            $gte: item.quantity,
          },
        },
        {
          $inc: {
            stock: -item.quantity,
          },
        },
        {
          session,
        },
      );

      // If any item is unavailable,
      // abort the whole transaction.
      if (result.matchedCount !== 1) {
        throw new InventoryUnavailableError();
      }
    }

    // Step 5: Record the successful reservation.
    order.inventoryState = "reserved";
    order.inventoryReservedAt = new Date();

    await order.save({
      session,
    });

    return true;
  });
};


 // =====================================
 // RELEASE RESERVED ORDER INVENTORY
 // =====================================

 // Call this only after a trusted backend
 // process confirms checkout failure or expiry.
 //
 // Returns true if stock was restored.
 // Returns false if already released.
 //
 // Do not call this simply because the
 // customer closes the browser.

export const releaseOrderInventory = async (
  orderId: Types.ObjectId,
  finalStatus: "failed" | "expired",
): Promise<boolean> => {
  return mongoose.connection.transaction(
    async (session) => {
      // Step 1: Find the order.
      const order = await Order.findById(
        orderId,
      ).session(session);

      if (!order) {
        throw new InventoryOrderError();
      }

      // Step 2: Never restore stock twice.
      if (order.inventoryState === "released") {
        return false;
      }

      // Step 3: Only a pending order with
      // reserved inventory can release it.
      //
      // Paid orders and old unreserved orders
      // must not receive extra stock.
      if (
        order.status !== "pending" ||
        order.inventoryState !== "reserved"
      ) {
        throw new InventoryOrderError();
      }

      // Step 4: Restore each product.
      for (const item of order.items) {
        const result = await Product.updateOne(
          {
            _id: item.product,
            stock: {
              $lte:
                Number.MAX_SAFE_INTEGER -
                item.quantity,
            },
          },
          {
            $inc: {
              stock: item.quantity,
            },
          },
          {
            session,
          },
        );

        if (result.matchedCount !== 1) {
          throw new InventoryOrderError();
        }
      }

      // Step 5: Record that the stock
      // was returned and checkout ended.
      order.inventoryState = "released";
      order.status = finalStatus;

      await order.save({
        session,
      });

      return true;
    },
  );
};


 // =====================================
 // COMMIT PAID ORDER INVENTORY
 // =====================================

// IMPORTANT:
// Only a trusted backend payment handler
// should call this AFTER verifying Stripe.
//
// Returns true if newly committed.
// Returns false if already committed.
//
// Do not deduct stock here again.
// Reservation already deducted the stock.

export const commitOrderInventory = async (
  orderId: Types.ObjectId,
): Promise<boolean> => {
  // Atomically change a reserved, pending order
  // into a paid order with committed inventory.
  const updatedOrder = await Order.findOneAndUpdate(
    {
      _id: orderId,
      status: "pending",
      inventoryState: "reserved",
    },
    {
      $set: {
        status: "paid",
        inventoryState: "committed",
        paidAt: new Date(),
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    },
  );

  if (updatedOrder) {
    return true;
  }

  // A repeated payment confirmation must
  // not update the order a second time.
  const alreadyCommitted = await Order.exists({
    _id: orderId,
    status: "paid",
    inventoryState: "committed",
  });

  if (alreadyCommitted) {
    return false;
  }

  // Missing, released, or unreserved orders
  // must not be marked paid by this function.
  throw new InventoryOrderError();
};


 // =====================================
 // CONFIRM VERIFIED ORDER PAYMENT
 // =====================================

// IMPORTANT:
// The caller MUST verify payment with Stripe
// before calling this function.
//
// This function does not contact Stripe.
//
// Returns true if newly confirmed.
// Returns false if already confirmed.

export const confirmVerifiedOrderPayment = async (
  orderId: Types.ObjectId,
): Promise<boolean> => {
  const order = await Order.findById(orderId);

  if (!order) {
    throw new InventoryOrderError();
  }

  // Step 1: Already paid.
  // Both new and historical orders are supported.
  if (order.status === "paid") {
    if (
      order.inventoryState === "committed" ||
      order.inventoryState === undefined
    ) {
      return false;
    }

    throw new InventoryOrderError();
  }

  // Step 2: Do not confirm failed or expired orders.
  if (order.status !== "pending") {
    throw new InventoryOrderError();
  }

  // Step 3: New orders have reserved inventory.
  if (order.inventoryState === "reserved") {
    return commitOrderInventory(orderId);
  }

  // Step 4: Reject unexpected inventory states.
  if (order.inventoryState !== undefined) {
    throw new InventoryOrderError();
  }

  // Step 5: Handle older orders created before
  // inventory reservations existed.
  //
  // These orders never deducted stock.
  // Do not deduct stock when confirming them.
  const updatedOrder = await Order.findOneAndUpdate(
    {
      _id: orderId,
      status: "pending",
      inventoryState: {
        $exists: false,
      },
    },
    {
      $set: {
        status: "paid",
        paidAt: new Date(),
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    },
  );

  if (updatedOrder) {
    return true;
  }

  // Step 6: Another request may have confirmed
  // the payment at the same time.
  const latest = await Order.findById(orderId);

  if (
    latest?.status === "paid" &&
    (
      latest.inventoryState === "committed" ||
      latest.inventoryState === undefined
    )
  ) {
    return false;
  }

  throw new InventoryOrderError();
};


 // =====================================
 // FINALIZE VERIFIED UNPAID ORDER
 // =====================================

// Only call this after verifying a trusted
// Stripe failure or expiration event.
//
// Returns true if the order changed.
// Returns false if already finalized.
//
// Historical orders have no inventoryState,
// so they must not receive extra stock.

export const finalizeVerifiedUnpaidOrder = async (
  orderId: Types.ObjectId,
  finalStatus: "failed" | "expired",
): Promise<boolean> => {
  const order = await Order.findById(orderId);

  if (!order) {
    throw new InventoryOrderError();
  }

  // A paid or already-finalized order must
  // not have its status or inventory changed.
  if (order.status !== "pending") {
    return false;
  }

  // New checkout: restore its reserved stock
  // and finalize the order in one transaction.
  if (order.inventoryState === "reserved") {
    try {
      return await releaseOrderInventory(
        orderId,
        finalStatus,
      );
    } catch (error) {
      // Another payment/finalization request
      // may have won the race.
      const latest = await Order.findById(orderId);

      if (latest && latest.status !== "pending") {
        return false;
      }

      throw error;
    }
  }

  // Reject unexpected inventory states.
  if (order.inventoryState !== undefined) {
    throw new InventoryOrderError();
  }

  // Historical checkout: no stock was reserved.
  // Change the order status without adding stock.
  const updatedOrder = await Order.findOneAndUpdate(
    {
      _id: orderId,
      status: "pending",
      inventoryState: { $exists: false },
    },
    {
      $set: {
        status: finalStatus,
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    },
  );

  if (updatedOrder) {
    return true;
  }

  const latest = await Order.findById(orderId);

  if (latest && latest.status !== "pending") {
    return false;
  }

  throw new InventoryOrderError();
};
