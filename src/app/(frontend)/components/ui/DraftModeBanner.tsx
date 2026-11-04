type DraftModeBannerProps = {
  currentPath: string
}

export function DraftModeBanner({ currentPath }: DraftModeBannerProps) {
  const exitHref = `/api/exit-draft?redirect=${encodeURIComponent(currentPath)}`

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: 'linear-gradient(90deg, #1b1507 0%, #261b08 50%, #1b1507 100%)',
        borderBottom: '1px solid rgba(255, 196, 72, 0.38)',
        color: '#ffe294',
        padding: '0.55rem 1rem',
        fontSize: '0.84rem',
      }}
    >
      <div className="container-xxl px-3 d-flex flex-wrap align-items-center justify-content-between gap-2">
        <span>
          <strong>Draft Preview Mode</strong> — You are viewing the latest unpublished draft version.
        </span>
        <a
          href={exitHref}
          className="pocms-utility-btn"
          style={{ color: '#fff', borderColor: 'rgba(255, 196, 72, 0.45)' }}
        >
          Exit preview ×
        </a>
      </div>
    </div>
  )
}
