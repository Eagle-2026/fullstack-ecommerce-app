import Link from "next/link";

export default function StoreHeader() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Link
          href="/"
          className="text-2xl font-bold tracking-tight text-gray-900"
        >
          E-Commerce Store
        </Link>

        <nav
          aria-label="Main navigation"
          className="flex flex-wrap items-center gap-3 text-sm font-medium sm:gap-6"
        >
          <Link href="/" className="text-gray-700 hover:text-blue-600">
            Shop
          </Link>

          <Link href="/account" className="text-gray-700 hover:text-blue-600">
            My Account
          </Link>

          <Link href="/login" className="text-gray-700 hover:text-blue-600">
            Login
          </Link>

          <Link
            href="/signup"
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Sign Up
          </Link>
        </nav>
      </div>
    </header>
  );
}
