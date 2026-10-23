"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// The browser key where our shopping cart is saved.
const CART_STORAGE_KEY = "ecommerce-cart-v1";

// Limit each product to 20 units in the demo cart.
export const MAX_CART_QUANTITY = 20;

// One item inside the shopping cart.
export type CartItem = {
  slug: string;
  quantity: number;
};

// Information and functions shared with our components.
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

// Check saved browser data before using it.
function isValidCartItem(value: unknown): value is CartItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const item = value as Partial<CartItem>;

  return (
    typeof item.slug === "string" &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug) &&
    typeof item.quantity === "number" &&
    Number.isSafeInteger(item.quantity) &&
    item.quantity >= 1 &&
    item.quantity <= MAX_CART_QUANTITY
  );
}

// Read previously saved cart items.
function loadSavedCart(): CartItem[] {
  try {
    const savedCart = localStorage.getItem(CART_STORAGE_KEY);

    if (!savedCart) {
      return [];
    }

    const parsed: unknown = JSON.parse(savedCart);

    if (!Array.isArray(parsed)) {
      return [];
    }

    const uniqueItems = new Map<string, CartItem>();

    for (const item of parsed) {
      if (isValidCartItem(item) && !uniqueItems.has(item.slug)) {
        uniqueItems.set(item.slug, {
          slug: item.slug,
          quantity: item.quantity,
        });
      }
    }

    return Array.from(uniqueItems.values());
  } catch {
    return [];
  }
}

type CartProviderProps = {
  children: ReactNode;
};

export function CartProvider({ children }: CartProviderProps) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Read localStorage only after the browser mounts.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setItems(loadSavedCart());
      setIsLoaded(true);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  // Save cart changes after initial loading.
  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // The cart still works during this session
      // even when browser storage is unavailable.
    }
  }, [items, isLoaded]);

  // Add one unit of a product.
  function addItem(slug: string, stock: number) {
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
      !Number.isSafeInteger(stock)
    ) {
      return;
    }

    const maximum = Math.min(stock, MAX_CART_QUANTITY);

    if (maximum < 1) {
      return;
    }

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

      return [
        ...currentItems,
        {
          slug,
          quantity: 1,
        },
      ];
    });
  }

  // Change the quantity of an existing product.
  function updateQuantity(slug: string, quantity: number) {
    if (!Number.isSafeInteger(quantity)) {
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

  // Remove one product completely.
  function removeItem(slug: string) {
    setItems((currentItems) =>
      currentItems.filter((item) => item.slug !== slug),
    );
  }

  // Remove every product from the cart.
  function clearCart() {
    setItems([]);
  }

  // Calculate total number of units in the cart.
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

// Reusable hook for accessing the shopping cart.
export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used inside CartProvider");
  }

  return context;
}
