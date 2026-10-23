import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { recentlyPlayed } from '@/collections/history';
import type { Db } from '@/db/types';
import { useDbQuery } from '@/db/useDbQuery';

import { TrackList } from '../TrackList';

const loadRecent = (db: Db) => recentlyPlayed(db, 200);

export function RecentSection({ header }: { header: ReactElement }) {
  const { t } = useTranslation();
  const tracks = useDbQuery(loadRecent) ?? [];
  return (
    <TrackList
      tracks={tracks}
      header={header}
      emptyText={t('recent.empty')}
      testIDPrefix="recent"
    />
  );
}
