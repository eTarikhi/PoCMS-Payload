#!/usr/bin/env node
/**
 * Guards the admin's Tailwind prefix (ADR 0002). Unprefixed utilities generate no CSS at all, so a
 * forgotten `acn:` fails silently in the browser. The script compiles src/styles/admin/admin-ui.css
 * and checks the class strings of every admin component:
 *
 *   MISSED  a token that becomes a valid utility once prefixed (`flex` → `acn:flex`)
 *   NO-CSS  an `acn:` class that produces no CSS (typo or unsupported utility)
 *
 * Class strings are found with the TypeScript AST: `className` attributes, arguments of
 * cn()/clsx()/cva() (including clsx object keys, ternaries, cva variants and compoundVariants), and
 * any other string literal that mixes prefixed and unprefixed utilities or consists of two or more
 * utilities. Plain data strings ('outline', 'accent-foreground') are therefore not reported.
 *
 *   node scripts/check-tw-prefix.mjs [dir ...]     (default: src/components/admin)
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { compile } from '@tailwindcss/node'
import ts from 'typescript'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cssPath = path.join(repo, 'src/styles/admin/admin-ui.css')
const compiler = await compile(fs.readFileSync(cssPath, 'utf8'), {
  base: path.dirname(cssPath),
  onDependency() {},
})

let cssSize = compiler.build([]).length
const cache = new Map()
const producesCss = (candidate) => {
  if (!cache.has(candidate)) {
    const next = compiler.build([candidate]).length
    cache.set(candidate, next > cssSize)
    cssSize = next
  }
  return cache.get(candidate)
}

const CLASS_FUNCTIONS = new Set(['cn', 'clsx', 'cva', 'twMerge'])
const MARKER = /^(group|peer)(\/[\w-]+)?$/

/** Static string parts of an expression used as a class value. */
function stringsOf(node, out = []) {
  if (!node) return out
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push(node.text)
  else if (ts.isTemplateExpression(node)) {
    out.push(node.head.text, ...node.templateSpans.map((span) => span.literal.text))
  } else if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) stringsOf(node.expression, out)
  else if (ts.isConditionalExpression(node)) {
    stringsOf(node.whenTrue, out)
    stringsOf(node.whenFalse, out)
  } else if (ts.isBinaryExpression(node)) {
    stringsOf(node.left, out)
    stringsOf(node.right, out)
  } else if (ts.isArrayLiteralExpression(node)) node.elements.forEach((el) => stringsOf(el, out))
  else if (ts.isObjectLiteralExpression(node)) {
    // clsx object syntax: { 'acn:hidden': condition }
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop) && (ts.isStringLiteral(prop.name) || ts.isIdentifier(prop.name))) {
        out.push(prop.name.text)
      }
    }
  }
  return out
}

/** cva(base, { variants, compoundVariants }) — never defaultVariants. */
function cvaStrings(call) {
  const [base, options] = call.arguments
  const out = stringsOf(base)
  if (!options || !ts.isObjectLiteralExpression(options)) return out
  for (const prop of options.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    const key = prop.name.getText().replace(/['"]/g, '')
    if (key === 'variants' && ts.isObjectLiteralExpression(prop.initializer)) {
      for (const variant of prop.initializer.properties) {
        if (ts.isPropertyAssignment(variant) && ts.isObjectLiteralExpression(variant.initializer)) {
          for (const option of variant.initializer.properties) {
            if (ts.isPropertyAssignment(option)) stringsOf(option.initializer, out)
          }
        }
      }
    }
    if (key === 'compoundVariants' && ts.isArrayLiteralExpression(prop.initializer)) {
      for (const entry of prop.initializer.elements) {
        if (!ts.isObjectLiteralExpression(entry)) continue
        for (const p of entry.properties) {
          if (ts.isPropertyAssignment(p) && /^(class|className)$/.test(p.name.getText())) {
            stringsOf(p.initializer, out)
          }
        }
      }
    }
  }
  return out
}

function classStrings(sourceFile) {
  const certain = []
  const literals = []
  const visit = (node) => {
    if (ts.isJsxAttribute(node) && /^(className|class)$/.test(node.name.getText())) {
      const init = node.initializer
      if (init && ts.isStringLiteral(init)) certain.push(init.text)
      else if (init && ts.isJsxExpression(init)) stringsOf(init.expression, certain)
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && CLASS_FUNCTIONS.has(node.expression.text)) {
      if (node.expression.text === 'cva') certain.push(...cvaStrings(node))
      else node.arguments.forEach((arg) => stringsOf(arg, certain))
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      literals.push(node.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return { certain, literals }
}

const tokensOf = (text) => text.split(/\s+/).filter((t) => t && t.length < 300 && !/[${}]/.test(t))
const looksLikeUtility = (token) => /^[a-z0-9[&*!@-]/.test(token) && !/^(https?|mailto):/.test(token)

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

let problems = 0
const report = (kind, file, token) => {
  problems++
  console.log(`${kind.padEnd(7)} ${path.relative(repo, file)}: ${token}${kind === 'MISSED' ? `  →  acn:${token}` : ''}`)
}

for (const file of files) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const { certain, literals } = classStrings(source)
  const seen = new Set()
  const check = (token, kind) => {
    const key = `${kind}:${token}`
    if (seen.has(key)) return
    seen.add(key)
    report(kind, file, token)
  }

  for (const text of certain) {
    for (const token of tokensOf(text)) {
      if (token.startsWith('acn:')) {
        if (!MARKER.test(token.slice(4)) && !producesCss(token)) check(token, 'NO-CSS')
      } else if (looksLikeUtility(token) && (MARKER.test(token) || producesCss(`acn:${token}`))) {
        check(token, 'MISSED')
      }
    }
  }

  // Other literals: report only when the string is clearly a class list.
  for (const text of literals) {
    const tokens = tokensOf(text)
    const prefixed = tokens.filter((t) => t.startsWith('acn:'))
    const unprefixed = tokens.filter((t) => !t.startsWith('acn:') && looksLikeUtility(t) && producesCss(`acn:${t}`))
    const isClassList = prefixed.length > 0 || (tokens.length >= 2 && unprefixed.length === tokens.length)
    if (!isClassList) continue
    unprefixed.forEach((t) => check(t, 'MISSED'))
    prefixed.filter((t) => !MARKER.test(t.slice(4)) && !producesCss(t)).forEach((t) => check(t, 'NO-CSS'))
  }
}

console.log(`\nChecked ${files.length} files: ${problems} problem(s).`)
process.exit(problems > 0 ? 1 : 0)
