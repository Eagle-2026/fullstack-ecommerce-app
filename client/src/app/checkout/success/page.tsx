import OrderStatus from "@/components/OrderStatus";

type Props = {
  searchParams: Promise<{
    orderId?: string;
  }>;
};

export default async function CheckoutSuccessPage({ searchParams }: Props) {
  const { orderId } = await searchParams;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <OrderStatus orderId={orderId ?? ""} />
    </main>
  );
}
