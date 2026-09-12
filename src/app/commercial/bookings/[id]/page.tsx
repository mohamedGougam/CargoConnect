import { BookingDetailView } from "@/components/commercial/BookingDetailView";

export default async function BookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BookingDetailView id={id} />;
}
