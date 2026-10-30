export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { installCompressionDrainFix } = await import('./lib/fixCompressionDrainListeners')
    installCompressionDrainFix()
  }
}
