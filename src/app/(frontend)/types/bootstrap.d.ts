// The bootstrap package ships no type declarations, and @types/bootstrap is not a dependency.
// This declares only the Collapse API used by src/app/(frontend)/components/layout/Navigation.tsx.
declare module 'bootstrap' {
  export class Collapse {
    static getOrCreateInstance(element: Element): Collapse
    hide(): void
  }
}

// The UMD bundle is loaded for its side effects only (BootstrapClient.tsx), so it needs no types.
declare module 'bootstrap/dist/js/bootstrap.bundle.js'
