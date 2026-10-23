import * as migration_20261020_125655_baseline from './20261020_125655_baseline';
import * as migration_20261020_131351_jobs_and_pagespeed from './20261020_131351_jobs_and_pagespeed';
import * as migration_20261020_182625_audit_log from './20261020_182625_audit_log';
import * as migration_20261020_223003_navigation_and_site_settings from './20261020_223003_navigation_and_site_settings';
import * as migration_20261020_225420_media_sizes_and_focal_point from './20261020_225420_media_sizes_and_focal_point';
import * as migration_20261020_231332_drafts_and_scheduled_publishing from './20261020_231332_drafts_and_scheduled_publishing';
import * as migration_20261021_001500_skills_orderable from './20261021_001500_skills_orderable';
import * as migration_20261021_150000_orderable_profile_and_services from './20261021_150000_orderable_profile_and_services';
import * as migration_20261021_163000_media_folders from './20261021_163000_media_folders';
import * as migration_20261022_045702_admin_changes from './20261022_045702_admin_changes';
import * as migration_20261022_090000_seo_meta from './20261022_090000_seo_meta';
import * as migration_20261022_140000_database_tools_capability from './20261022_140000_database_tools_capability';
import * as migration_20261022_160000_database_upkeep_job from './20261022_160000_database_upkeep_job';
import * as migration_20261023_022612_schema_snapshot from './20261023_022612_schema_snapshot';
import * as migration_20261023_023618_admin_changes from './20261023_023618_admin_changes';
import * as migration_20261023_050000_database_backup_job from './20261023_050000_database_backup_job';
import * as migration_20261023_061418_email_log from './20261023_061418_email_log';

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
    name: '20261020_182625_audit_log',
  },
  {
    up: migration_20261020_223003_navigation_and_site_settings.up,
    down: migration_20261020_223003_navigation_and_site_settings.down,
    name: '20261020_223003_navigation_and_site_settings',
  },
  {
    up: migration_20261020_225420_media_sizes_and_focal_point.up,
    down: migration_20261020_225420_media_sizes_and_focal_point.down,
    name: '20261020_225420_media_sizes_and_focal_point',
  },
  {
    up: migration_20261020_231332_drafts_and_scheduled_publishing.up,
    down: migration_20261020_231332_drafts_and_scheduled_publishing.down,
    name: '20261020_231332_drafts_and_scheduled_publishing',
  },
  {
    up: migration_20261021_001500_skills_orderable.up,
    down: migration_20261021_001500_skills_orderable.down,
    name: '20261021_001500_skills_orderable',
  },
  {
    up: migration_20261021_150000_orderable_profile_and_services.up,
    down: migration_20261021_150000_orderable_profile_and_services.down,
    name: '20261021_150000_orderable_profile_and_services',
  },
  {
    up: migration_20261021_163000_media_folders.up,
    down: migration_20261021_163000_media_folders.down,
    name: '20261021_163000_media_folders',
  },
  {
    up: migration_20261022_045702_admin_changes.up,
    down: migration_20261022_045702_admin_changes.down,
    name: '20261022_045702_admin_changes',
  },
  {
    up: migration_20261022_090000_seo_meta.up,
    down: migration_20261022_090000_seo_meta.down,
    name: '20261022_090000_seo_meta',
  },
  {
    up: migration_20261022_140000_database_tools_capability.up,
    down: migration_20261022_140000_database_tools_capability.down,
    name: '20261022_140000_database_tools_capability',
  },
  {
    up: migration_20261022_160000_database_upkeep_job.up,
    down: migration_20261022_160000_database_upkeep_job.down,
    name: '20261022_160000_database_upkeep_job',
  },
  {
    up: migration_20261023_022612_schema_snapshot.up,
    down: migration_20261023_022612_schema_snapshot.down,
    name: '20261023_022612_schema_snapshot',
  },
  {
    up: migration_20261023_023618_admin_changes.up,
    down: migration_20261023_023618_admin_changes.down,
    name: '20261023_023618_admin_changes',
  },
  {
    up: migration_20261023_050000_database_backup_job.up,
    down: migration_20261023_050000_database_backup_job.down,
    name: '20261023_050000_database_backup_job',
  },
  {
    up: migration_20261023_061418_email_log.up,
    down: migration_20261023_061418_email_log.down,
    name: '20261023_061418_email_log',
  },
];
