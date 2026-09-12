import { BookingHandoffView } from "@/components/commercial/BookingHandoffView";

export const dynamic = "force-dynamic";

export default async function BookingHandoffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BookingHandoffView bookingId={id} />;
}
