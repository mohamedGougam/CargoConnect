import { PriceIntelligenceView } from "@/components/commercial/PriceIntelligenceView";

export default async function PricePage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const params = await searchParams;
  return <PriceIntelligenceView intentId={params.intent} />;
}
