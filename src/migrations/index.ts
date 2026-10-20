import * as migration_20261020_125655_baseline from './20261020_125655_baseline';
import * as migration_20261020_131351_jobs_and_pagespeed from './20261020_131351_jobs_and_pagespeed';
import * as migration_20261020_182625_audit_log from './20261020_182625_audit_log';

export const migrations = [
  {
    up: migration_20261020_125655_baseline.up,
    down: migration_20261020_125655_baseline.down,
    name: '20261020_125655_baseline',
  },
  {
    up: migration_20261020_131351_jobs_and_pagespeed.up,
    down: migration_20261020_131351_jobs_and_pagespeed.down,
    name: '20261020_131351_jobs_and_pagespeed',
  },
  {
    up: migration_20261020_182625_audit_log.up,
    down: migration_20261020_182625_audit_log.down,
    name: '20261020_182625_audit_log'
  },
];
