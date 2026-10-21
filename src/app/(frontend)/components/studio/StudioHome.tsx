import Link from 'next/link'
import type { PortfolioContent } from '../../lib/types'
import { CoverImage } from '../ui/CoverImage'
import { WorkGrid } from './WorkGrid'
import { StudioChrome } from './StudioChrome'

function SectionHeading({
  number,
  label,
  title,
}: {
  number: string
  label: string
  title: string
}) {
  return (
    <div className="studio-section-heading">
      <p className="studio-eyebrow">
        {number} / {label}
      </p>
      <h2>{title}</h2>
    </div>
  )
}

export function StudioHome({ content: c }: { content: PortfolioContent }) {
  const writing = [...c.articles]
    .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)))
    .slice(0, 3)
  const name = c.header?.sureName || c.footer?.fullName || 'Portfolio'
  return (
    <StudioChrome name={name} footer={c.footer}>
      <main tabIndex={-1} id="main-content">
        <section className="studio-hero studio-container" id="home">
          <div>
            <p className="studio-eyebrow">
              <span className="studio-dot" /> Independent portfolio / {name}
            </p>
            <h1>
              {c.header?.professionTexts[0] || 'Engineering with purpose'}
              <span className="studio-accent">.</span>
            </h1>
            <p className="studio-hero-description">
              {c.header?.professionTexts.slice(1).join(' / ') || c.about?.experience.title}
            </p>
            <div className="studio-actions">
              <a className="studio-button" href="#project">
                Explore my work <span aria-hidden="true">↘</span>
              </a>
              {c.header?.requestCV ? (
                <a className="studio-text-link" href={c.header.requestCV}>
                  Request CV ↗
                </a>
              ) : null}
            </div>
            <div className="studio-hero-note">
              <span>Interfaces. Systems. Possibilities.</span>
              <a href="#project" aria-label="Scroll to selected work">
                ↓
              </a>
            </div>
          </div>
          <div className="studio-portrait">
            <CoverImage
              src={c.header?.imageUrl || ''}
              fallbackSrc="/placeholder.svg"
              alt={name}
              priority
              width={700}
              height={800}
              sizes="(max-width: 800px) 100vw, 42vw"
            />
            <div className="studio-portrait-caption">
              <span>{name}</span>
              <span>Engineer & builder</span>
            </div>
            {c.about ? (
              <div className="studio-experience">
                <strong>{c.about.experience.years}+</strong>
                <span>years of experience</span>
              </div>
            ) : null}
          </div>
        </section>
        <section className="studio-section studio-container" id="project">
          <SectionHeading number="01" label="Selected work" title="Ideas made tangible." />
          <WorkGrid projects={c.projects} />
          <Link className="studio-text-link studio-archive-link" href="/projects">
            Browse project archive ↗
          </Link>
        </section>
        <section className="studio-expertise" id="service">
          <div className="studio-container studio-section">
            <SectionHeading
              number="02"
              label="Expertise"
              title="From interface to infrastructure."
            />
            <div className="studio-services">
              {c.services.items.map((service, i) => (
                <article key={service.id}>
                  <span className="studio-eyebrow">0{i + 1} /</span>
                  <h3>{service.category}</h3>
                  <ul>
                    {service.descriptions.map((description, index) => (
                      <li key={index}>{description}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
            <div className="studio-skills" id="skill">
              {Object.entries(c.skills).map(([group, skills]) => (
                <div key={group}>
                  <h3>{group === 'frontend' ? 'Front-end toolkit' : 'Back-end toolkit'}</h3>
                  <div className="studio-tags">
                    {skills.map((skill) => (
                      <span key={skill.id}>{skill.label}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
        {c.about ? (
          <section className="studio-section studio-container studio-about" id="about">
            <div>
              <SectionHeading
                number="03"
                label="The person behind the work"
                title={c.about.experience.title}
              />
              <p className="studio-lead">{c.about.experience.description}</p>
              {c.about.images[0] ? (
                <CoverImage
                  src={c.about.images[0]}
                  fallbackSrc="/placeholder.svg"
                  alt="A glimpse behind the work"
                  width={800}
                  height={500}
                  sizes="(max-width: 800px) 100vw, 50vw"
                />
              ) : null}
            </div>
            <div className="studio-about-details">
              <h3>{c.about.workPermit.title}</h3>
              <p>{c.about.workPermit.description}</p>
              <h3>{c.about.interests.title}</h3>
              <p>{c.about.interests.description}</p>
              <div className="studio-tags">
                {c.about.interests.areas.map((area) => (
                  <span key={area}>{area}</span>
                ))}
              </div>
            </div>
          </section>
        ) : null}
        <section className="studio-section studio-container" id="article">
          <SectionHeading number="04" label="Field notes" title="Thinking out loud." />
          <div className="studio-writing">
            {writing.map((article) => (
              <article key={article.id}>
                <Link href={article.pagePath || article.link}>
                  <CoverImage
                    src={article.imageUrl}
                    fallbackSrc="/placeholder.svg"
                    alt=""
                    width={600}
                    height={380}
                    sizes="(max-width: 700px) 100vw, 33vw"
                  />
                  <p className="studio-eyebrow">
                    {article.featured ? 'Featured / ' : ''}
                    {article.author} · {article.readTime}
                  </p>
                  <h3>
                    {article.title} <span aria-hidden="true">↗</span>
                  </h3>
                  <p>{article.excerpt}</p>
                </Link>
              </article>
            ))}
          </div>
          <Link className="studio-text-link studio-archive-link" href="/articles">
            Browse all writing ↗
          </Link>
          {!writing.length ? <p>New field notes are on their way.</p> : null}
        </section>
        <section className="studio-section studio-container studio-career">
          <SectionHeading number="05" label="Background" title="Built on experience." />
          <div className="studio-career-columns">
            <div>
              <h3>Experience</h3>
              {c.experiences.map((item) => (
                <article key={item.id}>
                  <span>{item.date}</span>
                  <h4>{item.title}</h4>
                  <p>{item.company}</p>
                </article>
              ))}
            </div>
            <div>
              <h3>Education & credentials</h3>
              {c.educations.map((item) => (
                <article key={item.id}>
                  <span>{item.date}</span>
                  <h4>{item.title}</h4>
                  <p>{item.location}</p>
                </article>
              ))}
              {c.certificates.map((item) => (
                <article key={item.id}>
                  <span>{item.date}</span>
                  <h4>
                    {item.link ? (
                      <a href={item.link} target="_blank" rel="noopener noreferrer">
                        {item.title} ↗
                      </a>
                    ) : (
                      item.title
                    )}
                  </h4>
                  <p>{item.issuer}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="studio-contact" id="contact">
          <div className="studio-container">
            <p className="studio-eyebrow">Have something in mind?</p>
            <h2>
              Let’s build
              <br />
              something <em>great.</em>
            </h2>
            {c.services.hiring ? (
              <a className="studio-button" href={c.services.hiring.url}>
                {c.services.hiring.label} ↗
              </a>
            ) : null}
            <div className="studio-contact-links">
              {c.footer?.contactInfo.map((item, i) => (
                <div key={i}>
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
          </div>
        </section>
      </main>
    </StudioChrome>
  )
}
