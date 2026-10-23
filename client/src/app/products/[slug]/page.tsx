"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useQuery } from "@tanstack/react-query";

import ProductImage from "@/components/ProductImage";
import AddToCartButton from "@/components/AddToCartButton";

import { formatPrice } from "@/lib/format";
import { getProductBySlug } from "@/lib/products";

export default function ProductDetailPage() {
  const params = useParams<{ slug: string }>();

  const slug = params.slug;

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["product", slug],

    queryFn: () => getProductBySlug(slug),

    enabled: Boolean(slug),
  });

  // Loading state.
  if (isPending) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-12">
        <p role="status" className="text-gray-600">
          Loading product details...
        </p>
      </main>
    );
  }

  // API error.
  if (isError) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-12">
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-8"
        >
          <h1 className="text-2xl font-bold text-red-700">
            Unable to Load Product
          </h1>

          <p className="mt-3 text-red-600">
            {error instanceof Error
              ? error.message
              : "The product could not be loaded."}
          </p>

          <div className="mt-6 flex flex-wrap gap-4">
            <button
              type="button"
              onClick={() => void refetch()}
              className="rounded-lg bg-red-600 px-5 py-3 font-semibold text-white hover:bg-red-700"
            >
              Try Again
            </button>

            <Link
              href="/"
              className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-semibold text-gray-700"
            >
              Back to Store
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const product = data?.data.product;

  if (!product) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-2xl font-bold text-gray-900">Product Not Found</h1>

        <Link
          href="/"
          className="mt-5 inline-block text-blue-600 hover:underline"
        >
          Back to Store
        </Link>
      </main>
    );
  }

  const inStock = product.stock > 0;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link
        href="/"
        className="mb-8 inline-block text-sm font-medium text-blue-600 hover:underline"
      >
        ← Back to Products
      </Link>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        {/* Product image */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <ProductImage imageUrl={product.imageUrl} name={product.name} />
        </div>

        {/* Product information */}
        <section>
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
            {product.category}
          </p>

          <h1 className="mt-3 text-3xl font-bold text-gray-900 sm:text-4xl">
            {product.name}
          </h1>

          <p className="mt-6 text-3xl font-bold text-gray-900">
            {formatPrice(product.priceCents)}
          </p>

          <div className="mt-5">
            {inStock ? (
              <p className="font-semibold text-green-700">
                In Stock — {product.stock} Available
              </p>
            ) : (
              <p className="font-semibold text-red-600">
                Currently Out of Stock
              </p>
            )}
          </div>

          <div className="mt-8 border-t border-gray-200 pt-6">
            <h2 className="text-xl font-semibold text-gray-900">
              Product Description
            </h2>

            <p className="mt-4 whitespace-pre-line leading-7 text-gray-600">
              {product.description}
            </p>
          </div>

          <div className="mt-8 max-w-sm space-y-4">
            <AddToCartButton product={product} />

            <Link
              href="/cart"
              className="inline-flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-6 py-3 font-semibold text-gray-700 hover:bg-gray-50"
            >
              View Shopping Cart
            </Link>

            <Link
              href="/"
              className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
            >
              Continue Shopping
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
