import { ClaimDetailView } from "@/components/commercial/ClaimDetailView";

export const dynamic = "force-dynamic";

export default async function ClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClaimDetailView claimId={id} />;
}
