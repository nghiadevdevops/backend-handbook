import { createRequire } from 'node:module'
const require = createRequire('/work/')
const { chromium } = require('playwright')

const BASE = 'http://bookcheck-site-preview:4173/backend-handbook'
const OUT = '/out'
const pages = [
  ['home', '/'],
  ['roadmap', '/roadmap'],
  ['dbindex', '/books/database-indexing/01-index-fundamentals-and-storage'],
  ['gitflow', '/books/git-workflow/03-git-flow'],
  ['table', '/books/web-security/13-logging-and-incident-response']
]
const viewports = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 }
}

const browser = await chromium.launch()
for (const [vpName, viewport] of Object.entries(viewports)) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({
      viewport,
      colorScheme: scheme,
      deviceScaleFactor: 1,
      isMobile: vpName === 'mobile',
      locale: 'vi-VN'
    })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
    for (const [name, url] of pages) {
      await page.goto(BASE + url, { waitUntil: 'networkidle' })
      const total = await page.locator('.mermaid-wrap').count()
      if (total) {
        await page.waitForFunction(
          (n) => document.querySelectorAll('.mermaid-diagram svg').length >= n,
          total,
          { timeout: 60000 }
        )
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      )
      console.log(vpName, scheme, name, 'mermaid', total, 'overflowX', overflow)
      if (name === 'gitflow') {
        await page.locator('.mermaid-wrap').first().scrollIntoViewIfNeeded()
      }
      if (name === 'table') {
        const d = page.locator('details').first()
        if (await d.count()) {
          await d.scrollIntoViewIfNeeded()
          await d.locator('summary').click()
        } else {
          await page.locator('table').first().scrollIntoViewIfNeeded()
        }
      }
      await page.screenshot({
        path: `${OUT}/${name}-${vpName}-${scheme}.png`,
        fullPage: name === 'home' || name === 'roadmap'
      })
    }
    // Tìm kiếm
    await page.goto(BASE + '/', { waitUntil: 'networkidle' })
    await page.keyboard.press('Control+k')
    if (vpName === 'mobile') {
      await page.locator('.VPNavBarSearch button').first().click().catch(() => {})
    }
    await page.waitForSelector('#localsearch-input', { timeout: 10000 })
    await page.fill('#localsearch-input', 'deadlock')
    await page.waitForSelector('.result', { timeout: 15000 })
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${OUT}/search-${vpName}-${scheme}.png` })
    await ctx.close()
  }
}
// Đổi theme runtime: sơ đồ phải được vẽ lại
{
  const c = await browser.newContext({ viewport: viewports.desktop, colorScheme: 'light' })
  const pg = await c.newPage()
  await pg.goto(BASE + '/books/git-workflow/03-git-flow', { waitUntil: 'networkidle' })
  await pg.waitForSelector('.mermaid-diagram svg')
  const before = await pg.locator('.mermaid-diagram svg').first().innerHTML()
  await pg.locator('.VPSwitchAppearance').first().click()
  await pg.waitForTimeout(3000)
  const after = await pg.locator('.mermaid-diagram svg').first().innerHTML()
  console.log('theme toggle redraws mermaid:', before !== after)
  await c.close()
}
// 404
const ctx = await browser.newContext({ viewport: viewports.desktop, locale: 'vi-VN' })
const p = await ctx.newPage()
await p.goto(BASE + '/khong-ton-tai', { waitUntil: 'networkidle' })
await p.screenshot({ path: `${OUT}/404-desktop-light.png` })
await browser.close()
