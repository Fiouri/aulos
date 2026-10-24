import type { Migration } from '../migrate';
import { migration001 } from './001_init';
import { migration002 } from './002_search';
import { migration003 } from './003_album_grouping';

export const MIGRATIONS: readonly Migration[] = [migration001, migration002, migration003];
