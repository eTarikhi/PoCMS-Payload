'use client'

import {
  AwardIcon,
  BriefcaseIcon,
  FileTextIcon,
  FolderKanbanIcon,
  ImageUpIcon,
  PlusIcon,
} from 'lucide-react'
import Link from 'next/link'
import React from 'react'

import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

export type QuickCreateItem = {
  href: string
  label: string
  icon: 'article' | 'project' | 'media' | 'experience' | 'certificate'
}

const ICONS = {
  article: FileTextIcon,
  project: FolderKanbanIcon,
  media: ImageUpIcon,
  experience: BriefcaseIcon,
  certificate: AwardIcon,
} satisfies Record<QuickCreateItem['icon'], React.ComponentType<{ className?: string }>>

export function QuickCreateMenu({ items }: { items: QuickCreateItem[] }) {
  return (
    <div className="acn:mb-5 acn:self-stretch">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" className="acn:w-full acn:justify-start" />}
        >
          <PlusIcon aria-hidden />
          Create
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="acn:min-w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Create new</DropdownMenuLabel>
            {items.map(({ href, label, icon }) => {
              const Icon = ICONS[icon]
              return (
                <DropdownMenuItem key={href} render={<Link href={href} />}>
                  <Icon aria-hidden />
                  {label}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
