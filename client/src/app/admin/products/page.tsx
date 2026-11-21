"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { Product } from "@/types/product";

import {
  getAdminProducts,
  createAdminProduct,
  updateAdminProduct,
  deactivateAdminProduct,
} from "@/lib/admin";

type ProductForm = {
  name: string;
  slug: string;
  description: string;
  category: string;
  priceDollars: string;
  stock: string;
  imageUrl: string;
};

const emptyForm: ProductForm = {
  name: "",
  slug: "",
  description: "",
  category: "",
  priceDollars: "",
  stock: "0",
  imageUrl: "",
};

// Convert a dollar amount to whole cents.
function dollarsToCents(value: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new Error("Enter a price such as 19.99");
  }

  const [dollars, fraction = ""] = value.split(".");

  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));

  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new Error("Enter a valid positive price");
  }

  return cents;
}

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AdminProductsPage() {
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const { data, isPending, isError } = useQuery({
    queryKey: ["admin-products", page],
    queryFn: () => getAdminProducts(page),
    retry: false,
  });

  function updateField(field: keyof ProductForm, value: string) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function startEditing(product: Product) {
    setEditingId(product._id);

    setForm({
      name: product.name,
      slug: product.slug,
      description: product.description,
      category: product.category,
      priceDollars: (product.priceCents / 100).toFixed(2),
      stock: String(product.stock),
      imageUrl: product.imageUrl || "",
    });

    setError("");
    setMessage("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const stock = Number(form.stock);

      if (!Number.isSafeInteger(stock) || stock < 0) {
        throw new Error("Stock must be a whole number of zero or more");
      }

      const input = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        description: form.description.trim(),
        category: form.category.trim(),
        priceCents: dollarsToCents(form.priceDollars.trim()),
        stock,
        imageUrl: form.imageUrl.trim(),
      };

      if (editingId) {
        await updateAdminProduct(editingId, input);
        setMessage("Product updated successfully.");
      } else {
        await createAdminProduct(input);
        setMessage("Product created successfully.");
      }

      resetForm();
      setPage(1);

      await queryClient.invalidateQueries({
        queryKey: ["admin-products"],
      });

      await queryClient.invalidateQueries({
        queryKey: ["products"],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save product");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(product: Product) {
    const confirmed = window.confirm(
      product.isActive
        ? `Deactivate ${product.name}?`
        : `Reactivate ${product.name}?`,
    );

    if (!confirmed) return;

    setError("");
    setMessage("");

    try {
      if (product.isActive) {
        await deactivateAdminProduct(product._id);
      } else {
        await updateAdminProduct(product._id, {
          isActive: true,
        });
      }

      await queryClient.invalidateQueries({
        queryKey: ["admin-products"],
      });

      await queryClient.invalidateQueries({
        queryKey: ["products"],
      });

      setMessage("Product availability updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update product");
    }
  }

  const products = data?.data.products ?? [];
  const pagination = data?.data.pagination;

  return (
    <main className="mx-auto max-w-6xl p-6">
      <Link href="/admin" className="text-blue-600">
        Back to Dashboard
      </Link>

      <h1 className="mt-4 text-3xl font-bold">Product Management</h1>

      <p className="mt-2 text-gray-600">
        Add products, edit inventory, and control which products appear in the
        store.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-8 space-y-4 rounded-xl border bg-white p-6 shadow-sm"
      >
        <h2 className="text-xl font-semibold">
          {editingId ? "Edit Product" : "Add Product"}
        </h2>

        <div className="grid gap-4 md:grid-cols-2">
          {(
            [
              ["name", "Product Name"],
              ["slug", "Product Slug"],
              ["category", "Category"],
              ["priceDollars", "Price in USD"],
              ["stock", "Stock Quantity"],
              ["imageUrl", "Product Image Path or HTTPS URL (Optional)"],
            ] as const
          ).map(([field, label]) => (
            <label key={field} className="block text-sm font-medium">
              {label}

              <input
             type={field === "stock" ? "number" : "text"}
                min={field === "stock" ? 0 : undefined}
                step={field === "stock" ? 1 : undefined}
                required={field !== "imageUrl"}
                value={form[field]}
                onChange={(event) => updateField(field, event.target.value)}
                className="mt-2 w-full rounded-lg border p-3"
              />
            </label>
          ))}
        </div>

        <label className="block text-sm font-medium">
          Description
          <textarea
            required
            minLength={10}
            maxLength={2000}
            rows={4}
            value={form.description}
            onChange={(event) => updateField("description", event.target.value)}
            className="mt-2 w-full rounded-lg border p-3"
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-5 py-3 font-medium text-white disabled:opacity-50"
          >
            {saving
              ? "Saving..."
              : editingId
                ? "Save Changes"
                : "Create Product"}
          </button>

          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border px-5 py-3"
            >
              Cancel Edit
            </button>
          )}
        </div>
      </form>

      {message && (
        <p role="status" className="mt-5 text-green-700">
          {message}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-5 text-red-600">
          {error}
        </p>
      )}

      <section className="mt-10">
        <h2 className="text-2xl font-bold">Products</h2>

        {isPending ? (
          <p className="mt-4">Loading products...</p>
        ) : isError ? (
          <p className="mt-4 text-red-600">Unable to load products.</p>
        ) : products.length === 0 ? (
          <p className="mt-4">No products found.</p>
        ) : (
          <div className="mt-5 space-y-4">
            {products.map((product) => (
              <article
                key={product._id}
                className="rounded-xl border bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold">{product.name}</h3>

                    <p className="text-sm text-gray-500">{product.slug}</p>

                    <p className="mt-2">
                      Price: {formatMoney(product.priceCents)}
                    </p>

                    <p>Stock: {product.stock}</p>

                    <p className="mt-2 text-sm">
                      Status: {product.isActive ? "Active" : "Inactive"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => startEditing(product)}
                      className="rounded-lg border px-4 py-2"
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleToggleActive(product)}
                      className="rounded-lg bg-gray-900 px-4 py-2 text-white"
                    >
                      {product.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {pagination && (
          <div className="mt-6 flex items-center gap-4">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((previous) => previous - 1)}
              className="rounded-lg border px-4 py-2 disabled:opacity-40"
            >
              Previous
            </button>

            <span>
              Page {page} of {Math.max(1, pagination.pages)}
            </span>

            <button
              type="button"
              disabled={page >= pagination.pages}
              onClick={() => setPage((previous) => previous + 1)}
              className="rounded-lg border px-4 py-2 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
