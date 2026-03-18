<template>
  <div class="search-box">
    <div class="location row-item">
      <div class="city" @click="cityClick">
        <van-icon name="location-o" />
        <span class="city-name">{{ currentCity.cityName }}</span>
      </div>
      <div class="position" @click="getLocation">
        <span class="text">{{ locationLoading ? "定位中..." : "我的位置" }}</span>
        <img src="@/assets/img/home/icon_location.png" alt="" />
      </div>
    </div>

    <div class="section date-range row-item" @click="showCalendar = true">
      <div class="start">
        <span class="in">入住</span>
        <span>{{ startDateStr }}</span>
      </div>
      <div class="stay">共 {{ stayCount }} 晚</div>
      <div class="end">
        <span class="out">离店</span>
        <span>{{ endDateStr }}</span>
      </div>
    </div>

    <van-calendar
      v-model:show="showCalendar"
      type="range"
      color="#ff9854"
      @confirm="onConfirm"
      :round="false"
    />

    <div class="price-counter row-item">
      <div class="price-item clickable" @click="showPriceSheet = true">
        <div class="label">价格</div>
        <div class="value">{{ selectedPrice.name }}</div>
      </div>
      <div class="price-item right clickable" @click="showGuestSheet = true">
        <div class="label">人数</div>
        <div class="value">{{ selectedGuest.name }}</div>
      </div>
    </div>

    <van-action-sheet
      v-model:show="showPriceSheet"
      :actions="priceActions"
      cancel-text="取消"
      description="选择价格区间"
      @select="onPriceSelect"
    />

    <van-action-sheet
      v-model:show="showGuestSheet"
      :actions="guestActions"
      cancel-text="取消"
      description="选择入住人数"
      @select="onGuestSelect"
    />

    <div class="keyword-wrap row-item">
      <van-field
        v-model="keyword"
        clearable
        placeholder="关键词/位置/民宿名"
      />
    </div>

    <div class="hot-suggest">
      <div
        class="item"
        v-for="(item, index) in hotSuggestsList"
        :key="item.tagText?.text || index"
        :style="{
          color: item.tagText?.color,
          background: item.tagText?.background?.color
        }"
        @click="pickSuggest(item.tagText?.text)"
      >
        {{ item.tagText?.text }}
      </div>
    </div>

    <div class="action-group">
      <van-button type="warning" round block @click="searchBtnClick">
        开始搜索
      </van-button>
      <van-button plain color="#ff9854" round block @click="aiPlanClick">
        AI 帮我规划行程
      </van-button>
    </div>
  </div>
</template>

<script setup>
import useCityStore from "@/stores/modules/city";
import { formatMonthDay, getDiffDays } from "@/utils/format_date";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { computed, ref } from "vue";
import useHomeStore from "@/stores/modules/home";
import axios from "axios";
import useMainStore from "@/stores/modules/main";

const router = useRouter();
const homeStore = useHomeStore();
const cityStore = useCityStore();
const mainStore = useMainStore();

const { hotSuggests } = storeToRefs(homeStore);
const { currentCity } = storeToRefs(cityStore);
const { startDate, endDate } = storeToRefs(mainStore);

const AMAP_KEY = import.meta.env.VITE_AMAP_KEY || "";

const priceActions = [
  { name: "不限", value: "all" },
  { name: "200以下", value: "p200" },
  { name: "200-400", value: "p400" },
  { name: "400-700", value: "p700" },
  { name: "700以上", value: "pmax" }
];

const guestActions = [
  { name: "不限", value: "all" },
  { name: "1-2人", value: "g2" },
  { name: "3-4人", value: "g4" },
  { name: "5人及以上", value: "g5" }
];

const showCalendar = ref(false);
const showPriceSheet = ref(false);
const showGuestSheet = ref(false);
const keyword = ref("");
const locationLoading = ref(false);
const selectedPrice = ref(priceActions[0]);
const selectedGuest = ref(guestActions[0]);

const hotSuggestsList = computed(() => hotSuggests.value?.slice(0, 12) || []);
const startDateStr = computed(() => formatMonthDay(startDate.value));
const endDateStr = computed(() => formatMonthDay(endDate.value));
const stayCount = computed(() => getDiffDays(startDate.value, endDate.value));

const aiPrompt = computed(() => {
  const city = currentCity.value?.cityName || "当前城市";
  const text = keyword.value.trim();
  const keywordPrompt = text ? `，偏好关键词是${text}` : "";
  const pricePrompt = selectedPrice.value.value !== "all" ? `，预算${selectedPrice.value.name}` : "";
  const guestPrompt = selectedGuest.value.value !== "all" ? `，人数${selectedGuest.value.name}` : "";
  return `帮我规划一份${city}${stayCount.value}晚的旅行方案${keywordPrompt}${pricePrompt}${guestPrompt}，给出每天行程、交通建议和预算。`;
});

const getLocation = () => {
  if (!navigator.geolocation || locationLoading.value || !AMAP_KEY) return;

  locationLoading.value = true;
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const latitude = position.coords.latitude.toFixed(6);
      const longitude = position.coords.longitude.toFixed(6);

      axios
        .get("https://restapi.amap.com/v3/geocode/regeo", {
          params: {
            output: "json",
            location: `${longitude},${latitude}`,
            key: AMAP_KEY
          }
        })
        .then((res) => {
          const city = res?.data?.regeocode?.addressComponent?.city;
          if (typeof city === "string" && city.length > 1) {
            currentCity.value.cityName = city.slice(0, -1);
          }
        })
        .finally(() => {
          locationLoading.value = false;
        });
    },
    () => {
      locationLoading.value = false;
    }
  );
};

const cityClick = () => {
  router.push("/city");
};

const onConfirm = (value) => {
  const selectStartDate = value[0];
  const selectEndDate = value[1];
  mainStore.startDate = selectStartDate;
  mainStore.endDate = selectEndDate;
  showCalendar.value = false;
};

const onPriceSelect = (action) => {
  selectedPrice.value = action;
  showPriceSheet.value = false;
};

const onGuestSelect = (action) => {
  selectedGuest.value = action;
  showGuestSheet.value = false;
};

const pickSuggest = (text) => {
  if (!text) return;
  keyword.value = text;
};

const searchBtnClick = () => {
  router.push({
    path: "/search",
    query: {
      startDate: String(startDate.value?.getTime?.() || ""),
      endDate: String(endDate.value?.getTime?.() || ""),
      currentCity: currentCity.value.cityName,
      keyword: keyword.value.trim(),
      price: selectedPrice.value.value,
      priceLabel: selectedPrice.value.name,
      guests: selectedGuest.value.value,
      guestsLabel: selectedGuest.value.name
    }
  });
};

const aiPlanClick = () => {
  router.push({
    path: "/message",
    query: {
      prompt: aiPrompt.value
    }
  });
};
</script>

<style lang="less" scoped>
.search-box {
  --van-calendar-popup-height: 100%;
  margin: 10px 12px 0;
  padding: 10px 12px 14px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
}

.row-item {
  padding: 10px 8px;
  border-bottom: 1px solid #f0f1f4;
}

.location {
  display: flex;
  align-items: center;
  justify-content: space-between;

  .city {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 16px;
    font-weight: 600;
    color: #2d3540;
  }

  .position {
    display: flex;
    align-items: center;
    font-size: 12px;
    color: #737f8f;

    img {
      margin-left: 4px;
      width: 16px;
      height: 16px;
    }
  }
}

.section {
  display: flex;
  justify-content: space-between;
  align-items: center;

  .start,
  .end {
    display: flex;
    flex-direction: column;
    font-size: 16px;
    font-weight: 600;
    color: #2d3540;

    .in,
    .out {
      margin-bottom: 2px;
      font-size: 12px;
      font-weight: 400;
      color: #8c96a3;
    }
  }

  .stay {
    font-size: 12px;
    color: #ff9854;
    background: rgba(255, 152, 84, 0.14);
    padding: 4px 10px;
    border-radius: 12px;
  }
}

.price-counter {
  display: flex;

  .price-item {
    flex: 1;

    .label {
      font-size: 12px;
      color: #8c96a3;
    }

    .value {
      margin-top: 2px;
      font-size: 15px;
      color: #2d3540;
    }

    &.clickable {
      cursor: pointer;
    }
  }

  .price-item.right {
    text-align: right;
  }
}

.keyword-wrap {
  :deep(.van-cell) {
    padding: 0;
    background: transparent;
  }

  :deep(.van-field__control) {
    font-size: 14px;
  }
}

.hot-suggest {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 0 6px;

  .item {
    font-size: 12px;
    line-height: 1;
    padding: 7px 9px;
    border-radius: 14px;
  }
}

.action-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
}
</style>
