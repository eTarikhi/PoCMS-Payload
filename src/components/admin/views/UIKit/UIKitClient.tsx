'use client'

import { Drawer, SetStepNav, useModal, useTheme } from '@payloadcms/ui'
import {
  Check,
  ChevronDown,
  CircleCheck,
  Ellipsis,
  Info,
  LoaderCircle,
  Moon,
  Pencil,
  Plus,
  Search,
  Sun,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { useState, type ReactNode } from 'react'

import { Avatar, AvatarFallback } from '@/components/admin/ui/avatar'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/admin/ui/card'
import { Checkbox } from '@/components/admin/ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/admin/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/admin/ui/dropdown-menu'
import { Field, FieldDescription, FieldLabel } from '@/components/admin/ui/field'
import { Input } from '@/components/admin/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/admin/ui/input-group'
import { Label } from '@/components/admin/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/admin/ui/popover'
import { Progress } from '@/components/admin/ui/progress'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/admin/ui/select'
import { Separator } from '@/components/admin/ui/separator'
import { Skeleton } from '@/components/admin/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/admin/ui/tabs'
import { Textarea } from '@/components/admin/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/admin/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/admin/ui/tooltip'

// Recharts loads only when the chart section renders.
const UIKitChart = dynamic(() => import('./UIKitChart').then((mod) => mod.UIKitChart), {
  ssr: false,
  loading: () => <Skeleton className="acn:h-48 acn:w-full" />,
})

const COLOR_TOKENS = [
  ['background', 'foreground'],
  ['card', 'card-foreground'],
  ['primary', 'primary-foreground'],
  ['secondary', 'secondary-foreground'],
  ['muted', 'muted-foreground'],
  ['accent', 'accent-foreground'],
  ['destructive', 'destructive-foreground'],
  ['success-soft', 'success'],
  ['warning-soft', 'warning'],
  ['destructive-soft', 'destructive'],
] as const

const CHART_TOKENS = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'] as const

const TYPE_SCALE = [
  ['acn:text-xs', 'Extra small · 12px'],
  ['acn:text-sm', 'Small · 13px (Payload body)'],
  ['acn:text-base', 'Base · 14px'],
  ['acn:text-lg', 'Large · 16px'],
  ['acn:text-xl', 'XL · 18px'],
  ['acn:text-2xl', '2XL · 22px'],
  ['acn:text-3xl', '3XL · 28px'],
] as const

const SECTIONS = [
  ['tokens', 'Tokens'],
  ['actions', 'Actions'],
  ['forms', 'Forms'],
  ['feedback', 'Feedback'],
  ['overlays', 'Overlays'],
  ['data', 'Data'],
] as const

const DRAWER_SLUG = 'ui-kit-drawer'

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section
      id={id}
      data-slot="ui-kit-section"
      aria-labelledby={`${id}-title`}
      className="acn:scroll-mt-24 acn:space-y-4"
    >
      <div className="acn:space-y-1">
        <h2
          id={`${id}-title`}
          data-slot="ui-kit-section-title"
          className="acn:text-xl acn:font-semibold acn:text-foreground"
        >
          {title}
        </h2>
        <p data-slot="ui-kit-section-description" className="acn:text-sm acn:text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </section>
  )
}

function Swatch({ bg, fg }: { bg: string; fg: string }) {
  return (
    <div
      data-slot="ui-kit-swatch"
      className="acn:overflow-hidden acn:rounded-lg acn:border acn:border-border"
    >
      <div
        className="acn:flex acn:h-16 acn:items-end acn:p-2 acn:text-xs acn:font-medium"
        style={{ background: `var(--${bg})`, color: `var(--${fg})` }}
      >
        Aa · {fg}
      </div>
      <div className="acn:bg-card acn:px-2 acn:py-1.5 acn:font-mono acn:text-xs acn:text-muted-foreground">
        --{bg}
      </div>
    </div>
  )
}

export function UIKitClient() {
  const { theme, setTheme } = useTheme()
  const { openModal } = useModal()
  const [progress, setProgress] = useState(64)
  const [density, setDensity] = useState<string[]>(['comfortable'])

  return (
    <div data-testid="ui-kit" data-slot="ui-kit" className="acn:space-y-10 acn:pb-16 acn:pt-6">
      <SetStepNav nav={[{ label: 'UI kit' }]} />

      <header data-slot="ui-kit-header" className="acn:space-y-4">
        <div className="acn:flex acn:flex-wrap acn:items-start acn:justify-between acn:gap-4">
          <div className="acn:space-y-1">
            <h1 data-slot="ui-kit-title" className="acn:text-3xl acn:font-semibold acn:tracking-tight">
              UI kit
            </h1>
            <p data-slot="ui-kit-lede" className="acn:max-w-2xl acn:text-sm acn:text-muted-foreground">
              Design tokens and shadcn primitives (Base UI, Tailwind prefix{' '}
              <code className="acn:font-mono">acn:</code>) as they render inside Payload. Switch the
              theme to check light/dark parity. Admins only.
            </p>
          </div>
          <ToggleGroup
            aria-label="Admin theme"
            value={[theme]}
            onValueChange={(value) => {
              const next = value[0]
              if (next === 'light' || next === 'dark') setTheme(next)
            }}
            variant="outline"
          >
            <ToggleGroupItem value="light" aria-label="Light theme">
              <Sun /> Light
            </ToggleGroupItem>
            <ToggleGroupItem value="dark" aria-label="Dark theme">
              <Moon /> Dark
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <nav aria-label="UI kit sections" data-slot="ui-kit-nav" className="acn:flex acn:flex-wrap acn:gap-2">
          {SECTIONS.map(([id, label]) => (
            <Button
              key={id}
              size="sm"
              variant="secondary"
              nativeButton={false}
              render={<a href={`#${id}`} />}
            >
              {label}
            </Button>
          ))}
        </nav>
      </header>

      <Section
        id="tokens"
        title="Tokens"
        description="Tier 2 semantic colours (src/styles/admin/tokens.css). They resolve to Payload's theme variables, so they flip with the theme. Every text pair is checked for WCAG AA in CI."
      >
        <div className="acn:grid acn:grid-cols-2 acn:gap-3 acn:sm:grid-cols-3 acn:lg:grid-cols-5">
          {COLOR_TOKENS.map(([bg, fg]) => (
            <Swatch key={bg} bg={bg} fg={fg} />
          ))}
        </div>
        <div className="acn:flex acn:flex-wrap acn:items-center acn:gap-2">
          <span className="acn:text-sm acn:text-muted-foreground">Charts</span>
          {CHART_TOKENS.map((token) => (
            <span
              key={token}
              title={`--${token}`}
              className="acn:size-8 acn:rounded-md acn:border acn:border-border"
              style={{ background: `var(--${token})` }}
            />
          ))}
        </div>
        <div className="acn:grid acn:gap-6 acn:lg:grid-cols-2">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Type scale</CardTitle>
              <CardDescription>Inter, px-based so it lines up with Payload&apos;s 13px body.</CardDescription>
            </CardHeader>
            <CardContent className="acn:space-y-1.5">
              {TYPE_SCALE.map(([className, label]) => (
                <p key={label} data-slot="ui-kit-type-sample" className={className}>
                  {label}
                </p>
              ))}
              <p data-slot="ui-kit-type-sample" className="acn:text-sm acn:tabular-nums">
                Tabular figures: 1,234,567.89 · 7,654,321.00
              </p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Radius and spacing</CardTitle>
              <CardDescription>
                Radius derives from --radius (10px). One spacing step is --base / 5 (4px).
              </CardDescription>
            </CardHeader>
            <CardContent className="acn:space-y-4">
              <div className="acn:flex acn:flex-wrap acn:gap-3">
                {(
                  [
                    ['sm', 'acn:rounded-sm'],
                    ['md', 'acn:rounded-md'],
                    ['lg', 'acn:rounded-lg'],
                    ['xl', 'acn:rounded-xl'],
                    ['2xl', 'acn:rounded-2xl'],
                  ] as const
                ).map(([label, radius]) => (
                  <div key={label} className="acn:text-center acn:text-xs acn:text-muted-foreground">
                    <div
                      className={`acn:mb-1 acn:size-12 acn:border acn:border-border acn:bg-muted ${radius}`}
                    />
                    {label}
                  </div>
                ))}
              </div>
              <div className="acn:flex acn:items-end acn:gap-2">
                {[1, 2, 3, 4, 6, 8, 12].map((step) => (
                  <div key={step} className="acn:text-center acn:text-xs acn:text-muted-foreground">
                    <div
                      className="acn:mb-1 acn:rounded-sm acn:bg-primary"
                      style={{ width: 8, height: `calc(var(--base) / 5 * ${step})` }}
                    />
                    {step}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Separator />

      <Section
        id="actions"
        title="Actions"
        description="Buttons and badges. Primary is the brand amber: #996600 with white text in light, #da9100 with navy text in dark."
      >
        <div className="acn:flex acn:flex-wrap acn:items-center acn:gap-2">
          <Button>
            <Plus data-icon="inline-start" /> Create article
          </Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">
            <Trash2 data-icon="inline-start" /> Delete
          </Button>
          <Button variant="link">Link</Button>
          <Button disabled>Disabled</Button>
          <Button disabled aria-busy="true">
            <LoaderCircle data-icon="inline-start" className="acn:motion-safe:animate-spin" /> Saving
          </Button>
        </div>
        <div className="acn:flex acn:flex-wrap acn:items-center acn:gap-2">
          <Button size="xs">Extra small</Button>
          <Button size="sm">Small</Button>
          <Button>Default</Button>
          <Button size="lg">Large</Button>
          {(
            [
              ['Edit', Pencil],
              ['Delete', Trash2],
              ['More actions', Ellipsis],
            ] as const
          ).map(([label, Icon]) => (
            <Tooltip key={label}>
              <TooltipTrigger render={<Button size="icon" variant="outline" aria-label={label} />}>
                <Icon />
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
        <div className="acn:flex acn:flex-wrap acn:items-center acn:gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge className="acn:bg-success-soft acn:text-success">
            <CircleCheck /> Published
          </Badge>
          <Badge className="acn:bg-warning-soft acn:text-warning">
            <TriangleAlert /> Missing cover
          </Badge>
          <Badge variant="outline" className="acn:tabular-nums">
            12 min read
          </Badge>
        </div>
      </Section>

      <Separator />

      <Section
        id="forms"
        title="Forms"
        description="Inputs inside custom fields keep Payload's form state (useField); these primitives provide the look."
      >
        <div className="acn:grid acn:gap-6 acn:lg:grid-cols-2">
          <div className="acn:space-y-4">
            <Field>
              <FieldLabel htmlFor="ui-kit-title">Title</FieldLabel>
              <Input id="ui-kit-title" placeholder="A descriptive title" />
              <FieldDescription>Shown in lists and as the page title.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="ui-kit-search">Search</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput id="ui-kit-search" placeholder="Search articles…" />
              </InputGroup>
            </Field>
            <Field>
              <FieldLabel htmlFor="ui-kit-excerpt">Excerpt</FieldLabel>
              <Textarea id="ui-kit-excerpt" placeholder="One or two sentences" />
            </Field>
          </div>
          <div className="acn:space-y-4">
            <Field>
              <FieldLabel htmlFor="ui-kit-category">Category</FieldLabel>
              <Select
                defaultValue="articles"
                items={[
                  { label: 'Articles', value: 'articles' },
                  { label: 'Others', value: 'others' },
                ]}
              >
                <SelectTrigger id="ui-kit-category" className="acn:w-full">
                  <SelectValue placeholder="Choose a category" />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    <SelectItem value="articles">Articles</SelectItem>
                    <SelectItem value="others">Others</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            {/* Base UI's checkbox is a <span role="checkbox">, which a <label> cannot name: point
                aria-labelledby at the text. Wrapping keeps the whole label clickable. */}
            <Label className="acn:flex acn:w-fit acn:items-center acn:gap-2">
              <Checkbox defaultChecked aria-labelledby="ui-kit-featured-label" />
              <span id="ui-kit-featured-label">Featured on the home page</span>
            </Label>
            <div className="acn:space-y-2">
              <span className="acn:text-sm acn:font-medium">Table density</span>
              <ToggleGroup
                aria-label="Table density"
                value={density}
                onValueChange={(value) => value.length && setDensity(value)}
                variant="outline"
                size="sm"
              >
                <ToggleGroupItem value="comfortable">Comfortable</ToggleGroupItem>
                <ToggleGroupItem value="compact">Compact</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <Tabs defaultValue="content">
              <TabsList>
                <TabsTrigger value="content">Content</TabsTrigger>
                <TabsTrigger value="media">Media</TabsTrigger>
                <TabsTrigger value="meta">Meta</TabsTrigger>
              </TabsList>
              <TabsContent value="content" className="acn:pt-2 acn:text-sm acn:text-muted-foreground">
                Title, excerpt and body.
              </TabsContent>
              <TabsContent value="media" className="acn:pt-2 acn:text-sm acn:text-muted-foreground">
                Cover image or external URL.
              </TabsContent>
              <TabsContent value="meta" className="acn:pt-2 acn:text-sm acn:text-muted-foreground">
                Slug, dates and ordering.
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </Section>

      <Separator />

      <Section
        id="feedback"
        title="Feedback"
        description="Progress, loading placeholders and avatars. Status is never shown by colour alone."
      >
        <div className="acn:grid acn:gap-6 acn:lg:grid-cols-3">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Content health</CardTitle>
              <CardAction>
                <Button size="xs" variant="ghost" onClick={() => setProgress((p) => (p >= 100 ? 0 : p + 12))}>
                  Step
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="acn:space-y-3">
              <Progress value={progress} aria-label="Articles with a cover image" />
              <p className="acn:text-sm acn:text-muted-foreground acn:tabular-nums">
                {progress}% of articles have a cover image
              </p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Loading</CardTitle>
            </CardHeader>
            <CardContent
              className="acn:space-y-2"
              role="status"
              aria-busy="true"
              aria-label="Loading example"
            >
              <Skeleton className="acn:h-4 acn:w-3/4" />
              <Skeleton className="acn:h-4 acn:w-1/2" />
              <Skeleton className="acn:h-24 acn:w-full" />
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>People</CardTitle>
            </CardHeader>
            <CardContent className="acn:flex acn:items-center acn:gap-3">
              <Avatar>
                <AvatarFallback>AT</AvatarFallback>
              </Avatar>
              <div className="acn:text-sm">
                <p className="acn:font-medium">Amir v.Tarikhi</p>
                <p className="acn:text-muted-foreground">Admin</p>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="acn:grid acn:gap-3 acn:md:grid-cols-3">
          <p className="acn:flex acn:items-center acn:gap-2 acn:rounded-lg acn:bg-success-soft acn:p-3 acn:text-sm acn:text-success">
            <CircleCheck className="acn:size-4" /> Saved. The site refreshes in a few seconds.
          </p>
          <p className="acn:flex acn:items-center acn:gap-2 acn:rounded-lg acn:bg-warning-soft acn:p-3 acn:text-sm acn:text-warning">
            <TriangleAlert className="acn:size-4" /> Two projects have no image.
          </p>
          <p className="acn:flex acn:items-center acn:gap-2 acn:rounded-lg acn:bg-muted acn:p-3 acn:text-sm acn:text-muted-foreground">
            <Info className="acn:size-4" /> Drafts are not public.
          </p>
        </div>
      </Section>

      <Separator />

      <Section
        id="overlays"
        title="Overlays"
        description="Base UI renders popups in a portal on <body>, above Payload drawers. Open the drawer to check popovers, menus and selects inside it."
      >
        <div className="acn:flex acn:flex-wrap acn:items-center acn:gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              Actions <ChevronDown data-icon="inline-end" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuGroup>
                <DropdownMenuLabel>Article</DropdownMenuLabel>
                <DropdownMenuItem>
                  <Pencil /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Check /> Mark as featured
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Popover>
            <PopoverTrigger render={<Button variant="outline" />}>Popover</PopoverTrigger>
            <PopoverContent>
              <PopoverHeader>
                <PopoverTitle>Read time</PopoverTitle>
                <PopoverDescription>Shown as “n min” on the site.</PopoverDescription>
              </PopoverHeader>
            </PopoverContent>
          </Popover>

          <Dialog>
            <DialogTrigger render={<Button variant="outline" />}>Dialog</DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete this article?</DialogTitle>
                <DialogDescription>
                  It disappears from the site immediately. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                <DialogClose render={<Button variant="destructive" />}>Delete</DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button variant="outline" onClick={() => openModal(DRAWER_SLUG)}>
            Open a Payload drawer
          </Button>
        </div>

        <Drawer slug={DRAWER_SLUG} title="Primitives inside a Payload drawer">
          <div data-testid="ui-kit-drawer" className="acn:space-y-4 acn:py-4">
            <p className="acn:text-sm acn:text-muted-foreground">
              Popups opened here must appear above the drawer and keep focus inside it.
            </p>
            <div className="acn:flex acn:flex-wrap acn:gap-2">
              <Select
                defaultValue="frontend"
                items={[
                  { label: 'Front-End', value: 'frontend' },
                  { label: 'Back-End', value: 'backend' },
                ]}
              >
                <SelectTrigger className="acn:w-48" aria-label="Skill group">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectItem value="frontend">Front-End</SelectItem>
                  <SelectItem value="backend">Back-End</SelectItem>
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger render={<Button variant="outline" />}>Popover in drawer</PopoverTrigger>
                <PopoverContent>It renders above the drawer.</PopoverContent>
              </Popover>
              <Tooltip>
                <TooltipTrigger render={<Button variant="outline" size="icon" aria-label="Help" />}>
                  <Info />
                </TooltipTrigger>
                <TooltipContent>Tooltip in drawer</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </Drawer>
      </Section>

      <Separator />

      <Section
        id="data"
        title="Data"
        description="Tables use TanStack Table in the collection lists; charts are lazy-loaded Recharts islands with a text summary."
      >
        <div className="acn:grid acn:gap-6 acn:lg:grid-cols-2">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Recently updated</CardTitle>
              <CardDescription>A plain shadcn table.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Collection</TableHead>
                    <TableHead className="acn:text-right">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    ['DevOps Syllabus', 'Articles', '2 h ago'],
                    ['AlyaPanel', 'Projects', 'yesterday'],
                    ['Laravel', 'Skills', '3 days ago'],
                  ].map(([title, collection, updated]) => (
                    <TableRow key={title}>
                      <TableCell className="acn:font-medium">{title}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{collection}</Badge>
                      </TableCell>
                      <TableCell className="acn:text-right acn:text-muted-foreground">{updated}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Publishing activity</CardTitle>
              <CardDescription>Single-hue palette from --chart-1…5.</CardDescription>
            </CardHeader>
            <CardContent>
              <UIKitChart />
            </CardContent>
          </Card>
        </div>
      </Section>
    </div>
  )
}
