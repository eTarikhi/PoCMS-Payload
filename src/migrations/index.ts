import * as migration_20261016_171500_localize_english_content from './20261016_171500_localize_english_content'

export const migrations = [
  {
    up: migration_20261016_171500_localize_english_content.up,
    down: migration_20261016_171500_localize_english_content.down,
    name: '20261016_171500_localize_english_content',
  },
]
