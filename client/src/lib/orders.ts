import { apiFetch } from "@/lib/api";

export type OrderStatus = "pending" | "paid" | "failed" | "expired";

export type OrderItem = {
  product: string;
  name: string;
  slug: string;
  priceCents: number;
  quantity: number;
};

export type CustomerOrder = {
  _id: string;
  items: OrderItem[];
  totalCents: number;
  currency: string;
  status: OrderStatus;
  createdAt: string;
  paidAt?: string;
};

export type CheckoutResponse = {
  status: string;
  data: {
    orderId: string;
    checkoutUrl: string;
  };
};

export type OrdersResponse = {
  status: string;
  data: {
    orders: CustomerOrder[];
  };
};

export type OrderResponse = {
  status: string;
  data: {
    order: CustomerOrder;
  };
};

export async function startCheckout(
  items: { slug: string; quantity: number }[],
): Promise<CheckoutResponse> {
  return apiFetch<CheckoutResponse>("/orders/checkout", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

export async function getMyOrders(): Promise<OrdersResponse> {
  return apiFetch<OrdersResponse>("/orders");
}

export async function getMyOrderById(orderId: string): Promise<OrderResponse> {
  return apiFetch<OrderResponse>(`/orders/${encodeURIComponent(orderId)}`);
}
