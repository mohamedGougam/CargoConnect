import { ConfirmationReviewView } from "@/components/commercial/ConfirmationReviewView";

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ConfirmationReviewView requestId={id} />;
}
