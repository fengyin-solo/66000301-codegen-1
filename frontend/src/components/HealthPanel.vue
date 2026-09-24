<script setup lang="ts">
import { computed } from 'vue';
import { useFEAStore } from '../store/fea';
import { TIER_META, TIER_ORDER } from '../utils/health';
import type { HealthTier } from '../types';

const store = useFEAStore();

const health = computed(() => store.healthScore);

const notSolved = computed(() => !store.result);
const emptyResult = computed(
  () => !!store.result && store.result.stresses.length === 0
);
const allExcluded = computed(
  () =>
    !!store.result &&
    store.result.stresses.length > 0 &&
    !!health.value &&
    health.value.elements.length === 0
);

const scoreColor = computed(() => {
  if (!health.value || health.value.elements.length === 0) return '#94a3b8';
  if (health.value.counts.overlimit > 0) return TIER_META.overlimit.color;
  if (health.value.counts.warning > 0) return TIER_META.warning.color;
  return TIER_META.safe.color;
});

const missingElements = computed(() => {
  if (!health.value) return [];
  return health.value.missingMaterialElementIds
    .map((id) => store.model.elements.find((e) => e.id === id))
    .filter((e): e is NonNullable<typeof e> => !!e);
});

const visibleTierElements = computed(() => {
  if (!health.value) return [];
  const list = store.healthTierFilter
    ? health.value.elements.filter((h) => h.tier === store.healthTierFilter)
    : health.value.elements;
  return [...list].sort((a, b) => b.utilization - a.utilization);
});

const totalRated = computed(() => health.value?.elements.length ?? 0);

function selectTier(tier: HealthTier) {
  if (store.healthTierFilter === tier) {
    store.setHealthTierFilter(null);
  } else {
    store.setHealthTierFilter(tier);
  }
}

function selectElement(id: number) {
  store.selectElement(id);
}

function onThresholdInput(key: 'warning' | 'overlimit', raw: string) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return;
  const current = store.healthThresholds;
  const next = { ...current, [key]: value };
  // keep thresholds consistent: 0 < warning <= overlimit
  if (next.warning <= 0) next.warning = 0.01;
  if (next.overlimit < next.warning) next.overlimit = next.warning;
  store.setHealthThresholds(next);
}

function formatPercent(ratio: number) {
  return `${(ratio * 100).toFixed(1)}%`;
}
</script>

<template>
  <div class="bg-slate-800 rounded-lg p-4 space-y-3">
    <div class="flex items-center justify-between border-b border-slate-700 pb-2">
      <h3 class="text-sm font-bold text-slate-200">结构健康评分</h3>
      <label class="flex items-center gap-1.5 cursor-pointer">
        <input
          type="checkbox"
          :checked="store.showHealthOverlay"
          @change="store.toggleHealthOverlay()"
          class="accent-emerald-500"
        />
        <span class="text-[10px] text-slate-400">叠加显示</span>
      </label>
    </div>

    <!-- Model not solved yet -->
    <div v-if="notSolved" class="text-xs text-slate-400 bg-slate-900 rounded p-3 leading-relaxed">
      ⓘ 当前算例尚未求解。点击上方
      <span class="text-green-400 font-medium">「求解 FEA」</span>
      后，系统会按各构件应力与材料许用值之比计算利用率并生成健康评分。
    </div>

    <!-- Solved but result empty -->
    <div v-else-if="emptyResult" class="text-xs text-slate-400 bg-slate-900 rounded p-3 leading-relaxed">
      ⓠ 本次求解结果为空（没有任何单元应力数据），无法计算健康评分。请检查模型的边界条件与荷载后重新求解。
    </div>

    <!-- Every element excluded due to missing material params -->
    <div v-else-if="allExcluded" class="space-y-2">
      <div class="text-xs text-slate-400 bg-slate-900 rounded p-3 leading-relaxed">
        ⓠ 全部 {{ health?.missingMaterialElementIds.length ?? 0 }} 根构件都缺少材料许用应力，没有可参与评分的构件，因此不生成评分（不显示 0 分）。
      </div>
      <div>
        <div class="text-xs text-slate-400 mb-1">缺少材料参数的构件</div>
        <div class="flex flex-wrap gap-1">
          <button
            v-for="el in missingElements"
            :key="el.id"
            @click="selectElement(el.id)"
            class="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 text-[10px] font-mono hover:bg-slate-600"
          >
            #{{ el.id }}
          </button>
        </div>
      </div>
    </div>

    <!-- Normal: scored -->
    <div v-else-if="health" class="space-y-3">
      <!-- Overall score -->
      <div class="flex items-center gap-3 bg-slate-900 rounded p-3">
        <div
          class="w-16 h-16 rounded-full flex flex-col items-center justify-center border-4 shrink-0"
          :style="{ borderColor: scoreColor, color: scoreColor }"
        >
          <span class="text-lg font-bold leading-none">{{ health.overallScore.toFixed(1) }}</span>
          <span class="text-[9px] text-slate-500 mt-0.5">/ 100</span>
        </div>
        <div class="text-xs space-y-1">
          <div class="text-slate-300">
            整体评分 · 参与评分 {{ totalRated }} 根
          </div>
          <div class="text-slate-400">
            最大利用率：
            <span class="font-bold" :style="{ color: scoreColor }">
              {{ formatPercent(health.worstUtilization) }}
            </span>
          </div>
          <div v-if="health.missingMaterialElementIds.length" class="text-slate-500">
            {{ health.missingMaterialElementIds.length }} 根因材料参数缺失未参与
          </div>
        </div>
      </div>

      <!-- Tier filter chips -->
      <div>
        <div class="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span>判定分档（点击只看该档）</span>
          <button
            v-if="store.healthTierFilter"
            @click="store.setHealthTierFilter(null)"
            class="text-[10px] text-sky-400 hover:text-sky-300"
          >
            清除筛选 ✕
          </button>
        </div>
        <div class="grid grid-cols-4 gap-1">
          <button
            @click="store.setHealthTierFilter(null)"
            :class="store.healthTierFilter === null
              ? 'bg-slate-600 text-white'
              : 'bg-slate-700 text-slate-400'"
            class="py-1.5 rounded text-[10px] font-medium hover:opacity-90 transition"
          >
            全部
          </button>
          <button
            v-for="tier in TIER_ORDER"
            :key="tier"
            @click="selectTier(tier)"
            class="py-1.5 rounded text-[10px] font-medium transition hover:opacity-90"
            :style="store.healthTierFilter === tier
              ? { backgroundColor: TIER_META[tier].color, color: '#0f172a' }
              : { backgroundColor: 'rgba(51,65,85,0.7)', color: TIER_META[tier].color }"
          >
            {{ TIER_META[tier].label }} {{ health.counts[tier] }}
          </button>
        </div>
      </div>

      <!-- Thresholds -->
      <div class="grid grid-cols-2 gap-2">
        <div class="bg-slate-900 rounded p-2">
          <div class="text-[10px] text-slate-400 mb-1">预警阈值（利用率）</div>
          <input
            type="number"
            min="0.01"
            step="0.05"
            :value="store.healthThresholds.warning"
            @change="onThresholdInput('warning', ($event.target as HTMLInputElement).value)"
            class="w-full bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-xs text-amber-400 font-mono"
          />
        </div>
        <div class="bg-slate-900 rounded p-2">
          <div class="text-[10px] text-slate-400 mb-1">超限阈值（利用率）</div>
          <input
            type="number"
            min="0.01"
            step="0.05"
            :value="store.healthThresholds.overlimit"
            @change="onThresholdInput('overlimit', ($event.target as HTMLInputElement).value)"
            class="w-full bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-xs text-red-400 font-mono"
          />
        </div>
      </div>

      <!-- Elements in current filter -->
      <div>
        <div class="text-xs text-slate-400 mb-1">
          {{ store.healthTierFilter ? TIER_META[store.healthTierFilter].label + '构件' : '构件利用率（由高到低）' }}
        </div>
        <div class="max-h-40 overflow-y-auto space-y-1 pr-1">
          <button
            v-for="h in visibleTierElements.slice(0, 50)"
            :key="h.elementId"
            @click="selectElement(h.elementId)"
            class="w-full flex items-center gap-2 bg-slate-900 rounded px-2 py-1 hover:bg-slate-700/60 transition"
            :class="{ 'ring-1 ring-white/60': store.selectedElement === h.elementId }"
          >
            <span
              class="w-1.5 h-1.5 rounded-full shrink-0"
              :style="{ backgroundColor: TIER_META[h.tier].color }"
            />
            <span class="text-[10px] font-mono text-slate-300 w-10 text-left">#{{ h.elementId }}</span>
            <div class="flex-1 h-1.5 bg-slate-800 rounded overflow-hidden">
              <div
                class="h-full rounded"
                :style="{
                  width: Math.min(100, h.utilization * 100) + '%',
                  backgroundColor: TIER_META[h.tier].color,
                }"
              />
            </div>
            <span
              class="text-[10px] font-mono w-14 text-right"
              :style="{ color: TIER_META[h.tier].color }"
            >
              {{ formatPercent(h.utilization) }}
            </span>
          </button>
          <div v-if="visibleTierElements.length === 0" class="text-[10px] text-slate-500 py-1">
            该档没有构件
          </div>
        </div>
      </div>

      <!-- Missing material list -->
      <div v-if="missingElements.length" class="border-t border-slate-700 pt-2">
        <div class="text-xs text-slate-400 mb-1">
          未参与评分 · 缺少材料许用应力（{{ missingElements.length }}）
        </div>
        <div class="flex flex-wrap gap-1">
          <button
            v-for="el in missingElements"
            :key="el.id"
            @click="selectElement(el.id)"
            class="px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 text-[10px] font-mono hover:bg-slate-600"
            :class="{ 'ring-1 ring-white/60': store.selectedElement === el.id }"
          >
            #{{ el.id }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
