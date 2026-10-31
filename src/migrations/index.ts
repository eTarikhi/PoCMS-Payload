import * as migration_20261031_001_phase1_integrity_and_indexes from './20261031_001_phase1_integrity_and_indexes'

export const migrations = [
  {
    up: migration_20261031_001_phase1_integrity_and_indexes.up,
    down: migration_20261031_001_phase1_integrity_and_indexes.down,
    name: '20261031_001_phase1_integrity_and_indexes',
  },
]
