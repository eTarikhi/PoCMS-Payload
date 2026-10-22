import Link from 'next/link'
import type { PortfolioContent } from '../../lib/types'
import { CoverImage } from '../ui/CoverImage'
import { WorkGrid } from './WorkGrid'
import { StudioChrome } from './StudioChrome'

function SectionHeading({ label, title }: { label: string; title: string }) {
  return (
    <div className="studio-section-heading">
      <p className="studio-eyebrow">{label}</p>
      <h2>{title}</h2>
    </div>
  )
}

export function StudioHome({ content: c }: { content: PortfolioContent }) {
  const name = c.header?.sureName || c.footer?.fullName || 'Portfolio'
  const writing = [...c.articles]
    .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)))
    .slice(0, 3)
  return (
    <StudioChrome name={name} footer={c.footer} profile={c.header}>
      <main tabIndex={-1} id="main-content" className="bento-board">
        <section className="resume-summary studio-container" id="home">
          <div className="resume-page-heading">
            <span className="studio-eyebrow">Independent portfolio</span>
            <a className="studio-text-link" href="#contact">
              Say hello ↗
            </a>
          </div>
          <h1>{name}</h1>
          <p className="resume-role">{c.header?.professionTexts[0] || 'Professional portfolio'}</p>
          {c.about?.experience.description ? (
            <details className="bento-bio">
              <summary>
                About my work <span aria-hidden="true">+</span>
              </summary>
              <p>{c.about.experience.description}</p>
            </details>
          ) : null}
          {c.header?.professionTexts.slice(1).length ? (
            <p className="resume-specialties">{c.header.professionTexts.slice(1).join(' · ')}</p>
          ) : null}
          <div className="resume-summary-bottom">
            {c.about ? (
              <span>
                <strong>{c.about.experience.years}+ years</strong> of experience
              </span>
            ) : (
              <span>Experience, skills & selected work</span>
            )}
            <a className="studio-button" href="#project">
              Explore my work <span aria-hidden="true">↓</span>
            </a>
          </div>
        </section>

        <section className="bento-portrait" aria-label="Profile portrait">
          <span className="studio-eyebrow">The person behind the work</span>
          {c.header?.imageUrl ? (
            <CoverImage
              src={c.header.imageUrl}
              fallbackSrc="/placeholder.svg"
              alt={name}
              width={420}
              height={420}
              priority
              sizes="(max-width: 760px) 100vw, 33vw"
            />
          ) : (
            <span className="bento-portrait-initials" aria-hidden="true">
              {name
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0])
                .join('')}
            </span>
          )}
          <footer className="bento-portrait-caption">
            <span>{name}</span>
            {c.header?.requestCV ? (
              <a href={c.header.requestCV}>Request CV ↗</a>
            ) : (
              <a href="#contact">Contact ↗</a>
            )}
          </footer>
        </section>

        <section className="studio-section studio-container" id="skill">
          <SectionHeading label="Technical profile" title="Skills & expertise" />
          <div className="studio-skills">
            {Object.entries(c.skills).map(([group, skills]) => (
              <div key={group}>
                <h3>{group === 'frontend' ? 'Front-end development' : 'Back-end development'}</h3>
                <div className="studio-tags">
                  {skills.map((skill) => (
                    <span key={skill.id}>{skill.label}</span>
                  ))}
                </div>
                {!skills.length ? <p className="studio-empty">No skills listed yet.</p> : null}
              </div>
            ))}
          </div>
          {c.services.items.length ? (
            <details className="bento-services" id="service">
              <summary>
                How I can help <span aria-hidden="true">+</span>
              </summary>
              <div className="studio-services">
                {c.services.items.map((service) => (
                  <article key={service.id}>
                    <h3>{service.category}</h3>
                    <ul>
                      {service.descriptions.map((description, index) => (
                        <li key={index}>{description}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </details>
          ) : (
            <div id="service" />
          )}
        </section>

        <section className="studio-section studio-container" id="project">
          <SectionHeading label="Portfolio" title="Selected projects" />
          <WorkGrid projects={c.projects} initialLimit={4} />
          <Link className="studio-text-link studio-archive-link" href="/projects">
            Browse project archive ↗
          </Link>
        </section>

        <section className="studio-section studio-container studio-career" id="experience">
          <SectionHeading label="Career history" title="Professional experience" />
          <div className="resume-timeline">
            {c.experiences.map((item) => (
              <article key={item.id}>
                <p className="resume-date">{item.date}</p>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.company}</p>
                </div>
              </article>
            ))}
          </div>
          {!c.experiences.length ? (
            <p className="studio-empty">Experience details have not been added yet.</p>
          ) : null}
        </section>

        <section className="studio-section studio-container" id="article">
          <SectionHeading label="Articles & insights" title="Recent writing" />
          <div className="resume-writing-list">
            {writing.map((article) => (
              <article key={article.id}>
                <div>
                  <p className="studio-eyebrow">
                    {article.featured ? 'Featured · ' : ''}
                    {article.author} · {article.readTime}
                  </p>
                  <h3>
                    <Link href={article.pagePath || article.link}>
                      {article.title} <span aria-hidden="true">↗</span>
                    </Link>
                  </h3>
                  <p>{article.excerpt}</p>
                </div>
              </article>
            ))}
          </div>
          {!writing.length ? <p className="studio-empty">No articles published yet.</p> : null}
          <Link className="studio-text-link studio-archive-link" href="/articles">
            Browse all writing ↗
          </Link>
        </section>

        <section className="studio-section studio-container" id="education">
          <SectionHeading label="Qualifications" title="Education & certifications" />
          <div className="resume-timeline">
            {c.educations.map((item) => (
              <article key={item.id}>
                <p className="resume-date">{item.date}</p>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.location}</p>
                </div>
              </article>
            ))}
          </div>
          <div className="resume-certificates">
            {c.certificates.map((item) => (
              <article key={item.id}>
                <span className="resume-certificate-mark" aria-hidden="true">
                  ✓
                </span>
                <div>
                  <h3>
                    {item.link ? (
                      <a href={item.link} target="_blank" rel="noopener noreferrer">
                        {item.title} ↗
                      </a>
                    ) : (
                      item.title
                    )}
                  </h3>
                  <p>{item.issuer}</p>
                  <span>{item.date}</span>
                </div>
              </article>
            ))}
          </div>
          {!c.educations.length && !c.certificates.length ? (
            <p className="studio-empty">Qualifications have not been added yet.</p>
          ) : null}
        </section>

        {c.about ? (
          <section className="studio-section studio-container" id="about">
            <SectionHeading label="More about me" title="Additional information" />
            <div className="resume-additional">
              <div>
                <h3>{c.about.workPermit.title}</h3>
                <p>{c.about.workPermit.description}</p>
              </div>
              <div>
                <h3>{c.about.interests.title}</h3>
                <p>{c.about.interests.description}</p>
                <div className="studio-tags">
                  {c.about.interests.areas.map((area) => (
                    <span key={area}>{area}</span>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="studio-section studio-container studio-contact" id="contact">
          <SectionHeading label="Get in touch" title="Contact" />
          <div className="studio-contact-links">
            {c.footer?.contactInfo.map((item, index) => (
              <div key={index}>
                <span>{item.type}</span>
                {item.url ? (
                  <a href={item.url}>{item.content} ↗</a>
                ) : item.type === 'email' ? (
                  <a href={`mailto:${item.content}`}>{item.content} ↗</a>
                ) : (
                  <p>{item.content}</p>
                )}
              </div>
            ))}
          </div>
          {c.services.hiring ? (
            <a className="studio-button resume-contact-action" href={c.services.hiring.url}>
              {c.services.hiring.label} ↗
            </a>
          ) : null}
        </section>
      </main>
    </StudioChrome>
  )
}
