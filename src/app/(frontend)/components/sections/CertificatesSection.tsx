import Image from 'next/image'
import Link from 'next/link'

import { DEFAULT_SITE_SETTINGS } from '@/app/(frontend)/lib/mappers'
import type { CertificateItem, SiteSettingsContent } from '@/app/(frontend)/lib/types'

// Ported from vTarikhi/components/sections/certificates.tsx. The "View Certificate" link only renders when a link exists.

export type CertificatesSectionProps = {
  certificates: CertificateItem[]
  labels?: SiteSettingsContent['certificatesSection']
}

export function CertificatesSection({
  certificates,
  labels = DEFAULT_SITE_SETTINGS.certificatesSection,
}: CertificatesSectionProps) {
  return (
    <section id="certificate">
      <div className="container-xxl py-5">
        <div className="row g-5">
          <div className="col-12 wow fadeInUp" data-wow-delay="0.1s">
            <div className="row g-5 mb-5 wow fadeInUp" data-wow-delay="0.1s">
              <div className="col-lg-6">
                <h2 className="display-5 mb-0">{labels.heading}</h2>
              </div>
              <div className="col-lg-6 text-lg-end">
                {labels.cta ? (
                  <Link
                    className="btn btn-primary py-3 px-5"
                    target="_blank"
                    rel="noopener noreferrer"
                    href={labels.cta.url}
                  >
                    {labels.cta.label}
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="row gy-1 gx-4 align-items-center">
              {certificates.map((certificate) => (
                <CertificateCard
                  key={certificate.id}
                  certificate={certificate}
                  viewLabel={labels.viewCertificateLabel}
                />
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
  viewLabel,
}: {
  certificate: CertificateItem
  viewLabel: string
}) {
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
          <p className="mb-2">Issued by: {certificate.issuer}</p>
          <p className="mb-4">{certificate.date}</p>
          {certificate.link && (
            <Link
              href={certificate.link}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary mx-1"
            >
              {viewLabel}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
