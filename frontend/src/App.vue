<script setup lang="ts">
import { computed } from 'vue';
import { onMounted } from 'vue';
import FEACanvas from './components/FEACanvas.vue';
import ElementInfo from './components/ElementInfo.vue';
import MeshControls from './components/MeshControls.vue';
import HealthPanel from './components/HealthPanel.vue';
import { useFEAStore } from './store/fea';
import { TIER_META } from './utils/health';

const store = useFEAStore();

onMounted(() => {
  store.loadPreset('cantilever');
});

const scoreAvailable = computed(
  () => !!store.healthScore && store.healthScore.elements.length > 0
);
const scoreColor = computed(() => {
  const h = store.healthScore;
  if (!h || h.elements.length === 0) return '#94a3b8';
  if (h.counts.overlimit > 0) return TIER_META.overlimit.color;
  if (h.counts.warning > 0) return TIER_META.warning.color;
  return TIER_META.safe.color;
});
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
    <!-- Header -->
    <header class="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between">
      <h1 class="text-lg font-bold text-purple-400">
        🔬 有限元应力热力图可视化
      </h1>
      <div class="flex items-center gap-4">
        <!-- Overall structural health score -->
        <button
          v-if="scoreAvailable"
          @click="store.showHealthOverlay = !store.showHealthOverlay"
          class="flex items-center gap-2 bg-slate-800 rounded-full pl-2 pr-3 py-1 hover:bg-slate-700 transition border"
          :style="{ borderColor: scoreColor }"
          title="点击开关健康评分叠加显示"
        >
          <span
            class="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
            :style="{ backgroundColor: scoreColor, color: '#0f172a' }"
          >
            {{ store.healthScore!.overallScore.toFixed(0) }}
          </span>
          <span class="text-xs text-slate-300">结构健康评分</span>
          <span
            v-if="store.healthScore!.counts.overlimit > 0"
            class="text-[10px] font-bold px-1.5 py-0.5 rounded"
            :style="{ backgroundColor: TIER_META.overlimit.color, color: '#0f172a' }"
          >
            超限 {{ store.healthScore!.counts.overlimit }}
          </span>
          <span
            v-if="store.healthScore!.counts.warning > 0"
            class="text-[10px] font-bold px-1.5 py-0.5 rounded"
            :style="{ backgroundColor: TIER_META.warning.color, color: '#0f172a' }"
          >
            预警 {{ store.healthScore!.counts.warning }}
          </span>
        </button>
        <div class="text-xs text-slate-500">
          节点: {{ store.model.nodes.length }} |
          单元: {{ store.model.elements.length }}
        </div>
      </div>
    </header>

    <!-- Main content -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Canvas area -->
      <div class="flex-1 p-3" style="width: 75%">
        <FEACanvas />
      </div>

      <!-- Right sidebar -->
      <div class="w-[25%] min-w-[260px] bg-slate-900 border-l border-slate-800 p-3 flex flex-col gap-3 overflow-y-auto">
        <HealthPanel />
        <MeshControls />
        <ElementInfo />
      </div>
    </div>

    <!-- Bottom status bar -->
    <footer class="bg-slate-900 border-t border-slate-800 px-6 py-2 flex items-center gap-6 text-xs text-slate-400">
      <span>
        最大应力:
        <span class="text-red-400 font-bold">
          {{ store.result ? (store.maxStress / 1e6).toFixed(2) + ' MPa' : '—' }}
        </span>
      </span>
      <span>
        最大位移:
        <span class="text-amber-400 font-bold">
          {{ store.result ? (store.maxDisplacement * 1000).toFixed(3) + ' mm' : '—' }}
        </span>
      </span>
      <span>
        节点数: <span class="text-slate-200">{{ store.model.nodes.length }}</span>
      </span>
      <span>
        单元数: <span class="text-slate-200">{{ store.model.elements.length }}</span>
      </span>
      <span class="ml-auto text-slate-600">
        热力图: {{ store.heatmapMode }}
      </span>
    </footer>
  </div>
</template>
