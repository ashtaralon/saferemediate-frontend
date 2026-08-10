import {copyFile, mkdir, readdir, readFile, writeFile} from "node:fs/promises"
import path from "node:path"

const root = process.cwd()
const checkOnly = process.argv.includes("--check")
const hostedBackend = "https://saferemediate-backend-f.onrender.com"
const localBackend = "http://127.0.0.1:8000"
const roots = ["app/api", "lib/server"]

async function prepareLocalFonts() {
  const layoutPath = path.join(root, "app/layout.tsx")
  const cssPath = path.join(root, "app/globals.css")
  const layout = await readFile(layoutPath, "utf8")
  const css = await readFile(cssPath, "utf8")
  const nextLayout = layout
    .replace('import { Geist, Geist_Mono } from "next/font/google"\n', "")
    .replace(
      /const geistSans = Geist\([^\n]+\)\nconst geistMono = Geist_Mono\([^\n]+\)/,
      'const geistSans = {variable: "customer-geist-sans"}\nconst geistMono = {variable: "customer-geist-mono"}',
    )
  const fontCss = `@font-face {\n  font-family: "Geist";\n  src: url("/fonts/geist-latin.woff2") format("woff2");\n  font-display: swap;\n  font-weight: 100 900;\n}\n@font-face {\n  font-family: "Geist Mono";\n  src: url("/fonts/geist-mono-latin.woff2") format("woff2");\n  font-display: swap;\n  font-weight: 100 900;\n}\n:root {\n  --font-geist-sans: "Geist";\n  --font-geist-mono: "Geist Mono";\n}\n\n`

  if (nextLayout === layout) throw new Error("Customer font transform no longer matches app/layout.tsx")
  if (checkOnly) return

  await writeFile(layoutPath, nextLayout)
  await writeFile(cssPath, `${fontCss}${css}`)
  const target = path.join(root, "public/fonts")
  await mkdir(target, {recursive: true})
  const source = path.join(root, "node_modules/next/dist/next-devtools/server/font")
  await copyFile(path.join(source, "geist-latin.woff2"), path.join(target, "geist-latin.woff2"))
  await copyFile(path.join(source, "geist-mono-latin.woff2"), path.join(target, "geist-mono-latin.woff2"))
}

async function filesUnder(relative) {
  const absolute = path.join(root, relative)
  const entries = await readdir(absolute, {withFileTypes: true})
  const result = []
  for (const entry of entries) {
    const child = path.join(relative, entry.name)
    if (entry.isDirectory()) result.push(...await filesUnder(child))
    else if (/\.(?:js|mjs|cjs|ts|tsx)$/.test(entry.name)) result.push(child)
  }
  return result
}

const files = (await Promise.all(roots.map(filesUnder))).flat()
await prepareLocalFonts()
let replacements = 0
for (const relative of files) {
  const absolute = path.join(root, relative)
  const before = await readFile(absolute, "utf8")
  const after = before.split(hostedBackend).join(localBackend)
  if (after !== before) {
    replacements += before.split(hostedBackend).length - 1
    if (!checkOnly) await writeFile(absolute, after)
  }
}

const leaks = []
for (const relative of files) {
  const source = await readFile(path.join(root, relative), "utf8")
  const effective = checkOnly ? source.split(hostedBackend).join(localBackend) : source
  if (effective.includes(hostedBackend)) leaks.push(relative)
}
if (leaks.length) {
  throw new Error(`Customer image still references hosted backend: ${leaks.join(", ")}`)
}
console.log(`${checkOnly ? "Validated" : "Prepared"} customer-resident server source (${replacements} hosted URL replacements)`)
