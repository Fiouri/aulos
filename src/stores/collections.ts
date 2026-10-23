import { create } from 'zustand';

interface CollectionsState {
  /** Bumped after any playlist or favorite change, so open lists reload. */
  revision: number;
  bump(): void;
}

export const useCollectionsStore = create<CollectionsState>()((set) => ({
  revision: 0,
  bump: () => set((s) => ({ revision: s.revision + 1 })),
}));
