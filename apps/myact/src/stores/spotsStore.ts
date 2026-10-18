import { create } from 'zustand';

type Program = 'SOTA' | 'POTA' | 'ALL';

interface SpotsStore {
  // State
  program: Program;
  isListOpen: boolean;
  isChartOpen: boolean;

  // Actions
  setProgram: (program: Program) => void;
  toggleList: () => void;
  openList: () => void;
  closeList: () => void;
  toggleChart: () => void;
  openChart: () => void;
  closeChart: () => void;
}

export const useSpotsStore = create<SpotsStore>((set) => ({
  // Initial state
  program: 'ALL',
  isListOpen: false,
  isChartOpen: false,

  // Actions
  setProgram: (program) => set({ program }),
  toggleList: () => set((state) => ({ isListOpen: !state.isListOpen })),
  openList: () => set({ isListOpen: true }),
  closeList: () => set({ isListOpen: false }),
  toggleChart: () => set((state) => ({ isChartOpen: !state.isChartOpen })),
  openChart: () => set({ isChartOpen: true }),
  closeChart: () => set({ isChartOpen: false }),
}));
