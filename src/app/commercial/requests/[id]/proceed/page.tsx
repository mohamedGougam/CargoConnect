import { ProceedReviewView } from "@/components/commercial/ProceedReviewView";

export default async function ProceedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProceedReviewView requestId={id} />;
}
