import * as migration_20261020_125655_baseline from './20261020_125655_baseline';

export const migrations = [
  {
    up: migration_20261020_125655_baseline.up,
    down: migration_20261020_125655_baseline.down,
    name: '20261020_125655_baseline'
  },
];
