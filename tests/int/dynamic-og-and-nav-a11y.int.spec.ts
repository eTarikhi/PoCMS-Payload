import fs from 'node:fs'
import path from 'node:path'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'

import { Navigation } from '@/app/(frontend)/components/layout/Navigation'

describe('Front-End Accessibility & Infrastructure Hygiene', () => {
  it('exposes accessible ARIA attributes on Navigation .navbar-toggler and toggles #navbarCollapse on click', async () => {
    const { container } = render(React.createElement(Navigation))

    const toggler = screen.getByRole('button', { name: 'Toggle navigation' })
    expect(toggler.getAttribute('aria-controls')).toBe('navbarCollapse')
    expect(toggler.getAttribute('aria-expanded')).toBe('false')

    const collapseEl = container.querySelector('#navbarCollapse')
    expect(collapseEl).not.toBeNull()

    fireEvent.click(toggler)
    await waitFor(() => {
      expect(toggler.getAttribute('aria-expanded')).toBe('true')
    })

    // Simulate Bootstrap Collapse completing its show transition so classList stays aligned in jsdom
    collapseEl?.classList.add('show')
    fireEvent(collapseEl!, new Event('shown.bs.collapse'))
    expect(toggler.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(toggler)
    await waitFor(() => {
      expect(toggler.getAttribute('aria-expanded')).toBe('false')
    })
  })

  it('keeps CI workflow, Docker Postgres 16 + standalone config, Open_Sans weights, and removed starter route aligned', () => {
    const root = process.cwd()

    // Starter route removed (0 unused-var ESLint warnings)
    expect(fs.existsSync(path.join(root, 'src/app/my-route/route.ts'))).toBe(false)

    // GitHub Actions CI workflow defines validate + e2e jobs with postgres:16-alpine
    const ciYaml = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8')
    expect(ciYaml).toContain('validate:')
    expect(ciYaml).toContain('e2e:')
    expect(ciYaml).toContain('postgres:16-alpine')
    expect(ciYaml).toContain('pnpm run test:e2e')

    // Docker Compose & Dockerfile aligned with PostgreSQL 16 + DOCKER_BUILD standalone output
    const composeYaml = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8')
    expect(composeYaml).toContain('postgres:16-alpine')
    expect(composeYaml).toContain('POSTGRES_URL')
    expect(composeYaml).not.toContain('mongo:')

    const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8')
    expect(dockerfile).toContain('ENV DOCKER_BUILD=true')
    expect(dockerfile).toContain('pnpm run generate:all')

    const nextConfig = fs.readFileSync(path.join(root, 'next.config.ts'), 'utf8')
    expect(nextConfig).toContain("process.env.DOCKER_BUILD === 'true'")
    expect(nextConfig).toContain("output: 'standalone'")

    // Font weight hygiene: no unrequested 300 or 800 weights remain in main.css or inner-pages.css
    const mainCss = fs.readFileSync(path.join(root, 'src/app/(frontend)/styles/main.css'), 'utf8')
    const innerCss = fs.readFileSync(
      path.join(root, 'src/app/(frontend)/styles/inner-pages.css'),
      'utf8',
    )
    expect(mainCss).not.toMatch(/font-weight:\s*300\b/)
    expect(innerCss).not.toMatch(/font-weight:\s*800\b/)
  })
})
