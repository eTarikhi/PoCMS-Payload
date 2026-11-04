// The bootstrap package ships no type declarations, and @types/bootstrap is not a dependency.
// This declares the Collapse API used by src/app/(frontend)/components/layout/Navigation.tsx.
declare module 'bootstrap' {
  export interface CollapseOptions {
    toggle?: boolean
    parent?: string | Element
  }

  export class Collapse {
    static getOrCreateInstance(element: Element, config?: CollapseOptions): Collapse
    show(): void
    hide(): void
    toggle(): void
  }
}

// The UMD bundle is loaded for its side effects only (BootstrapClient.tsx), so it needs no types.
declare module 'bootstrap/dist/js/bootstrap.bundle.js'
