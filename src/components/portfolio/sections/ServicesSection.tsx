import Link from 'next/link'

import type { ServiceItem as ServiceEntry, ServicesContent } from '@/lib/portfolio/types'
import { getServiceIcon } from '../icons'

// Ported from vTarikhi/components/sections/services.tsx. The hiring CTA comes from the footer (D-3).

export type ServicesSectionProps = {
  services: ServicesContent
}

export function ServicesSection({ services }: ServicesSectionProps) {
  return (
    <section id="service" className="section-gray">
      <div className="container-fluid my-1 pb-5">
        <div className="container">
          <div className="row g-5 mb-5 wow fadeInUp" data-wow-delay="0.1s">
            <div className="col-lg-6">
              <h2 className="display-5 mb-0">My Services</h2>
            </div>
            <div className="col-lg-6 text-lg-end">
              {services.hiring && (
                <Link
                  className="btn btn-primary py-3 px-5"
                  href={services.hiring.url}
                  target="_blank"
                >
                  {services.hiring.label}
                </Link>
              )}
            </div>
          </div>
          <div className="row g-4">
            {services.items.map((service) => (
              <ServiceItem key={service.id} service={service} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function ServiceItem({ service }: { service: ServiceEntry }) {
  return (
    <div className="col-lg-6 wow fadeInUp" data-wow-delay="0.1s">
      <div className="service-item d-flex flex-column flex-sm-row bg-white rounded h-100 p-4 p-lg-5">
        <div className="bg-icon flex-shrink-0 mb-3">{getServiceIcon(service.iconFont)}</div>
        <div className="ms-sm-4">
          <h3 className="h4 mb-3">{service.category}</h3>
          {service.descriptions.map((description, index) => (
            <h4 key={index} className="p service-description">
              {description}
            </h4>
          ))}
        </div>
      </div>
    </div>
  )
}
