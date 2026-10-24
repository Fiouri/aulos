import { DetailScreen } from '@/ui/Layouts';
import { DownloadsSection } from '@/ui/library/DownloadsSection';

/** Settings → Downloads (the same list as the Library's Downloads section). */
export default function DownloadsScreen() {
  return (
    <DetailScreen>
      <DownloadsSection header={null} />
    </DetailScreen>
  );
}
