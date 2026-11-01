"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useCart } from "@/context/CartContext";
import { apiFetch, ApiRequestError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

// =====================================
// SIMPLE DASHBOARD ICONS
// No additional package is required.
// =====================================

type IconName =
  | "user"
  | "orders"
  | "cart"
  | "home"
  | "shield"
  | "key"
  | "logout"
  | "arrow";

const iconPaths: Record<IconName, string> = {
  user: "M20 21a8 8 0 0 0-16 0m8-10a4 4 0 1 0 0-8a4 4 0 0 0 0 8",

  orders: "M6 7h12l1 14H5L6 7Zm3 0V6a3 3 0 0 1 6 0v1",

  cart: "M3 3h2l2 12h11l2-8H6m2 13h.01M18 20h.01",

  home: "M3 10.5 12 3l9 7.5V21H3V10.5Zm6 10V13h6v7",

  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Zm-4-10 3 3 5-6",

  key: "M14 7a5 5 0 1 1-4.8 6.4L3 20v-4l6.2-6.2A5 5 0 0 1 14 7Z",

  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9",

  arrow: "M5 12h14m-6-6 6 6-6 6",
};

function DashboardIcon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}

// =====================================
// REUSABLE QUICK ACTION CARD
// =====================================

function QuickAction({
  href,
  title,
  description,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: IconName;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <DashboardIcon name={icon} />
        </div>

        <span className="text-slate-400 transition group-hover:translate-x-1 group-hover:text-blue-600">
          <DashboardIcon name="arrow" size={19} />
        </span>
      </div>

      <h3 className="mt-5 text-base font-bold text-slate-900">{title}</h3>

      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
    </Link>
  );
}

// =====================================
// ACCOUNT PAGE
// =====================================

export default function AccountPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { clearCart } = useCart();

  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  // Prevent the unauthenticated redirect from
  // competing with the Shop redirect after logout.
  const leavingAfterLogout = useRef(false);

  // =====================================
  // LOAD CURRENT CUSTOMER
  // =====================================

  const {
    data: customer,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["me"],
    queryFn: getCurrentUser,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });

  // =====================================
  // PROTECT ACCOUNT PAGE
  // =====================================

  useEffect(() => {
    // A real 401 is handled by getCurrentUser,
    // which returns null.
    //
    // Do not redirect for server/network errors.
    if (
      !isPending &&
      !isError &&
      customer === null &&
      !loggingOut &&
      !leavingAfterLogout.current
    ) {
      router.replace("/login");
    }
  }, [customer, isPending, isError, loggingOut, router]);

  // =====================================
  // SECURE LOGOUT
  // =====================================

  async function handleLogout() {
    if (loggingOut) return;

    setLogoutError("");
    setLoggingOut(true);

    try {
      // Step 1: Revoke the session in the backend.
      try {
        await apiFetch("/auth/logout", {
          method: "POST",
        });
      } catch (error) {
        // A 401 means this session is already
        // unauthenticated. Continue local cleanup.
        if (!(error instanceof ApiRequestError && error.status === 401)) {
          throw error;
        }
      }

      // Step 2: Stop old customer requests.
      await queryClient.cancelQueries();

      // Step 3: Clear cart and browser storage.
      clearCart();

      // Step 4: Remove cached customer data.
      leavingAfterLogout.current = true;

      queryClient.clear();
      queryClient.setQueryData(["me"], null);

      // Step 5: Return to the Shop homepage.
      router.replace("/");
    } catch {
      setLogoutError("Unable to log out. Please try again.");

      // Check whether the login is still valid.
      void queryClient.invalidateQueries({
        queryKey: ["me"],
      });
    } finally {
      setLoggingOut(false);
    }
  }

  // =====================================
  // LOADING STATE
  // =====================================

  if (isPending) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-16">
        <div
          role="status"
          className="mx-auto max-w-6xl rounded-2xl border border-slate-200 bg-white p-10 text-slate-600"
        >
          Checking your account...
        </div>
      </main>
    );
  }

  // =====================================
  // BACKEND / NETWORK ERROR
  // =====================================

  if (isError) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-16">
        <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">
            Account temporarily unavailable
          </h1>

          <p className="mt-3 text-slate-600">
            We could not load your account. Please check your connection and try
            again.
          </p>

          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-6 rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </main>
    );
  }

  // =====================================
  // NOT LOGGED IN
  // =====================================

  if (!customer) {
    return (
      <main
        role="status"
        className="min-h-screen bg-slate-50 p-10 text-slate-600"
      >
        Redirecting to login...
      </main>
    );
  }

  // =====================================
  // DISPLAY CUSTOMER INFORMATION
  // =====================================

  const displayName = customer.name.trim() || "Customer";

  const firstName = displayName.split(/\s+/)[0];

  const initial = displayName.charAt(0).toUpperCase();

  const accountRole = customer.role === "admin" ? "Administrator" : "Customer";

  // =====================================
  // PROFESSIONAL ACCOUNT DASHBOARD
  // =====================================

  return (
    <main className="min-h-screen bg-slate-50 pb-16">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* PAGE INTRODUCTION */}
        <div className="mb-7">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">
            Customer Dashboard
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            My Account
          </h1>

          <p className="mt-2 text-slate-500">
            View your account details and manage your shopping experience.
          </p>
        </div>

        {/* WELCOME BANNER */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-lg sm:p-9">
          <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-5">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/15 text-3xl font-bold sm:h-20 sm:w-20">
                {initial}
              </div>

              <div className="min-w-0">
                <p className="text-sm text-blue-200">Welcome back</p>

                <h2 className="mt-1 break-words text-2xl font-bold sm:text-3xl">
                  Hello, {firstName}!
                </h2>

                <p className="mt-2 break-all text-sm text-slate-300">
                  {customer.email}
                </p>
              </div>
            </div>

            <div className="self-start rounded-xl border border-white/15 bg-white/10 px-5 py-3 sm:self-auto">
              <p className="text-xs uppercase tracking-wider text-slate-300">
                Account Type
              </p>

              <p className="mt-1 font-semibold">{accountRole}</p>
            </div>
          </div>
        </section>

        {/* QUICK ACTIONS */}
        <section className="mt-9">
          <div className="mb-5">
            <h2 className="text-xl font-bold text-slate-900">Quick Actions</h2>

            <p className="mt-1 text-sm text-slate-500">
              Go directly to the sections you use most.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <QuickAction
              href="/orders"
              title="My Orders"
              description="Review purchases and check your order status."
              icon="orders"
            />

            <QuickAction
              href="/cart"
              title="Shopping Cart"
              description="Review your products before checkout."
              icon="cart"
            />

            <QuickAction
              href="/"
              title="Continue Shopping"
              description="Browse products and discover new items."
              icon="home"
            />

            <QuickAction
              href="/forgot-password"
              title="Password Security"
              description="Request a password reset email."
              icon="key"
            />
          </div>
        </section>

        {/* ACCOUNT DETAILS AND SECURITY */}
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* PERSONAL INFORMATION */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7 lg:col-span-2">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <DashboardIcon name="user" />
              </div>

              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Personal Information
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Your current account details
                </p>
              </div>
            </div>

            <div className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Full Name
                </p>

                <p className="mt-2 break-words font-semibold text-slate-900">
                  {displayName}
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Email Address
                </p>

                <p className="mt-2 break-all font-semibold text-slate-900">
                  {customer.email}
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Account Role
                </p>

                <p className="mt-2 font-semibold text-slate-900">
                  {accountRole}
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Store Currency
                </p>

                <p className="mt-2 font-semibold text-slate-900">
                  USD — US Dollar
                </p>
              </div>
            </div>

            <p className="mt-6 text-sm leading-6 text-slate-500">
              Your account information comes from your authenticated customer
              profile. Passwords and authentication tokens are never displayed
              here.
            </p>
          </section>

          {/* SECURITY AND LOGOUT */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <DashboardIcon name="shield" />
              </div>

              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Account Security
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Keep your account protected
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <h3 className="font-semibold text-slate-900">
                  Password Assistance
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Need to reset your password? Request a secure reset email.
                </p>

                <Link
                  href="/forgot-password"
                  className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
                >
                  Reset Password
                  <DashboardIcon name="arrow" size={16} />
                </Link>
              </div>

              <div className="border-t border-slate-100 pt-5">
                <h3 className="font-semibold text-slate-900">Sign Out</h3>

                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Always sign out when you finish using a shared computer.
                </p>
              </div>

              {logoutError && (
                <p
                  role="alert"
                  className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
                >
                  {logoutError}
                </p>
              )}

              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <DashboardIcon name="logout" size={19} />

                {loggingOut ? "Logging out..." : "Logout Securely"}
              </button>
            </div>
          </section>
        </div>

        {/* ADMIN ACCESS */}
        {customer.role === "admin" && (
          <section className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-6">
            <h2 className="text-lg font-bold text-slate-900">Administration</h2>

            <p className="mt-2 text-sm text-slate-600">
              Open your store management dashboard.
            </p>

            <Link
              href="/admin"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
            >
              Admin Dashboard
              <DashboardIcon name="arrow" size={18} />
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}
