<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue';
import { useFEAStore } from '../store/fea';
import { TIER_META, TIER_ORDER } from '../utils/health';
import type { HealthTier } from '../types';

const store = useFEAStore();
const canvas = ref<HTMLCanvasElement>();

let offsetX = 50;
let offsetY = 50;
let scale = 1;
let isDragging = false;
let lastMouse = { x: 0, y: 0 };

function worldToScreen(x: number, y: number): [number, number] {
  return [x * scale + offsetX, y * scale + offsetY];
}

function screenToWorld(sx: number, sy: number): [number, number] {
  return [(sx - offsetX) / scale, (sy - offsetY) / scale];
}

// Health-scoring overlay legend (top-left panel, separate from jet color bar)
function drawHealthLegend(
  W: number,
  _H: number,
  counts: Record<HealthTier, number>,
  score: number,
  filter: HealthTier | null,
  unratedCount: number
): void {
  const ctx = canvas.value?.getContext('2d');
  if (!ctx) return;

  const x = 12;
  let y = 12;
  const w = 168;
  const rowH = 17;
  const h = 72 + rowH * 3 + (unratedCount > 0 ? rowH : 0) + (filter ? 16 : 0);

  ctx.save();
  ctx.fillStyle = 'rgba(15,23,42,0.88)';
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, 6);
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('结构健康评分', x + 10, y + 14);
  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(score.toFixed(1), x + w - 10, y + 14);

  y += 28;
  ctx.textAlign = 'left';
  for (const tier of TIER_ORDER) {
    const meta = TIER_META[tier];
    const active = filter === tier;

    if (active) {
      ctx.fillStyle = 'rgba(51,65,85,0.8)';
      ctx.fillRect(x + 4, y - rowH / 2 + 1, w - 8, rowH - 2);
    }

    // swatch: thick solid/dashed line like the overlay
    ctx.beginPath();
    ctx.moveTo(x + 12, y);
    ctx.lineTo(x + 30, y);
    ctx.strokeStyle = meta.color;
    ctx.lineWidth = tier === 'safe' ? 2.5 : 4;
    ctx.setLineDash(tier === 'warning' ? [6, 3] : []);
    ctx.stroke();
    ctx.setLineDash([]);

    if (tier === 'overlimit') {
      ctx.fillStyle = meta.color;
      for (const sx2 of [x + 12, x + 30]) {
        ctx.beginPath();
        ctx.rect(sx2 - 2.5, y - 2.5, 5, 5);
        ctx.stroke();
      }
    }

    ctx.fillStyle = active ? '#ffffff' : '#cbd5e1';
    ctx.font = '11px sans-serif';
    ctx.fillText(meta.label, x + 38, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = meta.color;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(String(counts[tier]), x + w - 12, y);
    ctx.textAlign = 'left';
    y += rowH;
  }

  if (unratedCount > 0) {
    ctx.beginPath();
    ctx.moveTo(x + 12, y);
    ctx.lineTo(x + 30, y);
    ctx.strokeStyle = 'rgba(100,116,139,0.8)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.fillText('未评分(缺参数)', x + 38, y);
    ctx.textAlign = 'right';
    ctx.fillText(String(unratedCount), x + w - 12, y);
    ctx.textAlign = 'left';
    y += rowH;
  }

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#64748b';
  ctx.font = '9px sans-serif';
  ctx.fillText('实线/描边样式，与热力图区分', x + 10, y + 12);
  if (filter) {
    ctx.fillStyle = TIER_META[filter].color;
    ctx.fillText(`仅显示「${TIER_META[filter].label}」档`, x + 10, y + 26);
  }
  ctx.restore();
}

function draw() {
  const ctx = canvas.value?.getContext('2d');
  if (!ctx) return;

  const W = canvas.value!.width;
  const H = canvas.value!.height;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, W, H);

  const { nodes, elements, loads } = store.model;
  if (nodes.length === 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('选择一个预设模型开始分析', W / 2, H / 2);
    return;
  }

  // Auto-scale to fit
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y);
    maxY = Math.max(maxY, n.y);
  }
  const worldW = maxX - minX || 1;
  const worldH = maxY - minY || 1;
  const margin = 60;
  const fitScale = Math.min((W - margin * 2) / worldW, (H - margin * 2) / worldH);

  // Use auto scale only if no manual zoom
  const drawScale = fitScale * scale;
  const drawOffsetX = margin - minX * drawScale + (W - margin * 2 - worldW * drawScale) / 2;
  const drawOffsetY = margin - minY * drawScale + (H - margin * 2 - worldH * drawScale) / 2;

  function toScreen(x: number, y: number): [number, number] {
    return [x * drawScale + drawOffsetX, y * drawScale + drawOffsetY];
  }

  // When a health tier filter is active, members outside that tier are dimmed
  // even in the base heatmap pass so only the selected tier stands out.
  const healthFilterActive =
    store.showHealthOverlay &&
    !!store.healthScore &&
    store.healthScore.elements.length > 0 &&
    store.healthTierFilter !== null;

  // Draw elements with heatmap colors
  for (const el of elements) {
    const n1 = nodes.find((n) => n.id === el.nodeIds[0]);
    const n2 = nodes.find((n) => n.id === el.nodeIds[1]);
    if (!n1 || !n2) continue;

    const [x1, y1] = toScreen(n1.x, n1.y);
    const [x2, y2] = toScreen(n2.x, n2.y);
    const color = store.elementColors.get(el.id) || '#6b7280';
    const isSelected = store.selectedElement === el.id;
    const hItem = store.healthByElement.get(el.id);
    const outsideFilter =
      healthFilterActive &&
      (!hItem || hItem.tier !== store.healthTierFilter);

    ctx.save();
    if (outsideFilter) ctx.globalAlpha = 0.12;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = isSelected ? 4 : 2.5;
    ctx.stroke();
    ctx.restore();

    if (isSelected) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ─── Health scoring overlay (distinct style from the heatmap) ─────────────
  if (store.showHealthOverlay && store.healthScore && store.healthScore.elements.length > 0) {
    const health = store.healthScore;
    const filter = store.healthTierFilter;

    // Elements excluded from scoring: gray dashed (not heatmap-colored)
    for (const el of elements) {
      if (store.healthByElement.has(el.id)) continue;
      const n1 = nodes.find((n) => n.id === el.nodeIds[0]);
      const n2 = nodes.find((n) => n.id === el.nodeIds[1]);
      if (!n1 || !n2) continue;
      const [x1, y1] = toScreen(n1.x, n1.y);
      const [x2, y2] = toScreen(n2.x, n2.y);
      ctx.save();
      if (filter !== null) ctx.globalAlpha = 0.15;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = 'rgba(100,116,139,0.55)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Rated elements: solid/outline + glow per tier, dashed/dimmed never used
    // for the heatmap colors above
    for (const h of health.elements) {
      const el = elements.find((e) => e.id === h.elementId);
      if (!el) continue;
      const n1 = nodes.find((n) => n.id === el.nodeIds[0]);
      const n2 = nodes.find((n) => n.id === el.nodeIds[1]);
      if (!n1 || !n2) continue;

      const isFilteredOut = filter !== null && h.tier !== filter;
      const meta = TIER_META[h.tier];
      const [x1, y1] = toScreen(n1.x, n1.y);
      const [x2, y2] = toScreen(n2.x, n2.y);
      const isSelected = store.selectedElement === el.id;

      // outer glow pass
      ctx.save();
      if (isFilteredOut) {
        ctx.globalAlpha = 0.12;
      } else {
        ctx.shadowColor = meta.glow;
        ctx.shadowBlur = h.tier === 'safe' ? 0 : 8;
      }
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = meta.color;
      ctx.lineWidth = h.tier === 'overlimit' ? 5 : h.tier === 'warning' ? 4 : 2.5;
      if (h.tier === 'warning') ctx.setLineDash([7, 4]);
      else ctx.setLineDash([]);
      ctx.stroke();
      ctx.restore();

      // overlimit: inner white dash + end markers to stand out from heatmap
      if (!isFilteredOut && h.tier === 'overlimit') {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        for (const [mx, my] of [[x1, y1], [x2, y2]] as number[][]) {
          ctx.beginPath();
          ctx.rect(mx - 3, my - 3, 6, 6);
          ctx.strokeStyle = meta.color;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      if (isSelected) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = isFilteredOut ? 'rgba(255,255,255,0.35)' : '#ffffff';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // utilization label (only elements visible under the current filter)
      if (!isFilteredOut && h.tier !== 'safe') {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const label = `${(h.utilization * 100).toFixed(0)}%`;
        ctx.font = 'bold 10px sans-serif';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(15,23,42,0.85)';
        ctx.fillRect(mx - tw / 2 - 3, my - 7, tw + 6, 13);
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 1;
        ctx.strokeRect(mx - tw / 2 - 3, my - 7, tw + 6, 13);
        ctx.fillStyle = meta.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, mx, my);
        ctx.textBaseline = 'alphabetic';
      }
    }

    drawHealthLegend(W, H, health.counts, health.overallScore, filter, health.missingMaterialElementIds.length);
  }

  // Draw deformed mesh
  if (store.showDeformed && store.result) {
    ctx.setLineDash([5, 3]);
    for (const el of elements) {
      const n1 = nodes.find((n) => n.id === el.nodeIds[0]);
      const n2 = nodes.find((n) => n.id === el.nodeIds[1]);
      if (!n1 || !n2) continue;

      const s = store.deformationScale;
      const [x1, y1] = toScreen(n1.x + n1.displacementX * s, n1.y + n1.displacementY * s);
      const [x2, y2] = toScreen(n2.x + n2.displacementX * s, n2.y + n2.displacementY * s);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = 'rgba(251,191,36,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // Draw nodes
  for (const node of nodes) {
    const [x, y] = toScreen(node.x, node.y);

    if (node.fixed) {
      // Draw triangle for fixed nodes
      ctx.beginPath();
      ctx.moveTo(x, y - 8);
      ctx.lineTo(x - 6, y + 4);
      ctx.lineTo(x + 6, y + 4);
      ctx.closePath();
      ctx.fillStyle = '#f97316';
      ctx.fill();
      ctx.strokeStyle = '#ea580c';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Hatching below
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 1;
      for (let i = -8; i <= 8; i += 4) {
        ctx.beginPath();
        ctx.moveTo(x + i, y + 5);
        ctx.lineTo(x + i - 3, y + 10);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#e2e8f0';
      ctx.fill();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Draw load arrows
  for (const load of loads) {
    const node = nodes.find((n) => n.id === load.nodeId);
    if (!node) continue;
    const [x, y] = toScreen(node.x, node.y);

    const mag = Math.sqrt(load.fx ** 2 + load.fy ** 2);
    if (mag === 0) continue;

    const arrowLen = 30;
    const dx = (load.fx / mag) * arrowLen;
    const dy = (load.fy / mag) * arrowLen;

    // Arrow line
    ctx.beginPath();
    ctx.moveTo(x - dx, y - dy);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Arrow head
    const headLen = 8;
    const angle = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - headLen * Math.cos(angle - 0.4), y - headLen * Math.sin(angle - 0.4));
    ctx.moveTo(x, y);
    ctx.lineTo(x - headLen * Math.cos(angle + 0.4), y - headLen * Math.sin(angle + 0.4));
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label
    ctx.fillStyle = '#fca5a5';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${(mag / 1000).toFixed(1)}kN`, x - dx / 2, y - dy / 2 - 6);
  }

  // Draw color legend bar
  const legendX = W - 40;
  const legendY = 30;
  const legendH = H - 60;
  const legendW = 15;

  const gradient = ctx.createLinearGradient(0, legendY, 0, legendY + legendH);
  gradient.addColorStop(0, 'rgb(255,0,0)');
  gradient.addColorStop(0.25, 'rgb(255,255,0)');
  gradient.addColorStop(0.5, 'rgb(0,255,0)');
  gradient.addColorStop(0.75, 'rgb(0,255,255)');
  gradient.addColorStop(1, 'rgb(0,0,128)');

  ctx.fillStyle = gradient;
  ctx.fillRect(legendX, legendY, legendW, legendH);
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  ctx.strokeRect(legendX, legendY, legendW, legendH);

  // Legend labels
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'left';

  let maxVal = 0;
  if (store.result) {
    switch (store.heatmapMode) {
      case 'stress':
        maxVal = Math.max(...store.result.stresses.map(Math.abs));
        break;
      case 'strain':
        maxVal = Math.max(...store.result.strains.map(Math.abs));
        break;
      case 'force':
        maxVal = Math.max(...store.result.forces.map(Math.abs));
        break;
    }
  }

  const unit = store.heatmapMode === 'stress' ? 'MPa' :
    store.heatmapMode === 'strain' ? '%' : 'kN';

  ctx.textAlign = 'right';
  ctx.fillText(`${maxVal.toExponential(1)} ${unit}`, legendX - 4, legendY + 8);
  ctx.fillText('0', legendX - 4, legendY + legendH);

  // Mode label
  ctx.save();
  ctx.translate(legendX + legendW + 10, legendY + legendH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748b';
  ctx.font = '11px sans-serif';
  ctx.fillText(store.heatmapMode.toUpperCase(), 0, 0);
  ctx.restore();
}

function handleMouseDown(e: MouseEvent) {
  isDragging = true;
  lastMouse = { x: e.clientX, y: e.clientY };
}

function handleMouseMove(e: MouseEvent) {
  if (!isDragging) return;
  offsetX += e.clientX - lastMouse.x;
  offsetY += e.clientY - lastMouse.y;
  lastMouse = { x: e.clientX, y: e.clientY };
  draw();
}

function handleMouseUp() {
  isDragging = false;
}

function handleWheel(e: WheelEvent) {
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.9 : 1.1;
  scale *= factor;
  scale = Math.max(0.1, Math.min(10, scale));
  draw();
}

function handleClick(e: MouseEvent) {
  const rect = canvas.value!.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const { nodes, elements } = store.model;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y);
    maxY = Math.max(maxY, n.y);
  }
  const worldW = maxX - minX || 1;
  const worldH = maxY - minY || 1;
  const W = canvas.value!.width;
  const H = canvas.value!.height;
  const margin = 60;
  const fitScale = Math.min((W - margin * 2) / worldW, (H - margin * 2) / worldH);
  const drawScale = fitScale * scale;
  const drawOffsetX = margin - minX * drawScale + (W - margin * 2 - worldW * drawScale) / 2;
  const drawOffsetY = margin - minY * drawScale + (H - margin * 2 - worldH * drawScale) / 2;

  // Find nearest element
  let bestDist = 15;
  let bestId: number | null = null;

  for (const el of elements) {
    const n1 = nodes.find((n) => n.id === el.nodeIds[0]);
    const n2 = nodes.find((n) => n.id === el.nodeIds[1]);
    if (!n1 || !n2) continue;

    const x1 = n1.x * drawScale + drawOffsetX;
    const y1 = n1.y * drawScale + drawOffsetY;
    const x2 = n2.x * drawScale + drawOffsetX;
    const y2 = n2.y * drawScale + drawOffsetY;

    // Point-to-segment distance
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    let t = ((mx - x1) * dx + (my - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + t * dx;
    const py = y1 + t * dy;
    const dist = Math.sqrt((mx - px) ** 2 + (my - py) ** 2);

    if (dist < bestDist) {
      bestDist = dist;
      bestId = el.id;
    }
  }

  store.selectElement(bestId);
  draw();
}

onMounted(() => {
  nextTick(draw);
});

watch(
  () => [
    store.model,
    store.result,
    store.showDeformed,
    store.deformationScale,
    store.selectedElement,
    store.heatmapMode,
    store.elementColors,
    store.showHealthOverlay,
    store.healthTierFilter,
    store.healthScore,
    store.healthByElement,
  ],
  () => nextTick(draw),
  { deep: true }
);
</script>

<template>
  <canvas
    ref="canvas"
    width="800"
    height="500"
    class="w-full rounded-lg border border-slate-700 cursor-crosshair"
    @mousedown="handleMouseDown"
    @mousemove="handleMouseMove"
    @mouseup="handleMouseUp"
    @mouseleave="handleMouseUp"
    @wheel="handleWheel"
    @click="handleClick"
  />
</template>
