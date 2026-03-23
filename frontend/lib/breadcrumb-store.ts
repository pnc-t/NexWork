import { create } from 'zustand';

interface BreadcrumbSegment {
  label: string;
  href?: string;
}

interface BreadcrumbState {
  segments: BreadcrumbSegment[];
  setSegments: (segments: BreadcrumbSegment[]) => void;
  clear: () => void;
}

export const useBreadcrumbStore = create<BreadcrumbState>((set) => ({
  segments: [],
  setSegments: (segments) => set({ segments }),
  clear: () => set({ segments: [] }),
}));
