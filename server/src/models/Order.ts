import mongoose, { Schema, Types, Document } from "mongoose";

export type OrderStatus = "pending" | "paid" | "failed" | "expired";

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
  stripeSessionId?: string;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

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
    },
    slug: {
      type: String,
      required: true,
    },
    priceCents: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  {
    _id: false,
  },
);

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
    },

    totalCents: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: "usd",
      enum: ["usd"],
    },

    status: {
      type: String,
      enum: ["pending", "paid", "failed", "expired"],
      default: "pending",
      required: true,
    },

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

orderSchema.index({
  user: 1,
  createdAt: -1,
});

const Order = mongoose.model<IOrder>("Order", orderSchema);

export default Order;
