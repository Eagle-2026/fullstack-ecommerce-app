import mongoose, { Schema, Types, Document } from "mongoose";

// ===================================
// ORDER TYPES
// ===================================

export type OrderStatus = "pending" | "paid" | "failed" | "expired";

export type InventoryState = "reserved" | "committed" | "released";

export interface IOrderItem {
  product: Types.ObjectId;
  name: string;
  slug: string;
  priceCents: number;
  quantity: number;
}

export interface IOrder extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  items: IOrderItem[];
  totalCents: number;
  currency: string;
  status: OrderStatus;

  // Optional for older orders.
  inventoryState?: InventoryState;
  inventoryReservedAt?: Date;

  // One unique ID for one checkout attempt.
  // Optional for older orders.
  checkoutAttemptId?: string;

  stripeSessionId?: string;
  paidAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

// ===================================
// ORDER ITEM SCHEMA
// ===================================

const orderItemSchema = new Schema<IOrderItem>(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    slug: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },

    priceCents: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: (value: number) => Number.isSafeInteger(value),
        message: "Price must be a whole number of cents",
      },
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
      max: 20,
      validate: {
        validator: (value: number) => Number.isSafeInteger(value),
        message: "Quantity must be a whole number",
      },
    },
  },
  {
    _id: false,
  },
);

// ===================================
// MAIN ORDER SCHEMA
// ===================================

const orderSchema = new Schema<IOrder>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items: IOrderItem[]) =>
          Array.isArray(items) && items.length >= 1 && items.length <= 20,
        message: "Order must contain 1 to 20 products",
      },
    },

    totalCents: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: (value: number) => Number.isSafeInteger(value),
        message: "Order total must be whole cents",
      },
    },

    currency: {
      type: String,
      default: "usd",
      enum: ["usd"],
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "paid", "failed", "expired"],
      default: "pending",
      required: true,
    },

    // ===================================
    // INVENTORY RESERVATION TRACKING
    // ===================================

    inventoryState: {
      type: String,
      enum: ["reserved", "committed", "released"],
    },

    inventoryReservedAt: {
      type: Date,
    },

    // ===================================
    // CHECKOUT IDEMPOTENCY
    // ===================================

    // Generated as a UUID v4 for one checkout
    // attempt. Old orders do not have this field.
    checkoutAttemptId: {
      type: String,
      trim: true,
      match:
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    },

    // ===================================
    // STRIPE PAYMENT INFORMATION
    // ===================================

    stripeSessionId: {
      type: String,
      unique: true,
      sparse: true,
    },

    paidAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

// ===================================
// DATABASE INDEXES
// ===================================

// Efficient order-history queries.
orderSchema.index({
  user: 1,
  createdAt: -1,
});

// Prevent the same customer from creating
// multiple orders with the same attempt ID.
//
// Partial index:
// Only orders containing checkoutAttemptId
// participate in this uniqueness rule.
//
// Older orders remain compatible.
orderSchema.index(
  {
    user: 1,
    checkoutAttemptId: 1,
  },
  {
    unique: true,
    name: "unique_user_checkout_attempt",
    partialFilterExpression: {
      checkoutAttemptId: {
        $type: "string",
      },
    },
  },
);

// ===================================
// EXPORT MODEL
// ===================================

const Order = mongoose.model<IOrder>("Order", orderSchema);

export default Order;
