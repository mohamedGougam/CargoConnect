import { BookingTrackingView } from "@/components/commercial/BookingTrackingView";

export const dynamic = "force-dynamic";

export default async function BookingTrackingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BookingTrackingView bookingId={id} />;
}
