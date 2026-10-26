"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { getCurrentUser } from "@/lib/auth";

type AdminLayoutProps = {
  children: ReactNode;
};

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { data: user, isPending } = useQuery({
    queryKey: ["me"],
    queryFn: getCurrentUser,
    staleTime: 0,
    retry: false,
  });

  if (isPending) {
    return (
      <main className="mx-auto max-w-5xl p-8">
        Checking administrator access...
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-5xl p-8">
        <h1 className="text-2xl font-bold">Please log in</h1>

        <Link href="/login" className="mt-4 inline-block text-blue-600">
          Go to Login
        </Link>
      </main>
    );
  }

  if (user.role !== "admin") {
    return (
      <main className="mx-auto max-w-5xl p-8">
        <h1 className="text-2xl font-bold">Access Denied</h1>

        <p className="mt-3">This page is available only to administrators.</p>

        <Link href="/" className="mt-4 inline-block text-blue-600">
          Return to Store
        </Link>
      </main>
    );
  }

  return <>{children}</>;
}
