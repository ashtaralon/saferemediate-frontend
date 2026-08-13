#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const roots = ['components', 'app']
const suffixes = new Set(['.ts', '.tsx', '.js', '.jsx'])
const banned = [
  ['/vulnerability/port/', 'legacy port-catalogue endpoint'],
  ['/vulnerability/sg/', 'legacy SG/CVE correlation endpoint'],
  ['CVE_PORT_MAPPING', 'hard-coded CVE-to-port mapping'],
  ['PORT_TO_SERVICE', 'port-to-software inference'],
  ['port.cve_count', 'per-port CVE count without verified attribution'],
  ['/inject-cve', 'synthetic CVE injection surface'],
]

const failures = []
function visit(candidate) {
  if (!fs.existsSync(candidate)) return
  for (const entry of fs.readdirSync(candidate, { withFileTypes: true })) {
    const full = path.join(candidate, entry.name)
    if (entry.isDirectory()) visit(full)
    else if (suffixes.has(path.extname(entry.name))) {
      const source = fs.readFileSync(full, 'utf8')
      source.split('\n').forEach((line, index) => {
        if (line.includes('WAIVER: port-cve')) return
        for (const [needle, label] of banned) {
          if (line.includes(needle)) failures.push(`${full}:${index + 1}: ${label}`)
        }
      })
    }
  }
}

roots.forEach(visit)
if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join('\n'))
  process.exit(1)
}
console.log('PASS: frontend does not infer resource CVEs from ports or SG rules')
