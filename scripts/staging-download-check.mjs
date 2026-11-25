#!/usr/bin/env node
// Staging check of the download prototype (loop `loop-website-download-staging`, goals G1 to G7).
// Run: node scripts/staging-download-check.mjs
// The script prints one line for each goal with PASS or FAIL and the reason.
// The exit code is 0 only when all goals pass.
// STAGING_BASE_URL replaces the default staging address.
// VERCEL_AUTOMATION_BYPASS_SECRET gives the bypass secret. Without it, the script reads the Windows
// credential `mqs-website-staging/vercel-bypass`. The script never prints the secret.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const DEFAULT_BASE_URL = 'https://vane-science-website-git-staging-download-prototype-vane-science.vercel.app'
const SHOTS_DIR = 'C:/Users/mqs/Documents/vane-website-staging-shots'
const DOWNLOAD_HOST = 'https://download.vanescience.com'
const EXPECTED = {
  mac: { version: '0.1.0-test.11', kind: 'dmg' },
  windows: { version: '0.1.0-test.17', kind: 'nsis' },
}
const MAIN_HEAD_PREFIX = 'c5ce4c19'
const USER_AGENTS = {
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
}
const FETCH_TIMEOUT_MS = 20_000
const DOWNLOAD_TIMEOUT_MS = 15 * 60_000

const base = new URL(process.env.STAGING_BASE_URL || DEFAULT_BASE_URL)
const results = new Map()

function record(goal, ok, reason) {
  const previous = results.get(goal)
  // A goal passes only when each of its parts passes.
  if (previous && !previous.ok) return
  if (previous && ok) {
    results.set(goal, { ok, reason: `${previous.reason}; ${reason}` })
    return
  }
  results.set(goal, { ok, reason })
}

function readBypassSecret() {
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) return process.env.VERCEL_AUTOMATION_BYPASS_SECRET.trim()
  if (process.platform !== 'win32') return ''
  // CredRead gives the password of a generic credential. cmdkey cannot show it.
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class StagingCred {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL { public int Flags; public int Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob;
    public int Persist; public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName; }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredRead(string target, int type, int flags, out IntPtr cred);
  [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr cred);
  public static string Read(string target) {
    IntPtr p; if (!CredRead(target, 1, 0, out p)) return "";
    try { var c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
      return Marshal.PtrToStringUni(c.CredentialBlob, c.CredentialBlobSize / 2); } finally { CredFree(p); }
  }
}
"@
[Console]::Out.Write([StagingCred]::Read('mqs-website-staging/vercel-bypass'))
`
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

const bypass = readBypassSecret()
const bypassHeaders = bypass ? { 'x-vercel-protection-bypass': bypass } : {}

async function fetchWithTimeout(url, init = {}, timeout = FETCH_TIMEOUT_MS) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeout) })
}

function stagingUrl(path) {
  return new URL(path, base).toString()
}

/** The text of an error, without a query string that can hold a token. */
function safeError(error) {
  return String(error?.message ?? error).replace(/\?[^\s"']*/gu, '?…').slice(0, 300)
}

// ---------- browser checks (G1, G2, G3) ----------

async function newPage(browser, os) {
  const context = await browser.newContext({
    userAgent: USER_AGENTS[os],
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  })
  // The bypass header goes to the staging host only, never to another host.
  await context.route((url) => url.origin === base.origin, (route) =>
    route.continue({ headers: { ...route.request().headers(), ...bypassHeaders } }))
  // A saved language keeps the first-visit language dialog closed.
  await context.addCookies([{ name: 'vane-lang', value: 'en', url: base.origin }])
  const page = await context.newPage()
  return { context, page }
}

/** Accent color of the site as `rgb(...)`, read from its own design token. */
async function accentColor(page) {
  return page.evaluate(() => {
    const token = getComputedStyle(document.documentElement).getPropertyValue('--mqs-accent').trim()
    if (!token) return ''
    const probe = document.createElement('span')
    probe.style.color = token
    document.body.append(probe)
    const value = getComputedStyle(probe).color
    probe.remove()
    return value
  })
}

async function checkG1(browser) {
  const { context, page } = await newPage(browser, 'mac')
  try {
    const response = await page.goto(stagingUrl('/'), { waitUntil: 'networkidle', timeout: 60_000 })
    if (!response || response.status() !== 200) throw new Error(`landing page answered ${response?.status()}`)
    const accent = await accentColor(page)
    const facts = await page.evaluate(() => {
      const header = document.querySelector('header')
      if (!header) return { error: 'no header on the landing page' }
      const logo = header.querySelector('img[alt="VANE Science"]') ?? header.querySelector('a[href="/"]')
      if (!logo) return { error: 'no VANE Science logo in the header' }
      const link = [...header.querySelectorAll('a[href]')].find((a) =>
        a.textContent.replace(/\s+/gu, ' ').trim().toUpperCase() === 'DOWNLOAD MQS')
      if (!link) return { error: 'no link with the text "DOWNLOAD MQS" in the top navigation' }
      const word = (text) => [...link.querySelectorAll('*')].find((element) =>
        element.children.length === 0 && element.textContent.trim().toUpperCase() === text)
      const download = word('DOWNLOAD')
      const mqs = word('MQS')
      if (!download || !mqs) return { error: 'the two words "DOWNLOAD" and "MQS" are not in their own elements' }
      const h1 = document.querySelector('main h1')
      const sub = h1?.nextElementSibling
      if (!h1 || !sub) return { error: 'no header and sub-header on the page to compare with' }
      const style = (element) => getComputedStyle(element)
      const box = (element) => element.getBoundingClientRect()
      const linkStyle = style(link)
      const logoBox = box(logo)
      const linkBox = box(link)
      return {
        href: new URL(link.getAttribute('href'), location.href).pathname,
        logo: { left: logoBox.left, right: logoBox.right, top: logoBox.top, bottom: logoBox.bottom },
        link: { left: linkBox.left, right: linkBox.right, top: linkBox.top, bottom: linkBox.bottom },
        background: linkStyle.backgroundColor,
        backgroundImage: linkStyle.backgroundImage,
        borders: ['Top', 'Right', 'Bottom', 'Left'].map((side) =>
          linkStyle[`border${side}Style`] === 'none' ? 0 : parseFloat(linkStyle[`border${side}Width`])),
        colors: [linkStyle.color, style(download).color, style(mqs).color],
        download: { size: style(download).fontSize, weight: Number(style(download).fontWeight), family: style(download).fontFamily,
          transform: style(download).textTransform, text: download.textContent.trim() },
        mqs: { size: style(mqs).fontSize, weight: Number(style(mqs).fontWeight), family: style(mqs).fontFamily,
          transform: style(mqs).textTransform, text: mqs.textContent.trim() },
        headerFamily: style(h1).fontFamily,
        subFamily: style(sub).fontFamily,
        subWeight: Number(style(sub).fontWeight),
      }
    })
    await page.screenshot({ path: join(SHOTS_DIR, 'g1-landing-top-mac.png'), clip: { x: 0, y: 0, width: 1440, height: 260 } })
    if (facts.error) return record('G1', false, facts.error)
    const problems = []
    if (facts.link.left < facts.logo.right) problems.push('the link is not at the right of the logo')
    const linkMiddle = (facts.link.top + facts.link.bottom) / 2
    if (linkMiddle < facts.logo.top - 12 || linkMiddle > facts.logo.bottom + 12) problems.push('the link is not in the row of the logo')
    if (!/rgba\(0, 0, 0, 0\)|transparent/u.test(facts.background) || facts.backgroundImage !== 'none') problems.push(`the link has a fill (${facts.background})`)
    if (facts.borders.some((width) => width > 0)) problems.push('the link has a border')
    if (!accent) problems.push('the site has no --mqs-accent token')
    else if (facts.colors.some((color) => color !== accent)) problems.push(`color ${facts.colors.join('/')} is not the accent ${accent}`)
    if (facts.download.size !== facts.mqs.size) problems.push(`font sizes differ (${facts.download.size} and ${facts.mqs.size})`)
    if (facts.mqs.weight < 700) problems.push(`"MQS" weight is ${facts.mqs.weight}, not bold`)
    if (facts.mqs.family !== facts.headerFamily) problems.push('"MQS" is not in the header type style')
    if (facts.download.family !== facts.subFamily) problems.push('"DOWNLOAD" is not in the sub-header type style')
    if (facts.download.weight >= 700) problems.push('"DOWNLOAD" is bold, but the sub-header style is light')
    if (facts.href !== '/download') problems.push(`the link goes to ${facts.href}, not /download`)
    if (problems.length) return record('G1', false, problems.join('; '))
    record('G1', true, `label right of the logo, accent ${accent}, ${facts.mqs.size} both words, MQS ${facts.mqs.weight}, goes to /download`)
  } finally {
    await context.close()
  }
}

/** Facts about a download button: fill, icon, icon place, link. */
async function buttonFacts(page, handle) {
  return page.evaluate((button) => {
    const style = getComputedStyle(button)
    const icon = button.querySelector('[data-os]')
    const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT)
    let textRight = -Infinity
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      textRight = Math.max(textRight, range.getBoundingClientRect().right)
    }
    const iconBox = icon?.getBoundingClientRect()
    const buttonBox = button.getBoundingClientRect()
    return {
      text: button.textContent.replace(/\s+/gu, ' ').trim(),
      background: style.backgroundColor,
      borderWidth: style.borderTopStyle === 'none' ? 0 : parseFloat(style.borderTopWidth),
      iconOs: icon?.getAttribute('data-os') ?? null,
      iconRightOfText: iconBox ? iconBox.left >= textRight - 0.5 : false,
      iconInside: iconBox ? iconBox.left >= buttonBox.left && iconBox.right <= buttonBox.right &&
        iconBox.top >= buttonBox.top && iconBox.bottom <= buttonBox.bottom : false,
      iconSize: iconBox ? Math.round(iconBox.width) : 0,
      href: button.getAttribute('href') ? new URL(button.getAttribute('href'), location.href).toString() : null,
    }
  }, handle)
}

async function checkG2(browser) {
  for (const os of ['mac', 'windows']) {
    const { context, page } = await newPage(browser, os)
    try {
      const response = await page.goto(stagingUrl('/for/coach'), { waitUntil: 'networkidle', timeout: 60_000 })
      if (!response || response.status() !== 200) throw new Error(`For Coaches page answered ${response?.status()}`)
      const accent = await accentColor(page)
      const waitlist = await page.evaluate(() => [...document.querySelectorAll('a, button, [role="button"], input[type="submit"], input[type="button"]')]
        .filter((element) => /join the wait\s*list/iu.test(element.textContent || element.value || '')).length)
      const buttons = await page.locator('main a, main button').filter({ hasText: /^\s*Download MQS\s*$/iu }).elementHandles()
      await page.screenshot({ path: join(SHOTS_DIR, `g2-coaches-${os}.png`), clip: { x: 0, y: 0, width: 1440, height: 900 } })
      if (waitlist > 0) { record('G2', false, `${os}: ${waitlist} "Join the Waitlist" control(s) left`); continue }
      if (buttons.length === 0) { record('G2', false, `${os}: no "Download MQS" button in the For Coaches section`); continue }
      const facts = await buttonFacts(page, buttons[0])
      const problems = []
      if (facts.background !== accent) problems.push(`fill ${facts.background} is not the accent ${accent}`)
      if (facts.iconOs !== os) problems.push(`icon is ${facts.iconOs ?? 'missing'}, not ${os}`)
      if (!facts.iconInside || !facts.iconRightOfText) problems.push('the icon is not inside the button at the right of the text')
      if (!facts.href || new URL(facts.href).pathname !== '/download') problems.push(`the button goes to ${facts.href}`)
      if (problems.length) { record('G2', false, `${os}: ${problems.join('; ')}`); continue }
      record('G2', true, `${os}: no waitlist control, "Download MQS" in accent with the ${os} icon (${facts.iconSize}px) right of the text, goes to /download`)
    } finally {
      await context.close()
    }
  }
}

const downloadLinks = {}

async function checkG3(browser) {
  for (const os of ['mac', 'windows']) {
    const other = os === 'mac' ? 'windows' : 'mac'
    const { context, page } = await newPage(browser, os)
    try {
      const response = await page.goto(stagingUrl('/download'), { waitUntil: 'networkidle', timeout: 60_000 })
      await page.screenshot({ path: join(SHOTS_DIR, `g3-download-${os}.png`), fullPage: true })
      if (!response || response.status() !== 200) { record('G3', false, `${os}: /download answered ${response?.status()}`); continue }
      const accent = await accentColor(page)
      const h1 = (await page.locator('main h1').first().textContent({ timeout: 5000 }).catch(() => ''))?.trim()
      const mainButton = await page.$(`main a[data-download-os="${os}"]`)
      const otherButton = await page.$(`main a[data-download-os="${other}"]`)
      const textLength = await page.evaluate(() => [...document.querySelectorAll('main p')].reduce((sum, p) => sum + p.textContent.trim().length, 0))
      const problems = []
      if (h1 !== 'Downloads') problems.push(`h1 is "${h1}", not "Downloads"`)
      if (!mainButton || !otherButton) problems.push('the two buttons (data-download-os) are not both there')
      if (textLength < 80) problems.push('no placeholder text on the page')
      if (mainButton && otherButton) {
        const first = await buttonFacts(page, mainButton)
        const second = await buttonFacts(page, otherButton)
        downloadLinks[os] = first.href
        downloadLinks[other] = second.href
        if (first.background !== accent) problems.push(`the ${os} button is not the main button (fill ${first.background})`)
        if (first.iconOs !== os) problems.push(`the main button icon is ${first.iconOs ?? 'missing'}`)
        if (second.background === accent || second.borderWidth <= 0) problems.push(`the ${other} button is not in the secondary style`)
        if (second.iconOs !== other) problems.push(`the ${other} button icon is ${second.iconOs ?? 'missing'}`)
        const mainBox = await mainButton.boundingBox()
        const otherBox = await otherButton.boundingBox()
        if (mainBox && otherBox && (mainBox.y > otherBox.y + 1 || (Math.abs(mainBox.y - otherBox.y) <= 1 && mainBox.x > otherBox.x))) {
          problems.push('the main button does not come first')
        }
      }
      if (problems.length) { record('G3', false, `${os}: ${problems.join('; ')}`); continue }
      record('G3', true, `${os}: "Downloads", main ${os} button in accent with its icon, ${other} button secondary, ${textLength} characters of text`)
    } finally {
      await context.close()
    }
  }
}

// ---------- HTTP checks (G4, G5, G6, G7) ----------

async function stagingManifest(os) {
  const response = await fetchWithTimeout(stagingUrl(`/api/download/${os}/manifest`), { headers: bypassHeaders, cache: 'no-store' })
  if (!response.ok) throw new Error(`the staging manifest route for ${os} answered ${response.status}`)
  return response.json()
}

/** The download host address that a staging link redirects to. */
async function resolveDownloadLink(link) {
  const response = await fetchWithTimeout(link, { headers: bypassHeaders, redirect: 'manual' })
  const location = response.headers.get('location')
  if (response.status < 300 || response.status > 399 || !location) {
    throw new Error(`the staging link answered ${response.status} with no redirect`)
  }
  return new URL(location, link)
}

async function checkG4() {
  for (const os of ['mac', 'windows']) {
    try {
      const link = downloadLinks[os]
      if (!link) throw new Error('no button link from the download page (G3)')
      const target = await resolveDownloadLink(link)
      const manifest = await stagingManifest(os)
      if (manifest.version !== EXPECTED[os].version) throw new Error(`manifest version is ${manifest.version}, not ${EXPECTED[os].version}`)
      const name = decodeURIComponent(target.pathname.split('/').pop() ?? '')
      const entry = (manifest.files ?? []).find((file) => file.name === name)
      if (!entry) throw new Error(`the link file ${name} is not in the manifest`)
      if (entry.kind !== EXPECTED[os].kind) throw new Error(`the link file is a ${entry.kind}, not a ${EXPECTED[os].kind}`)
      const response = await fetchWithTimeout(target, {}, DOWNLOAD_TIMEOUT_MS)
      if (!response.ok || !response.body) throw new Error(`the download host answered ${response.status}`)
      const hash = createHash('sha256')
      let bytes = 0
      for await (const chunk of response.body) {
        hash.update(chunk)
        bytes += chunk.length
      }
      const digest = hash.digest('hex')
      if (digest !== entry.sha256) throw new Error(`SHA-256 ${digest.slice(0, 12)}… is not the manifest value ${entry.sha256.slice(0, 12)}…`)
      if (bytes !== entry.bytes) throw new Error(`size ${bytes} is not the manifest size ${entry.bytes}`)
      record('G4', true, `${os}: ${name} ${bytes} bytes, SHA-256 equal to manifest ${manifest.version}`)
    } catch (error) {
      record('G4', false, `${os}: ${safeError(error)}`)
    }
  }
}

async function checkG5() {
  try {
    const manifest = await stagingManifest('windows')
    if (manifest.version !== EXPECTED.windows.version) throw new Error(`manifest-windows.json names ${manifest.version}`)
    if (!(manifest.files ?? []).some((file) => file.os === 'windows' && file.kind === 'nsis')) throw new Error('no Windows installer in the manifest')
    record('G5', true, `mqs/test/manifest-windows.json names ${manifest.version}`)
  } catch (error) {
    record('G5', false, safeError(error))
  }
}

async function checkG6() {
  try {
    const response = await fetchWithTimeout(`${DOWNLOAD_HOST}/mqs/test/manifest-mac.json`, { redirect: 'manual' })
    const cache = response.headers.get('cache-control')
    if (response.status !== 401) throw new Error(`no credentials gave ${response.status}, not 401`)
    if (cache !== 'private, no-store') throw new Error(`Cache-Control is "${cache}"`)
    record('G6', true, 'no credentials: 401 with private, no-store')
  } catch (error) {
    record('G6', false, safeError(error))
  }
  for (const os of ['mac', 'windows']) {
    // The channel of the link must stay test, also when the visitor asks for another channel.
    for (const query of ['', '?channel=stable', '?ch=beta']) {
      try {
        const target = await resolveDownloadLink(stagingUrl(`/api/download/${os}${query}`))
        if (target.origin !== DOWNLOAD_HOST) throw new Error(`the link goes to ${target.origin}`)
        if (/^\/mqs\/(stable|beta)\//u.test(target.pathname)) throw new Error(`the link opens ${target.pathname}`)
        if (!target.pathname.startsWith('/mqs/test/')) throw new Error(`the link opens ${target.pathname}, not mqs/test/`)
      } catch (error) {
        record('G6', false, `${os}${query}: ${safeError(error)}`)
      }
    }
  }
  if (results.get('G6')?.ok) record('G6', true, 'staging links open mqs/test/ only')
}

async function checkG7() {
  try {
    const response = await fetchWithTimeout('https://vanescience.com/download', { redirect: 'follow' })
    if (response.status !== 404) throw new Error(`https://vanescience.com/download answered ${response.status}, not 404`)
    record('G7', true, 'vanescience.com/download is 404')
  } catch (error) {
    record('G7', false, safeError(error))
  }
  try {
    const head = execFileSync('gh', ['api', 'repos/dario7s/vane-website-final/branches/main', '--jq', '.commit.sha'], { encoding: 'utf8' }).trim()
    if (!head.startsWith(MAIN_HEAD_PREFIX)) throw new Error(`website main is ${head.slice(0, 10)}, not ${MAIN_HEAD_PREFIX}`)
    record('G7', true, `website main is ${head.slice(0, 8)}`)
  } catch (error) {
    record('G7', false, safeError(error))
  }
  try {
    for (const path of ['/', '/download', '/api/download/mac']) {
      const response = await fetchWithTimeout(stagingUrl(path), { redirect: 'manual' })
      const body = await response.text()
      const login = response.status === 401 || (response.status >= 300 && response.status < 400 &&
        /vercel\.com/u.test(response.headers.get('location') ?? ''))
      if (!login) throw new Error(`${path} without the bypass answered ${response.status}`)
      if (/Human Movement|Downloads|download\.vanescience\.com/u.test(body)) throw new Error(`${path} without the bypass shows page content`)
    }
    record('G7', true, 'staging without login answers 401 or the Vercel login')
  } catch (error) {
    record('G7', false, safeError(error))
  }
  try {
    for (const path of ['/', '/for/coach', '/download']) {
      const response = await fetchWithTimeout(stagingUrl(path), { headers: { ...bypassHeaders, cookie: 'vane-lang=en' } })
      if (response.status !== 200) throw new Error(`${path} with the bypass answered ${response.status}`)
      const header = response.headers.get('x-robots-tag') ?? ''
      const html = await response.text()
      const meta = /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/iu.test(html)
      if (!/noindex/iu.test(header) && !meta) throw new Error(`${path} has no noindex`)
    }
    record('G7', true, 'staging pages carry noindex')
  } catch (error) {
    record('G7', false, safeError(error))
  }
}

async function main() {
  mkdirSync(SHOTS_DIR, { recursive: true })
  console.log(`Staging: ${base.origin}  bypass secret: ${bypass ? 'found' : 'MISSING'}`)
  let browser
  try {
    browser = await chromium.launch()
    for (const [goal, check] of [['G1', checkG1], ['G2', checkG2], ['G3', checkG3]]) {
      try {
        await check(browser)
      } catch (error) {
        record(goal, false, safeError(error))
      }
    }
  } catch (error) {
    for (const goal of ['G1', 'G2', 'G3']) if (!results.has(goal)) record(goal, false, `browser: ${safeError(error)}`)
  } finally {
    await browser?.close()
  }
  await checkG4()
  await checkG5()
  await checkG6()
  await checkG7()
  let failed = 0
  for (const goal of ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7']) {
    const result = results.get(goal) ?? { ok: false, reason: 'not checked' }
    if (!result.ok) failed += 1
    console.log(`${goal} ${result.ok ? 'PASS' : 'FAIL'} ${result.reason}`)
  }
  console.log(failed === 0 ? 'ALL PASS' : `${failed} of 7 FAIL`)
  process.exitCode = failed === 0 ? 0 : 1
}

await main()
