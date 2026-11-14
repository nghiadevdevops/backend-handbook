<script setup lang="ts">
import { withBase } from 'vitepress'
import { stages } from '../data/stages'

const props = defineProps<{ stage: number }>()
const s = stages[props.stage]
let first = 1
for (let i = 0; i < props.stage; i++) first += stages[i].books.length
</script>

<template>
  <section class="stage">
    <h2 class="stage-title">{{ s.title }}</h2>
    <p class="stage-note">{{ s.note }}</p>
    <div class="book-grid">
      <a v-for="(b, i) in s.books" :key="b.id" class="book-card" :href="withBase(`/books/${b.id}/`)">
        <span class="book-no">Book {{ first + i }}</span>
        <span class="book-title">{{ b.title }}</span>
        <span class="book-desc">{{ b.desc }}</span>
      </a>
    </div>
  </section>
</template>
