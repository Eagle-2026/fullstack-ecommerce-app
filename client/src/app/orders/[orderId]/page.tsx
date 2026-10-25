import OrderDetails from "@/components/OrderDetails";

type PageProps = {
  params: Promise<{
    orderId: string;
  }>;
};

export default async function OrderDetailPage({ params }: PageProps) {
  const { orderId } = await params;

  return <OrderDetails orderId={orderId} />;
}
