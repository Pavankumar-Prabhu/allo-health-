import { CheckoutPanel } from "@/components/checkout-panel";

type PageProps = { params: Promise<{ id: string }> };

export default async function CheckoutPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <main className="flex-1 mx-auto max-w-5xl px-4 py-10">
      <CheckoutPanel reservationId={id} />
    </main>
  );
}
