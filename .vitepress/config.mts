import { defineConfig, type DefaultTheme } from 'vitepress'
import type MarkdownIt from 'markdown-it'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { allBooks, GITHUB } from './data/stages'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const BOOKS_DIR = path.join(ROOT, 'books')

// ---------------------------------------------------------------- sidebar

/** Lấy nhãn từ H1 của file; đổi tiền tố "Chương N. " thành "N. ". */
function labelFromH1(file: string, fallback: string): string {
  const text = fs.readFileSync(file, 'utf8')
  const m = text.match(/^#\s+(.+?)\s*$/m)
  if (!m) return fallback
  return m[1].replace(/^Chương\s+(\d+)\.\s*/i, '$1. ')
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
      text: 'Nội dung',
      items: [
        { text: 'Giới thiệu', link: `/books/${book}/` },
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
    'Thư viện 14 cuốn học backend bằng tiếng Việt: từ system design, database, kiến trúc code đến bảo mật, triển khai và AI engineering.',
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
      { text: 'Trang chủ', link: '/' },
      { text: 'Lộ trình', link: '/roadmap' },
      {
        text: 'Sách',
        items: allBooks.map((b) => ({ text: b.title, link: `/books/${b.id}/` }))
      },
      { text: 'Nguồn & ghi công', link: '/credits' }
    ],
    socialLinks: [{ icon: 'github', link: GITHUB }],
    sidebar,
    outline: { level: [2, 3], label: 'Trên trang này' },
    docFooter: { prev: 'Trang trước', next: 'Trang sau' },
    editLink: {
      pattern: `${GITHUB}/edit/main/:path`,
      text: 'Sửa trang này trên GitHub'
    },
    lastUpdated: {
      text: 'Cập nhật lần cuối',
      formatOptions: { dateStyle: 'medium' }
    },
    darkModeSwitchLabel: 'Giao diện',
    lightModeSwitchTitle: 'Chuyển sang giao diện sáng',
    darkModeSwitchTitle: 'Chuyển sang giao diện tối',
    sidebarMenuLabel: 'Menu',
    returnToTopLabel: 'Lên đầu trang',
    skipToContentLabel: 'Chuyển tới nội dung',
    langMenuLabel: 'Đổi ngôn ngữ',
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: 'Tìm kiếm', buttonAriaLabel: 'Tìm kiếm' },
          modal: {
            displayDetails: 'Hiện chi tiết',
            resetButtonTitle: 'Xóa từ khóa',
            backButtonTitle: 'Đóng tìm kiếm',
            noResultsText: 'Không có kết quả cho',
            footer: {
              selectText: 'chọn',
              selectKeyAriaLabel: 'enter',
              navigateText: 'di chuyển',
              navigateUpKeyAriaLabel: 'mũi tên lên',
              navigateDownKeyAriaLabel: 'mũi tên xuống',
              closeText: 'đóng',
              closeKeyAriaLabel: 'esc'
            }
          }
        }
      }
    },
    notFound: {
      title: 'KHÔNG TÌM THẤY TRANG',
      quote: 'Trang bạn tìm không tồn tại, hoặc đã được đổi địa chỉ.',
      linkLabel: 'về trang chủ',
      linkText: 'Quay về trang chủ',
      code: '404'
    },
    footer: {
      message:
        'Nội dung tự học, thông tin chốt vào 11/2026. Bốn cuốn được viết lại từ dàn ý ebook của tác giả Huy: xem <a href="/backend-handbook/credits">Nguồn &amp; ghi công</a>.',
      copyright: 'Backend Handbook'
    }
  }
})
