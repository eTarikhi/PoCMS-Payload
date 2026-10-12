import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  Calendar,
  CheckCircle2,
  ChevronDown,
  CircleUser,
  Clock,
  Database,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  FolderOpen,
  Globe,
  GraduationCap,
  Image as LucideImage,
  Info,
  Layers,
  LayoutDashboard,
  List,
  LogOut,
  Menu,
  MoreHorizontal,
  Palette,
  Pencil,
  PieChart,
  Plug,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  Moon,
  Table as LucideTable,
  TrendingDown,
  TrendingUp,
  User,
  Users,
  X,
  type LucideProps,
} from 'lucide-react'
import type { FC } from 'react'

/**
 * Icon set for the TailAdmin pilot.
 *
 * Upstream TailAdmin Free imports 60+ hand-rolled SVG files through
 * `@svgr/webpack`, which requires extra webpack *and* turbopack rules in
 * `next.config.ts`. This repository already depends on `lucide-react` (used by
 * the frontend), so the TailAdmin icon names are re-exported on top of Lucide
 * instead — identical call sites, zero build-config changes, and the icons stay
 * tree-shakeable.
 *
 * Every icon accepts the TailAdmin props (`className`, and optionally `size`).
 */
export type TaIconProps = LucideProps

const createIcon = (Icon: FC<LucideProps>, defaultSize = 20): FC<TaIconProps> => {
  const Wrapped: FC<TaIconProps> = ({ size = defaultSize, strokeWidth = 1.8, ...props }) => (
    <Icon size={size} strokeWidth={strokeWidth} aria-hidden="true" {...props} />
  )
  Wrapped.displayName = Icon.displayName || Icon.name || 'TailAdminIcon'
  return Wrapped
}

/* Layout / navigation ------------------------------------------------------- */
export const GridIcon = createIcon(LayoutDashboard)
export const BoxCubeIcon = createIcon(Layers)
export const BoxIcon = createIcon(FolderOpen)
export const BoxIconLine = createIcon(Database)
export const TableIcon = createIcon(LucideTable)
export const ListIcon = createIcon(List)
export const PageIcon = createIcon(FileText)
export const PieChartIcon = createIcon(PieChart)
export const BarChartIcon = createIcon(BarChart3)
export const PlugInIcon = createIcon(Plug)
export const CalenderIcon = createIcon(Calendar)
export const UserCircleIcon = createIcon(CircleUser)
export const GroupIcon = createIcon(Users)
export const UserIcon = createIcon(User)
export const FolderIcon = createIcon(FolderOpen)
export const DocsIcon = createIcon(BookOpen)
export const PaletteIcon = createIcon(Palette)
export const GlobeIcon = createIcon(Globe)
export const SparklesIcon = createIcon(Sparkles)
export const SettingsIcon = createIcon(Settings)
export const AwardIcon = createIcon(Award)
export const BriefcaseIcon = createIcon(Briefcase)
export const GraduationCapIcon = createIcon(GraduationCap)
export const ImageIcon = createIcon(LucideImage)
export const ClockIcon = createIcon(Clock)

/* Actions ------------------------------------------------------------------- */
export const ChevronDownIcon = createIcon(ChevronDown)
export const HorizontaLDots = createIcon(MoreHorizontal)
export const MoreDotIcon = createIcon(MoreHorizontal)
export const SearchIcon = createIcon(Search)
export const BellIcon = createIcon(Bell)
export const MenuIcon = createIcon(Menu)
export const CloseIcon = createIcon(X)
export const PlusIcon = createIcon(Plus)
export const PencilIcon = createIcon(Pencil)
export const EyeIcon = createIcon(Eye)
export const FilterIcon = createIcon(Filter)
export const ExternalLinkIcon = createIcon(ExternalLink)
export const LogOutIcon = createIcon(LogOut)
export const SunIcon = createIcon(Sun)
export const MoonIcon = createIcon(Moon)

/* Trends / status ----------------------------------------------------------- */
export const ArrowUpIcon = createIcon(ArrowUp, 16)
export const ArrowDownIcon = createIcon(ArrowDown, 16)
export const ArrowUpRightIcon = createIcon(ArrowUpRight, 16)
export const TrendingUpIcon = createIcon(TrendingUp)
export const TrendingDownIcon = createIcon(TrendingDown)
export const CheckCircleIcon = createIcon(CheckCircle2)
export const InfoIcon = createIcon(Info)

/* ---------------------------------------------------------------------------
 * Name -> component registry.
 *
 * Payload root views are React Server Components. A component *reference* is
 * not serialisable across the RSC boundary, so server code passes icon NAMES
 * (plain strings) to client components, and the client resolves them here.
 * ------------------------------------------------------------------------- */
export const iconRegistry = {
  grid: GridIcon,
  box: BoxIcon,
  boxCube: BoxCubeIcon,
  boxLine: BoxIconLine,
  table: TableIcon,
  list: ListIcon,
  page: PageIcon,
  pieChart: PieChartIcon,
  barChart: BarChartIcon,
  plugin: PlugInIcon,
  calendar: CalenderIcon,
  userCircle: UserCircleIcon,
  group: GroupIcon,
  user: UserIcon,
  folder: FolderIcon,
  docs: DocsIcon,
  palette: PaletteIcon,
  globe: GlobeIcon,
  sparkles: SparklesIcon,
  settings: SettingsIcon,
  award: AwardIcon,
  briefcase: BriefcaseIcon,
  graduation: GraduationCapIcon,
  image: ImageIcon,
  clock: ClockIcon,
  search: SearchIcon,
  bell: BellIcon,
  menu: MenuIcon,
  close: CloseIcon,
  plus: PlusIcon,
  pencil: PencilIcon,
  eye: EyeIcon,
  filter: FilterIcon,
  externalLink: ExternalLinkIcon,
  logOut: LogOutIcon,
  sun: SunIcon,
  moon: MoonIcon,
  chevronDown: ChevronDownIcon,
  dots: HorizontaLDots,
  arrowUp: ArrowUpIcon,
  arrowDown: ArrowDownIcon,
  arrowUpRight: ArrowUpRightIcon,
  trendingUp: TrendingUpIcon,
  trendingDown: TrendingDownIcon,
  checkCircle: CheckCircleIcon,
  info: InfoIcon,
} as const

export type TaIconName = keyof typeof iconRegistry

/** Resolves an icon name to a component, falling back to `box`. */
export function getIcon(name: TaIconName | string | undefined): (typeof iconRegistry)[TaIconName] {
  if (name && name in iconRegistry) return iconRegistry[name as TaIconName]
  return iconRegistry.box
}

/**
 * Heuristic icon picker for Payload entities, so the sidebar looks curated
 * rather than uniform. Extend the map as the content model grows.
 */
const ENTITY_ICON_HINTS: Array<[RegExp, TaIconName]> = [
  [/^media|image|file|asset/, 'image'],
  [/^user|author|member|team/, 'group'],
  [/^article|post|blog|news/, 'docs'],
  [/^project|portfolio|work|case/, 'briefcase'],
  [/^service|offer|package|pricing/, 'sparkles'],
  [/^skill|technolog/, 'palette'],
  [/^experience|job|career/, 'briefcase'],
  [/^education|school|degree/, 'graduation'],
  [/^certificate|award|honou?r/, 'award'],
  [/^about|bio|profile/, 'userCircle'],
  [/^header|footer|nav|menu|setting/, 'settings'],
  [/^categor|tag/, 'list'],
  [/^form|contact|inquir/, 'page'],
  [/^redirect/, 'globe'],
  [/^search/, 'search'],
]

export function pickEntityIcon(slug: string, type: 'collection' | 'global' = 'collection'): TaIconName {
  if (type === 'global') return 'settings'
  for (const [pattern, name] of ENTITY_ICON_HINTS) {
    if (pattern.test(slug)) return name
  }
  return 'box'
}
