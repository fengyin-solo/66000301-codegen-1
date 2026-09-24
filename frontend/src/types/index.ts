export interface Node {
  id: number;
  x: number;
  y: number;
  fixed: boolean;       // boundary condition
  displacementX: number;
  displacementY: number;
}

export interface Element {
  id: number;
  nodeIds: [number, number];  // 2-node truss element
  area: number;               // cross-section area (m²)
  youngsModulus: number;      // Pa
  allowableStress?: number | null; // material allowable stress (Pa); missing => excluded from health scoring
  stress: number;             // computed
  strain: number;             // computed
  force: number;              // computed
}

export type HealthTier = 'safe' | 'warning' | 'overlimit';

export interface ElementHealth {
  elementId: number;
  stress: number;            // signed stress from the current FEAResult (Pa)
  allowableStress: number;   // material allowable (Pa)
  utilization: number;       // |stress| / allowableStress
  tier: HealthTier;
}

export interface HealthThresholds {
  warning: number;   // utilization ratio at/above which an element is flagged 预警
  overlimit: number; // utilization ratio at/above which an element is 超限
}

export interface HealthScore {
  elements: ElementHealth[];            // rated elements only
  missingMaterialElementIds: number[];  // elements excluded due to missing material parameters
  counts: Record<HealthTier, number>;
  worstUtilization: number;             // max utilization among rated elements
  overallScore: number;                 // 0 - 100
  thresholds: HealthThresholds;
}

export interface Load {
  nodeId: number;
  fx: number;   // force X component (N)
  fy: number;   // force Y component (N)
}

export interface FEAModel {
  nodes: Node[];
  elements: Element[];
  loads: Load[];
}

export interface FEAResult {
  displacements: number[];    // global displacement vector
  stresses: number[];          // per-element stress
  strains: number[];           // per-element strain
  forces: number[];            // per-element axial force
  maxDisplacement: number;
  maxStress: number;
  reactionForces: { nodeId: number; fx: number; fy: number }[];
}
