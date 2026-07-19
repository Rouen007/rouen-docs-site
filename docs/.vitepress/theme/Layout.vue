<script setup>
import DefaultTheme from 'vitepress/theme'
import Giscus from '@giscus/vue'
import { useData, useRoute } from 'vitepress'
import { watch, ref, onMounted } from 'vue'

const { isDark, frontmatter } = useData()
const route = useRoute()

// Control Giscus theme based on VitePress dark mode
const giscusTheme = ref(isDark.value ? 'dark' : 'light')

watch(isDark, (dark) => {
  giscusTheme.value = dark ? 'dark' : 'light'
})
</script>

<template>
  <DefaultTheme.Layout>
    <template #doc-after>
      <div v-if="frontmatter.comments !== false" style="margin-top: 2rem;">
        <!-- Use a key to force remount on route change, ensuring Giscus maps correctly -->
        <Giscus
          :key="route.path"
          id="comments"
          repo="Rouen007/rouen-docs-site"
          repoId="R_kgDOTc6TNw"
          category="General"
          categoryId="DIC_kwDOTc6TN84DBhaL"
          mapping="pathname"
          term="Welcome!"
          reactionsEnabled="1"
          emitMetadata="0"
          inputPosition="top"
          :theme="giscusTheme"
          lang="zh-CN"
          loading="lazy"
        />
      </div>
    </template>
  </DefaultTheme.Layout>
</template>
