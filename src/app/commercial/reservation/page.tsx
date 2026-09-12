import { CommercialRequestFormView } from "@/components/commercial/CommercialRequestFormView";

export default async function ReservationPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const params = await searchParams;
  return (
    <CommercialRequestFormView type="RESERVATION" intentId={params.intent} />
  );
}
