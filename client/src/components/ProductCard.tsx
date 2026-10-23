import Link from "next/link";

import ProductImage from "@/components/ProductImage";
import AddToCartButton from "@/components/AddToCartButton";

import { formatPrice } from "@/lib/format";

import type { Product } from "@/types/product";

type ProductCardProps = {
  product: Product;
};

export default function ProductCard({ product }: ProductCardProps) {
  const inStock = product.stock > 0;

  return (
    <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <Link
        href={`/products/${encodeURIComponent(product.slug)}`}
        className="block"
      >
        <ProductImage imageUrl={product.imageUrl} name={product.name} />
      </Link>

      <div className="space-y-3 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
          {product.category}
        </p>

        <h2 className="text-lg font-semibold text-gray-900">
          <Link
            href={`/products/${encodeURIComponent(product.slug)}`}
            className="hover:text-blue-600"
          >
            {product.name}
          </Link>
        </h2>

        <p className="text-2xl font-bold text-gray-900">
          {formatPrice(product.priceCents)}
        </p>

        {inStock ? (
          <p className="text-sm font-medium text-green-700">
            In stock ({product.stock} available)
          </p>
        ) : (
          <p className="text-sm font-medium text-red-600">Out of stock</p>
        )}

        <div className="space-y-3 pt-2">
          <AddToCartButton product={product} />

          <Link
            href={`/products/${encodeURIComponent(product.slug)}`}
            className="inline-flex w-full items-center justify-center rounded-lg border border-blue-600 px-4 py-3 text-sm font-semibold text-blue-600 hover:bg-blue-50"
          >
            View Details
          </Link>
        </div>
      </div>
    </article>
  );
}
