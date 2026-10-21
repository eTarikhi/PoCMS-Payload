import { StudioChrome } from './components/studio/StudioChrome'

export default function FrontendLoading() {
  return (
    <StudioChrome footer={null}>
      <main
        id="main-content"
        tabIndex={-1}
        className="studio-container studio-system-page"
        aria-busy="true"
      >
        <p className="studio-eyebrow" role="status">
          Loading portfolio…
        </p>
        <div className="studio-skeleton" aria-hidden="true">
          <div />
          <div />
          <div />
        </div>
      </main>
    </StudioChrome>
  )
}
