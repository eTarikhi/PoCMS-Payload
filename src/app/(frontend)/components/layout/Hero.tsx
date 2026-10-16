import Image from 'next/image'
import Link from 'next/link'

import type { HeaderContent } from '@/app/(frontend)/lib/types'
import type { Locale } from '@/i18n/locales'
import { getMessages } from '@/i18n/messages'

import { TypingEffect } from '../ui/TypingEffect'

export type HeroProps = {
  header: HeaderContent
  locale: Locale
}

export function Hero({ header, locale }: HeroProps) {
  const messages = getMessages(locale)

  return (
    <header>
      <div className="container-fluid my-6 mt-0" id="home">
        <div className="container">
          <div className="row g-5 align-items-center">
            <div className="col-lg-6 py-lg-6 pb-0 pt-lg-0">
              <div className="" style={{ minHeight: 200 }}>
                <h3 className="typed-balancer text-secondary mb-3">{messages.hero.greeting}</h3>
                <h1 className="display-3 mb-3 text-white">{header.sureName}</h1>
                <h2 className="typed-text-output d-inline">
                  <TypingEffect
                    texts={header.professionTexts}
                    typeSpeed={100}
                    deleteSpeed={20}
                    pauseTime={200}
                    infinite={true}
                    color="light"
                    cursorColor="light"
                  />
                </h2>
              </div>
              <div className="d-flex align-items-center pt-lg-4">
                <Link href={header.requestCV} className="btn btn-primary py-3 px-4 me-5">
                  {messages.hero.requestCV}
                </Link>
              </div>
            </div>
            <div className="col-lg-6 order-first order-lg-last pt-lg-5">
              <Image
                className="img-fluid"
                src={header.imageUrl}
                alt={messages.common.profileImageAlt}
                width={700}
                height={700}
                priority={true}
              />
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
