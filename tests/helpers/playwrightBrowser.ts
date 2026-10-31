import fs from 'node:fs'
import path from 'node:path'

export interface PlaywrightBrowserUse {
  channel?: string
  launchOptions?: {
    executablePath?: string
  }
}

export interface ResolvePlaywrightBrowserOptions {
  platform?: NodeJS.Platform
  env?: Record<string, string | undefined>
  bundledChromiumExecutablePath?: string
  fileExists?: (candidatePath: string) => boolean
}

const defaultFileExists = (candidatePath: string): boolean => {
  try {
    return Boolean(candidatePath) && fs.existsSync(candidatePath)
  } catch {
    return false
  }
}

function hasCompanionHeadlessShell(
  bundledPath: string,
  fileExists: (candidatePath: string) => boolean,
): boolean {
  const match = /^([\s\S]*?[\\/])chromium-(\d+)[\\/]/.exec(bundledPath)
  if (!match) return false
  const [, msPlaywrightRoot, rev] = match
  const sep = bundledPath.includes('\\') ? '\\' : '/'
  const shellDir = `${msPlaywrightRoot}chromium_headless_shell-${rev}${sep}`
  return [
    `${shellDir}chrome-headless-shell-win64${sep}chrome-headless-shell.exe`,
    `${shellDir}chrome-headless-shell-linux64${sep}chrome-headless-shell`,
    `${shellDir}chrome-linux${sep}headless_shell`,
    `${shellDir}chrome-headless-shell-mac-arm64${sep}chrome-headless-shell`,
    `${shellDir}chrome-headless-shell-mac-x64${sep}chrome-headless-shell`,
  ].some((candidate) => fileExists(candidate))
}

/**
 * Resolves Playwright's Chromium `use` configuration with automatic offline fallback to a locally
 * installed system Chromium-based browser (Google Chrome, Microsoft Edge, Brave, or system Chromium)
 * whenever Playwright's bundled `ms-playwright` binary is not downloaded (for instance, in regions
 * where `cdn.playwright.dev/builds/cft/...` returns HTTP 403 AccessDenied).
 */
export function resolvePlaywrightBrowserUse(
  options?: ResolvePlaywrightBrowserOptions,
): PlaywrightBrowserUse {
  const env = options?.env ?? process.env
  const platform = options?.platform ?? process.platform
  const fileExists = options?.fileExists ?? defaultFileExists

  const explicitExecutablePath = env.PLAYWRIGHT_EXECUTABLE_PATH?.trim()
  if (explicitExecutablePath) {
    return {
      launchOptions: {
        executablePath: explicitExecutablePath,
      },
    }
  }

  const explicitChannel = env.PLAYWRIGHT_CHANNEL?.trim()
  if (explicitChannel) {
    return {
      channel: explicitChannel,
    }
  }

  const bundled = options?.bundledChromiumExecutablePath?.trim() ?? ''
  if (bundled && fileExists(bundled)) {
    if (hasCompanionHeadlessShell(bundled, fileExists)) {
      return {}
    }
    return {
      channel: 'chromium',
      launchOptions: {
        executablePath: bundled,
      },
    }
  }

  if (platform === 'win32') {
    const drive = (env.HOMEDRIVE || env.SystemDrive || 'C:').replace(/[\\/]+$/, '')
    const roots = Array.from(
      new Set(
        [
          env.LOCALAPPDATA,
          env.PROGRAMFILES,
          env['PROGRAMFILES(X86)'],
          `${drive}\\Program Files`,
          `${drive}\\Program Files (x86)`,
        ]
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    )

    const winCandidates: Array<{ channel?: string; suffix: string }> = [
      { channel: 'chrome', suffix: 'Google\\Chrome\\Application\\chrome.exe' },
      { channel: 'msedge', suffix: 'Microsoft\\Edge\\Application\\msedge.exe' },
      { suffix: 'BraveSoftware\\Brave-Browser\\Application\\brave.exe' },
      { suffix: 'Chromium\\Application\\chrome.exe' },
    ]

    for (const item of winCandidates) {
      for (const root of roots) {
        const candidate = path.win32.join(root, item.suffix)
        if (fileExists(candidate)) {
          return {
            ...(item.channel ? { channel: item.channel } : {}),
            launchOptions: { executablePath: candidate },
          }
        }
      }
    }

    return {}
  }

  if (platform === 'darwin') {
    const macCandidates: Array<{ channel?: string; executablePath: string }> = [
      {
        channel: 'chrome',
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      },
      {
        channel: 'msedge',
        executablePath: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      },
      {
        executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      },
      {
        executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium',
      },
    ]

    for (const item of macCandidates) {
      if (fileExists(item.executablePath)) {
        return {
          ...(item.channel ? { channel: item.channel } : {}),
          launchOptions: { executablePath: item.executablePath },
        }
      }
    }

    return {}
  }

  const linuxCandidates: Array<{ channel?: string; executablePath: string }> = [
    { channel: 'chrome', executablePath: '/opt/google/chrome/chrome' },
    { channel: 'chrome', executablePath: '/usr/bin/google-chrome-stable' },
    { channel: 'chrome', executablePath: '/usr/bin/google-chrome' },
    { channel: 'msedge', executablePath: '/opt/microsoft/msedge/msedge' },
    { channel: 'msedge', executablePath: '/usr/bin/microsoft-edge-stable' },
    { executablePath: '/usr/bin/chromium' },
    { executablePath: '/usr/bin/chromium-browser' },
    { executablePath: '/snap/bin/chromium' },
  ]

  for (const item of linuxCandidates) {
    if (fileExists(item.executablePath)) {
      return {
        ...(item.channel ? { channel: item.channel } : {}),
        launchOptions: { executablePath: item.executablePath },
      }
    }
  }

  return {}
}
