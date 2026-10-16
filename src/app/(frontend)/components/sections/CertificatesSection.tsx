import Image from 'next/image'
import Link from 'next/link'

import type { CertificateItem } from '@/app/(frontend)/lib/types'
import type { Locale } from '@/i18n/locales'
import { getMessages } from '@/i18n/messages'

export type CertificatesSectionProps = {
  certificates: CertificateItem[]
  locale: Locale
}

export function CertificatesSection({ certificates, locale }: CertificatesSectionProps) {
  const messages = getMessages(locale)
  return (
    <section id="certificate">
      <div className="container-xxl py-5">
        <div className="row g-5">
          <div className="col-12 wow fadeInUp" data-wow-delay="0.1s">
            <div className="row g-5 mb-5 wow fadeInUp" data-wow-delay="0.1s">
              <div className="col-lg-6">
                <h2 className="display-5 mb-0">{messages.certificates.recentCertificates}</h2>
              </div>
              <div className="col-lg-6 text-lg-end">
                <Link
                  className="btn btn-primary py-3 px-5"
                  target="_blank"
                  href="https://www.linkedin.com/in/etarikhi/details/certifications/"
                >
                  {messages.certificates.allCertificates}
                </Link>
              </div>
            </div>
            <div className="row gy-1 gx-4 align-items-center">
              {certificates.map((certificate) => (
                <CertificateCard key={certificate.id} certificate={certificate} locale={locale} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function CertificateCard({
  certificate,
  locale,
}: {
  certificate: CertificateItem
  locale: Locale
}) {
  const messages = getMessages(locale)
  return (
    <div className="col-lg-4 col-md-6">
      <div className="service-item rounded h-100 p-4 p-lg-5 my-2 wow fadeInUp">
        <div className="rounded overflow-hidden">
          <Image
            className="img-fluid"
            src={certificate.imageUrl}
            alt={certificate.title}
            width={330}
            height={255}
            loading="lazy"
          />
        </div>
        <div className="p-6">
          <h3 className="my-2">{certificate.title}</h3>
          <p className="mb-2">
            {messages.certificates.issuedBy}: {certificate.issuer}
          </p>
          <p className="mb-4">{certificate.date}</p>
          {certificate.link && (
            <Link
              href={certificate.link}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary mx-1"
            >
              {messages.certificates.viewCertificate}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
