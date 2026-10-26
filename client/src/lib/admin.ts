import { apiFetch } from "@/lib/api";

import type { Product, ProductsResponse } from "@/types/product";

import type { OrderStatus } from "@/lib/orders";

export type AdminSummary = {
  totalCustomers: number;
  totalProducts: number;
  activeProducts: number;
  lowStockProducts: number;
  totalOrders: number;
  paidOrders: number;
  pendingOrders: number;
  paidTotalCents: number;
};

export type AdminOrder = {
  _id: string;
  user: {
    _id: string;
    name: string;
    email: string;
  } | null;
  items: {
    product: string;
    name: string;
    slug: string;
    priceCents: number;
    quantity: number;
  }[];
  totalCents: number;
  currency: string;
  status: OrderStatus;
  createdAt: string;
  paidAt?: string;
};

export type AdminOrderFilter = OrderStatus | "all";

export type AdminProductInput = Pick<
  Product,
  | "name"
  | "slug"
  | "description"
  | "priceCents"
  | "category"
  | "imageUrl"
  | "stock"
>;

type Pagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

type SummaryResponse = {
  status: string;
  data: {
    summary: AdminSummary;
  };
};

type AdminOrdersResponse = {
  status: string;
  data: {
    orders: AdminOrder[];
    pagination: Pagination;
  };
};

type ProductMutationResponse = {
  status: string;
  message: string;
  data: {
    product: Product;
  };
};

// Dashboard statistics
export function getAdminSummary() {
  return apiFetch<SummaryResponse>("/admin/summary");
}

// All orders, with optional payment-status filter
export function getAdminOrders(page: number, status: AdminOrderFilter) {
  const params = new URLSearchParams({
    page: String(page),
    limit: "10",
  });

  if (status !== "all") {
    params.set("status", status);
  }

  return apiFetch<AdminOrdersResponse>(`/admin/orders?${params.toString()}`);
}

// Existing Day 3 admin product API
export function getAdminProducts(page: number) {
  return apiFetch<ProductsResponse>(
    `/products/admin/all?page=${page}&limit=10&sort=newest`,
  );
}

// Create a product
export function createAdminProduct(input: AdminProductInput) {
  return apiFetch<ProductMutationResponse>("/products", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Update product details or active status
export function updateAdminProduct(
  id: string,
  changes: Partial<AdminProductInput> & {
    isActive?: boolean;
  },
) {
  return apiFetch<ProductMutationResponse>(
    `/products/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(changes),
    },
  );
}

// Deactivate a product without removing its history
export function deactivateAdminProduct(id: string) {
  return apiFetch<ProductMutationResponse>(
    `/products/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );
}
