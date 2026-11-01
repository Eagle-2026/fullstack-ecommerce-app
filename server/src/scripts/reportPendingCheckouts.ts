import "dotenv/config";
import mongoose from "mongoose";
import { setServers } from "node:dns";

import Order from "../models/Order";
import { connectDB } from "../config/db";

// =====================================
// READ-ONLY PENDING CHECKOUT REPORT
// =====================================

// This script only reads MongoDB data.
// It does not change orders or inventory.

const ONE_HOUR_MS = 60 * 60 * 1000;

async function main(): Promise<void> {
  // Use public DNS servers for this script only.
  // Fixes the local MongoDB Atlas SRV lookup problem.
  setServers(["1.1.1.1", "8.8.8.8"]);

  // Step 1: Connect to the E-commerce database.
  await connectDB();

  if (mongoose.connection.name !== "ecommerce") {
    throw new Error(
      "Expected the ecommerce database",
    );
  }

  // Step 2: Count all pending orders.
  const totalPending = await Order.countDocuments({
    status: "pending",
  });

  // Step 3: Read up to 100 pending orders.
  // Do not display customer passwords,
  // emails, cookies, or payment secrets.
  const orders = await Order.find({
    status: "pending",
  })
    .sort({ _id: 1 })
    .limit(100)
    .select(
      "_id status inventoryState inventoryReservedAt stripeSessionId",
    )
    .lean();

  console.log("\n=== PENDING CHECKOUT REPORT ===");
  console.log("Database: ecommerce");
  console.log("Total pending orders:", totalPending);
  console.log("Mode: READ ONLY\n");

  // Step 4: Identify orders needing review.
  for (const order of orders) {
    const reservedAt =
      order.inventoryReservedAt instanceof Date
        ? order.inventoryReservedAt
        : order._id.getTimestamp();

    const ageMs = Date.now() - reservedAt.getTime();
    const ageMinutes = Math.max(
      0,
      Math.floor(ageMs / 60000),
    );

    let result: string;

    if (order.inventoryState === "reserved") {
      if (!order.stripeSessionId) {
        result = "REVIEW: Missing Stripe Session ID";
      } else if (ageMs >= ONE_HOUR_MS) {
        result = "REVIEW: Old reservation, check Stripe";
      } else {
        result = "WAITING: Checkout or payment";
      }
    } else if (order.inventoryState === undefined) {
      result = "LEGACY: No stock reservation";
    } else {
      result = "REVIEW: Unexpected inventory state";
    }

    console.log("------------------------------");
    console.log("Order:", order._id.toString());
    console.log("Age (minutes):", ageMinutes);
    console.log("Inventory:", order.inventoryState ?? "none");
    console.log("Stripe ID saved:", Boolean(order.stripeSessionId));
    console.log("Result:", result);
  }

  if (totalPending > orders.length) {
    console.log(
      `\n${totalPending - orders.length} additional pending orders not displayed.`,
    );
  }

  console.log("\nReport complete.");
  console.log("No database records were changed.");
}

main()
  .catch((error: unknown) => {
    console.error("Report failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
