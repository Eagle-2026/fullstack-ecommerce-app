export type Product = {
  _id: string;
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  category: string;
  imageUrl: string;
  stock: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductSort = "newest" | "price_asc" | "price_desc" | "name_asc";

export type ProductFilters = {
  page: number;
  limit: number;
  search: string;
  category: string;
  sort: ProductSort;
};

export type ProductPagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

export type ProductsResponse = {
  status: string;
  data: {
    products: Product[];
    pagination: ProductPagination;
  };
};

export type ProductResponse = {
  status: string;
  data: {
    product: Product;
  };
};
