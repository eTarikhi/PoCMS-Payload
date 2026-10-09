import type { Experience } from '@/payload-types'

export const experiencesData = (): (Omit<Experience, 'id' | 'createdAt' | 'updatedAt'> & { order?: number })[] => [
  {
    title: 'IT Department Manager',
    company: 'Tiryaki İlaç LTD. ŞTİ. Istanbul, Turkey',
    date: '2022 - 2023',
    order: 0,
  },
  {
    title: 'Chief Technology Officer (CTO)',
    company: 'Proxima Agency LTD. Istanbul, Turkey',
    date: '2023.01 - 2023.06',
    order: 1,
  },
  {
    title: 'e-Commerce CMS Developer',
    company: 'Cadde10 İnteraktif LTD. Turkey',
    date: '2019 - 2022',
    order: 2,
  },
  {
    title: 'Web Developer & Manager',
    company: 'ARK Informatic Services, Tabriz, Iran',
    date: '2011 - 2019',
    order: 3,
  },
]
