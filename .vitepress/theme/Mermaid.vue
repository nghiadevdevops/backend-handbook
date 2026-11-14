<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useData } from 'vitepress'

const props = defineProps<{ code: string }>()
const { isDark } = useData()

const el = ref<HTMLElement | null>(null)
const failed = ref(false)
const source = decodeURIComponent(props.code)

let uid = 0
// Render tuần tự: mermaid dùng chung trạng thái toàn cục nên không render song song.
let queue: Promise<unknown> = Promise.resolve()

async function draw() {
  const mermaid = (await import('mermaid')).default
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: isDark.value ? 'dark' : 'default',
    fontFamily: 'inherit'
  })
  const id = `mmd-${Math.random().toString(36).slice(2)}-${uid++}`
  try {
    const { svg } = await mermaid.render(id, source)
    if (el.value) el.value.innerHTML = svg
    failed.value = false
  } catch (e) {
    console.error('Mermaid lỗi', e)
    document.getElementById('d' + id)?.remove()
    failed.value = true
  }
}

function schedule() {
  queue = queue.then(draw, draw)
}

onMounted(() => {
  schedule()
  watch(isDark, schedule)
})
</script>

<template>
  <div class="mermaid-wrap">
    <div ref="el" class="mermaid-diagram" role="img" aria-label="Sơ đồ" />
    <pre v-if="failed" class="mermaid-fallback"><code>{{ source }}</code></pre>
  </div>
</template>
