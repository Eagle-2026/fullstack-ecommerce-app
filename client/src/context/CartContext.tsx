"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// =====================================
// CART SETTINGS
// =====================================

// Store only product slugs and quantities.
// Never store passwords, JWTs, or payment data.
const CART_STORAGE_KEY = "ecommerce-cart-v1";

// Maximum quantity for one product.
export const MAX_CART_QUANTITY = 20;

// Maximum different products in one cart.
export const MAX_CART_ITEMS = 20;
// Limit the size of saved browser data.
const MAX_STORAGE_LENGTH = 50000;

// Match safe product slugs.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const MAX_SLUG_LENGTH = 120;

// =====================================
// CART TYPES
// =====================================

export type CartItem = {
  slug: string;
  quantity: number;
};

type CartContextType = {
  items: CartItem[];
  isLoaded: boolean;
  itemCount: number;

  addItem: (slug: string, stock: number) => void;
  updateQuantity: (slug: string, quantity: number) => void;
  removeItem: (slug: string) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

// =====================================
// VALIDATE PRODUCT SLUG
// =====================================

function isValidSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_SLUG_LENGTH &&
    SLUG_PATTERN.test(value)
  );
}

// =====================================
// VALIDATE SAVED CART ITEM
// =====================================

function isValidCartItem(value: unknown): value is CartItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const item = value as Record<string, unknown>;

  return (
    isValidSlug(item.slug) &&
    typeof item.quantity === "number" &&
    Number.isSafeInteger(item.quantity) &&
    item.quantity >= 1 &&
    item.quantity <= MAX_CART_QUANTITY
  );
}

// =====================================
// PARSE SAVED CART SAFELY
// =====================================

function parseSavedCart(savedCart: string | null): CartItem[] {
  if (!savedCart || savedCart.length > MAX_STORAGE_LENGTH) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(savedCart);

    if (!Array.isArray(parsed)) {
      return [];
    }

    const uniqueItems = new Map<string, CartItem>();

    for (const item of parsed) {
      if (!isValidCartItem(item)) {
        continue;
      }

      // Avoid duplicate product entries.
      if (uniqueItems.has(item.slug)) {
        continue;
      }

      uniqueItems.set(item.slug, {
        slug: item.slug,
        quantity: item.quantity,
      });

      // Prevent an oversized cart.
      if (uniqueItems.size >= MAX_CART_ITEMS) {
        break;
      }
    }

    return Array.from(uniqueItems.values());
  } catch {
    return [];
  }
}

// =====================================
// LOAD CART FROM BROWSER
// =====================================

function loadSavedCart(): CartItem[] {
  try {
    return parseSavedCart(localStorage.getItem(CART_STORAGE_KEY));
  } catch {
    return [];
  }
}

// =====================================
// CART PROVIDER
// =====================================

type CartProviderProps = {
  children: ReactNode;
};

export function CartProvider({ children }: CartProviderProps) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // =====================================
  // LOAD CART AFTER MOUNTING
  // =====================================

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setItems(loadSavedCart());
      setIsLoaded(true);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  // =====================================
  // SAVE CART CHANGES
  // =====================================

  useEffect(() => {
    if (!isLoaded) return;

    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Cart remains usable in React state.
    }
  }, [items, isLoaded]);

  // =====================================
  // SYNC CART BETWEEN BROWSER TABS
  // =====================================

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.storageArea !== window.localStorage) {
        return;
      }

      if (event.key === CART_STORAGE_KEY || event.key === null) {
        setItems(parseSavedCart(event.newValue));
      }
    }

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  // =====================================
  // ADD PRODUCT TO CART
  // =====================================

  function addItem(slug: string, stock: number) {
    if (!isValidSlug(slug) || !Number.isSafeInteger(stock) || stock < 1) {
      return;
    }

    const maximum = Math.min(stock, MAX_CART_QUANTITY);

    setItems((currentItems) => {
      const existingItem = currentItems.find((item) => item.slug === slug);

      if (existingItem) {
        return currentItems.map((item) =>
          item.slug === slug
            ? {
                ...item,
                quantity: Math.min(item.quantity + 1, maximum),
              }
            : item,
        );
      }

      // Reject additional different products
      // when the cart reaches its limit.
      if (currentItems.length >= MAX_CART_ITEMS) {
        return currentItems;
      }

      return [
        ...currentItems,
        {
          slug,
          quantity: 1,
        },
      ];
    });
  }

  // =====================================
  // UPDATE PRODUCT QUANTITY
  // =====================================

  function updateQuantity(slug: string, quantity: number) {
    if (!isValidSlug(slug) || !Number.isSafeInteger(quantity)) {
      return;
    }

    if (quantity <= 0) {
      removeItem(slug);
      return;
    }

    setItems((currentItems) =>
      currentItems.map((item) =>
        item.slug === slug
          ? {
              ...item,
              quantity: Math.min(quantity, MAX_CART_QUANTITY),
            }
          : item,
      ),
    );
  }

  // =====================================
  // REMOVE ONE PRODUCT
  // =====================================

  function removeItem(slug: string) {
    if (!isValidSlug(slug)) {
      return;
    }

    setItems((currentItems) =>
      currentItems.filter((item) => item.slug !== slug),
    );
  }

  // =====================================
  // CLEAR ENTIRE CART
  // =====================================

  const clearCart = useCallback(() => {
    // Clear React state.
    setItems([]);

    // Also remove the persisted browser copy.
    try {
      localStorage.removeItem(CART_STORAGE_KEY);
    } catch {
      // React state is still cleared.
    }
  }, []);

  // =====================================
  // TOTAL NUMBER OF ITEMS
  // =====================================

  const itemCount = items.reduce((total, item) => total + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        isLoaded,
        itemCount,
        addItem,
        updateQuantity,
        removeItem,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

// =====================================
// REUSABLE CART HOOK
// =====================================

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used inside CartProvider");
  }

  return context;
}
