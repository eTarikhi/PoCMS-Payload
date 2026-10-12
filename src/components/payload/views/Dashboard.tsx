import type { AdminViewServerProps } from 'payload'
import Link from 'next/link'
import {
  ArrowUpRight,
  BookOpenText,
  BriefcaseBusiness,
  Clock3,
  Image as ImageIcon,
  Plus,
  Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Badge } from '@/components/payload/ui/badge'
import { Button } from '@/components/payload/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/payload/ui/card'

type RecentDocument = {
  id: string | number
  title?: string | null
  updatedAt?: string | null
}

type StatCardProps = {
  label: string
  value: number
  note: string
  icon: LucideIcon
}

function StatCard({ label, value, note, icon: Icon }: StatCardProps) {
  return (
    <Card className="tw:min-w-0">
      <CardContent className="tw:flex tw:items-start tw:justify-between tw:gap-4 tw:pt-5 tw:sm:pt-6">
        <div className="tw:min-w-0">
          <p className="tw:m-0 tw:text-sm tw:font-medium tw:text-admin-muted-foreground">{label}</p>
          <p className="tw:mb-1 tw:mt-3 tw:text-3xl tw:font-semibold tw:tabular-nums tw:tracking-tight">
            {value}
          </p>
          <p className="tw:m-0 tw:text-sm tw:text-admin-muted-foreground">{note}</p>
        </div>
        <span className="tw:flex tw:size-10 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-xl tw:bg-admin-primary/10 tw:text-admin-primary">
          <Icon aria-hidden="true" className="tw:size-5" />
        </span>
      </CardContent>
    </Card>
  )
}

function formatDate(value?: string | null) {
  if (!value) return 'No updates yet'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently updated'

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

type RecentListProps = {
  items: RecentDocument[]
  title: string
  description: string
  href: string
  emptyLabel: string
}

function RecentList({ items, title, description, href, emptyLabel }: RecentListProps) {
  const singularTitle = title.endsWith('s') ? title.slice(0, -1) : title

  return (
    <Card className="tw:min-w-0">
      <CardHeader className="tw:flex tw:flex-row tw:items-start tw:justify-between tw:gap-3">
        <div className="tw:space-y-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button asChild size="sm" variant="ghost" className="tw:shrink-0">
          <Link href={href} aria-label={`View all ${title.toLowerCase()}`}>
            View all <ArrowUpRight aria-hidden="true" className="tw:size-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {items.length > 0 ? (
          <ul className="tw:m-0 tw:list-none tw:divide-y tw:divide-admin-border tw:p-0">
            {items.map((item) => (
              <li
                key={item.id}
                className="tw:flex tw:min-w-0 tw:items-center tw:justify-between tw:gap-3 tw:py-3 tw:first:pt-0 tw:last:pb-0"
              >
                <div className="tw:min-w-0">
                  <Link
                    className="tw:block tw:truncate tw:text-sm tw:font-medium tw:text-admin-foreground tw:hover:text-admin-primary"
                    href={`${href}/${encodeURIComponent(String(item.id))}`}
                  >
                    {item.title?.trim() || 'Untitled document'}
                  </Link>
                  <p className="tw:mb-0 tw:mt-1 tw:flex tw:items-center tw:gap-1.5 tw:text-[13px] tw:text-admin-muted-foreground">
                    <Clock3 aria-hidden="true" className="tw:size-3.5" />
                    <time dateTime={item.updatedAt || undefined}>{formatDate(item.updatedAt)}</time>
                  </p>
                </div>
                <ArrowUpRight
                  aria-hidden="true"
                  className="tw:size-4 tw:shrink-0 tw:text-admin-muted-foreground"
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="tw:rounded-xl tw:border tw:border-dashed tw:border-admin-border tw:bg-admin-background tw:px-4 tw:py-8 tw:text-center">
            <p className="tw:m-0 tw:text-sm tw:text-admin-muted-foreground">{emptyLabel}</p>
            <Button asChild size="sm" variant="outline" className="tw:mt-4">
              <Link href={`${href}/create`}>
                <Plus aria-hidden="true" className="tw:size-4" />
                Create {singularTitle.toLowerCase()}
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export async function CustomDashboard({ initPageResult }: AdminViewServerProps) {
  const { req } = initPageResult
  const payload = req.payload
  const user = req.user
  const adminRoute = payload.config.routes.admin || '/admin'

  if (!user) {
    return (
      <main className="pocms-admin tw:mx-auto tw:w-full tw:max-w-6xl tw:p-4 tw:sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Sign in to view your workspace</CardTitle>
            <CardDescription>Your content overview is available after you sign in.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    )
  }

  const queryOptions = {
    depth: 0 as const,
    overrideAccess: false,
    req,
    user,
  }

  const [articleCount, projectCount, mediaCount, recentArticles, recentProjects] =
    await Promise.all([
      payload.count({ collection: 'articles', ...queryOptions }),
      payload.count({ collection: 'projects', ...queryOptions }),
      payload.count({ collection: 'media', ...queryOptions }),
      payload.find({
        collection: 'articles',
        limit: 4,
        sort: '-updatedAt',
        ...queryOptions,
      }),
      payload.find({
        collection: 'projects',
        limit: 4,
        sort: '-updatedAt',
        ...queryOptions,
      }),
    ])

  return (
    <main className="pocms-admin tw:mx-auto tw:w-full tw:max-w-6xl tw:space-y-6 tw:rounded-2xl tw:bg-admin-background tw:p-4 tw:sm:p-6 tw:lg:p-8">
      <header className="tw:flex tw:flex-col tw:justify-between tw:gap-5 tw:md:flex-row tw:md:items-end">
        <div className="tw:max-w-2xl">
          <Badge variant="secondary" className="tw:mb-3 tw:gap-1.5">
            <Sparkles aria-hidden="true" className="tw:size-3.5" />
            Portfolio workspace
          </Badge>
          <h1 className="tw:m-0 tw:text-3xl tw:font-semibold tw:tracking-tight tw:sm:text-4xl">
            Your content, at a glance.
          </h1>
          <p className="tw:mb-0 tw:mt-3 tw:max-w-xl tw:text-sm tw:leading-6 tw:text-admin-muted-foreground tw:sm:text-base">
            Create, organize, and keep your portfolio up to date from one place.
          </p>
        </div>
        <div className="tw:flex tw:flex-wrap tw:gap-2">
          <Button asChild>
            <Link href={`${adminRoute}/collections/articles/create`}>
              <Plus aria-hidden="true" className="tw:size-4" />
              New article
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`${adminRoute}/collections/projects/create`}>
              <Plus aria-hidden="true" className="tw:size-4" />
              New project
            </Link>
          </Button>
        </div>
      </header>

      <section
        aria-label="Content totals"
        className="tw:grid tw:grid-cols-1 tw:gap-4 tw:sm:grid-cols-2 tw:xl:grid-cols-3"
      >
        <StatCard
          label="Articles"
          value={articleCount.totalDocs}
          note="Stories and external publications"
          icon={BookOpenText}
        />
        <StatCard
          label="Projects"
          value={projectCount.totalDocs}
          note="Work in your portfolio"
          icon={BriefcaseBusiness}
        />
        <StatCard
          label="Media assets"
          value={mediaCount.totalDocs}
          note="Images available to your content"
          icon={ImageIcon}
        />
      </section>

      <section
        aria-label="Recent content"
        className="tw:grid tw:grid-cols-1 tw:gap-4 tw:lg:grid-cols-2"
      >
        <RecentList
          title="Articles"
          description="The latest changes to your writing."
          href={`${adminRoute}/collections/articles`}
          emptyLabel="No articles yet. Create your first article to get started."
          items={recentArticles.docs}
        />
        <RecentList
          title="Projects"
          description="The latest changes to your portfolio work."
          href={`${adminRoute}/collections/projects`}
          emptyLabel="No projects yet. Add a project to showcase your work."
          items={recentProjects.docs}
        />
      </section>

      <Card className="tw:overflow-hidden">
        <div className="tw:flex tw:flex-col tw:gap-4 tw:p-5 tw:sm:flex-row tw:sm:items-center tw:sm:justify-between tw:sm:p-6">
          <div className="tw:flex tw:items-start tw:gap-3">
            <span className="tw:flex tw:size-10 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-xl tw:bg-admin-muted tw:text-admin-foreground">
              <Sparkles aria-hidden="true" className="tw:size-5" />
            </span>
            <div>
              <h2 className="tw:m-0 tw:text-sm tw:font-semibold">Keep your portfolio fresh</h2>
              <p className="tw:mb-0 tw:mt-1 tw:text-sm tw:text-admin-muted-foreground">
                Review your profile, experience, and site-wide details.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" className="tw:w-full tw:sm:w-auto">
            <Link href={`${adminRoute}/globals/footer`}>
              Review site details <ArrowUpRight aria-hidden="true" className="tw:size-4" />
            </Link>
          </Button>
        </div>
      </Card>
    </main>
  )
}
