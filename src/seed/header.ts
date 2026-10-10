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
  }
}
