import type {
  NormalizedCommercialQuote,
  QuoteComparisonPreference,
  QuoteComparisonWeights,
} from "@/domain/commercial/types";

export interface RankedQuote {
  normalized: NormalizedCommercialQuote;
  score: number | null;
  rank: number | null;
  dimensionNotes: string[];
  incomparableReason?: string;
}

export interface RankingResult {
  preference: QuoteComparisonPreference;
  weights: QuoteComparisonWeights;
  ranked: RankedQuote[];
  recommendation: {
    quoteId: string;
    organization: string;
    why: string[];
    tradeoffs: string[];
  } | null;
  summaryNotes: string[];
}

const DEFAULT_WEIGHTS: QuoteComparisonWeights = {
  cost: 0.4,
  departure: 0.2,
  transit: 0.25,
  completeness: 0.15,
};

export function resolveWeights(
  preference: QuoteComparisonPreference,
  custom?: Partial<QuoteComparisonWeights>,
): QuoteComparisonWeights {
  if (preference === "lowest_cost") {
    return { cost: 1, departure: 0, transit: 0, completeness: 0 };
  }
  if (preference === "fastest_transit") {
    return { cost: 0, departure: 0, transit: 1, completeness: 0 };
  }
  if (preference === "earliest_departure") {
    return { cost: 0, departure: 1, transit: 0, completeness: 0 };
  }
  if (preference === "custom" && custom) {
    const w = {
      cost: custom.cost ?? 0.4,
      departure: custom.departure ?? 0.2,
      transit: custom.transit ?? 0.25,
      completeness: custom.completeness ?? 0.15,
    };
    const sum = w.cost + w.departure + w.transit + w.completeness;
    if (sum <= 0) return DEFAULT_WEIGHTS;
    return {
      cost: w.cost / sum,
      departure: w.departure / sum,
      transit: w.transit / sum,
      completeness: w.completeness / sum,
    };
  }
  return DEFAULT_WEIGHTS;
}

/**
 * Deterministic ranking. Only scores dimensions with comparable data.
 * Prefer latest versions by default (exclude superseded unless only option).
 */
export function rankQuotes(input: {
  quotes: NormalizedCommercialQuote[];
  preference: QuoteComparisonPreference;
  weights?: Partial<QuoteComparisonWeights>;
  includeSuperseded?: boolean;
}): RankingResult {
  const weights = resolveWeights(input.preference, input.weights);
  const pool = input.quotes.filter((q) =>
    input.includeSuperseded ? true : q.isLatest,
  );
  const summaryNotes: string[] = [];

  const priceComparable = pool.filter(
    (q) => q.priceComparable && q.normalizedTotal != null && q.expiryState !== "expired",
  );
  summaryNotes.push(
    `${priceComparable.length} of ${pool.length} quotes include a comparable freight amount`,
  );

  const scored: RankedQuote[] = pool.map((q) => {
    if (q.expiryState === "expired") {
      return {
        normalized: q,
        score: null,
        rank: null,
        dimensionNotes: ["Expired — de-emphasized"],
        incomparableReason: "expired",
      };
    }

    const notes: string[] = [];
    let score = 0;
    let weightUsed = 0;

    if (weights.cost > 0) {
      if (q.priceComparable && q.normalizedTotal != null && priceComparable.length >= 1) {
        const costs = priceComparable.map((p) => p.normalizedTotal!) as number[];
        const min = Math.min(...costs);
        const max = Math.max(...costs);
        const costScore =
          max === min ? 1 : 1 - (q.normalizedTotal - min) / (max - min);
        score += weights.cost * costScore;
        weightUsed += weights.cost;
        notes.push(`cost score ${costScore.toFixed(2)}`);
      } else {
        notes.push("cost not comparable");
      }
    }

    if (weights.transit > 0) {
      const withTransit = pool.filter(
        (p) => p.transitDaysMin != null && p.expiryState !== "expired",
      );
      if (q.transitDaysMin != null && withTransit.length) {
        const vals = withTransit.map((p) => p.transitDaysMin!);
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        const tScore = max === min ? 1 : 1 - (q.transitDaysMin - min) / (max - min);
        score += weights.transit * tScore;
        weightUsed += weights.transit;
        notes.push(`transit score ${tScore.toFixed(2)}`);
      } else {
        notes.push("transit missing");
      }
    }

    if (weights.departure > 0) {
      const withDep = pool.filter(
        (p) => p.departureSortKey != null && p.expiryState !== "expired",
      );
      if (q.departureSortKey != null && withDep.length) {
        const vals = withDep.map((p) => p.departureSortKey!);
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        const dScore =
          max === min ? 1 : 1 - (q.departureSortKey - min) / (max - min);
        score += weights.departure * dScore;
        weightUsed += weights.departure;
        notes.push(`departure score ${dScore.toFixed(2)}`);
      } else {
        notes.push("departure missing");
      }
    }

    if (weights.completeness > 0) {
      score += weights.completeness * q.completenessScore;
      weightUsed += weights.completeness;
      notes.push(`completeness ${q.completenessScore.toFixed(2)}`);
    }

    if (weightUsed <= 0) {
      return {
        normalized: q,
        score: null,
        rank: null,
        dimensionNotes: notes,
        incomparableReason: "insufficient_comparable_dimensions",
      };
    }

    return {
      normalized: q,
      score: Math.round((score / weightUsed) * 1000) / 1000,
      rank: null,
      dimensionNotes: notes,
    };
  });

  const sortable = scored
    .filter((s) => s.score != null)
    .sort((a, b) => (b.score! - a.score!) || a.normalized.organization.localeCompare(b.normalized.organization));

  sortable.forEach((s, i) => {
    s.rank = i + 1;
  });

  const ranked = [
    ...sortable,
    ...scored.filter((s) => s.score == null),
  ];

  let recommendation: RankingResult["recommendation"] = null;
  if (sortable.length >= 2 || (sortable.length === 1 && priceComparable.length >= 1)) {
    // Require at least some comparable signal for best_overall / cost prefs
    const top = sortable[0];
    if (
      input.preference === "best_overall" &&
      priceComparable.length < 2 &&
      sortable.length < 2
    ) {
      summaryNotes.push(
        "Insufficient comparable data for a best-overall recommendation",
      );
    } else if (
      input.preference === "lowest_cost" &&
      priceComparable.length < 1
    ) {
      summaryNotes.push("No price-comparable quotes for lowest-cost ranking");
    } else {
      const why: string[] = [];
      const tradeoffs: string[] = [];
      const n = top.normalized;

      if (n.priceComparable && n.normalizedTotal != null) {
        const cheapest = priceComparable.every(
          (p) => (p.normalizedTotal ?? Infinity) >= (n.normalizedTotal ?? Infinity),
        );
        if (cheapest) why.push("lowest comparable freight amount");
        else why.push("strong overall score across available dimensions");
      }
      if (n.departureSortKey != null) {
        const earliest = pool
          .filter((p) => p.departureSortKey != null && p.expiryState !== "expired")
          .every((p) => (p.departureSortKey ?? Infinity) >= n.departureSortKey!);
        if (earliest) why.push("earliest indicated departure");
      }
      if (n.transitDaysMin != null) {
        const fastest = pool
          .filter((p) => p.transitDaysMin != null && p.expiryState !== "expired")
          .every((p) => (p.transitDaysMin ?? Infinity) >= n.transitDaysMin!);
        if (fastest) why.push("fastest indicated transit");
      }
      if (n.completenessScore >= 0.6) {
        why.push("relatively complete commercial terms");
      }
      if (!why.length) why.push("highest deterministic score based on available quote data");

      const runner = sortable[1];
      if (runner) {
        const r = runner.normalized;
        if (
          n.transitDaysMin != null &&
          r.transitDaysMin != null &&
          r.transitDaysMin < n.transitDaysMin
        ) {
          tradeoffs.push(
            `transit is ${n.transitDaysMin - r.transitDaysMin} day(s) longer than ${r.organization}`,
          );
        }
        if (
          n.normalizedTotal != null &&
          r.normalizedTotal != null &&
          r.normalizedTotal < n.normalizedTotal
        ) {
          tradeoffs.push(
            `${r.organization} has a lower comparable freight amount`,
          );
        }
        if (n.excludedCharges.length && !r.excludedCharges.length) {
          tradeoffs.push("selected quote lists excluded charges");
        }
      }

      recommendation = {
        quoteId: n.quoteId,
        organization: n.organization,
        why,
        tradeoffs,
      };
    }
  } else {
    summaryNotes.push(
      "Do not treat ranking as exact when comparable fields are sparse",
    );
  }

  return {
    preference: input.preference,
    weights,
    ranked,
    recommendation,
    summaryNotes,
  };
}
