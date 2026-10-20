
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-10 text-center shadow-lg">
        <h1 className="text-4xl font-bold text-gray-900">
          E-Commerce Store
        </h1>

        <p className="mt-4 text-gray-600">
          Welcome to our secure online store.
        </p>

        <p className="mt-2 text-sm text-gray-500">
          Product browsing and shopping features are coming next.
        </p>

        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/signup"
            className="rounded-lg bg-gray-900 px-6 py-3 text-white"
          >
            Create Account
          </Link>

          <Link
            href="/login"
            className="rounded-lg border border-gray-300 px-6 py-3 text-gray-900"
          >
            Login
          </Link>

          <Link
            href="/account"
            className="rounded-lg border border-gray-300 px-6 py-3 text-gray-900"
          >
            My Account
          </Link>
        </div>
      </div>
    </main>
  );
}
