import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import robots from '@/app/robots'
import sitemap from '@/app/sitemap'
import nextConfig from '@/next.config'
import { BETA_PAGE_PATHS, BETA_ROBOTS_HEADER } from './beta-pages'

vi.mock('@/lib/locale', () => ({ useLocale: () => ({ locale: 'en' }) }))

const root = fileURLToPath(new URL('..', import.meta.url))

const pageModules = {
  '/download': () => import('@/app/download/page'),
  '/pricing': () => import('@/app/pricing/page'),
  '/account': () => import('@/app/account/page'),
  '/legal/subscription-terms': () => import('@/app/legal/subscription-terms/page'),
  '/legal/refunds': () => import('@/app/legal/refunds/page'),
  '/legal/app-privacy': () => import('@/app/legal/app-privacy/page'),
} as const

describe('beta pages stay out of search and navigation', () => {
  it.each(BETA_PAGE_PATHS)('%s declares noindex, nofollow', async (path) => {
    const page = await pageModules[path]()
    expect(page.metadata.robots).toEqual({ index: false, follow: false })
  })

  it('sends an X-Robots-Tag header for every beta path', async () => {
    const headers = await nextConfig.headers!()
    for (const path of BETA_PAGE_PATHS) {
      const rule = headers.find((entry) => entry.source === path)
      expect(rule?.headers).toContainEqual(BETA_ROBOTS_HEADER)
    }
  })

  it('leaves robots.txt as it was and keeps beta pages out of the sitemap', () => {
    expect(robots()).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: ['/studio', '/api'] },
      sitemap: 'https://vanescience.com/sitemap.xml',
    })
    const urls = sitemap().map((entry) => new URL(entry.url).pathname)
    for (const path of BETA_PAGE_PATHS) expect(urls).not.toContain(path)
  })

  it('is not linked from the site header or footer', () => {
    for (const file of ['components/layout/SiteHeader.tsx', 'components/layout/SiteFooter.tsx']) {
      const source = readFileSync(`${root}${file}`, 'utf8')
      for (const path of BETA_PAGE_PATHS) expect(source).not.toContain(`'${path}`)
      for (const path of BETA_PAGE_PATHS) expect(source).not.toContain(`"${path}`)
    }
  })
})

describe('server functions are pinned to Frankfurt', () => {
  it('vercel.json sets the function region to fra1 only', () => {
    const config = JSON.parse(readFileSync(`${root}vercel.json`, 'utf8'))
    expect(config.regions).toEqual(['fra1'])
  })
})

describe('placeholder pages carry no prices and no legal text', () => {
  it.each(BETA_PAGE_PATHS.filter((path) => path !== '/download'))('%s', async (path) => {
    const page = await pageModules[path]()
    const html = renderToStaticMarkup(createElement(page.default as () => React.ReactElement))
    const text = html.replace(/<[^>]+>/g, ' ')
    expect(text).not.toMatch(/€|EUR|\$|\d/)
    if (path.startsWith('/legal/')) expect(html).toContain('This text is being prepared.')
    if (path === '/pricing') expect(html).toContain('Plans and prices are coming soon.')
    if (path === '/account') {
      expect(html.match(/<button[^>]*disabled/g)).toHaveLength(3)
      expect(html.match(/Not active yet/g)).toHaveLength(3)
      for (const slot of ['customer-portal', 'withdrawal', 'cancellation']) expect(html).toContain(`data-slot="${slot}"`)
    }
  })
})
