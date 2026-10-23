import type { Migration } from '../migrate';
import { migration001 } from './001_init';

export const MIGRATIONS: readonly Migration[] = [migration001];
