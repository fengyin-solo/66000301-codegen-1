import type { FEAModel, FEAResult, ElementHealth, HealthGrade } from '../types';

// Utilization thresholds (ratio |stress| / allowableStress):
//   u < UTIL_WARNING  => 安全 safe
//   UTIL_WARNING <= u < UTIL_OVER => 预警 warning
//   u >= UTIL_OVER    => 超限 over
export const UTIL_WARNING = 0.6;
export const UTIL_OVER = 1.0;

// Discrete health colors — deliberately categorical (flat, no colormap) so
// they never look like the Jet heatmap underneath.
export const HEALTH_COLORS: Record<HealthGrade, string> = {
  safe: '#22c55e',    // green
  warning: '#f59e0b', // amber
  over: '#ef4444',    // red
};

export const HEALTH_LABELS: Record<HealthGrade, string> = {
  safe: '安全',
  warning: '预警',
  over: '超限',
};

export function gradeForUtilization(u: number): HealthGrade {
  if (u >= UTIL_OVER) return 'over';
  if (u >= UTIL_WARNING) return 'warning';
  return 'safe';
}

/**
 * Per-member score, 0–100:
 *   safe (u < 0.6)         -> 100
 *   warning (0.6 <= u < 1) -> 100 → 50 linear across the band
 *   over (u >= 1)          -> 50 → 0 linear across [1.0, 1.5], floored at 0
 */
export function memberScore(u: number): number {
  if (u < UTIL_WARNING) return 100;
  if (u < UTIL_OVER) {
    return Math.round(100 - ((u - UTIL_WARNING) / (UTIL_OVER - UTIL_WARNING)) * 50);
  }
  return Math.max(0, Math.round(50 - ((u - UTIL_OVER) / 0.5) * 50));
}

export interface HealthReport {
  items: ElementHealth[];                // members that took part in scoring
  excludedElementIds: number[];          // members with missing material data
  counts: Record<HealthGrade, number>;
  worstUtilization: number;
  score: number | null;                  // overall score, null when nothing scored
}

/**
 * Compute the structural health report. Always reads stresses from the same
 * FEAResult the canvas / element detail panel use, so the numbers can never
 * come from different solve runs.
 */
export function computeHealth(model: FEAModel, result: FEAResult | null): HealthReport {
  const empty: HealthReport = {
    items: [],
    excludedElementIds: [],
    counts: { safe: 0, warning: 0, over: 0 },
    worstUtilization: 0,
    score: null,
  };
  if (!result || model.elements.length === 0 || result.stresses.length === 0) {
    return empty;
  }

  const items: ElementHealth[] = [];
  const excludedElementIds: number[] = [];

  for (let i = 0; i < model.elements.length; i++) {
    const el = model.elements[i];
    const stress = result.stresses[i] ?? 0;
    // Members without material allowable data are excluded, never scored 0.
    if (el.allowableStress === undefined || el.allowableStress <= 0) {
      excludedElementIds.push(el.id);
      continue;
    }
    const utilization = Math.abs(stress) / el.allowableStress;
    const grade = gradeForUtilization(utilization);
    items.push({
      elementId: el.id,
      stress,
      allowableStress: el.allowableStress,
      utilization,
      grade,
      score: memberScore(utilization),
    });
  }

  const counts: Record<HealthGrade, number> = { safe: 0, warning: 0, over: 0 };
  let worst = 0;
  let scoreSum = 0;
  for (const it of items) {
    counts[it.grade]++;
    worst = Math.max(worst, it.utilization);
    scoreSum += it.score;
  }

  return {
    items,
    excludedElementIds,
    counts,
    worstUtilization: worst,
    score: items.length ? Math.round(scoreSum / items.length) : null,
  };
}
