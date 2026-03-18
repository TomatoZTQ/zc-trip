<template>
  <div class="search-page top-page">
    <van-nav-bar title="搜索结果" left-arrow @click-left="goBack" />

    <div class="criteria">
      <van-tag plain type="warning">{{ cityLabel }}</van-tag>
      <van-tag plain type="primary">{{ dateRangeLabel }}</van-tag>
      <van-tag plain type="success">价格: {{ priceLabel }}</van-tag>
      <van-tag plain type="danger">人数: {{ guestsLabel }}</van-tag>
      <van-tag v-if="keywordLabel" plain type="default">关键词: {{ keywordLabel }}</van-tag>
    </div>

    <div class="summary">共找到 {{ filteredHouselist.length }} 套房源</div>

    <div class="list" v-if="filteredHouselist.length">
      <template v-for="item in filteredHouselist" :key="item.data?.houseId">
        <house-item-v9
          v-if="item.discoveryContentType === 9"
          :item-data="item.data"
          :show-order-btn="true"
          @click="toDetail(item.data)"
          @order="saveOrder(item)"
        />
        <house-item-v3
          v-else-if="item.discoveryContentType === 3"
          :item-data="item.data"
          :show-order-btn="true"
          @click="toDetail(item.data)"
          @order="saveOrder(item)"
        />
      </template>
    </div>

    <div class="empty" v-else>
      <van-empty description="没有找到符合条件的房源" />
      <div class="empty-actions">
        <van-button plain type="warning" @click="goBack">返回修改条件</van-button>
        <van-button type="warning" @click="askAi">让 AI 给我推荐</van-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import useHomeStore from "@/stores/modules/home";
import useOrderStore from "@/stores/modules/order";
import { storeToRefs } from "pinia";
import houseItemV9 from "@/components/house-item-v9/house-item-v9.vue";
import houseItemV3 from "@/components/house-item-v3/house-item-v3.vue";

const route = useRoute();
const router = useRouter();
const homeStore = useHomeStore();
const orderStore = useOrderStore();
const { houselist } = storeToRefs(homeStore);

const PRICE_LABEL_MAP = {
  all: "不限",
  p200: "200以下",
  p400: "200-400",
  p700: "400-700",
  pmax: "700以上"
};

const GUEST_LABEL_MAP = {
  all: "不限",
  g2: "1-2人",
  g4: "3-4人",
  g5: "5人及以上"
};

const cityLabel = computed(() => String(route.query.currentCity || "全部城市"));
const keywordLabel = computed(() => String(route.query.keyword || "").trim());
const priceKey = computed(() => String(route.query.price || "all"));
const guestsKey = computed(() => String(route.query.guests || "all"));
const priceLabel = computed(() => PRICE_LABEL_MAP[priceKey.value] || "不限");
const guestsLabel = computed(() => GUEST_LABEL_MAP[guestsKey.value] || "不限");

const dateRangeLabel = computed(() => {
  const start = Number(route.query.startDate || 0);
  const end = Number(route.query.endDate || 0);

  if (!start || !end) return "日期不限";

  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return "日期不限";

  return `${startDate.getMonth() + 1}月${startDate.getDate()}日 - ${endDate.getMonth() + 1}月${endDate.getDate()}日`;
});

const normalizeText = (text) => String(text || "").toLowerCase().replace(/\s+/g, "");

const getHouseSearchText = (data) => {
  if (!data) return "";

  const tagTexts = Array.isArray(data.houseTags)
    ? data.houseTags
        .map((item) => item?.text || item?.tagText?.text || "")
        .filter(Boolean)
        .join(" ")
    : "";

  return normalizeText(
    [
      data.houseName,
      data.summaryText,
      data.location,
      data.guideText,
      data.sellingPoint,
      data.referencePriceDesc,
      data.priceTipBadge?.text,
      tagTexts
    ].join(" ")
  );
};

const getGuestCapacity = (data) => {
  const content = `${data?.summaryText || ""} ${data?.houseName || ""}`;
  const match = content.match(/(\d+)\s*人/);
  return match ? Number(match[1]) : 0;
};

const matchCity = (data) => {
  const city = cityLabel.value.trim();
  if (!city || city === "全部城市") return true;

  const text = normalizeText(`${data?.location || ""} ${data?.houseName || ""}`);
  const cityText = normalizeText(city);
  const shortCity = cityText.replace(/市$/, "");

  return text.includes(cityText) || (shortCity && text.includes(shortCity));
};

const matchKeyword = (data) => {
  const keyword = keywordLabel.value;
  if (!keyword) return true;
  return getHouseSearchText(data).includes(normalizeText(keyword));
};

const matchPrice = (data) => {
  const price = Number(data?.finalPrice || 0);
  switch (priceKey.value) {
    case "p200":
      return price > 0 && price <= 200;
    case "p400":
      return price > 200 && price <= 400;
    case "p700":
      return price > 400 && price <= 700;
    case "pmax":
      return price > 700;
    default:
      return true;
  }
};

const matchGuests = (data) => {
  const capacity = getGuestCapacity(data);
  if (capacity === 0) return true;

  switch (guestsKey.value) {
    case "g2":
      return capacity <= 2;
    case "g4":
      return capacity >= 3 && capacity <= 4;
    case "g5":
      return capacity >= 5;
    default:
      return true;
  }
};

const filteredHouselist = computed(() => {
  return houselist.value.filter((item) => {
    const data = item?.data;
    if (!data) return false;

    return matchCity(data) && matchKeyword(data) && matchPrice(data) && matchGuests(data);
  });
});

const ensureData = async () => {
  if (houselist.value.length > 0) return;

  for (let i = 0; i < 3; i++) {
    await homeStore.fetchHouselistData();
  }
};

onMounted(() => {
  ensureData();
});

const goBack = () => {
  router.back();
};

const toDetail = (item) => {
  router.push("/detail/" + item.houseId);
};

const askAi = () => {
  const keywordPrompt = keywordLabel.value ? `，关键词是${keywordLabel.value}` : "";
  router.push({
    path: "/message",
    query: {
      prompt: `请根据${cityLabel.value}的住宿需求，价格${priceLabel.value}、人数${guestsLabel.value}${keywordPrompt}，推荐3套合适民宿并说明理由。`
    }
  });
};

const saveOrder = (selected) => {
  if (!selected?.data?.houseId) return;

  const startDate = Number(route.query.startDate || 0);
  const endDate = Number(route.query.endDate || 0);
  const nights =
    startDate > 0 && endDate > startDate
      ? Math.max(1, Math.round((endDate - startDate) / (24 * 60 * 60 * 1000)))
      : 1;

  const selectedHouse = selected?.data
    ? {
        houseId: selected.data.houseId,
        houseName: selected.data.houseName,
        finalPrice: selected.data.finalPrice,
        location: selected.data.location,
        imageUrl: selected.data.image?.url || "",
        cardType: selected.discoveryContentType
      }
    : null;

  orderStore.createOrder({
    city: cityLabel.value,
    startDate,
    endDate,
    nights,
    keyword: keywordLabel.value,
    priceLabel: priceLabel.value,
    guestsLabel: guestsLabel.value,
    houseCount: filteredHouselist.value.length,
    selectedHouse
  });

  router.push("/order");
};
</script>

<style lang="less" scoped>
.search-page {
  background: #f6f7f9;
}

.criteria {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 12px;
  background: #fff;
}

.summary {
  padding: 10px 12px;
  color: #7a8695;
  font-size: 12px;
}

.list {
  padding: 0 8px 20px;
  display: flex;
  flex-wrap: wrap;
}

.empty {
  padding-top: 40px;

  .empty-actions {
    display: flex;
    justify-content: center;
    gap: 8px;
  }
}
</style>
