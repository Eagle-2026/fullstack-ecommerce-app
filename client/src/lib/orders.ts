import { apiFetch } from "@/lib/api";

// =====================================
// TYPES
// =====================================

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

export type VerifyPaymentResponse = {
  status: string;
  data: {
    orderId: string;
    orderStatus: OrderStatus;
  };
};

// =====================================
// CHECKOUT ATTEMPT TRACKING
// =====================================

const CHECKOUT_STORAGE_KEY = "ecommerce-checkout-attempt-v1";

const ATTEMPT_MAX_AGE_MS = 60 * 60 * 1000;

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CheckoutItemInput = {
  slug: string;
  quantity: number;
};

type StoredCheckoutAttempt = {
  id: string;
  cartSignature: string;
  createdAt: number;

  // The order created by this checkout attempt.
  orderId?: string;
};

let memoryAttempt: StoredCheckoutAttempt | null = null;

// =====================================
// CART SIGNATURE
// =====================================

function getCartSignature(items: CheckoutItemInput[]): string {
  return JSON.stringify(
    [...items].sort((a, b) => a.slug.localeCompare(b.slug)),
  );
}

// =====================================
// READ SAVED ATTEMPT
// =====================================

function readCheckoutAttempt(): StoredCheckoutAttempt | null {
  try {
    const raw = window.localStorage.getItem(CHECKOUT_STORAGE_KEY);

    if (raw) {
      return JSON.parse(raw) as StoredCheckoutAttempt;
    }
  } catch {
    // Browser storage may be unavailable.
  }

  return memoryAttempt;
}

// =====================================
// SAVE CHECKOUT ATTEMPT
// =====================================

function saveCheckoutAttempt(attempt: StoredCheckoutAttempt): void {
  memoryAttempt = attempt;

  try {
    window.localStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify(attempt));
  } catch {
    // Memory fallback remains available.
  }
}

// =====================================
// REMOVE CHECKOUT ATTEMPT
// =====================================

function removeCheckoutAttempt(attemptId: string): void {
  if (memoryAttempt?.id === attemptId) {
    memoryAttempt = null;
  }

  try {
    const raw = window.localStorage.getItem(CHECKOUT_STORAGE_KEY);

    if (!raw) {
      return;
    }

    const stored = JSON.parse(raw) as StoredCheckoutAttempt;

    // Do not delete an unrelated newer attempt.
    if (stored.id === attemptId) {
      window.localStorage.removeItem(CHECKOUT_STORAGE_KEY);
    }
  } catch {
    // Do not interrupt the checkout status page.
  }
}

// =====================================
// GET OR CREATE CHECKOUT ID
// =====================================

function getCheckoutAttemptId(items: CheckoutItemInput[]): string {
  const cartSignature = getCartSignature(items);
  const now = Date.now();

  const saved = readCheckoutAttempt();

  if (saved) {
    const age = now - saved.createdAt;

    if (
      saved.cartSignature === cartSignature &&
      typeof saved.id === "string" &&
      UUID_V4.test(saved.id) &&
      Number.isFinite(age) &&
      age >= 0 &&
      age < ATTEMPT_MAX_AGE_MS
    ) {
      memoryAttempt = saved;
      return saved.id;
    }
  }

  // New cart or expired local attempt.
  const attempt: StoredCheckoutAttempt = {
    id: window.crypto.randomUUID(),
    cartSignature,
    createdAt: now,
  };

  saveCheckoutAttempt(attempt);

  return attempt.id;
}

// =====================================
// START CHECKOUT
// =====================================

export async function startCheckout(
  items: CheckoutItemInput[],
): Promise<CheckoutResponse> {
  const cartSignature = getCartSignature(items);

  const checkoutAttemptId = getCheckoutAttemptId(items);

  const response = await apiFetch<CheckoutResponse>("/orders/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": checkoutAttemptId,
    },
    body: JSON.stringify({ items }),
  });

  // Associate this attempt with its server order.
  // Only update if another tab has not replaced it.
  const saved = readCheckoutAttempt();

  if (
    saved?.id === checkoutAttemptId &&
    saved.cartSignature === cartSignature
  ) {
    saveCheckoutAttempt({
      ...saved,
      orderId: response.data.orderId,
    });
  }

  return response;
}

// =====================================
// FINISH CHECKOUT ATTEMPT
// =====================================

// Called only after the trusted backend reports
// a final order status.
//
// Returns true ONLY when:
// - The order was paid.
// - The saved checkout belongs to that order.
// - The current cart still matches that checkout.
//
// The caller may then safely clear the cart.
export function finishCheckoutAttempt(
  orderId: string,
  orderStatus: OrderStatus,
  currentCart: CheckoutItemInput[],
): boolean {
  if (
    orderStatus !== "paid" &&
    orderStatus !== "failed" &&
    orderStatus !== "expired"
  ) {
    return false;
  }

  const saved = readCheckoutAttempt();

  if (!saved || saved.orderId !== orderId) {
    return false;
  }

  const shouldClearCart =
    orderStatus === "paid" &&
    saved.cartSignature === getCartSignature(currentCart);

  // A final order must not reuse the old ID.
  removeCheckoutAttempt(saved.id);

  return shouldClearCart;
}

// =====================================
// GET MY ORDERS
// =====================================

export async function getMyOrders(): Promise<OrdersResponse> {
  return apiFetch<OrdersResponse>("/orders");
}

// =====================================
// GET ONE OF MY ORDERS
// =====================================

export async function getMyOrderById(orderId: string): Promise<OrderResponse> {
  return apiFetch<OrderResponse>(`/orders/${encodeURIComponent(orderId)}`);
}

// =====================================
// VERIFY MY ORDER PAYMENT
// =====================================

export async function verifyMyOrderPayment(
  orderId: string,
): Promise<VerifyPaymentResponse> {
  return apiFetch<VerifyPaymentResponse>(
    `/orders/${encodeURIComponent(orderId)}/verify-payment`,
    {
      method: "POST",
    },
  );
}
