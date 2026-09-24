import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  FEAModel,
  FEAResult,
  ElementHealth,
  HealthThresholds,
  HealthTier,
} from '../types';
import {
  solve as feaSolve,
  presetCantileverBeam,
  presetBridgeTruss,
  presetSimpleFrame,
  jetColormap,
} from '../utils/fea-solver';
import {
  computeHealthScore,
  DEFAULT_THRESHOLDS,
} from '../utils/health';

export interface ElementResultValues {
  stress: number;
  strain: number;
  force: number;
}

export const useFEAStore = defineStore('fea', () => {
  const model = ref<FEAModel>({ nodes: [], elements: [], loads: [] });
  const result = ref<FEAResult | null>(null);
  const selectedPreset = ref<string>('cantilever');
  const showDeformed = ref(false);
  const deformationScale = ref(10);
  const selectedElement = ref<number | null>(null);
  const heatmapMode = ref<'stress' | 'strain' | 'force'>('stress');

  // ─── Health scoring state ─────────────────────────────────────────────────
  const showHealthOverlay = ref(false);
  // null = show all tiers; otherwise only elements of this tier are highlighted
  const healthTierFilter = ref<HealthTier | null>(null);
  const healthThresholds = ref<HealthThresholds>({ ...DEFAULT_THRESHOLDS });

  // ─── Actions ──────────────────────────────────────────────────────────────
  function loadPreset(name: string) {
    selectedPreset.value = name;
    result.value = null;
    selectedElement.value = null;
    healthTierFilter.value = null;
    switch (name) {
      case 'cantilever':
        model.value = presetCantileverBeam();
        break;
      case 'bridge':
        model.value = presetBridgeTruss();
        break;
      case 'frame':
        model.value = presetSimpleFrame();
        break;
      default:
        model.value = presetCantileverBeam();
    }
  }

  function solve() {
    result.value = feaSolve(model.value);
  }

  function toggleDeformed() {
    showDeformed.value = !showDeformed.value;
  }

  function selectElement(id: number | null) {
    selectedElement.value = id;
  }

  function setHeatmapMode(mode: 'stress' | 'strain' | 'force') {
    heatmapMode.value = mode;
  }

  function addLoad(nodeId: number, fx: number, fy: number) {
    model.value.loads.push({ nodeId, fx, fy });
  }

  function toggleFixed(nodeId: number) {
    const node = model.value.nodes.find((n) => n.id === nodeId);
    if (node) node.fixed = !node.fixed;
  }

  function toggleHealthOverlay() {
    showHealthOverlay.value = !showHealthOverlay.value;
  }

  function setHealthTierFilter(tier: HealthTier | null) {
    healthTierFilter.value = tier;
  }

  function setHealthThresholds(thresholds: HealthThresholds) {
    healthThresholds.value = {
      warning: Number(thresholds.warning),
      overlimit: Number(thresholds.overlimit),
    };
  }

  // ─── Computed ─────────────────────────────────────────────────────────────
  const maxStress = computed(() => {
    if (!result.value) return 0;
    return result.value.maxStress;
  });

  const maxDisplacement = computed(() => {
    if (!result.value) return 0;
    return result.value.maxDisplacement;
  });

  /**
   * Index of an element id in model.elements — the same index aligns with
   * result.stresses / strains / forces.
   */
  function elementIndex(id: number): number {
    return model.value.elements.findIndex((e) => e.id === id);
  }

  /**
   * Single source of truth for per-element result values: canvas colors,
   * element detail panel and health scoring all read from result arrays,
   * never from fields mutated on the model, so switching presets / re-solving
   * can never show values from different runs.
   */
  function elementResult(id: number): ElementResultValues | null {
    if (!result.value) return null;
    const idx = elementIndex(id);
    if (idx < 0) return null;
    return {
      stress: result.value.stresses[idx] ?? 0,
      strain: result.value.strains[idx] ?? 0,
      force: result.value.forces[idx] ?? 0,
    };
  }

  const elementColors = computed(() => {
    const colors = new Map<number, string>();
    if (!result.value || model.value.elements.length === 0) {
      for (const el of model.value.elements) {
        colors.set(el.id, '#6b7280');
      }
      return colors;
    }

    let values: number[];
    switch (heatmapMode.value) {
      case 'stress':
        values = result.value.stresses.map(Math.abs);
        break;
      case 'strain':
        values = result.value.strains.map(Math.abs);
        break;
      case 'force':
        values = result.value.forces.map(Math.abs);
        break;
      default:
        values = result.value.stresses.map(Math.abs);
    }

    const min = Math.min(...values);
    const max = Math.max(...values);

    for (let i = 0; i < model.value.elements.length; i++) {
      colors.set(
        model.value.elements[i].id,
        jetColormap(values[i], min, max)
      );
    }
    return colors;
  });

  // ─── Health scoring ───────────────────────────────────────────────────────
  // Always derived from the current result + model: when the preset changes
  // (result = null) it becomes null ("not solved yet"), after a re-solve it is
  // recomputed from the same stress array used everywhere else.
  const healthScore = computed(() =>
    computeHealthScore(
      model.value.elements,
      result.value ? result.value.stresses : null,
      healthThresholds.value
    )
  );

  const healthByElement = computed(() => {
    const map = new Map<number, ElementHealth>();
    if (healthScore.value) {
      for (const item of healthScore.value.elements) {
        map.set(item.elementId, item);
      }
    }
    return map;
  });

  const missingMaterialIds = computed(
    () => new Set(healthScore.value?.missingMaterialElementIds ?? [])
  );

  return {
    model,
    result,
    selectedPreset,
    showDeformed,
    deformationScale,
    selectedElement,
    heatmapMode,
    showHealthOverlay,
    healthTierFilter,
    healthThresholds,
    maxStress,
    maxDisplacement,
    elementColors,
    healthScore,
    healthByElement,
    missingMaterialIds,
    loadPreset,
    solve,
    toggleDeformed,
    selectElement,
    setHeatmapMode,
    addLoad,
    toggleFixed,
    toggleHealthOverlay,
    setHealthTierFilter,
    setHealthThresholds,
    elementResult,
  };
});
