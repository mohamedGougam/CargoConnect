import type {
  OperationalExceptionAction,
  OperationalExceptionType,
} from "@/domain/commercial/types";

export function recommendedActionsFor(
  type: OperationalExceptionType,
): OperationalExceptionAction[] {
  switch (type) {
    case "AIS_STALE":
      return [
        { id: "check_broker", label: "Check latest broker/carrier update" },
        { id: "verify_vessel", label: "Verify vessel association" },
        { id: "wait_ais", label: "Wait for next AIS observation" },
      ];
    case "ETA_SLIPPAGE":
      return [
        {
          id: "review_eta",
          label: "Review latest ETA with broker/carrier",
        },
        {
          id: "assess_schedule",
          label: "Assess downstream schedule impact",
        },
      ];
    case "ROUTE_DEVIATION":
      return [
        {
          id: "review_position",
          label: "Review latest AIS position against the reference corridor",
        },
        {
          id: "ask_broker",
          label: "Ask broker/carrier whether routing changed",
        },
      ];
    case "VESSEL_SUBSTITUTION":
      return [
        {
          id: "review_nomination",
          label: "Review and confirm vessel change",
        },
        {
          id: "compare_email",
          label: "Compare the broker email with the current association",
        },
      ];
    case "SOURCE_CONFLICT":
      return [
        { id: "review_email", label: "Review original broker email" },
        { id: "compare_ais", label: "Compare AIS timeline" },
        {
          id: "confirm_timestamp",
          label: "Confirm operational timestamp before proceeding",
        },
      ];
    case "ORIGIN_DWELL":
      return [
        {
          id: "confirm_departure",
          label: "Confirm departure when the vessel has sailed",
        },
        {
          id: "check_updates",
          label: "Check for broker/carrier loading or sailing updates",
        },
      ];
    case "DESTINATION_DWELL":
      return [
        {
          id: "confirm_discharge",
          label: "Confirm discharge when cargo operations complete",
        },
        {
          id: "check_discharge_update",
          label: "Check for broker/carrier discharge updates",
        },
      ];
    case "DOCUMENT_REGRESSION":
      return [
        {
          id: "review_document",
          label: "Review the replaced or invalid document",
        },
        {
          id: "upload_valid",
          label: "Upload a valid required document version",
        },
      ];
    case "MILESTONE_OVERDUE":
      return [
        {
          id: "review_plan",
          label: "Review the planned milestone timing",
        },
        {
          id: "confirm_or_update",
          label: "Confirm the milestone or update with broker/carrier",
        },
      ];
    default:
      return [{ id: "review", label: "Review shipment details" }];
  }
}
