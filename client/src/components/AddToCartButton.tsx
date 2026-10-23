"use client";

import { useState } from "react";
import Link from "next/link";

import { useCart, MAX_CART_QUANTITY } from "@/context/CartContext";

import type { Product } from "@/types/product";

type AddToCartButtonProps = {
  product: Product;
};

export default function AddToCartButton({ product }: AddToCartButtonProps) {
  const [message, setMessage] = useState("");

  const { items, isLoaded, addItem } = useCart();

  const existingItem = items.find((item) => item.slug === product.slug);

  const quantityInCart = existingItem?.quantity ?? 0;

  const maximum = Math.min(product.stock, MAX_CART_QUANTITY);

  const outOfStock = !product.isActive || maximum <= 0;

  const reachedLimit = !outOfStock && quantityInCart >= maximum;

  const disabled = !isLoaded || outOfStock || reachedLimit;

  function handleAddToCart() {
    if (disabled) {
      return;
    }

    addItem(product.slug, product.stock);

    setMessage(`${product.name} added to cart.`);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleAddToCart}
        disabled={disabled}
        className="w-full rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400"
      >
        {!isLoaded
          ? "Loading Cart..."
          : outOfStock
            ? "Out of Stock"
            : reachedLimit
              ? "Maximum Quantity Reached"
              : "Add to Cart"}
      </button>

      {quantityInCart > 0 && (
        <p className="text-center text-xs text-gray-600">
          {quantityInCart} in your cart
        </p>
      )}

      {message && (
        <p role="status" className="text-center text-xs text-green-700">
          {message}{" "}
          <Link href="/cart" className="font-semibold underline">
            View Cart
          </Link>
        </p>
      )}
    </div>
  );
}
