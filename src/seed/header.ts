import type { Header } from '@/payload-types'

export const headerData = (
  profileImage?: number | { id: number } | null,
): Omit<Header, 'id' | 'createdAt' | 'updatedAt'> => {
  return {
    sureName: 'Amir v.Tarikhi',
    profileImage: profileImage
      ? typeof profileImage === 'object'
        ? profileImage.id
        : profileImage
      : null,
    imageUrl: '/images/profile.webp',
    requestCV: 'https://api.whatsapp.com/send/?phone=905525700850',
    professionTexts: [
      'Full-Stack Senior PHP Developer',
      'Junior Laravel - NodeJS Developer',
      'Automation Panel Developer',
      'E-Commerce CMS - CRM Developer',
      'SEO Manager and Consultant',
    ],
    articlesHeader: {
      eyebrow: 'Engineering Journal & Notes',
      headingOverride: null,
      subtitleOverride: null,
      backgroundPreset: 'aurora-grain',
      accentTone: 'gold-copper',
      defaultLayout: 'magazine',
      showSearch: true,
      showFilters: true,
      showStatsBar: true,
      showRssLink: true,
    },
    projectsHeader: {
      eyebrow: 'Selected Architecture & Builds',
      headingOverride: null,
      subtitleOverride: null,
      backgroundPreset: 'blueprint-spotlight',
      accentTone: 'amber-slate',
      defaultLayout: 'showcase',
      showSearch: true,
      showCategoryFilters: true,
      showTechFilters: true,
      showStatsBar: true,
    },
    articleDetailHeader: {
      eyebrow: 'Engineering Article',
      backgroundPreset: 'chromatic-cover',
      accentTone: 'gold-copper',
      showBreadcrumbs: true,
      showShareActions: true,
      showSectionJumpDock: true,
      showStickyToc: true,
      showRelatedArticles: true,
    },
    projectDetailHeader: {
      eyebrow: 'Engineering Case Study',
      backgroundPreset: 'chromatic-cover',
      accentTone: 'amber-slate',
      showBreadcrumbs: true,
      showSpecDock: true,
      showTechLinks: true,
      showStickySidebar: true,
      showRelatedProjects: true,
    },
  }
}
