import Link from 'next/link'
import { ArrowRight, CalendarDays, Link2, NotebookPen } from 'lucide-react'

import { Badge } from '@/components/payload/ui/badge'
import { Button } from '@/components/payload/ui/button'
import { Card, CardContent } from '@/components/payload/ui/card'

export function ArticlesListIntro() {
  return (
    <div className="pocms-admin tw:mb-5">
      <Card>
        <CardContent className="tw:flex tw:flex-col tw:gap-4 tw:pt-5 tw:sm:flex-row tw:sm:items-center tw:sm:justify-between tw:sm:pt-6">
          <div className="tw:min-w-0">
            <Badge variant="secondary" className="tw:mb-2 tw:gap-1.5">
              <NotebookPen aria-hidden="true" className="tw:size-3.5" />
              Editorial checklist
            </Badge>
            <h2 className="tw:m-0 tw:text-base tw:font-semibold tw:tracking-tight">
              A quick article checklist
            </h2>
            <p className="tw:mb-0 tw:mt-1 tw:text-sm tw:leading-relaxed tw:text-admin-muted-foreground">
              Add a publication date, a destination link, and a short excerpt so every article is
              ready to share.
            </p>
            <div className="tw:mt-3 tw:flex tw:flex-wrap tw:gap-2">
              <Badge variant="outline" className="tw:gap-1.5">
                <CalendarDays aria-hidden="true" className="tw:size-3.5" />
                Publication date
              </Badge>
              <Badge variant="outline" className="tw:gap-1.5">
                <Link2 aria-hidden="true" className="tw:size-3.5" />
                Destination link
              </Badge>
            </div>
          </div>
          <Button asChild variant="outline" className="tw:w-full tw:shrink-0 tw:sm:w-auto">
            <Link href="/admin/collections/articles/create">
              Create article <ArrowRight aria-hidden="true" className="tw:size-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
