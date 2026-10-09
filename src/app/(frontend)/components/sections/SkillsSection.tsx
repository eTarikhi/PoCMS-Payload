import type { EducationItem, ExperienceItem, SkillsContent } from '@/app/(frontend)/lib/types'
import { ProgressBar } from '../ui/ProgressBar'

// Ported from vTarikhi/components/sections/skills.tsx.
// The original wrapped the experiences and educations in an extra array, so each list is one row here.

export type SkillsSectionProps = {
  skills: SkillsContent
  experiences: ExperienceItem[]
  educations: EducationItem[]
}

export function SkillsSection({ skills, experiences, educations }: SkillsSectionProps) {
  return (
    <section id="skill">
      <div className="container-xxl py-5">
        <div className="container">
          <div className="row g-5">
            {/* Skills display section */}
            <div className="col-lg-6 wow fadeInUp" data-wow-delay="0.1s">
              <h2 className="display-5 mb-5">Skills & Experience</h2>
              <p className="mb-4">Some of my top skills listed as below.</p>
              <h3 className="mb-4">My Skills</h3>
              <div className="row align-items-center tab-pane">
                <div className="col-md-6">
                  {skills.frontend.map((skill) => (
                    <ProgressBar
                      key={skill.id}
                      id={skill.id}
                      value={skill.value}
                      label={skill.label}
                      color={skill.color}
                    />
                  ))}
                </div>
                <div className="col-md-6">
                  {skills.backend.map((skill) => (
                    <ProgressBar
                      key={skill.id}
                      id={skill.id}
                      value={skill.value}
                      label={skill.label}
                      color={skill.color}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Experience and education tabs */}
            <div className="col-lg-6 wow fadeInUp" data-wow-delay="0.5s">
              <ul className="nav nav-pills rounded border border-2 border-primary mb-5">
                <li className="nav-item w-50">
                  <a
                    className="nav-link w-100 py-3 fs-5 text-center active"
                    id="experience"
                    data-bs-toggle="pill"
                    href="#tab-1"
                  >
                    Experience
                  </a>
                </li>
                <li className="nav-item w-50">
                  <a
                    className="nav-link w-100 py-3 fs-5 text-center"
                    id="education"
                    data-bs-toggle="pill"
                    href="#tab-2"
                  >
                    Education
                  </a>
                </li>
              </ul>
              <div className="tab-content">
                <div id="tab-1" className="tab-pane fade show p-0 active">
                  <div className="row gy-5 gx-4">
                    {experiences.map((experience) => (
                      <ExperienceCard key={experience.id} experience={experience} />
                    ))}
                  </div>
                </div>
                <div id="tab-2" className="tab-pane fade show p-0">
                  <div className="row gy-5 gx-4">
                    {educations.map((education) => (
                      <EducationCard key={education.id} education={education} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function ExperienceCard({ experience }: { experience: ExperienceItem }) {
  return (
    <div className="col-sm-6">
      <h5>{experience.title}</h5>
      <hr className="text-primary my-2" />
      <p className="text-primary mb-1">{experience.date}</p>
      <h6 className="mb-0">{experience.company}</h6>
    </div>
  )
}

function EducationCard({ education }: { education: EducationItem }) {
  return (
    <div className="col-sm-6">
      <h5>{education.title}</h5>
      <hr className="text-primary my-2" />
      <p className="text-primary mb-1">{education.date}</p>
      <h6 className="mb-0">{education.location}</h6>
    </div>
  )
}
