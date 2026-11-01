import Link from "next/link";

export default function AccountBackNavigation() {
  return (
    <nav
      aria-label="Page navigation"
      className="mb-7 flex flex-wrap items-center gap-4"
    >
      <Link
        href="/account"
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-blue-300 hover:text-blue-600"
      >
        <span aria-hidden="true">←</span>
        Back to My Account
      </Link>

      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-blue-600"
      >
        Shop Home
        <span aria-hidden="true">→</span>
      </Link>
    </nav>
  );
}
