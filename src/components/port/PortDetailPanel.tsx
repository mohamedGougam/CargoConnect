"use client";

import type { Port } from "@/domain/models";
import { formatCoordinate, formatPortType } from "@/lib/format";
import { DetailDrawer, DetailField, DetailSection } from "@/components/ui/DetailDrawer";

interface PortDetailPanelProps {
  port: Port | null;
  open: boolean;
  onClose: () => void;
}

export function PortDetailPanel({ port, open, onClose }: PortDetailPanelProps) {
  if (!port) {
    return (
      <DetailDrawer open={false} kind="port" title="" onClose={onClose}>
        {null}
      </DetailDrawer>
    );
  }

  const specs = port.specifications;
  const caps = port.capabilities;

  return (
    <DetailDrawer
      open={open}
      kind="port"
      title={port.name}
      subtitle={`${port.locationLabel} · ${formatPortType(port.type)}`}
      status={port.country}
      onClose={onClose}
      footerHint="Dedicated port pages (brokers, deeper contacts) will plug in here later."
    >
      <DetailSection title="Overview" accent="sky">
        <DetailField label="Country" value={port.country} />
        <DetailField label="Location" value={port.locationLabel} />
        <DetailField label="UN/LOCODE" value={port.unlocode} />
        <DetailField label="Type" value={formatPortType(port.type)} />
        <DetailField
          label="Position"
          value={formatCoordinate(port.position.latitude, port.position.longitude)}
        />
      </DetailSection>

      <DetailSection title="Specifications" accent="sky">
        <DetailField
          label="Max draft"
          value={specs?.maxDraftMeters ? `${specs.maxDraftMeters} m` : undefined}
        />
        <DetailField
          label="Channel depth"
          value={specs?.channelDepthMeters ? `${specs.channelDepthMeters} m` : undefined}
        />
        <DetailField label="Berths" value={specs?.berthCount} />
        <DetailField
          label="Area"
          value={specs?.totalAreaHectares ? `${specs.totalAreaHectares} ha` : undefined}
        />
      </DetailSection>

      <DetailSection title="Capabilities" accent="sky">
        <DetailField label="Cargo types" value={caps?.cargoTypes?.join(", ")} />
        <DetailField label="Equipment" value={caps?.loadingEquipment?.join(", ")} />
        <DetailField label="Shipping lines" value={caps?.shippingLines?.join(", ")} />
        <DetailField
          label="Operations"
          value={
            caps
              ? [caps.canLoad ? "Loading" : null, caps.canUnload ? "Unloading" : null]
                  .filter(Boolean)
                  .join(" · ") || undefined
              : undefined
          }
          fallback="Not available"
        />
      </DetailSection>

      {port.contacts && port.contacts.length > 0 ? (
        <DetailSection title="Contacts" accent="sky">
          {port.contacts.map((contact, index) => (
            <DetailField
              key={`${contact.role}-${index}`}
              label={contact.role}
              value={contact.name ?? contact.email ?? contact.phone}
            />
          ))}
        </DetailSection>
      ) : null}
    </DetailDrawer>
  );
}
