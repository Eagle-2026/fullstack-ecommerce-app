import type { Request, Response } from "express";
import type { QueryFilter } from "mongoose";
import { z } from "zod";

import User from "../models/User";
import Product from "../models/Product";
import Order, { type IOrder } from "../models/Order";

// Validate the filters used to list admin orders.
const adminOrdersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),

    limit: z.coerce.number().int().min(1).max(20).default(10),

    status: z.enum(["pending", "paid", "failed", "expired"]).optional(),
  })
  .strict();

// =====================================
// GET ADMIN DASHBOARD SUMMARY
// =====================================

export const getAdminSummary = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  const [
    totalCustomers,
    totalProducts,
    activeProducts,
    lowStockProducts,
    totalOrders,
    paidOrders,
    pendingOrders,
    paidTotals,
  ] = await Promise.all([
    User.countDocuments({ role: "customer" }),

    Product.countDocuments(),

    Product.countDocuments({
      isActive: true,
    }),

    Product.countDocuments({
      isActive: true,
      stock: { $lte: 5 },
    }),

    Order.countDocuments(),

    Order.countDocuments({
      status: "paid",
    }),

    Order.countDocuments({
      status: "pending",
    }),

    Order.aggregate<{ totalCents: number }>([
      {
        $match: {
          status: "paid",
        },
      },
      {
        $group: {
          _id: null,
          totalCents: { $sum: "$totalCents" },
        },
      },
    ]),
  ]);

  res.status(200).json({
    status: "success",
    data: {
      summary: {
        totalCustomers,
        totalProducts,
        activeProducts,
        lowStockProducts,
        totalOrders,
        paidOrders,
        pendingOrders,
        paidTotalCents: paidTotals[0]?.totalCents ?? 0,
      },
    },
  });
};

// =====================================
// GET CUSTOMER ORDERS FOR ADMIN
// =====================================

export const getAdminOrders = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const result = adminOrdersQuerySchema.safeParse(req.query);

  if (!result.success) {
    res.status(400).json({
      message: "Invalid order filters",
    });
    return;
  }

  const { page, limit, status } = result.data;

  const filter: QueryFilter<IOrder> = {};

  if (status) {
    filter.status = status;
  }

  const skip = (page - 1) * limit;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .select("user items totalCents currency status paidAt createdAt")
      .populate("user", "name email")
      .sort({
        createdAt: -1,
        _id: -1,
      })
      .skip(skip)
      .limit(limit)
      .lean(),

    Order.countDocuments(filter),
  ]);

  res.status(200).json({
    status: "success",
    data: {
      orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
};
