<script setup lang="ts">
import { computed } from 'vue';
import { useFEAStore } from '../store/fea';
import { TIER_META } from '../utils/health';

const store = useFEAStore();

const selectedEl = computed(() => {
  if (store.selectedElement === null) return null;
  return store.model.elements.find((e) => e.id === store.selectedElement) || null;
});

const node1 = computed(() => {
  if (!selectedEl.value) return null;
  return store.model.nodes.find((n) => n.id === selectedEl.value!.nodeIds[0]) || null;
});

const node2 = computed(() => {
  if (!selectedEl.value) return null;
  return store.model.nodes.find((n) => n.id === selectedEl.value!.nodeIds[1]) || null;
});

const length = computed(() => {
  if (!node1.value || !node2.value) return 0;
  const dx = node2.value.x - node1.value.x;
  const dy = node2.value.y - node1.value.y;
  return Math.sqrt(dx * dx + dy * dy);
});

const angle = computed(() => {
  if (!node1.value || !node2.value) return 0;
  const dx = node2.value.x - node1.value.x;
  const dy = node2.value.y - node1.value.y;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
});

const color = computed(() => {
  if (store.selectedElement === null) return '#6b7280';
  return store.elementColors.get(store.selectedElement) || '#6b7280';
});

// Values come from the same FEAResult array used by the heatmap and health score
const values = computed(() =>
  selectedEl.value ? store.elementResult(selectedEl.value.id) : null
);

const health = computed(() =>
  selectedEl.value ? store.healthByElement.get(selectedEl.value.id) ?? null : null
);

const hasMaterial = computed(() => {
  const a = selectedEl.value?.allowableStress;
  return (
    a !== null && a !== undefined && Number.isFinite(a) && (a as number) > 0
  );
});
</script>

<template>
  <div class="bg-slate-800 rounded-lg p-4">
    <h3 class="text-sm font-bold text-slate-200 border-b border-slate-700 pb-2 mb-3">
      单元详情
    </h3>

    <div v-if="!selectedEl" class="text-xs text-slate-500 text-center py-6">
      点击一个单元查看详情
    </div>

    <div v-else class="space-y-2 text-xs">
      <!-- Color indicator -->
      <div class="flex items-center gap-2 mb-3">
        <div class="w-4 h-4 rounded" :style="{ backgroundColor: color }" />
        <span class="text-slate-300 font-medium">单元 #{{ selectedEl.id }}</span>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div class="bg-slate-900 rounded p-2">
          <div class="text-slate-400">连接节点</div>
          <div class="text-sm font-mono text-slate-200">
            {{ selectedEl.nodeIds[0] }} → {{ selectedEl.nodeIds[1] }}
          </div>
        </div>
        <div class="bg-slate-900 rounded p-2">
          <div class="text-slate-400">长度 / 角度</div>
          <div class="text-sm font-mono text-slate-200">
            {{ length.toFixed(3) }}m / {{ angle.toFixed(1) }}°
          </div>
        </div>
        <div class="bg-slate-900 rounded p-2">
          <div class="text-slate-400">截面积</div>
          <div class="text-sm font-mono text-slate-200">
            {{ (selectedEl.area * 1e6).toFixed(0) }} mm²
          </div>
        </div>
        <div class="bg-slate-900 rounded p-2">
          <div class="text-slate-400">弹性模量</div>
          <div class="text-sm font-mono text-slate-200">
            {{ (selectedEl.youngsModulus / 1e9).toFixed(0) }} GPa
          </div>
        </div>
      </div>

      <!-- Material allowable stress -->
      <div class="bg-slate-900 rounded p-2">
        <div class="text-slate-400">材料许用应力</div>
        <div v-if="hasMaterial" class="text-sm font-mono text-slate-200">
          {{ ((selectedEl.allowableStress as number) / 1e6).toFixed(0) }} MPa
        </div>
        <div v-else class="text-sm font-mono text-amber-400">
          缺失 · 不参与健康评分
        </div>
      </div>

      <div class="border-t border-slate-700 pt-2 mt-2">
        <div class="text-slate-400 mb-1">计算结果</div>
        <div v-if="!values" class="text-slate-500 text-[11px] py-2 text-center">
          尚未求解，点击「求解 FEA」后显示
        </div>
        <div v-else class="grid grid-cols-3 gap-2">
          <div class="bg-slate-900 rounded p-2">
            <div class="text-slate-500 text-[10px]">应力</div>
            <div class="text-sm font-bold" :style="{ color }">
              {{ (values.stress / 1e6).toFixed(2) }}
              <span class="text-[10px] text-slate-500">MPa</span>
            </div>
          </div>
          <div class="bg-slate-900 rounded p-2">
            <div class="text-slate-500 text-[10px]">应变</div>
            <div class="text-sm font-bold text-sky-400">
              {{ (values.strain * 100).toFixed(4) }}
              <span class="text-[10px] text-slate-500">%</span>
            </div>
          </div>
          <div class="bg-slate-900 rounded p-2">
            <div class="text-slate-500 text-[10px]">轴力</div>
            <div class="text-sm font-bold text-amber-400">
              {{ (values.force / 1000).toFixed(2) }}
              <span class="text-[10px] text-slate-500">kN</span>
            </div>
          </div>
        </div>

        <!-- Utilization / tier, from the same result -->
        <div v-if="values" class="mt-2 bg-slate-900 rounded p-2">
          <div class="flex items-center justify-between">
            <span class="text-slate-400">利用率（|应力| / 许用）</span>
            <span v-if="health"
              class="text-[10px] font-bold px-1.5 py-0.5 rounded"
              :style="{
                color: '#0f172a',
                backgroundColor: TIER_META[health.tier].color,
              }"
            >
              {{ TIER_META[health.tier].label }}
            </span>
          </div>
          <div v-if="health" class="flex items-center gap-2 mt-1">
            <div class="flex-1 h-2 bg-slate-800 rounded overflow-hidden">
              <div
                class="h-full rounded transition-all"
                :style="{
                  width: Math.min(100, health.utilization * 100) + '%',
                  backgroundColor: TIER_META[health.tier].color,
                }"
              />
            </div>
            <span
              class="text-xs font-mono font-bold w-14 text-right"
              :style="{ color: TIER_META[health.tier].color }"
            >
              {{ (health.utilization * 100).toFixed(1) }}%
            </span>
          </div>
          <div v-else class="text-[11px] text-amber-400 mt-1">
            材料许用应力缺失，该构件不参与健康评分
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
