export interface ErrorMarker {
  id: string;
  blockId: string;
  startOffset: number;
  endOffset: number;
  type: 'spelling' | 'grammar' | 'style';
  message?: string;
  suggestions?: string[];
  isTransient?: boolean;
}

export class ErrorMarkerStore {
  private readonly markers: Map<string, ErrorMarker[]> = new Map();
  private readonly listeners: Set<() => void> = new Set();

  addMarker(marker: Omit<ErrorMarker, 'id'>): ErrorMarker {
    const fullMarker: ErrorMarker = {
      ...marker,
      id: `err-${Math.random().toString(36).substring(2, 9)}`,
    };
    const blockMarkers = this.markers.get(marker.blockId) || [];
    blockMarkers.push(fullMarker);
    this.markers.set(marker.blockId, blockMarkers);
    this.notify();
    return fullMarker;
  }

  setMarkersForBlock(blockId: string, markers: Omit<ErrorMarker, 'id'>[]): ErrorMarker[] {
    const fullMarkers = markers.map(m => ({
      ...m,
      id: `err-${Math.random().toString(36).substring(2, 9)}`,
    }));
    if (fullMarkers.length === 0) {
      this.markers.delete(blockId);
    } else {
      this.markers.set(blockId, fullMarkers);
    }
    this.notify();
    return fullMarkers;
  }

  removeMarker(markerId: string): void {
    for (const [blockId, markers] of this.markers) {
      const filtered = markers.filter(m => m.id !== markerId);
      if (filtered.length === 0) {
        this.markers.delete(blockId);
      } else {
        this.markers.set(blockId, filtered);
      }
    }
    this.notify();
  }

  getMarkersForBlock(blockId: string): ErrorMarker[] {
    return this.markers.get(blockId) || [];
  }

  getAllMarkers(): ErrorMarker[] {
    return Array.from(this.markers.values()).flat();
  }

  clearBlock(blockId: string): void {
    this.markers.delete(blockId);
    this.notify();
  }

  clear(): void {
    this.markers.clear();
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach(listener => listener());
  }
}
