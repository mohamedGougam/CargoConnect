import { CommercialRequestFormView } from "@/components/commercial/CommercialRequestFormView";

export default async function QuotePage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const params = await searchParams;
  return (
    <CommercialRequestFormView type="QUOTE" intentId={params.intent} />
  );
}
