"use client";

import { useState, type FormEvent } from "react";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import ProductCard from "@/components/ProductCard";
import { getProducts } from "@/lib/products";

import type { ProductSort } from "@/types/product";

const PRODUCTS_PER_PAGE = 4;

export default function HomePage() {
  // Product search
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Product filters
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<ProductSort>("newest");

  // Pagination
  const [page, setPage] = useState(1);

  // Fetch products from our Express backend.
  const {
    data,
    isPending,
    isError,
    error,
    isFetching,
    isPlaceholderData,
    refetch,
  } = useQuery({
    queryKey: [
      "products",
      {
        page,
        limit: PRODUCTS_PER_PAGE,
        search,
        category,
        sort,
      },
    ],

    queryFn: () =>
      getProducts({
        page,
        limit: PRODUCTS_PER_PAGE,
        search,
        category,
        sort,
      }),

    placeholderData: keepPreviousData,
  });

  // Extract product and pagination information.
  const products = data?.data.products ?? [];
  const pagination = data?.data.pagination;

  // Apply the search when the customer submits.
  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSearch(searchInput.trim());
    setPage(1);
  }

  // Clear all filters.
  function handleClearFilters() {
    setSearchInput("");
    setSearch("");
    setCategory("");
    setSort("newest");
    setPage(1);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      {/* Store introduction */}
      <section className="mb-10">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-blue-600">
          Welcome to our store
        </p>

        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Explore Our Products
        </h1>

        <p className="mt-4 max-w-2xl text-gray-600">
          Browse our collection, search for products, and find something you
          love.
        </p>
      </section>

      {/* Search and filters */}
      <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <form
          onSubmit={handleSearch}
          className="mb-5 flex flex-col gap-3 sm:flex-row"
        >
          <label htmlFor="product-search" className="sr-only">
            Search products
          </label>

          <input
            id="product-search"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search products..."
            maxLength={100}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-500"
          />

          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
          >
            Search
          </button>
        </form>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Category */}
          <div>
            <label
              htmlFor="category"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Category
            </label>

            <select
              id="category"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
            >
              <option value="">All Categories</option>

              <option value="Electronics">Electronics</option>

              <option value="Lifestyle">Lifestyle</option>

              <option value="Office">Office</option>
            </select>
          </div>

          {/* Sorting */}
          <div>
            <label
              htmlFor="sort"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Sort By
            </label>

            <select
              id="sort"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as ProductSort);
                setPage(1);
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
            >
              <option value="newest">Newest First</option>

              <option value="price_asc">Price: Low to High</option>

              <option value="price_desc">Price: High to Low</option>

              <option value="name_asc">Name: A to Z</option>
            </select>
          </div>

          {/* Reset */}
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleClearFilters}
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 font-medium text-gray-700 hover:bg-gray-100"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </section>

      {/* Results information */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-gray-900">Available Products</h2>

        {pagination && (
          <p className="text-sm text-gray-600">
            {pagination.total} product(s) found
          </p>
        )}
      </div>

      {/* Background loading */}
      {isFetching && !isPending && (
        <p role="status" className="mb-4 text-sm text-blue-600">
          Updating products...
        </p>
      )}

      {/* Initial loading */}
      {isPending ? (
        <div
          role="status"
          className="rounded-xl bg-white p-10 text-center text-gray-600"
        >
          Loading products...
        </div>
      ) : isError ? (
        /* API error */
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-8 text-center"
        >
          <h3 className="text-lg font-semibold text-red-700">
            Unable to load products
          </h3>

          <p className="mt-2 text-sm text-red-600">
            {error instanceof Error ? error.message : "Something went wrong."}
          </p>

          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-5 rounded-lg bg-red-600 px-5 py-2 text-white hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      ) : products.length === 0 ? (
        /* No products */
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
          <h3 className="text-lg font-semibold text-gray-900">
            No products found
          </h3>

          <p className="mt-2 text-gray-600">
            Try another search or change your filters.
          </p>

          <button
            type="button"
            onClick={handleClearFilters}
            className="mt-5 rounded-lg bg-blue-600 px-5 py-2 text-white hover:bg-blue-700"
          >
            Show All Products
          </button>
        </div>
      ) : (
        /* Product grid */
        <div
          aria-busy={isFetching}
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {products.map((product) => (
            <ProductCard key={product._id} product={product} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!isPending && !isError && pagination && pagination.pages > 1 && (
        <nav
          aria-label="Product pagination"
          className="mt-10 flex items-center justify-center gap-4"
        >
          <button
            type="button"
            disabled={page <= 1 || isPlaceholderData}
            onClick={() =>
              setPage((currentPage) => Math.max(1, currentPage - 1))
            }
            className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>

          <span className="text-sm font-medium text-gray-700">
            Page {page} of {pagination.pages}
          </span>

          <button
            type="button"
            disabled={page >= pagination.pages || isPlaceholderData}
            onClick={() => setPage((currentPage) => currentPage + 1)}
            className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </nav>
      )}
    </main>
  );
}
