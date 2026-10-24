import Link from "next/link";

export default function CheckoutCancelPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-xl rounded-xl bg-white p-8 text-center shadow">
        <h1 className="text-2xl font-bold text-gray-900">
          Checkout Not Completed
        </h1>

        <p className="mt-4 text-gray-600">
          You returned from Stripe without completing this checkout.
        </p>

        <p className="mt-3 text-sm text-gray-500">
          Your cart has been preserved. Check your order history before starting
          another payment attempt.
        </p>

        <div className="mt-6 flex justify-center gap-4">
          <Link
            href="/cart"
            className="rounded-lg bg-blue-600 px-5 py-3 text-white"
          >
            Return to Cart
          </Link>

          <Link
            href="/orders"
            className="rounded-lg border px-5 py-3 text-gray-900"
          >
            My Orders
          </Link>
        </div>
      </div>
    </main>
  );
}
