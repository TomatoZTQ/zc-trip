<template>
  <div class="login-page top-page">
    <van-nav-bar title="账号登录" @click-left="goBack" />

    <div class="panel">
      <div class="title">欢迎来到 ZC Trip</div>
      <div class="sub-title">登录后可使用收藏、订单和 AI 助手能力</div>

      <van-form @submit="handleSubmit">
        <van-field
          v-model="form.userName"
          name="userName"
          label="账号"
          placeholder="请输入账号"
          maxlength="24"
          clearable
          :rules="[{ required: true, message: '请输入账号' }]"
        />
        <van-field
          v-model="form.password"
          name="password"
          label="密码"
          type="password"
          placeholder="请输入密码"
          maxlength="32"
          clearable
          :rules="[
            { required: true, message: '请输入密码' },
            { pattern: /^.{6,}$/, message: '密码长度至少 6 位' }
          ]"
        />

        <div class="tips">
          测试账号：{{ mockAuthConfig.testUserName }} / {{ mockAuthConfig.testPassword }}
        </div>

        <div class="action">
          <van-button
            block
            round
            type="warning"
            native-type="submit"
            :loading="isSubmitting"
          >
            登录
          </van-button>
        </div>
      </van-form>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { showFailToast, showSuccessToast } from "vant";
import useAuthStore from "@/stores/modules/auth";
import { getMockAuthConfig } from "@/services/modules/auth";

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const mockAuthConfig = getMockAuthConfig();

const form = reactive({
  userName: "",
  password: ""
});
const isSubmitting = ref(false);

const redirectPath = computed(() => {
  const raw = String(route.query.redirect || "");
  if (!raw.startsWith("/")) return "/home";
  return raw;
});

function goBack() {
  if (window.history.length > 1) {
    router.back();
    return;
  }
  router.replace("/home");
}

async function handleSubmit() {
  if (isSubmitting.value) return;

  isSubmitting.value = true;
  try {
    await authStore.login(form);
    showSuccessToast("登录成功");
    router.replace(redirectPath.value);
  } catch (error) {
    showFailToast(error?.message || "登录失败，请稍后重试");
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<style lang="less" scoped>
.login-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #fff6ed 0%, #ffffff 35%);
}

.panel {
  margin: 16px 12px 0;
  padding: 20px 14px 16px;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(29, 40, 58, 0.08);
}

.title {
  font-size: 20px;
  font-weight: 700;
  color: #1f2733;
}

.sub-title {
  margin-top: 6px;
  margin-bottom: 14px;
  color: #778395;
  font-size: 12px;
}

.tips {
  margin-top: 8px;
  font-size: 12px;
  color: #7b8694;
}

.action {
  margin-top: 14px;
}
</style>
