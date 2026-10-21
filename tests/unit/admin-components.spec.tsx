// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Badge } from '@/components/admin/elements/Badge'
import { Button } from '@/components/admin/elements/Button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/admin/elements/Dialog'
import { Checkbox } from '@/components/admin/elements/Checkbox'
import { IntegrationNotice } from '@/components/admin/elements/IntegrationNotice'
import { RunStatus } from '@/components/admin/elements/RunStatus'
import { Input } from '@/components/admin/elements/Input'
import { Progress } from '@/components/admin/elements/Progress'
import { Sparkline } from '@/components/admin/elements/Sparkline'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/admin/elements/Tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/admin/elements/ToggleGroup'
import { WidgetCard } from '@/components/admin/elements/WidgetCard'

/**
 * Component tests for the admin's primitives (roadmap P2.6).
 *
 * The axe checks in the e2e suite prove the rendered screens are accessible; these prove the
 * primitives behave — the parts that are easy to break when a primitive is upgraded, a class moves
 * or a wrapper is added: which element is rendered, whether a click reaches the handler, whether a
 * disabled control refuses input, whether the tab list responds to the keyboard, whether a dialog
 * takes focus and returns it. jsdom only: no stylesheet, no browser (see `vitest.config.mts`).
 *
 * Testing Library only registers its automatic cleanup when the test framework provides global
 * `afterEach`, and this project keeps Vitest's globals off, so each test cleans up explicitly.
 */
afterEach(cleanup)
describe('Button', () => {
  it('renders a button with the variant and size classes', () => {
    render(
      <Button variant="destructive" size="sm">
        Delete
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Delete' })
    expect(button).toHaveAttribute('data-slot', 'button')
    expect(button.className).toContain('acn:bg-destructive/10')
    expect(button.className).toContain('acn:h-8')
  })

  it('calls onClick and does not call it while disabled', async () => {
    const onClick = vi.fn()
    const { rerender } = render(<Button onClick={onClick}>Save</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onClick).toHaveBeenCalledTimes(1)

    rerender(
      <Button onClick={onClick} disabled>
        Save
      </Button>,
    )
    const disabled = screen.getByRole('button', { name: 'Save' })
    expect(disabled).toBeDisabled()
    await userEvent.click(disabled)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('keeps the custom class next to the generated ones', () => {
    render(<Button className="acn:my-marker">Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' }).className).toContain('acn:my-marker')
  })
})

describe('Badge', () => {
  it('renders a span by default and applies the variant', () => {
    render(<Badge variant="outline">Published</Badge>)
    const badge = screen.getByText('Published')
    expect(badge.tagName).toBe('SPAN')
    expect(badge.className).toContain('acn:border-border')
  })

  it('renders the element passed through `render`', () => {
    render(
      <Badge render={<a href="https://example.com/articles" />} variant="secondary">
        Articles
      </Badge>,
    )
    const link = screen.getByRole('link', { name: 'Articles' })
    expect(link).toHaveAttribute('href', 'https://example.com/articles')
    expect(link.className).toContain('acn:bg-secondary')
  })
})

describe('Progress', () => {
  it('exposes the value to assistive technology', () => {
    render(<Progress value={42} aria-label="Content health" />)
    const bar = screen.getByRole('progressbar', { name: 'Content health' })
    expect(bar).toHaveAttribute('aria-valuenow', '42')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
  })

  it('renders the track and indicator parts', () => {
    const { container } = render(<Progress value={10} />)
    expect(container.querySelector('[data-slot="progress-track"]')).not.toBeNull()
    expect(container.querySelector('[data-slot="progress-indicator"]')).not.toBeNull()
  })
})

describe('Tabs', () => {
  const Example = () => (
    <Tabs defaultValue="media">
      <TabsList>
        <TabsTrigger value="media">Media library</TabsTrigger>
        <TabsTrigger value="url">External URL</TabsTrigger>
      </TabsList>
      <TabsContent value="media">Pick a file</TabsContent>
      <TabsContent value="url">Paste a URL</TabsContent>
    </Tabs>
  )

  it('shows the selected panel and hides the other', () => {
    render(<Example />)
    expect(screen.getByRole('tab', { name: 'Media library' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByText('Pick a file')).toBeVisible()
    expect(screen.queryByText('Paste a URL')).toBeNull()
  })

  it('switches panels on click', async () => {
    render(<Example />)
    await userEvent.click(screen.getByRole('tab', { name: 'External URL' }))
    expect(screen.getByText('Paste a URL')).toBeVisible()
    expect(screen.queryByText('Pick a file')).toBeNull()
  })

  it('moves between tabs with the keyboard', async () => {
    render(<Example />)
    // Roving tabindex: only the selected tab is in the tab order, the arrow keys move along it.
    expect(screen.getByRole('tab', { name: 'Media library' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'External URL' })).toHaveAttribute('tabindex', '-1')

    screen.getByRole('tab', { name: 'Media library' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    const next = screen.getByRole('tab', { name: 'External URL' })
    expect(next).toHaveFocus()
    expect(next).toHaveAttribute('tabindex', '0')

    // Activating it (Enter or Space, per the ARIA tabs pattern) shows its panel.
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('tab', { name: 'External URL' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByText('Paste a URL')).toBeVisible()
  })
})

describe('Dialog', () => {
  it('opens from the trigger, names itself and closes again', async () => {
    render(
      <Dialog>
        <DialogTrigger render={<Button>Open</Button>} />
        <DialogContent>
          <DialogTitle>Delete article</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
        </DialogContent>
      </Dialog>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete article' })
    expect(within(dialog).getByText('This cannot be undone.')).toBeVisible()

    await userEvent.keyboard('{Escape}')
    expect(await screen.findByRole('button', { name: 'Open' })).toHaveFocus()
  })
})

describe('Sparkline', () => {
  it('draws one point per value and stays out of the accessibility tree', () => {
    const { container } = render(<Sparkline values={[1, 4, 2, 8]} />)
    const svg = container.querySelector('[data-slot="sparkline"]')
    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    const line = svg!.querySelector('polyline')!
    expect(line.getAttribute('points')!.split(' ')).toHaveLength(4)
    // The last value is the maximum, so its point sits at the top of the box.
    expect(line.getAttribute('points')!.split(' ').at(-1)).toMatch(/,2\.0$/)
  })

  it('handles a single value without dividing by zero', () => {
    const { container } = render(<Sparkline values={[3]} />)
    const points = container.querySelector('polyline')!.getAttribute('points')!
    expect(points).not.toContain('NaN')
  })
})

describe('WidgetCard', () => {
  it('renders a level-two heading, the description and the action', () => {
    render(
      <WidgetCard
        title="Content health"
        description="Published vs draft"
        action={<Button size="xs">Open</Button>}
      >
        <p>Body</p>
      </WidgetCard>,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Content health' })).toBeVisible()
    expect(screen.getByText('Published vs draft')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Open' })).toBeVisible()
    expect(screen.getByText('Body')).toBeVisible()
  })
})

describe('Form controls', () => {
  it('binds a label to the input and passes the value through', async () => {
    render(<Input id="field-title" aria-label="Title" defaultValue="Hello" />)
    const input = screen.getByRole('textbox', { name: 'Title' })
    expect(input).toHaveAttribute('data-slot', 'input')
    expect(input).toHaveValue('Hello')
    await userEvent.clear(input)
    await userEvent.type(input, 'Edited')
    expect(input).toHaveValue('Edited')
  })

  it('toggles a checkbox by click and by keyboard', async () => {
    render(<Checkbox aria-label="Featured" />)
    const box = screen.getByRole('checkbox', { name: 'Featured' })
    expect(box).not.toBeChecked()
    await userEvent.click(box)
    expect(box).toBeChecked()
    await userEvent.keyboard(' ')
    expect(box).not.toBeChecked()
  })

  it('reports the pressed state of a toggle group and lets one item be chosen', async () => {
    function Example() {
      const [value, setValue] = React.useState<string[]>(['list'])
      return (
        <ToggleGroup aria-label="View" value={value} onValueChange={(next) => next.length && setValue(next)}>
          <ToggleGroupItem value="list">List</ToggleGroupItem>
          <ToggleGroupItem value="grid">Grid</ToggleGroupItem>
        </ToggleGroup>
      )
    }
    render(<Example />)
    const list = screen.getByRole('button', { name: 'List' })
    const grid = screen.getByRole('button', { name: 'Grid' })
    expect(list).toHaveAttribute('aria-pressed', 'true')
    expect(grid).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(grid)
    expect(grid).toHaveAttribute('aria-pressed', 'true')
    expect(list).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('RunStatus', () => {
  it('says the state in words as well as in colour', () => {
    render(<RunStatus tone="poor" label="Failed" />)
    // The word is part of the label, so colour is never the only cue.
    expect(screen.getByText('Failed')).toBeVisible()
    expect(screen.getByText('Failed').className).toContain('acn:text-rating-poor')
  })

  it('keeps a running state distinguishable from a good one', () => {
    const { container } = render(
      <>
        <RunStatus tone="good" label="Passed" />
        <RunStatus tone="running" label="Running" />
      </>,
    )
    expect(container.querySelectorAll('svg')).toHaveLength(2)
    expect(screen.getByText('Running').className).toContain('acn:text-rating-average')
  })
})

describe('IntegrationNotice', () => {
  it('lists the environment variables an administrator has to set', () => {
    render(
      <IntegrationNotice
        isAdmin
        missing={['GITHUB_TOKEN', 'GITHUB_REPO']}
        service="GitHub"
        state="not-configured"
      />,
    )
    expect(screen.getByText(/GitHub/)).toBeVisible()
    expect(screen.getByText('GITHUB_TOKEN')).toBeVisible()
    expect(screen.getByText('GITHUB_REPO')).toBeVisible()
  })

  it('hides the setup instructions from a non-administrator', () => {
    render(
      <IntegrationNotice
        missing={['GITHUB_TOKEN']}
        service="GitHub"
        state="not-configured"
      />,
    )
    expect(screen.queryByText('GITHUB_TOKEN')).toBeNull()
  })

  it('links the fix a failure names', () => {
    render(
      <IntegrationNotice
        isAdmin
        action={{ label: 'Open the API settings', href: 'https://example.com/settings' }}
        service="Google"
        state="error"
        message="The key is not valid."
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent("Couldn't load Google: The key is not valid.")
    const link = screen.getByRole('link', { name: /Open the API settings/ })
    expect(link).toHaveAttribute('href', 'https://example.com/settings')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    // The new-tab hint is there for screen readers, not only in the icon.
    expect(link).toHaveTextContent('(opens in a new tab)')
  })
})
