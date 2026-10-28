import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderToString } from 'react-dom/server'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { appRoutes } from '../src/routes'

const indexPath = fileURLToPath(
  new URL('../dist/index.html', import.meta.url),
)
const template = readFileSync(indexPath, 'utf8')

const PRERENDER_START = '<!--prerender-start-->'
const PRERENDER_END = '<!--prerender-end-->'
const EMPTY_ROOT = '<div id="root"></div>'

function stripPrerender(html: string): string {
  const start = html.indexOf(PRERENDER_START)
  if (start === -1) {
    return html
  }
  const end = html.indexOf(PRERENDER_END, start)
  if (end === -1) {
    return html
  }
  return (
    html.slice(0, start) +
    html.slice(end + PRERENDER_END.length)
  )
}

const baseTemplate = stripPrerender(template)

if (!baseTemplate.includes(EMPTY_ROOT)) {
  throw new Error('could not locate the app root in dist/index.html')
}

const landingMarkup = renderToString(
  <RouterProvider
    router={createMemoryRouter(appRoutes, { initialEntries: ['/'] })}
  />,
)

if (!landingMarkup.includes('Maps below the surface.')) {
  throw new Error('landing prerender is missing its headline')
}

const landingHtml = baseTemplate.replace(
  EMPTY_ROOT,
  `<div id="root">${PRERENDER_START}${landingMarkup}${PRERENDER_END}</div>`,
)
writeFileSync(indexPath, landingHtml)

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
      })[character] ?? character,
  )
}

function routeHtml(
  title: string,
  description: string,
): string {
  return baseTemplate
    .replace(
      /<title>[^<]*<\/title>/,
      `<title>${escapeHtml(title)}</title>`,
    )
    .replace(
      /(<meta\s+name="description"\s+content=")[^"]*(")/,
      `$1${escapeHtml(description)}$2`,
    )
}

const routes = [
  {
    file: 'maps/lisboa/index.html',
    title: 'Lisboa Metro Depth',
    description:
      'A 3D cutaway of the Lisbon Metro, with measured and published depths shown by provenance.',
  },
  {
    file: 'maps/lisboa/method/index.html',
    title: 'Method · Underground Atlas',
    description:
      'Data sources, provenance rules, and limitations for the Lisboa Metro depth map.',
  },
]

for (const route of routes) {
  const filePath = fileURLToPath(
    new URL(`../dist/${route.file}`, import.meta.url),
  )
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, routeHtml(route.title, route.description))
  console.log(`prerendered ${route.file}`)
}

console.log('prerendered index.html')
