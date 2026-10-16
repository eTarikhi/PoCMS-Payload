#!/usr/bin/env node
/**
 * Guards the admin's Tailwind prefix (ADR 0002). Unprefixed utilities generate no CSS at all, so a
 * forgotten `acn:` fails silently in the browser. This script compiles src/styles/admin/admin-ui.css
 * and reports, for every admin component:
 *   - MISSED: a string token that is a valid Tailwind utility once prefixed (e.g. `flex` → `acn:flex`)
 *   - NO-CSS: an `acn:` class that produces no CSS (typo, unsupported utility)
 *
 *   node scripts/check-tw-prefix.mjs [dir ...]     (default: src/components/admin)
 *
 * Exit code 1 when anything is found. Values of non-class attributes (data-*, role, variant, …),
 * type arguments and comments are ignored.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { compile } from '@tailwindcss/node'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cssPath = path.join(repo, 'src/styles/admin/admin-ui.css')
const compiler = await compile(fs.readFileSync(cssPath, 'utf8'), {
  base: path.dirname(cssPath),
  onDependency() {},
})

const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ['src/components/admin']
const files = []
const walk = (dir) => {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) walk(p)
    else if (/\.(tsx?|jsx?)$/.test(name) && !/\.(test|spec)\./.test(name)) files.push(p)
  }
}
for (const d of dirs) walk(path.join(repo, d))

let size = compiler.build([]).length
const cache = new Map()
const producesCss = (candidate) => {
  if (!cache.has(candidate)) {
    const next = compiler.build([candidate]).length
    cache.set(candidate, next > size)
    size = next
  }
  return cache.get(candidate)
}

const NON_CLASS_ATTRS =
  /\b(?:data-[\w-]+|aria-[\w-]+|role|variant|size|type|side|align|orientation|name|id|htmlFor|key|href|target|rel|method|mode|layout|width|lang|dir|autoComplete|inputMode|placeholder|title|alt)=(['"])[^'"]*\1/g
const MARKERS = /^(group|peer)(\/[\w-]+)?$/

let problems = 0
for (const file of files) {
  const source = fs
    .readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(NON_CLASS_ATTRS, '')
    .replace(/<(['"])[\w-]+\1>/g, '') // type arguments such as ComponentProps<'table'>
  const strings = [...source.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)].map((m) => m[2])
  const tokens = new Set(strings.flatMap((s) => s.split(/\s+/)).filter(Boolean))
  const rel = path.relative(repo, file)
  for (const token of tokens) {
    if (token.length > 300 || /[${}]/.test(token)) continue
    if (token.startsWith('acn:')) {
      if (MARKERS.test(token.slice(4)) || producesCss(token)) continue
      problems++
      console.log(`NO-CSS  ${rel}: ${token}`)
    } else if (/^[a-z0-9[&*!-]/.test(token) && !/^(https?|mailto):/.test(token)) {
      if (MARKERS.test(token) || producesCss(`acn:${token}`)) {
        problems++
        console.log(`MISSED  ${rel}: ${token}  →  acn:${token}`)
      }
    }
  }
}

console.log(`\nChecked ${files.length} files: ${problems} problem(s).`)
process.exit(problems > 0 ? 1 : 0)
