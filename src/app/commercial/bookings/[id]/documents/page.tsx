import { BookingDocumentsView } from "@/components/commercial/BookingDocumentsView";

export default async function BookingDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BookingDocumentsView bookingId={id} />;
}
