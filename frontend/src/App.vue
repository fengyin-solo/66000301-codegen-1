<script setup lang="ts">
import { onMounted, computed } from 'vue';
import FEACanvas from './components/FEACanvas.vue';
import ElementInfo from './components/ElementInfo.vue';
import MeshControls from './components/MeshControls.vue';
import HealthScore from './components/HealthScore.vue';
import { useFEAStore } from './store/fea';
import { HEALTH_COLORS } from './utils/health-score';

const store = useFEAStore();

onMounted(() => {
  store.loadPreset('cantilever');
});

const overallScore = computed(() => store.healthReport.score);
const scoreColor = computed(() => {
  const s = overallScore.value;
  if (s === null) return '#64748b';
  if (s >= 90) return HEALTH_COLORS.safe;
  if (s >= 60) return HEALTH_COLORS.warning;
  return HEALTH_COLORS.over;
});
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
    <!-- Header -->
    <header class="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between">
      <h1 class="text-lg font-bold text-purple-400">
        🔬 有限元应力热力图可视化
      </h1>
      <div class="flex items-center gap-5">
        <!-- Overall structural health score -->
        <div
          v-if="store.result"
          class="flex items-center gap-2 cursor-pointer select-none"
          @click="store.toggleHealth()"
          :title="store.showHealth ? '点击关闭健康评分叠加' : '点击在画布上叠加健康评分'"
        >
          <span class="text-xs text-slate-400">整体健康评分</span>
          <span
            class="text-base font-extrabold font-mono px-2 py-0.5 rounded border-2"
            :class="store.showHealth ? '' : 'opacity-70'"
            :style="{ color: scoreColor, borderColor: scoreColor }"
          >
            {{ overallScore === null ? '—' : overallScore }}
          </span>
          <span class="text-[10px] text-slate-500">/ 100</span>
        </div>
        <div v-else class="text-xs text-slate-500">
          整体健康评分：未计算
        </div>
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
        <MeshControls />
        <HealthScore />
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
        热力图: {{ store.heatmapMode }}<template v-if="store.showHealth"> + 健康评分叠加</template>
      </span>
    </footer>
  </div>
</template>
