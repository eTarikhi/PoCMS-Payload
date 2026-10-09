import Image from 'next/image'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck } from '@fortawesome/free-solid-svg-icons'

import type { AboutContent } from '@/app/(frontend)/lib/portfolio/types'

// Ported from vTarikhi/components/sections/about.tsx. Markup and copy are unchanged.

export type AboutSectionProps = {
  about: AboutContent | null
}

export function AboutSection({ about }: AboutSectionProps) {
  if (!about) {
    return null
  }

  return (
    <section id="about">
      <div className="container-xxl py-6">
        <div className="container">
          <div className="row g-5">
            {/* Left column: Experience and Work Permit */}
            <div className="col-lg-6 wow fadeInUp" data-wow-delay="0.1s">
              <div className="row d-flex align-items-center mb-5">
                <div className="col-md-6 flex-shrink-0 text-center me-4">
                  <h2>
                    <span className="display-1 mb-0">{about.experience.years}+</span>
                    <br className="g-0" />
                    <span className="years mb-0">Years</span>
                  </h2>
                </div>
                <div className="col-md-4 text-center me-4 mt-4">
                  <h3 className="lh-middle">{about.experience.title}</h3>
                </div>
              </div>
              <p className="mb-4">{about.experience.description}</p>

              <div className="d-flex align-items-center mb-3">
                <h3 className="h5 border-end pe-3 me-3 mb-0">{about.workPermit.title}</h3>
              </div>
              <p className="mb-0">{about.workPermit.description}</p>
            </div>

            {/* Right column: Images and Interests */}
            <div className="col-lg-6 wow fadeInUp" data-wow-delay="0.5s">
              <div className="row g-3 mb-4">
                {/* Empty image URLs are filtered out by the mapper, so no fallback is needed here (F-08). */}
                {about.images.map((src, index) => (
                  <div key={index} className="col-sm-6">
                    <Image
                      className="img-fluid rounded"
                      src={src}
                      alt="About Amir v.Tarikhi"
                      width={400}
                      height={400}
                    />
                  </div>
                ))}
              </div>

              <div className="d-flex align-items-center mb-3">
                <h3 className="h5 border-end pe-3 me-3 mb-0">{about.interests.title}</h3>
              </div>
              <p className="mb-4">{about.interests.description}</p>
              {about.interests.areas.map((area, index) => (
                <h2 key={index} className="p h6 mb-3">
                  <FontAwesomeIcon
                    icon={faCheck}
                    className="far fa-check-circle text-primary me-3"
                  />
                  <span>{area}</span>
                </h2>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
