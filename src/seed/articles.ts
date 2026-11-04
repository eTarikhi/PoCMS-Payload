import {
  buildLexicalDocument,
  lexicalBlockNode,
  lexicalBulletListNode,
  lexicalHeadingNode,
  lexicalParagraphNode,
  lexicalTextNode,
} from '@/app/(frontend)/lib/lexical'

export const articlesData = () => [
  {
    title: 'Full-Stack Geliştiriciler İçin DevOps: Temel Kavramlar ve Pratikler İçin Yol Haritası',
    excerpt:
      'Günümüz yazılım geliştirme dünyasında DevOps, artık bir seçenek değil, bir gereklilik haline geldi. Tam yığın (full-stack) geliştiriciler için DevOps yol haritası.',
    featured: true,
    category: 'articles' as const,
    publishedAt: '2025-02-02T12:00:00.000Z',
    readTime: 3,
    imageUrl: '/images/articles/1735708966846.webp',
    link: 'https://www.linkedin.com/pulse/full-stack-geli%25C5%259Ftiriciler-i%25C3%25A7in-devops-temel-kavramlar-amir-vtarikhi-xmndf',
    content: buildLexicalDocument([
      lexicalParagraphNode([
        lexicalTextNode(
          'Modern full-stack engineering extends well beyond writing application handlers and UI components. Delivering reliable releases requires automated pipelines, reproducible environments, and actionable observability from day one.',
        ),
      ]),
      lexicalHeadingNode('h2', 'Continuous Integration & Delivery'),
      lexicalParagraphNode([
        lexicalTextNode(
          'Every commit should run static analysis, type checks, unit tests, and schema verification before reaching production.',
        ),
      ]),
      lexicalBlockNode({
        blockType: 'code',
        language: 'yaml',
        filename: '.github/workflows/ci.yml',
        code: `name: CI
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm generate:all && pnpm exec tsc --noEmit && pnpm test:int`,
      }),
      lexicalBlockNode({
        blockType: 'callout',
        variant: 'tip',
        title: 'Keep schema artifacts deterministic',
        content:
          'Commit generated TypeScript types and GraphQL schemas alongside code changes so review diffs immediately surface contract changes.',
      }),
      lexicalHeadingNode('h2', 'Core Pillars for Full-Stack Teams'),
      lexicalBulletListNode([
        'Containerized parity between local development and production runtimes.',
        'Zero-downtime database migrations with backward-compatible schema steps.',
        'Structured logging, error budgets, and synthetic health checks.',
      ]),
      lexicalHeadingNode('h3', 'Observability Checklist'),
      lexicalParagraphNode([
        lexicalTextNode(
          'Instrument request latency, cache hit ratios, and background queue depth before scaling horizontally.',
        ),
      ]),
      lexicalBlockNode({
        blockType: 'mediaBlock',
        imageUrl: '/images/articles/1735708966846.webp',
        size: 'normal',
        caption: 'End-to-end delivery pipeline for modern full-stack teams.',
      }),
    ]),
  },
  {
    title: 'The Best Code Editors: A Comprehensive Guide',
    excerpt:
      'In the ever-evolving world of software development, choosing the right code editor can significantly enhance productivity and streamline the coding process.',
    featured: false,
    category: 'articles' as const,
    publishedAt: '2025-01-15T12:00:00.000Z',
    readTime: 3,
    imageUrl: '/images/articles/1736912634143.webp',
    link: 'https://www.linkedin.com/pulse/best-code-editors-comprehensive-guide-amir-vtarikhi-o9jmf',
    content: buildLexicalDocument([
      lexicalParagraphNode([
        lexicalTextNode(
          'Selecting and configuring a code editor shapes daily developer velocity across TypeScript, PHP, and SQL codebases.',
        ),
      ]),
      lexicalHeadingNode('h2', 'Language Server Protocol & Diagnostics'),
      lexicalParagraphNode([
        lexicalTextNode(
          'First-class LSP integration surfaces type mismatches, unused imports, and refactors inline before a build even runs.',
        ),
      ]),
      lexicalBlockNode({
        blockType: 'callout',
        variant: 'info',
        title: 'Workspace settings',
        content:
          'Check workspace-level formatter and linter settings into version control so every contributor shares identical formatting rules.',
      }),
    ]),
  },
  {
    title: 'Essential DevOps Toolchains for Every Syllabus: Modern Software Development',
    excerpt:
      'Software development and IT operations are moving faster than ever, so DevOps toolchains have been widely employed to automate delivery.',
    featured: false,
    category: 'articles' as const,
    publishedAt: '2025-01-06T12:00:00.000Z',
    readTime: 5,
    imageUrl: '/images/articles/1736156534915.webp',
    link: 'https://www.linkedin.com/pulse/essential-devops-toolchains-every-syllabus-modern-amir-vtarikhi-semaf',
  },
  {
    title: 'DevOps Syllabus You Need to Learn as a Full-Stack Developer',
    excerpt:
      'In the rapidly evolving landscape of software development, the integration of DevOps practices is becoming increasingly essential for full-stack web developers.',
    featured: false,
    category: 'articles' as const,
    publishedAt: '2025-01-01T12:00:00.000Z',
    readTime: 3,
    imageUrl: '/images/articles/1735708966846.webp',
    link: 'https://www.linkedin.com/pulse/devops-syllabus-you-need-learn-full-stack-developer-amir-vtarikhi-3kpqf',
  },
  {
    title: 'Most Used Laravel Packages: A Comprehensive Guide',
    excerpt:
      '#Laravel is a powerful #PHP #framework that provides developers with a robust set of tools to build web applications efficiently.',
    featured: false,
    category: 'articles' as const,
    publishedAt: '2024-12-30T12:00:00.000Z',
    readTime: 3,
    imageUrl: '/images/articles/1735489434802.webp',
    link: 'https://www.linkedin.com/pulse/most-used-laravel-packages-comprehensive-guide-amir-vtarikhi-k9v3f',
  },
  {
    title: 'Becoming a full-stack developer',
    excerpt:
      'Becoming a full-stack developer is an exciting and rewarding career path! A full-stack developer works on both the front-end and back-end.',
    featured: false,
    category: 'others' as const,
    publishedAt: '2024-12-04T12:00:00.000Z',
    readTime: 2,
    imageUrl: '/images/articles/1733263816314.webp',
    link: 'https://www.linkedin.com/pulse/becoming-full-stack-developer-amir-vtarikhi-9nwif',
  },
]
