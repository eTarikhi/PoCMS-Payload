import type { Locale } from './locales'

type Messages = {
  about: {
    imageAlt: string
    years: string
  }
  article: {
    backToArticles: string
    categoryArticles: string
    categoryOther: string
    originallyPublishedAt: string
    read: string
  }
  articles: {
    allArticles: string
    issued: string
    latestArticles: string
    readOnSite: string
  }
  certificates: {
    allCertificates: string
    issuedBy: string
    recentCertificates: string
    viewCertificate: string
  }
  common: {
    backToTop: string
    profileImageAlt: string
    skipToContent: string
  }
  email: {
    clickToEmail: string
    clickToReveal: string
  }
  footer: {
    allRightsReserved: string
    contact: string
    copyright: string
    myProfiles: string
    socialIntro: string
  }
  hero: {
    greeting: string
    requestCV: string
  }
  language: {
    label: string
    switchToEnglish: string
    switchToPersian: string
  }
  metadata: {
    description: string
    keywords: string
    siteName: string
    title: string
  }
  navigation: {
    about: string
    contact: string
    home: string
    projects: string
    services: string
    skills: string
  }
  notFound: {
    body: string
    title: string
  }
  projects: {
    all: string
    backend: string
    cmsCrm: string
    frontend: string
    myProjects: string
    viewFullImage: (title: string) => string
    visitProject: (title: string) => string
  }
  services: {
    myServices: string
  }
  skills: {
    education: string
    experience: string
    heading: string
    mySkills: string
    summary: string
  }
}

const messages: Record<Locale, Messages> = {
  en: {
    about: {
      imageAlt: 'About Amir v.Tarikhi',
      years: 'Years',
    },
    article: {
      backToArticles: 'Back to articles',
      categoryArticles: 'Articles',
      categoryOther: 'Others',
      originallyPublishedAt: 'Originally published at',
      read: 'read',
    },
    articles: {
      allArticles: 'All Articles >',
      issued: 'Issued:',
      latestArticles: 'Latest Articles',
      readOnSite: 'Read on this site',
    },
    certificates: {
      allCertificates: 'All Certificates >',
      issuedBy: 'Issued by:',
      recentCertificates: 'Recent Certificates',
      viewCertificate: 'View Certificate →',
    },
    common: {
      backToTop: 'Back to top',
      profileImageAlt: 'Profile',
      skipToContent: 'Skip to content',
    },
    email: {
      clickToEmail: 'Click to email',
      clickToReveal: 'Click to reveal email',
    },
    footer: {
      allRightsReserved: 'All Rights Reserved.',
      contact: 'Contact',
      copyright: 'Copyright',
      myProfiles: 'My Profiles',
      socialIntro: 'Get connected with me on social networks:',
    },
    hero: {
      greeting: "I'm",
      requestCV: 'Request CV',
    },
    language: {
      label: 'Language',
      switchToEnglish: 'English',
      switchToPersian: 'فارسی',
    },
    metadata: {
      description:
        'Senior PHP, JavaScript & MySQL, Mid. React & Next.js, Jr. Node.js & Laravel, E-Commerce CMS, WordPress, WooCommerce & Shopify Developer ..',
      keywords:
        'Senior Web Developer, Full-Stack Developer, PHP Developer, JavaScript Developer, Next.js Developer, React.js Developer, Shopify Developer, MySQL Developer, Full-Stack Senior PHP Developer, Automation Panel Developer, E-Commerce CMS Developer, SEO Manager and Consultant',
      siteName: 'Amir v.Tarikhi Live Resume',
      title: 'Amir v.Tarikhi Live Resume | Full-Stack Senior Web Developer',
    },
    navigation: {
      about: 'About',
      contact: 'Contact',
      home: 'Home',
      projects: 'Projects',
      services: 'Services',
      skills: 'Skills',
    },
    notFound: {
      body: 'This article does not exist, or it has no page on this site.',
      title: 'Article not found',
    },
    projects: {
      all: 'All Projects',
      backend: 'Back-End',
      cmsCrm: 'CMS-CRM',
      frontend: 'Front-End',
      myProjects: 'My Projects',
      viewFullImage: (title) => `View full image of ${title}`,
      visitProject: (title) => `Visit ${title}`,
    },
    services: {
      myServices: 'My Services',
    },
    skills: {
      education: 'Education',
      experience: 'Experience',
      heading: 'Skills & Experience',
      mySkills: 'My Skills',
      summary: 'Some of my top skills listed as below.',
    },
  },
  fa: {
    about: {
      imageAlt: 'درباره امیر تارخی',
      years: 'سال',
    },
    article: {
      backToArticles: 'بازگشت به مقاله‌ها',
      categoryArticles: 'مقاله‌ها',
      categoryOther: 'سایر',
      originallyPublishedAt: 'انتشار اصلی در',
      read: 'مطالعه',
    },
    articles: {
      allArticles: 'همه مقاله‌ها >',
      issued: 'انتشار:',
      latestArticles: 'آخرین مقاله‌ها',
      readOnSite: 'مطالعه در این وب‌سایت',
    },
    certificates: {
      allCertificates: 'همه گواهی‌ها >',
      issuedBy: 'صادرکننده:',
      recentCertificates: 'گواهی‌های اخیر',
      viewCertificate: 'مشاهده گواهی ←',
    },
    common: {
      backToTop: 'بازگشت به بالا',
      profileImageAlt: 'تصویر پروفایل',
      skipToContent: 'پرش به محتوا',
    },
    email: {
      clickToEmail: 'برای ارسال ایمیل کلیک کنید',
      clickToReveal: 'برای نمایش ایمیل کلیک کنید',
    },
    footer: {
      allRightsReserved: 'تمامی حقوق محفوظ است.',
      contact: 'تماس',
      copyright: 'کپی‌رایت',
      myProfiles: 'پروفایل‌های من',
      socialIntro: 'در شبکه‌های اجتماعی با من در ارتباط باشید:',
    },
    hero: {
      greeting: 'من هستم',
      requestCV: 'درخواست رزومه',
    },
    language: {
      label: 'زبان',
      switchToEnglish: 'English',
      switchToPersian: 'فارسی',
    },
    metadata: {
      description:
        'توسعه‌دهنده ارشد فول‌استک وب با تجربه در PHP، JavaScript، MySQL، React، Next.js، Node.js، Laravel و سامانه‌های تجارت الکترونیک.',
      keywords:
        'توسعه‌دهنده وب، توسعه‌دهنده فول‌استک، PHP، JavaScript، Next.js، React، Shopify، MySQL، سئو',
      siteName: 'رزومه آنلاین امیر تارخی',
      title: 'رزومه آنلاین امیر تارخی | توسعه‌دهنده ارشد فول‌استک وب',
    },
    navigation: {
      about: 'درباره من',
      contact: 'تماس',
      home: 'خانه',
      projects: 'پروژه‌ها',
      services: 'خدمات',
      skills: 'مهارت‌ها',
    },
    notFound: {
      body: 'این مقاله وجود ندارد یا صفحه‌ای در این وب‌سایت ندارد.',
      title: 'مقاله پیدا نشد',
    },
    projects: {
      all: 'همه پروژه‌ها',
      backend: 'بک‌اند',
      cmsCrm: 'سامانه‌های CMS و CRM',
      frontend: 'فرانت‌اند',
      myProjects: 'پروژه‌های من',
      viewFullImage: (title) => `نمایش تصویر کامل ${title}`,
      visitProject: (title) => `بازدید از ${title}`,
    },
    services: {
      myServices: 'خدمات من',
    },
    skills: {
      education: 'تحصیلات',
      experience: 'تجربه',
      heading: 'مهارت‌ها و تجربه',
      mySkills: 'مهارت‌های من',
      summary: 'برخی از مهارت‌های برتر من در زیر فهرست شده‌اند.',
    },
  },
}

export const getMessages = (locale: Locale): Messages => messages[locale]
