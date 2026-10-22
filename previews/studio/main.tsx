import { StudioFailure } from '../../src/app/(frontend)/components/studio/StudioFailure'
import FrontendLoading from '../../src/app/(frontend)/(studio)/loading'
import { MoreWriting } from '../../src/app/(frontend)/components/article/MoreWriting'
import { ProjectsArchive } from '../../src/app/(frontend)/components/studio/ProjectsArchive'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import { ArticleLayout } from '../../src/app/(frontend)/components/article/ArticleLayout'
import type { ArticleDetail } from '../../src/app/(frontend)/lib/article-mappers'
import { StudioChrome } from '../../src/app/(frontend)/components/studio/StudioChrome'
import { WritingArchive } from '../../src/app/(frontend)/components/studio/WritingArchive'
import { ArticleNotFoundContent } from '../../src/app/(frontend)/components/article/ArticleNotFoundContent'
import '../../src/app/(frontend)/styles/article.css'
import { StudioHome } from '../../src/app/(frontend)/components/studio/StudioHome'
import type { PortfolioContent } from '../../src/app/(frontend)/lib/types'
import sample from '../../src/app/(frontend)/data/database.json'
import '../../src/app/(frontend)/styles/bootstrap.min.css'
import '../../src/app/(frontend)/styles/main.css'
import '../../src/app/(frontend)/styles/studio.css'
import './preview.css'

// Deliberately outside src/app: never a fallback for failed production database requests.
const source = sample[0]
const content: PortfolioContent = {
  header: { ...source.header, id: String(source.header.id) },
  about: source.about,
  skills: {
    frontend: source.skills.frontend.map((item) => ({ ...item, id: String(item.id) })),
    backend: source.skills.backend.map((item) => ({ ...item, id: String(item.id) })),
  },
  experiences: source.experiences.map((item) => ({ ...item, id: String(item.id) })),
  educations: source.educations.map((item) => ({ ...item, id: String(item.id) })),
  certificates: source.certificates.map((item) => ({ ...item, id: String(item.id) })),
  articles: source.articles.map((item, index) => ({
    ...item,
    pagePath: index === 0 ? '/articles/design-preview' : null,
  })),
  services: {
    items: source.services.items.map((item) => ({ ...item, id: String(item.id) })),
    hiring: source.services.hiring[0]
      ? { label: source.services.hiring[0].title, url: source.services.hiring[0].link }
      : null,
  },
  projects: {
    filters: source.projects.categories.map((item) => ({
      label: item.category,
      value: item.class,
    })),
    items: source.projects.items.map((item) => ({
      id: String(item.id),
      title: item.alt,
      categories: item.class,
      thumbnailUrl: item.placeHolder,
      imageUrl: item.src,
      url: item.url,
    })),
  },
  footer: {
    socialLinks: source.footer.socialLinks,
    fullName: source.footer.personalInfo.name,
    roles: source.footer.personalInfo.skills.map((item) => item.title),
    profiles: source.footer.profiles,
    contactInfo: source.footer.contactInfo.map((item) => ({
      ...item,
      type: item.type as 'address' | 'email' | 'phone' | 'whatsapp',
      url: item.url ?? null,
      isLink: item.isLink ?? false,
      className: item.className ?? '',
    })),
    copyright: source.footer.copyright,
  },
}

const demoArticle: ArticleDetail = {
  id: 0,
  slug: 'design-preview',
  title: 'Inside the Engineer’s Studio',
  excerpt:
    'A reading-layout demonstration for the new portfolio. This is sample text, not a published article.',
  category: 'articles',
  publishedAt: null,
  publishedDisplay: '',
  readTimeDisplay: '2 min',
  coverUrl: source.articles[0].imageUrl,
  coverAlt: 'Sample article cover from the checked-in portfolio assets',
  paragraphs: [
    'This is an explicitly labeled design demonstration. It lets you review the article layout without a database connection or a published article body. The production site only renders article content supplied by Payload.',
    'The reading experience uses a quiet paper-colored background, generous spacing, and a narrow text column. The heading, excerpt, and publication metadata introduce the article before the cover image and body.',
    'The navigation stays consistent with the homepage. Work opens the project archive. Expertise and contact links return to their homepage sections. The writing link opens a searchable archive of articles.',
    'Images use the same fallback component as the portfolio gallery. In production Next.js provides image optimization; this standalone preview uses ordinary image elements and the existing local sample assets.',
    'The thin amber reading indicator reflects your progress down the page. It is removed when reduced motion is requested. You can return to all writing at the beginning or end of an article.',
    'This preview does not invent client outcomes, testimonials, or credentials. Before launch, validate real CMS content, media storage, cache revalidation, and the editor’s live preview in your configured environment.',
  ],
  externalLink: null,
}
const path = window.location.pathname.replace(/\/$/, '') || '/'
const articleRoute = path === '/articles/design-preview'
const archiveRoute = path === '/articles'
const projectsRoute = path === '/projects'
const failureRoute = path === '/preview/error'
const loadingRoute = path === '/preview/loading'
const missingRoute =
  path !== '/' && !articleRoute && !archiveRoute && !projectsRoute && !failureRoute && !loadingRoute
document.title = `${articleRoute ? 'Article demo' : archiveRoute ? 'Writing' : projectsRoute ? 'Projects' : missingRoute ? 'Page not found' : 'Engineer’s Studio'} — design preview`

// This standalone Vite harness has no Next router; the real error boundary calls reset().
const recoverPreview = () => {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign('/')
}

createRoot(document.getElementById('root')!).render(
  <>
    <aside className="preview-notice">
      Design preview · checked-in sample content, not live CMS data
      {articleRoute
        ? ' · Demonstration article'
        : failureRoute || loadingRoute
          ? ' · UI state demonstration'
          : ''}
    </aside>
    {failureRoute ? (
      <StudioFailure retry={recoverPreview} />
    ) : loadingRoute ? (
      <FrontendLoading />
    ) : articleRoute ? (
      <StudioChrome
        active="writing"
        footer={content.footer}
        name={content.header?.sureName}
        profile={content.header}
      >
        <main tabIndex={-1} id="main-content" className="article-page">
          <ArticleLayout article={demoArticle} />
          <MoreWriting articles={content.articles} current={demoArticle} />
        </main>
      </StudioChrome>
    ) : archiveRoute ? (
      <WritingArchive content={content} />
    ) : projectsRoute ? (
      <ProjectsArchive content={content} />
    ) : missingRoute ? (
      <StudioChrome
        active="writing"
        footer={content.footer}
        name={content.header?.sureName}
        profile={content.header}
      >
        <ArticleNotFoundContent />
      </StudioChrome>
    ) : (
      <StudioHome content={content} />
    )}
  </>,
)
