"use client";

import type { Port, Vessel } from "@/domain/models";
import {
  formatCoordinate,
  formatEta,
  formatVesselStatus,
  formatVesselType,
} from "@/lib/format";
import { DetailDrawer, DetailField, DetailSection } from "@/components/ui/DetailDrawer";
import { CommercialDrawerActions } from "@/components/commercial/CommercialDrawerActions";

interface VesselRouteContext {
  originName: string;
  destinationName: string;
  isRelevant: boolean;
}

interface VesselDetailPanelProps {
  vessel: Vessel | null;
  origin?: Port;
  destination?: Port;
  open: boolean;
  onClose: () => void;
  /** Present when a corridor search is active — no commercial claims. */
  routeContext?: VesselRouteContext | null;
  hasActiveSearch?: boolean;
  onCheckPrice?: () => void;
  onMakeReservation?: () => void;
}

export function VesselDetailPanel({
  vessel,
  origin,
  destination,
  open,
  onClose,
  routeContext = null,
  hasActiveSearch = false,
  onCheckPrice,
  onMakeReservation,
}: VesselDetailPanelProps) {
  if (!vessel) {
    return (
      <DetailDrawer open={false} kind="vessel" title="" onClose={onClose}>
        {null}
      </DetailDrawer>
    );
  }

  const specs = vessel.specifications;
  const cargo = vessel.cargo;

  return (
    <DetailDrawer
      open={open}
      kind="vessel"
      title={vessel.name}
      subtitle={`${formatVesselType(vessel.type)} · ${vessel.cargoCategory}`}
      status={formatVesselStatus(vessel.status)}
      onClose={onClose}
    >
      {routeContext ? (
        <DetailSection title="Route context">
          <DetailField label="Origin" value={routeContext.originName} />
          <DetailField label="Destination" value={routeContext.destinationName} />
          <DetailField
            label="Search"
            value={
              routeContext.isRelevant
                ? "Corridor-relevant vessel"
                : "Visible while search is active"
            }
          />
          <p className="mt-1 text-[10px] leading-relaxed text-slate-400/85">
            Corridor relevance only — commercial availability not confirmed.
          </p>
        </DetailSection>
      ) : null}

      <DetailSection title="Voyage">
        <DetailField label="Origin" value={origin?.name} fallback="Not available" />
        <DetailField
          label="Destination"
          value={
            destination?.name
              ? destination.name
              : vessel.destinationRaw
                ? `${vessel.destinationRaw} (AIS text)`
                : undefined
          }
          fallback="Not available"
        />
        <DetailField label="ETA" value={formatEta(vessel.eta)} fallback="Not available" />
        <DetailField
          label="Nav status"
          value={vessel.navStatus}
          fallback="Not available"
        />
        <DetailField label="Status" value={formatVesselStatus(vessel.status)} />
      </DetailSection>

      <DetailSection title="Position">
        <DetailField
          label="Coordinates"
          value={formatCoordinate(vessel.position.latitude, vessel.position.longitude)}
        />
        <DetailField
          label="Speed"
          value={vessel.speed !== undefined ? `${vessel.speed.toFixed(1)} kn` : undefined}
          fallback="Not available"
        />
        <DetailField
          label="Course"
          value={
            vessel.course !== undefined ? `${Math.round(vessel.course)}°` : undefined
          }
          fallback="Not available"
        />
      </DetailSection>

      <DetailSection title="Specifications">
        <DetailField label="IMO" value={vessel.imo} />
        <DetailField label="MMSI" value={vessel.mmsi} />
        <DetailField label="Flag" value={vessel.flag} />
        <DetailField
          label="Length"
          value={specs?.lengthMeters ? `${specs.lengthMeters} m` : undefined}
        />
        <DetailField
          label="Beam"
          value={specs?.beamMeters ? `${specs.beamMeters} m` : undefined}
        />
        <DetailField
          label="Draft"
          value={specs?.draftMeters ? `${specs.draftMeters} m` : undefined}
        />
        <DetailField
          label="DWT"
          value={
            specs?.deadweightTons
              ? `${specs.deadweightTons.toLocaleString()} t`
              : undefined
          }
        />
        <DetailField
          label="Gross tonnage"
          value={specs?.grossTonnage ? specs.grossTonnage.toLocaleString() : undefined}
        />
        <DetailField label="Built" value={specs?.yearBuilt} />
      </DetailSection>

      <DetailSection title="Cargo">
        <DetailField label="Category" value={vessel.cargoCategory} />
        <DetailField label="Current cargo" value={cargo?.currentCargoDescription} />
        <DetailField
          label="Capacity"
          value={
            cargo?.capacityTons
              ? `${cargo.capacityTons.toLocaleString()} t`
              : cargo?.capacityTeu
                ? `${cargo.capacityTeu.toLocaleString()} TEU`
                : undefined
          }
          fallback="Not available"
        />
        <DetailField
          label="Available capacity"
          value={
            cargo?.availableCapacityTons !== undefined
              ? `${cargo.availableCapacityTons.toLocaleString()} t`
              : undefined
          }
        />
      </DetailSection>

      {onCheckPrice && onMakeReservation ? (
        <CommercialDrawerActions
          hasActiveSearch={hasActiveSearch}
          onCheckPrice={onCheckPrice}
          onMakeReservation={onMakeReservation}
        />
      ) : null}
    </DetailDrawer>
  );
}
