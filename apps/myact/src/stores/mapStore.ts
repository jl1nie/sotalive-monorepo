import { create } from 'zustand';
import type { LatLngExpression } from 'leaflet';
import { MAP_DEFAULTS, type PopupData } from '@/types/map';
import type { SotaSummitMarker, PotaParkMarker } from '@/types';

/** マーカークリック時のポップアップデータ */
export interface MarkerPopupData {
  type: 'summit' | 'park';
  position: [number, number];
  data: SotaSummitMarker | PotaParkMarker;
}

interface MapStore {
  // State
  center: LatLngExpression;
  zoom: number;
  activePopup: PopupData | null;
  markerPopup: MarkerPopupData | null;
  qthPosition: { lat: number; lng: number } | null;
  selectedBaseLayer: 'gsi' | 'gsi_photo' | 'osm';

  // Actions
  setCenter: (center: LatLngExpression) => void;
  setZoom: (zoom: number) => void;
  setView: (center: LatLngExpression, zoom: number) => void;
  setActivePopup: (popup: PopupData | null) => void;
  setPopupData: (data: MarkerPopupData | null) => void;
  setQthPosition: (position: { lat: number; lng: number } | null) => void;
  setSelectedBaseLayer: (layer: 'gsi' | 'gsi_photo' | 'osm') => void;
}

export const useMapStore = create<MapStore>((set) => ({
  // Initial state
  center: MAP_DEFAULTS.center,
  zoom: MAP_DEFAULTS.zoom,
  activePopup: null,
  markerPopup: null,
  qthPosition: null,
  selectedBaseLayer: 'gsi',

  // Actions
  setCenter: (center) => set({ center }),
  setZoom: (zoom) => set({ zoom }),
  setView: (center, zoom) => set({ center, zoom }),
  setActivePopup: (popup) => set({ activePopup: popup }),
  setPopupData: (data) => set({ markerPopup: data }),
  setQthPosition: (position) => set({ qthPosition: position }),
  setSelectedBaseLayer: (layer) => set({ selectedBaseLayer: layer }),
}));
