import mongoose, { Schema, Types, Document } from "mongoose";

export interface IProduct extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  category: string;
  imageUrl: string;
  stock: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<IProduct>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },

    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 2000,
    },

    priceCents: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: "Price must be a whole number of cents",
      },
    },

    category: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60,
    },

    imageUrl: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
      validate: {
        validator: (value: string) => {
          if (value === "") return true;

          // Allow local images from public/productsImages.
          const isLocalImage =
            /^\/productsImages\/[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$/i.test(
              value,
            );

          if (isLocalImage) return true;

          // Also allow secure HTTPS image URLs.
          try {
            return new URL(value).protocol === "https:";
          } catch {
            return false;
          }
        },
        message: "Use an HTTPS URL or a valid local product image path",
      },
    },

    stock: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "Stock must be a whole number",
      },
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// Support common product filters.
productSchema.index({
  isActive: 1,
  category: 1,
});

const Product = mongoose.model<IProduct>("Product", productSchema);

export default Product;
