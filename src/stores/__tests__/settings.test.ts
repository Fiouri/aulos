/**
 * @jest-environment node
 */
import { openNodeDb, type NodeDb } from '../../../test/node-db';
import { getKv, setKv } from '../../db/kv';
import { migrate } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { THEME_KEY, useSettingsStore } from '../settings';

describe('settings store', () => {
  let db: NodeDb;
  beforeEach(async () => {
    db = openNodeDb();
    await migrate(db, MIGRATIONS);
    useSettingsStore.setState(useSettingsStore.getInitialState(), true);
  });
  afterEach(() => db.close());

  it('defaults to the system theme', async () => {
    await useSettingsStore.getState().load(db);
    expect(useSettingsStore.getState()).toMatchObject({ theme: 'system', loaded: true });
  });

  it('persists the theme in kv and restores it', async () => {
    await useSettingsStore.getState().setTheme(db, 'dark');
    expect(await getKv(db, THEME_KEY)).toBe('dark');

    useSettingsStore.setState(useSettingsStore.getInitialState(), true);
    await useSettingsStore.getState().load(db);
    expect(useSettingsStore.getState().theme).toBe('dark');
  });

  it('ignores an invalid stored value', async () => {
    await setKv(db, THEME_KEY, 'sepia');
    await useSettingsStore.getState().load(db);
    expect(useSettingsStore.getState().theme).toBe('system');
  });
});
