import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { FEAModel, FEAResult, ElementHealth, HealthGrade } from '../types';
import {
  solve as feaSolve,
  presetCantileverBeam,
  presetBridgeTruss,
  presetSimpleFrame,
  jetColormap,
} from '../utils/fea-solver';
import { computeHealth } from '../utils/health-score';

export const useFEAStore = defineStore('fea', () => {
  const model = ref<FEAModel>({ nodes: [], elements: [], loads: [] });
  const result = ref<FEAResult | null>(null);
  const selectedPreset = ref<string>('cantilever');
  const showDeformed = ref(false);
  const deformationScale = ref(10);
  const selectedElement = ref<number | null>(null);
  const heatmapMode = ref<'stress' | 'strain' | 'force'>('stress');

  // Structural health overlay
  const showHealth = ref(false);
  // null = show all grades; otherwise only members of the selected grade
  const healthGradeFilter = ref<HealthGrade | null>(null);

  // ─── Actions ──────────────────────────────────────────────────────────────
  function loadPreset(name: string) {
    selectedPreset.value = name;
    // Switching a case drops the previous solve: score overlay and colors
    // must be derived from the new model's own (next) solve run.
    result.value = null;
    selectedElement.value = null;
    healthGradeFilter.value = null;
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
    // A single new result object is the only source of truth for canvas
    // colors, element details and the health score.
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

  function toggleHealth() {
    showHealth.value = !showHealth.value;
    if (!showHealth.value) healthGradeFilter.value = null;
  }

  function toggleHealthGradeFilter(grade: HealthGrade) {
    healthGradeFilter.value = healthGradeFilter.value === grade ? null : grade;
  }

  function addLoad(nodeId: number, fx: number, fy: number) {
    model.value.loads.push({ nodeId, fx, fy });
  }

  function toggleFixed(nodeId: number) {
    const node = model.value.nodes.find((n) => n.id === nodeId);
    if (node) node.fixed = !node.fixed;
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

  // ─── Health score (derived strictly from the current result) ──────────────
  const healthReport = computed(() => computeHealth(model.value, result.value));

  const healthByElement = computed(() => {
    const map = new Map<number, ElementHealth>();
    for (const it of healthReport.value.items) map.set(it.elementId, it);
    return map;
  });

  /** Per-element result accessor — single source for canvas and detail panel. */
  function elementResult(index: number) {
    if (!result.value) return null;
    return {
      stress: result.value.stresses[index] ?? 0,
      strain: result.value.strains[index] ?? 0,
      force: result.value.forces[index] ?? 0,
    };
  }

  function elementResultById(id: number) {
    const index = model.value.elements.findIndex((e) => e.id === id);
    if (index < 0) return null;
    return elementResult(index);
  }

  return {
    model,
    result,
    selectedPreset,
    showDeformed,
    deformationScale,
    selectedElement,
    heatmapMode,
    showHealth,
    healthGradeFilter,
    maxStress,
    maxDisplacement,
    elementColors,
    healthReport,
    healthByElement,
    elementResultById,
    loadPreset,
    solve,
    toggleDeformed,
    selectElement,
    setHeatmapMode,
    toggleHealth,
    toggleHealthGradeFilter,
    addLoad,
    toggleFixed,
  };
});
