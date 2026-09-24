import type {
  Element,
  ElementHealth,
  HealthScore,
  HealthThresholds,
  HealthTier,
} from '../types';

export const DEFAULT_THRESHOLDS: HealthThresholds = {
  warning: 0.6,
  overlimit: 1.0,
};

// ─── Tier styles (distinct from the jet heatmap colormap) ───────────────────
export const TIER_META: Record<
  HealthTier,
  { label: string; color: string; glow: string; dim: string }
> = {
  safe: {
    label: '安全',
    color: '#22c55e', // green
    glow: 'rgba(34,197,94,0.35)',
    dim: 'rgba(34,197,94,0.18)',
  },
  warning: {
    label: '预警',
    color: '#f59e0b', // amber
    glow: 'rgba(245,158,11,0.45)',
    dim: 'rgba(245,158,11,0.2)',
  },
  overlimit: {
    label: '超限',
    color: '#ef4444', // red
    glow: 'rgba(239,68,68,0.55)',
    dim: 'rgba(239,68,68,0.22)',
  },
};

export const TIER_ORDER: HealthTier[] = ['overlimit', 'warning', 'safe'];

/**
 * Classify a single utilization ratio into one of the three tiers.
 */
export function classifyUtilization(
  ratio: number,
  thresholds: HealthThresholds
): HealthTier {
  if (ratio >= thresholds.overlimit) return 'overlimit';
  if (ratio >= thresholds.warning) return 'warning';
  return 'safe';
}

/**
 * Per-element score contribution: full 100 below the warning threshold,
 * linear decay to 0 at the overlimit threshold, clamped at 0 beyond it.
 */
export function elementScore(
  ratio: number,
  thresholds: HealthThresholds
): number {
  if (ratio <= thresholds.warning) return 100;
  if (ratio >= thresholds.overlimit) return 0;
  const t =
    (ratio - thresholds.warning) /
    (thresholds.overlimit - thresholds.warning);
  return Math.round((1 - t) * 1000) / 10;
}

/**
 * Compute the structural health score from a solved result.
 *
 * Stresses must come from the same FEAResult array that feeds the heatmap and
 * the element detail panel (aligned with `elements` by index). Elements with a
 * missing / non-positive allowable stress are excluded from scoring and listed
 * separately. Returns null when there is no result to score, and
 * `rated === 0` inside the score when every element is excluded.
 */
export function computeHealthScore(
  elements: Element[],
  stresses: number[] | null | undefined,
  thresholds: HealthThresholds
): HealthScore | null {
  if (!stresses) return null;

  const rated: ElementHealth[] = [];
  const missingMaterialElementIds: number[] = [];

  // An empty stress array means nothing was actually computed: do not rate
  // anything (all-zero utilization would fake a perfect score). The UI shows
  // an "empty result" notice instead.
  const hasStresses = stresses.length > 0;

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const allowable = el.allowableStress;
    if (
      allowable === null ||
      allowable === undefined ||
      !Number.isFinite(allowable) ||
      allowable <= 0
    ) {
      if (hasStresses) missingMaterialElementIds.push(el.id);
      continue;
    }
    if (!hasStresses || i >= stresses.length) continue;

    const stress = stresses[i] ?? 0;
    const utilization = Math.abs(stress) / allowable;
    rated.push({
      elementId: el.id,
      stress,
      allowableStress: allowable,
      utilization,
      tier: classifyUtilization(utilization, thresholds),
    });
  }

  const counts: Record<HealthTier, number> = {
    safe: 0,
    warning: 0,
    overlimit: 0,
  };
  let worst = 0;
  let scoreSum = 0;
  for (const item of rated) {
    counts[item.tier] += 1;
    worst = Math.max(worst, item.utilization);
    scoreSum += elementScore(item.utilization, thresholds);
  }

  return {
    elements: rated,
    missingMaterialElementIds,
    counts,
    worstUtilization: rated.length ? worst : 0,
    overallScore: rated.length ? Math.round((scoreSum / rated.length) * 10) / 10 : 0,
    thresholds: { ...thresholds },
  };
}
