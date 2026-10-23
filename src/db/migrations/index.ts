import type { Migration } from '../migrate';
import { migration001 } from './001_init';
import { migration002 } from './002_search';

export const MIGRATIONS: readonly Migration[] = [migration001, migration002];
