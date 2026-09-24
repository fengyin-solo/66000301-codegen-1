<script setup lang="ts">
import { computed } from 'vue';
import { useFEAStore } from '../store/fea';
import {
  HEALTH_COLORS,
  HEALTH_LABELS,
  UTIL_WARNING,
  UTIL_OVER,
} from '../utils/health-score';
import type { HealthGrade } from '../types';

const store = useFEAStore();

const report = computed(() => store.healthReport);

const grades: HealthGrade[] = ['safe', 'warning', 'over'];

const scoreColor = computed(() => {
  const s = report.value.score;
  if (s === null) return '#64748b';
  if (s >= 90) return HEALTH_COLORS.safe;
  if (s >= 60) return HEALTH_COLORS.warning;
  return HEALTH_COLORS.over;
});

const excludedElements = computed(() =>
  report.value.excludedElementIds
    .map((id) => store.model.elements.find((e) => e.id === id))
    .filter((e): e is NonNullable<typeof e> => !!e)
);

const worstItem = computed(() => {
  let worst = null as null | (typeof report.value.items)[number];
  for (const it of report.value.items) {
    if (!worst || it.utilization > worst.utilization) worst = it;
  }
  return worst;
});

function selectElement(id: number) {
  store.selectElement(store.selectedElement === id ? null : id);
}

function utilizationPercent(u: number) {
  return (u * 100).toFixed(1) + '%';
}
</script>

<template>
  <div class="bg-slate-800 rounded-lg p-4 space-y-3">
    <div class="flex items-center justify-between border-b border-slate-700 pb-2">
      <h3 class="text-sm font-bold text-slate-200">结构健康评分</h3>
      <label class="flex items-center gap-1.5 cursor-pointer">
        <input
          type="checkbox"
          :checked="store.showHealth"
          @change="store.toggleHealth()"
          class="accent-emerald-500"
        />
        <span class="text-xs text-slate-300">画布叠加</span>
      </label>
    </div>

    <!-- Not solved / empty result -->
    <div
      v-if="!store.result"
      class="text-xs text-slate-400 bg-slate-900 rounded p-3 leading-5"
    >
      模型尚未计算，暂无健康评分。<br />
      请先点击「⚙ 求解 FEA」，评分将按本次求解结果生成。
    </div>
    <div
      v-else-if="report.items.length === 0"
      class="text-xs text-amber-300/90 bg-slate-900 rounded p-3 leading-5"
    >
      本次计算结果为空或所有构件均缺少材料许用应力，无法计算利用率，
      不给出全零评分。请补充材料参数后重新求解。
    </div>

    <template v-else>
      <!-- Overall score -->
      <div class="flex items-center gap-3 bg-slate-900 rounded p-3">
        <div
          class="w-14 h-14 rounded-full flex items-center justify-center text-xl font-extrabold border-4"
          :style="{ color: scoreColor, borderColor: scoreColor }"
        >
          {{ report.score }}
        </div>
        <div class="text-xs text-slate-400 leading-5">
          <div>整体健康评分 <span class="text-slate-200 font-bold">/ 100</span></div>
          <div v-if="worstItem">
            最大利用率：
            <span class="font-mono text-slate-200">{{ utilizationPercent(worstItem.utilization) }}</span>
            <span class="text-slate-500">（单元 #{{ worstItem.elementId }}）</span>
          </div>
          <div class="text-slate-500">
            参评 {{ report.items.length }} 根 / 共 {{ store.model.elements.length }} 根
          </div>
        </div>
      </div>

      <!-- Rule hint -->
      <div class="text-[10px] text-slate-500 leading-4">
        利用率 = |应力| / 材料许用应力；
        &lt;{{ (UTIL_WARNING * 100).toFixed(0) }}% 安全，
        {{ (UTIL_WARNING * 100).toFixed(0) }}%–{{ (UTIL_OVER * 100).toFixed(0) }}% 预警，
        ≥{{ (UTIL_OVER * 100).toFixed(0) }}% 超限。数值与画布、单元详情同属一次求解结果。
      </div>

      <!-- Grade filter chips -->
      <div>
        <div class="text-xs text-slate-400 mb-1">按档位筛选（点击只看该档构件）</div>
        <div class="grid grid-cols-3 gap-1">
          <button
            v-for="g in grades"
            :key="g"
            @click="store.toggleHealthGradeFilter(g)"
            class="py-1.5 rounded text-[10px] font-medium transition border"
            :style="
              store.healthGradeFilter === g
                ? { backgroundColor: HEALTH_COLORS[g], borderColor: HEALTH_COLORS[g], color: '#0f172a' }
                : { borderColor: HEALTH_COLORS[g], color: HEALTH_COLORS[g] }
            "
          >
            {{ HEALTH_LABELS[g] }} {{ report.counts[g] }}
          </button>
        </div>
        <button
          v-if="store.healthGradeFilter"
          @click="store.healthGradeFilter = null"
          class="mt-1 text-[10px] text-sky-400 hover:underline"
        >
          清除筛选，显示全部
        </button>
      </div>

      <!-- Members of each grade -->
      <div class="space-y-2">
        <div v-for="g in grades" :key="g" class="bg-slate-900 rounded p-2">
          <div class="flex items-center gap-1.5 text-xs mb-1">
            <span class="w-2.5 h-2.5 rounded-sm" :style="{ backgroundColor: HEALTH_COLORS[g] }" />
            <span class="text-slate-300 font-medium">{{ HEALTH_LABELS[g] }}</span>
            <span class="text-slate-500 ml-auto">{{ report.counts[g] }} 根</span>
          </div>
          <div v-if="report.counts[g] === 0" class="text-[10px] text-slate-600 pl-4">—</div>
          <div v-else class="flex flex-wrap gap-1 pl-4">
            <button
              v-for="it in report.items.filter((i) => i.grade === g)"
              :key="it.elementId"
              @click="selectElement(it.elementId)"
              class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 transition"
              :class="store.selectedElement === it.elementId ? 'ring-1 ring-white' : ''"
              :style="{ color: HEALTH_COLORS[g] }"
              :title="`利用率 ${utilizationPercent(it.utilization)}`"
            >
              #{{ it.elementId }} {{ utilizationPercent(it.utilization) }}
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- Members excluded due to missing material data -->
    <div
      v-if="excludedElements.length > 0"
      class="border-t border-slate-700 pt-2"
    >
      <div class="text-xs text-slate-400 mb-1">
        材料参数缺失（不参与评分，{{ excludedElements.length }} 根）
      </div>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="el in excludedElements"
          :key="el.id"
          @click="selectElement(el.id)"
          class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-dashed border-slate-600 hover:bg-slate-700 transition"
          :class="store.selectedElement === el.id ? 'ring-1 ring-white' : ''"
        >
          #{{ el.id }}
        </button>
      </div>
    </div>
  </div>
</template>
