import type { Migration } from '../migrate';
import { migration001 } from './001_init';
import { migration002 } from './002_search';
import { migration003 } from './003_album_grouping';
import { migration004 } from './004_merged_album_artist';
import { migration005 } from './005_sources_downloads';

export const MIGRATIONS: readonly Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
];
