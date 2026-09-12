import { RequestDetailView } from "@/components/commercial/RequestDetailView";

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RequestDetailView id={id} />;
}
