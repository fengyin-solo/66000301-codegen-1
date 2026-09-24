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
  allowableStress?: number;   // material allowable stress (Pa, absolute); undefined => excluded from health scoring
  stress: number;             // computed
  strain: number;             // computed
  force: number;              // computed
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
  stresses: number[];          // per-element stress (aligned with model.elements order)
  strains: number[];           // per-element strain
  forces: number[];            // per-element axial force
  maxDisplacement: number;
  maxStress: number;
  reactionForces: { nodeId: number; fx: number; fy: number }[];
}

// ─── Structural health scoring ──────────────────────────────────────────────
export type HealthGrade = 'safe' | 'warning' | 'over';

export interface ElementHealth {
  elementId: number;
  stress: number;        // Pa, signed, from the same FEAResult
  allowableStress: number; // Pa
  utilization: number;   // |stress| / allowableStress
  grade: HealthGrade;
  score: number;         // 0–100 for this member
}
