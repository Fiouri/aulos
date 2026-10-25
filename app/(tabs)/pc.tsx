import { useEffect } from 'react';

import { useDb } from '@/db/DbProvider';
import { lastUsedPairing } from '@/nuclear/pairings';
import { usePcStore } from '@/stores/pc';
import { TabScreen } from '@/ui/Layouts';
import { PairingView } from '@/ui/pc/PairingView';
import { RemoteView } from '@/ui/pc/RemoteView';

/** Remote for Nuclear on the PC; the last PC used reconnects when the tab first opens. */
export default function PcScreen() {
  const db = useDb();
  const paired = usePcStore((s) => s.pairing !== null);

  useEffect(() => {
    let active = true;
    void lastUsedPairing(db).then((pairing) => {
      if (active && pairing && usePcStore.getState().pairing === null) {
        usePcStore.getState().connect(pairing);
      }
    });
    return () => {
      active = false;
    };
  }, [db]);

  return <TabScreen>{paired ? <RemoteView /> : <PairingView />}</TabScreen>;
}
