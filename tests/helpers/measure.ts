import fs from 'node:fs'
import path from 'node:path'

import type { Locator, Page, TestInfo } from '@playwright/test'

/**
 * Measurement for the task-based acceptance suite (roadmap P5.6).
 *
 * The acceptance question is not "does the screen work" (the feature suites answer that) but "how
 * much work is it for an editor". Two numbers capture that: how many interactions the task takes,
 * and how long it takes against a production build. Both are compared with
 * `tests/acceptance-baseline.json`, so a future redesign that adds steps to a core task has to say
 * so in the baseline diff instead of passing silently.
 *
 * Steps are counted by this helper, not inferred from the DOM: a step is one thing the editor does
 * — open a screen, type into a field, click a button, choose a file. `TaskResult.steps` is
 * therefore deterministic across machines; `ms` is not, so its budget is loose (see `withinBudget`).
 */
export type TaskBudget = { steps: number; ms: number }

export type TaskResult = {
  task: string
  steps: number
  ms: number
  budget: TaskBudget
  /** Whether the measurement stayed inside the budget. */
  ok: boolean
}

const BASELINE_PATH = path.join(process.cwd(), 'tests/acceptance-baseline.json')
const RESULTS_PATH = path.join(process.cwd(), 'test-results/acceptance.json')

/** The checked-in budgets. A missing file means the first run: the baseline is written instead. */
export function loadBaseline(): Record<string, TaskBudget> {
  try {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as Record<string, TaskBudget>
  } catch {
    return {}
  }
}

/**
 * Steps may grow by two before the test complains (one confirmation dialog, one extra tab), and
 * time gets 60% plus two seconds of slack: CI machines and cold caches differ, the step count is
 * what the test is really measuring.
 */
export const withinBudget = (result: TaskResult): boolean =>
  result.steps <= result.budget.steps + 2 && result.ms <= result.budget.ms * 1.6 + 2_000

/**
 * Counts one editor's interactions and the time taken, and appends the result to
 * `test-results/acceptance.json` so the numbers are visible in CI without reading logs.
 */
export class TaskMeter {
  readonly task: string
  private steps = 0
  private readonly startedAt = Date.now()

  constructor(task: string) {
    this.task = task
  }

  /** One editor action. Every interaction the task uses goes through one of these wrappers. */
  step(): void {
    this.steps += 1
  }

  async goto(page: Page, url: string): Promise<void> {
    this.step()
    await page.goto(url)
  }

  async fill(page: Page, selector: string, value: string): Promise<void> {
    this.step()
    await page.locator(selector).fill(value)
  }

  async click(locator: Locator, what = 'click'): Promise<void> {
    void what
    this.step()
    await locator.click()
  }

  /** Choosing a file in the upload field is one editor action, however many DOM events it fires. */
  async setInputFiles(locator: Locator, file: string): Promise<void> {
    this.step()
    await locator.setInputFiles(file)
  }

  result(): TaskResult {
    const budget = loadBaseline()[this.task] ?? { steps: this.steps, ms: Date.now() - this.startedAt }
    const result: TaskResult = {
      task: this.task,
      steps: this.steps,
      ms: Date.now() - this.startedAt,
      budget,
      ok: false,
    }
    result.ok = withinBudget(result)
    return result
  }

  /** Records the result on the test (annotation, attachment) and returns it. */
  async record(testInfo: TestInfo): Promise<TaskResult> {
    const result = this.result()
    testInfo.annotations.push({
      type: 'acceptance',
      description: `${result.task}: ${result.steps} steps (budget ${result.budget.steps}), ${result.ms} ms (budget ${result.budget.ms})`,
    })
    appendResult(result)
    await testInfo.attach(`acceptance-${result.task}.json`, {
      body: JSON.stringify(result, null, 2),
      contentType: 'application/json',
    })
    return result
  }
}

/** Appends one measurement to the shared artifact; a failed write must not fail the test. */
function appendResult(result: TaskResult): void {
  try {
    fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true })
    const existing = fs.existsSync(RESULTS_PATH)
      ? (JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8')) as TaskResult[])
      : []
    const withoutThisTask = existing.filter((entry) => entry.task !== result.task)
    fs.writeFileSync(RESULTS_PATH, JSON.stringify([...withoutThisTask, result], null, 2))
  } catch {
    // The artifact is a convenience; the assertion in the test is the gate.
  }
}
