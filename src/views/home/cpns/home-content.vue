<template>
  <div class="content">
    <div class="title-row">
      <h2 class="title">热门精选</h2>
      <div class="result" v-if="categoryTitle">
        {{ categoryTitle }} · {{ filteredHouselist.length }} 套
      </div>
    </div>

    <div class="empty" v-if="categoryTitle && filteredHouselist.length === 0">
      <div class="empty-text">当前分类下暂无匹配房源</div>
      <van-button size="small" plain type="warning" @click="emit('clearCategory')">
        清空筛选
      </van-button>
    </div>

    <div class="list" v-else>
      <template v-for="item in filteredHouselist" :key="item.data?.houseId">
        <house-item-v9
          v-if="item.discoveryContentType === 9"
          :item-data="item.data"
          @click="itemClick(item.data)"
        />
        <house-item-v3
          v-else-if="item.discoveryContentType === 3"
          :item-data="item.data"
          @click="itemClick(item.data)"
        />
      </template>
    </div>
  </div>
</template>

<script setup>
import houseItemV9 from "@/components/house-item-v9/house-item-v9.vue";
import houseItemV3 from "@/components/house-item-v3/house-item-v3.vue";
import useHomeStore from "@/stores/modules/home";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useRouter } from "vue-router";

const props = defineProps({
  categoryTitle: {
    type: String,
    default: ""
  }
});

const emit = defineEmits(["clearCategory"]);

const homeStore = useHomeStore();
const { houselist } = storeToRefs(homeStore);
const router = useRouter();

const CATEGORY_KEYWORDS = {
  新房特惠: ["特惠", "优惠", "立减", "折扣"],
  品牌民宿: ["品牌", "高端", "设计师", "精品"],
  整套出租: ["整套", "整租", "独享", "一居", "两居", "三居"],
  做饭方便: ["做饭", "厨房", "厨具", "锅具"],
  loft: ["loft", "复式"],
  客栈: ["客栈", "青旅", "旅舍"],
  别墅: ["别墅", "villa", "独栋", "联排"]
};

const normalizeText = (text) => String(text || "").toLowerCase().replace(/\s+/g, "");
const SPECIAL_OFFER_TITLE = normalizeText("新房特惠");

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

const hasSpecialOffer = (item) => {
  // 新房特惠仅匹配 v3 卡片（即 house-item-v3）且存在“已减”角标
  if (item?.discoveryContentType !== 3) return false;

  const badgeText = String(item?.data?.priceTipBadge?.text || "").replace(/\s+/g, "");
  return /已减\d*/.test(badgeText);
};

const matchByCategory = (item, categoryTitle) => {
  const data = item?.data;
  const searchText = getHouseSearchText(data);
  const normalizedTitle = normalizeText(categoryTitle);

  // "新房特惠"使用严格优惠条件，避免仅因关键词命中把非优惠房源筛进来
  if (normalizedTitle === SPECIAL_OFFER_TITLE) {
    return hasSpecialOffer(item);
  }

  const keywords = [
    categoryTitle,
    ...(CATEGORY_KEYWORDS[categoryTitle] || CATEGORY_KEYWORDS[normalizedTitle] || [])
  ].map(normalizeText);

  if (keywords.some((keyword) => keyword && searchText.includes(keyword))) {
    return true;
  }

  return false;
};

const filteredHouselist = computed(() => {
  const title = props.categoryTitle.trim();
  if (!title) return houselist.value;

  return houselist.value.filter((item) => matchByCategory(item, title));
});

const itemClick = (item) => {
  router.push("/detail/" + item.houseId);
};
</script>

<style lang="less" scoped>
.content {
  padding: 10px 8px;

  .title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;

    .title {
      font-size: 22px;
      color: #202733;
    }

    .result {
      font-size: 12px;
      color: #ff9854;
      background: rgba(255, 152, 84, 0.14);
      padding: 4px 10px;
      border-radius: 12px;
    }
  }

  .empty {
    margin: 6px 8px 10px;
    padding: 18px 12px;
    border-radius: 12px;
    text-align: center;
    background: #f8f9fb;

    .empty-text {
      margin-bottom: 10px;
      color: #697789;
    }
  }

  .list {
    display: flex;
    flex-wrap: wrap;
  }
}
</style>
