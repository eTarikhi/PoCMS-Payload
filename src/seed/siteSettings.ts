import type { Media, SiteSetting } from '@/payload-types'

export const siteSettingsData = (
  profileImage?: Media | null,
): Omit<SiteSetting, 'id' | 'createdAt' | 'updatedAt' | 'globalType'> => ({
  siteName: 'Amir v.Tarikhi Live Resume',
  ownerName: 'Amir v.Tarikhi',
  locale: 'en_US',
  themeColor: '#da9100',
  siteTitle: 'Amir v.Tarikhi Live Resume | Full-Stack Senior Web Developer',
  metaDescription:
    'Senior PHP, JavaScript & MySQL, Mid. React & Next.js, Jr. Node.js & Laravel, E-Commerce CMS, WordPress, WooCommerce & Shopify Developer ..',
  keywords:
    'Senior Web Developer, Full-Stack Developer, PHP Developer, JavaScript Developer, Next.js Developer, React.js Developer, Shopify Developer, MySQL Developer, Full-Stack Senior PHP Developer, Automation Panel Developer, E-Commerce CMS Developer, SEO Manager and Consultant',
  ogDescription:
    'Full-Stack Senior PHP Developer, Automation Panel Developer, E-Commerce CMS Developer, SEO Manager and Consultant',
  ogImage: profileImage?.id ?? null,
  ogImageUrl: '/images/profile.webp',
  jobTitle: 'Senior Full-Stack Web Developer',
  address: {
    streetAddress: '34805, Beykoz, Istanbul, Turkey',
    addressLocality: 'Istanbul, Turkey',
    addressRegion: 'Beykoz',
    postalCode: '34805',
  },
  hero: {
    greeting: "I'm",
    requestCvLabel: 'Request CV',
  },
  servicesSection: {
    heading: 'My Services',
  },
  skillsSection: {
    heading: 'Skills & Experience',
    intro: 'Some of my top skills listed as below.',
    skillsSubheading: 'My Skills',
    experienceTabLabel: 'Experience',
    educationTabLabel: 'Education',
  },
  certificatesSection: {
    heading: 'Recent Certificates',
    ctaLabel: 'All Certificates >',
    ctaUrl: 'https://www.linkedin.com/in/etarikhi/details/certifications/',
    viewCertificateLabel: 'View Certificate →',
  },
  projectsSection: {
    heading: 'My Projects',
    allFilterLabel: 'All Projects',
    archiveDescription: 'Selected projects, engineering case studies, and full-stack builds.',
    searchPlaceholder: 'Search projects by title, tech stack, or role…',
    caseStudyLabel: 'Case study',
    backToProjectsLabel: 'Back to projects',
    liveProjectLabel: 'Visit live project',
    notFoundTitle: 'Project not found',
    notFoundDescription: 'This project does not exist, or it has no case-study page on this site.',
  },
  articlesSection: {
    heading: 'Latest Articles',
    ctaLabel: 'All Articles >',
    ctaUrl: '/articles',
    readOnSiteLabel: 'Read on this site',
    featuredBadgeLabel: 'Featured',
    archiveDescription: 'Articles, engineering notes, and guides.',
    searchPlaceholder: 'Search articles by title or topic…',
    backToArticlesLabel: 'Back to articles',
    externalPublicationLabel: 'Originally published at',
    notFoundTitle: 'Article not found',
    notFoundDescription: 'This article does not exist, or it has no page on this site.',
  },
  footerLabels: {
    socialPrompt: 'Get connected with me on social networks:',
    profilesHeading: 'My Profiles',
    contactHeading: 'Contact',
  },
})
