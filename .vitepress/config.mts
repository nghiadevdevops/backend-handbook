import { defineConfig, type DefaultTheme } from 'vitepress'
import type MarkdownIt from 'markdown-it'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { allBooks, GITHUB } from './data/stages'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const BOOKS_DIR = path.join(ROOT, 'books')

// ---------------------------------------------------------------- sidebar

/** Sidebar label from the file's H1; "Chapter N. " (or legacy "Chương N. ") becomes "N. ". */
function labelFromH1(file: string, fallback: string): string {
  const text = fs.readFileSync(file, 'utf8')
  const m = text.match(/^#\s+(.+?)\s*$/m)
  if (!m) return fallback
  return m[1].replace(/^(Chapter|Chương)\s+(\d+)\.\s*/i, '$2. ')
}

function bookSidebar(book: string): DefaultTheme.SidebarItem[] {
  const dir = path.join(BOOKS_DIR, book)
  const files = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== 'README.md')
    .map((e) => e.name)
    .sort()
  return [
    {
      text: 'Contents',
      items: [
        { text: 'Introduction', link: `/books/${book}/` },
        ...files.map((f) => ({
          text: labelFromH1(path.join(dir, f), f),
          link: `/books/${book}/${f.replace(/\.md$/, '')}`
        }))
      ]
    }
  ]
}

const sidebar: DefaultTheme.Sidebar = Object.fromEntries(
  allBooks.map((b) => [`/books/${b.id}/`, bookSidebar(b.id)])
)

// ---------------------------------------------------------------- markdown-it plugins

/**
 * Link tương đối trỏ vào lab/ hoặc tới file không phải .md
 * thành URL GitHub (blob cho file, tree cho thư mục).
 */
function repoLinkPlugin(md: MarkdownIt) {
  md.core.ruler.push('repo_links', (state) => {
    const filePath: string | undefined = state.env?.path
    if (!filePath) return
    const walk = (tokens: any[]) => {
      for (const t of tokens) {
        if (t.type === 'link_open') {
          const href = t.attrGet('href')
          if (href && !/^([a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(href)) {
            const [rawPath, ...rest] = href.split(/(?=[#?])/)
            const target = path.resolve(path.dirname(filePath), decodeURI(rawPath))
            const rel = path.relative(ROOT, target).split(path.sep).join('/')
            const ext = path.extname(rel)
            const inLab = /(^|\/)lab(\/|$)/.test(rel)
            const nonMd = ext !== '' && ext !== '.md'
            if (!rel.startsWith('..') && (inLab || nonMd)) {
              let kind = 'blob'
              try {
                kind = fs.statSync(target).isDirectory() ? 'tree' : 'blob'
              } catch {
                kind = rawPath.endsWith('/') || ext === '' ? 'tree' : 'blob'
              }
              t.attrSet('href', `${GITHUB}/${kind}/main/${rel.replace(/\/$/, '')}${rest.join('')}`)
            }
          }
        }
        if (t.children) walk(t.children)
      }
    }
    walk(state.tokens)
  })
}

/**
 * `{{ }}` ngoài code block không được để Vue biên dịch:
 * code span thêm v-pre, văn bản thường đổi thành entity.
 */
function escapeMustachePlugin(md: MarkdownIt) {
  const codeInline = md.renderer.rules.code_inline!
  md.renderer.rules.code_inline = (tokens, idx, options, env, self) =>
    codeInline(tokens, idx, options, env, self).replace(/^<code/, '<code v-pre')

  md.core.ruler.push('escape_mustache', (state) => {
    for (const block of state.tokens) {
      if (block.type !== 'inline' || !block.children) continue
      for (const t of block.children) {
        if (t.type === 'text' && /\{\{|\}\}/.test(t.content)) {
          t.type = 'html_inline'
          t.content = md.utils
            .escapeHtml(t.content)
            .replace(/\{/g, '&#123;')
            .replace(/\}/g, '&#125;')
        }
      }
    }
  })
}

/** Khối mermaid thành component Mermaid (render phía client). */
function mermaidPlugin(md: MarkdownIt) {
  const fence = md.renderer.rules.fence!
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    if (token.info.trim() === 'mermaid') {
      return `<Mermaid code="${encodeURIComponent(token.content)}" />\n`
    }
    return fence(tokens, idx, options, env, self)
  }
}

// ---------------------------------------------------------------- config

export default defineConfig({
  lang: 'vi-VN',
  title: 'Backend Handbook',
  description:
    'A library of 14 backend study books (content in Vietnamese): system design, databases, code architecture, security, deployment and AI engineering.',
  base: '/backend-handbook/',
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: ['books/*/lab/**', 'node_modules/**', 'scripts/**'],
  rewrites: {
    'README.md': 'roadmap.md',
    'books/:book/README.md': 'books/:book/index.md'
  },
  ignoreDeadLinks: [/\/use-cases\/UC-XXX-ten/],
  head: [
    ['meta', { name: 'theme-color', content: '#2563eb' }],
    ['link', { rel: 'icon', href: '/backend-handbook/favicon.svg', type: 'image/svg+xml' }]
  ],
  markdown: {
    config(md) {
      md.use(repoLinkPlugin)
      md.use(escapeMustachePlugin)
      md.use(mermaidPlugin)
    }
  },
  themeConfig: {
    logo: '/favicon.svg',
    siteTitle: 'Backend Handbook',
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Roadmap', link: '/roadmap' },
      {
        text: 'Books',
        items: allBooks.map((b) => ({ text: b.title, link: `/books/${b.id}/` }))
      },
      { text: 'Credits', link: '/credits' }
    ],
    socialLinks: [{ icon: 'github', link: GITHUB }],
    sidebar,
    outline: { level: [2, 3], label: 'On this page' },
    docFooter: { prev: 'Previous page', next: 'Next page' },
    editLink: {
      pattern: `${GITHUB}/edit/main/:path`,
      text: 'Edit this page on GitHub'
    },
    lastUpdated: {
      text: 'Last updated',
      formatOptions: { dateStyle: 'medium' }
    },
    search: { provider: 'local' },
    notFound: {
      title: 'PAGE NOT FOUND',
      quote: 'The page you are looking for does not exist or has moved.',
      linkLabel: 'go to home',
      linkText: 'Back to home',
      code: '404'
    },
    footer: {
      message:
        'Self-study notes, facts checked as of 11/2026. Four books are rewritten from the outlines of ebooks by Huy: see <a href="/backend-handbook/credits">Credits</a>.',
      copyright: 'Backend Handbook'
    }
  }
})
