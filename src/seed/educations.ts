import type { Education } from '@/payload-types'

export const educationsData = (): (Omit<Education, 'id' | 'createdAt' | 'updatedAt'> & { order?: number })[] => [
  {
    title: 'Bachelor in Computer Software Engineering',
    institution: 'Payam-e Nur University',
    location: 'Tabriz, East Azerbaijan Province, Iran',
    date: '2014 - Leaved',
    order: 0,
  },
  {
    title: 'Theoretical Diploma - Mathematics & Physics',
    institution: 'Ferdosi Pre-University Center',
    location: 'Tabriz, East Azerbaijan Province, Iran',
    date: '2001 - 2007',
    order: 1,
  },
]
