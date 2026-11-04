export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const [{ installNodeDnsFallback }, { installCompressionDrainFix, installEarlyStreamCloseFilter }] =
      await Promise.all([
        import('./lib/nodeDnsFallback'),
        import('./lib/fixCompressionDrainListeners'),
      ])
    installNodeDnsFallback()
    installCompressionDrainFix()
    installEarlyStreamCloseFilter()
  }
}
