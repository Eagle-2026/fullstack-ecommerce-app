import { apiFetch } from "@/lib/api";

import type {
  ProductFilters,
  ProductResponse,
  ProductsResponse,
} from "@/types/product";

// Fetch a list of products with optional filters.
export async function getProducts(
  filters: ProductFilters,
): Promise<ProductsResponse> {
  const params = new URLSearchParams();

  params.set("page", String(filters.page));
  params.set("limit", String(filters.limit));
  params.set("sort", filters.sort);

  if (filters.search.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.category) {
    params.set("category", filters.category);
  }

  return apiFetch<ProductsResponse>(`/products?${params.toString()}`);
}

// Fetch one product using its slug.
export async function getProductBySlug(slug: string): Promise<ProductResponse> {
  return apiFetch<ProductResponse>(`/products/${encodeURIComponent(slug)}`);
}
