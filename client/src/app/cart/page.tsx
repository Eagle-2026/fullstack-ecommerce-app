"use client";

import Link from "next/link";

import { useQueries } from "@tanstack/react-query";

import { useCart, MAX_CART_QUANTITY } from "@/context/CartContext";

import ProductImage from "@/components/ProductImage";

import { formatPrice } from "@/lib/format";
import { getProductBySlug } from "@/lib/products";

export default function CartPage() {
  const { items, isLoaded, itemCount, updateQuantity, removeItem, clearCart } =
    useCart();

  // Get fresh product details from our existing API.
  const productQueries = useQueries({
    queries: items.map((item) => ({
      queryKey: ["product", item.slug],
      queryFn: () => getProductBySlug(item.slug),
      staleTime: 0,
      retry: 1,
    })),
  });

  // Are any product requests still running?
  const isCheckingProducts = productQueries.some((query) => query.isFetching);

  // Check whether all product details loaded.
  const allProductsLoaded = productQueries.every(
    (query) => query.isSuccess && Boolean(query.data?.data.product),
  );

  // We only show the full subtotal when
  // all product details have been checked.
  const canCalculateSubtotal = allProductsLoaded && !isCheckingProducts;

  // Calculate subtotal using product prices from API.
  const subtotalCents = items.reduce((total, item, index) => {
    const product = productQueries[index]?.data?.data.product;

    if (!product) {
      return total;
    }

    return total + product.priceCents * item.quantity;
  }, 0);

  // Check whether any cart quantity exceeds stock.
  const hasStockProblem = items.some((item, index) => {
    const product = productQueries[index]?.data?.data.product;

    if (!product) {
      return false;
    }

    return (
      !product.isActive ||
      product.stock < item.quantity ||
      item.quantity > MAX_CART_QUANTITY
    );
  });

  function handleClearCart() {
    const confirmed = window.confirm(
      "Are you sure you want to clear your cart?",
    );

    if (confirmed) {
      clearCart();
    }
  }

  // Wait until saved browser data has loaded.
  if (!isLoaded) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-12">
        <p role="status" className="text-gray-600">
          Loading your shopping cart...
        </p>
      </main>
    );
  }

  // Empty cart.
  if (items.length === 0) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold text-gray-900">Your Shopping Cart</h1>

        <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <h2 className="text-2xl font-semibold text-gray-900">
            Your cart is empty
          </h2>

          <p className="mt-3 text-gray-600">
            You haven&apos;t added any products yet.
          </p>

          <Link
            href="/"
            className="mt-6 inline-flex rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
          >
            Start Shopping
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Your Shopping Cart
          </h1>

          <p className="mt-2 text-gray-600">{itemCount} item(s) in your cart</p>
        </div>

        <button
          type="button"
          onClick={handleClearCart}
          className="rounded-lg border border-red-300 px-4 py-2 font-semibold text-red-700 hover:bg-red-50"
        >
          Clear Cart
        </button>
      </div>

      {isCheckingProducts && (
        <p
          role="status"
          className="mb-5 rounded-lg bg-blue-50 p-4 text-sm text-blue-700"
        >
          Checking current product prices and stock...
        </p>
      )}

      {hasStockProblem && (
        <p
          role="alert"
          className="mb-5 rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900"
        >
          Some product quantities exceed available stock. Please adjust your
          cart before checkout.
        </p>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Cart items */}
        <section className="space-y-4 lg:col-span-2">
          {items.map((item, index) => {
            const query = productQueries[index];

            const product = query?.data?.data.product;

            const maximum = product
              ? Math.min(product.stock, MAX_CART_QUANTITY)
              : 0;

            const quantityTooHigh = Boolean(product) && item.quantity > maximum;

            const productUnavailable =
              Boolean(product) && (!product?.isActive || product?.stock === 0);

            return (
              <article
                key={item.slug}
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-5 sm:flex-row">
                  {/* Product image */}
                  <div className="w-full overflow-hidden rounded-xl sm:w-40 sm:shrink-0">
                    {product ? (
                      <ProductImage
                        imageUrl={product.imageUrl}
                        name={product.name}
                      />
                    ) : (
                      <div className="flex aspect-4/3 items-center justify-center bg-gray-100 p-4 text-center text-sm text-gray-500">
                        Image unavailable
                      </div>
                    )}
                  </div>

                  {/* Product details */}
                  <div className="min-w-0 flex-1">
                    {product ? (
                      <>
                        <Link
                          href={`/products/${encodeURIComponent(product.slug)}`}
                          className="text-lg font-bold text-gray-900 hover:text-blue-600"
                        >
                          {product.name}
                        </Link>

                        <p className="mt-1 text-sm text-gray-500">
                          {product.category}
                        </p>

                        <p className="mt-3 font-bold text-gray-900">
                          {formatPrice(product.priceCents)}
                        </p>

                        <p className="mt-2 text-sm text-gray-600">
                          {product.stock} in stock
                        </p>
                      </>
                    ) : (
                      <>
                        <h2 className="text-lg font-semibold text-gray-900">
                          {item.slug}
                        </h2>

                        <p className="mt-2 text-sm text-gray-600">
                          {query?.isPending
                            ? "Loading product..."
                            : "Product unavailable or could not be loaded."}
                        </p>
                      </>
                    )}

                    {/* Quantity controls */}
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <div className="flex items-center overflow-hidden rounded-lg border border-gray-300">
                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(item.slug, item.quantity - 1)
                          }
                          disabled={item.quantity <= 1}
                          aria-label={`Decrease quantity for ${product?.name ?? item.slug}`}
                          className="px-4 py-2 font-bold text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300"
                        >
                          -
                        </button>

                        <span className="min-w-10 px-3 text-center font-semibold text-gray-900">
                          {item.quantity}
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(item.slug, item.quantity + 1)
                          }
                          disabled={
                            !product ||
                            query.isFetching ||
                            item.quantity >= maximum
                          }
                          aria-label={`Increase quantity for ${product?.name ?? item.slug}`}
                          className="px-4 py-2 font-bold text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300"
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeItem(item.slug)}
                        className="text-sm font-semibold text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </div>

                    {productUnavailable && (
                      <p className="mt-3 text-sm font-semibold text-red-700">
                        This product is currently unavailable. Please remove it
                        from your cart.
                      </p>
                    )}

                    {quantityTooHigh && maximum > 0 && (
                      <div className="mt-3 space-y-2">
                        <p className="text-sm text-red-700">
                          Your quantity is higher than the available limit.
                        </p>

                        <button
                          type="button"
                          onClick={() => updateQuantity(item.slug, maximum)}
                          className="text-sm font-semibold text-blue-600 underline"
                        >
                          Adjust quantity to {maximum}
                        </button>
                      </div>
                    )}

                    {product && (
                      <p className="mt-4 text-sm font-semibold text-gray-900">
                        Line Total:{" "}
                        {formatPrice(product.priceCents * item.quantity)}
                      </p>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        {/* Order summary */}
        <aside className="h-fit rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">Order Summary</h2>

          <div className="mt-6 flex items-center justify-between border-b border-gray-200 pb-5">
            <span className="text-gray-600">Items ({itemCount})</span>

            <span className="text-lg font-bold text-gray-900">
              {canCalculateSubtotal
                ? formatPrice(subtotalCents)
                : "Calculating..."}
            </span>
          </div>

          <div className="mt-5 flex items-center justify-between">
            <span className="text-lg font-semibold text-gray-900">
              Subtotal
            </span>

            <span className="text-2xl font-bold text-gray-900">
              {canCalculateSubtotal
                ? formatPrice(subtotalCents)
                : "Unavailable"}
            </span>
          </div>

          <p className="mt-4 text-sm leading-6 text-gray-500">
            This is an estimated subtotal based on product information from the
            API. Shipping and taxes are not included.
          </p>

          <button
            type="button"
            disabled
            className="mt-6 w-full cursor-not-allowed rounded-lg bg-gray-400 px-6 py-3 font-semibold text-white"
          >
            Checkout — Available on Day 6
          </button>

          <Link
            href="/"
            className="mt-4 inline-flex w-full items-center justify-center rounded-lg border border-gray-300 px-5 py-3 font-semibold text-gray-700 hover:bg-gray-50"
          >
            Continue Shopping
          </Link>

          <p className="mt-5 text-xs leading-5 text-gray-500">
            Prices and stock will be verified by the backend again before
            payment.
          </p>
        </aside>
      </div>
    </main>
  );
}
