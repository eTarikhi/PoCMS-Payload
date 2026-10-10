import type { Footer } from '@/payload-types'

export const footerData = (): Omit<Footer, 'id' | 'createdAt' | 'updatedAt' | 'globalType'> => {
  return {
    roles: {
      fullName: 'Amir v.Tarikhi',
      footerRoles: [
        'Senior PHP Developer',
        'Junior NodeJS Developer',
        'Junior Laravel Developer',
        'E-Commerce CRM Developer',
        'Automation Panel Developer',
        'SEO Manager and Consultant',
      ],
    },
    hiringCta: {
      label: 'Hiring Me ..',
      url: 'https://linkedin.com/comm/mynetwork/discovery-see-all?usecase=PEOPLE_FOLLOWS&followMember=etarikhi',
    },
    copyRight: {
      year: 2023,
      website: 'eTarikhi.com',
      url: '#',
    },
    socialLinks: [
      {
        platform: 'facebook',
        url: 'https://www.facebook.com/etarikhi',
        iconName: 'faFacebookF',
        ariaLabel: 'Facebook',
      },
      {
        platform: 'twitter',
        url: 'https://www.twitter.com/eTarikhi',
        iconName: 'faXTwitter',
        ariaLabel: 'Twitter',
      },
      {
        platform: 'instagram',
        url: 'https://www.instagram.com/eTarikhi',
        iconName: 'faInstagram',
        ariaLabel: 'Instagram',
      },
      {
        platform: 'linkedin',
        url: 'https://www.linkedin.com/in/eTarikhi',
        iconName: 'faLinkedin',
        ariaLabel: 'LinkedIn',
      },
      {
        platform: 'github',
        url: 'https://www.github.com/eTarikhi',
        iconName: 'faGithub',
        ariaLabel: 'Github',
      },
      {
        platform: 'whatsapp',
        url: 'https://api.whatsapp.com/send/?phone=905525700850',
        iconName: 'faWhatsapp',
        ariaLabel: 'Whatsapp',
      },
    ],
    profiles: [
      {
        name: 'freelancer.com',
        url: 'https://www.freelancer.com/u/ETarikhi',
      },
      {
        name: 'upwork.com',
        url: 'https://upwork.com/freelancers/~01ecd833bdd6892456',
      },
      {
        name: 'fiverr.com',
        url: 'https://www.fiverr.com/etarikhi',
      },
      {
        name: 'themeforest.net',
        url: 'https://themeforest.net/user/etarikhi',
      },
    ],
    contactInfo: [
      {
        type: 'address',
        iconName: 'faHome',
        content: '34805, Istanbul, Turkey',
      },
      {
        type: 'email',
        iconName: 'faEnvelope',
        content: 'etarikhi@gmail.com',
        url: 'mailto:etarikhi@gmail.com',
        isLink: true,
        className: 'text-white',
      },
      {
        type: 'phone',
        iconName: 'faPhoneFlip',
        content: '+90 552 570 0850',
        url: 'tel:00905525700850',
        isLink: true,
        className: 'text-white',
      },
      {
        type: 'whatsapp',
        iconName: 'faWhatsapp',
        content: 'Direct Whatsapp Call',
        url: 'https://call.whatsapp.com/voice/LvPt9J2VKYrXpvqfPBwdH3',
        isLink: true,
        className: 'text-secondary',
      },
    ],
  }
}
