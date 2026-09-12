import { CompareQuotesView } from "@/components/commercial/CompareQuotesView";

export default async function CompareQuotesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CompareQuotesView requestId={id} />;
}
