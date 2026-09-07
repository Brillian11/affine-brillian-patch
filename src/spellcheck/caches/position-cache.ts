export class PositionCache {
  private readonly cache = new Map<string, DOMRect[]>();
  private readonly dirtyBlocks = new Set<string>();
  private readonly versionMap = new Map<string, number>();

  markDirty(blockId: string): void {
    this.dirtyBlocks.add(blockId);
    this.versionMap.set(blockId, (this.versionMap.get(blockId) || 0) + 1);
  }

  get(blockId: string, errorId: string): DOMRect[] | null {
    if (this.dirtyBlocks.has(blockId)) return null;
    const key = `${blockId}:${errorId}`;
    return this.cache.get(key) ?? null;
  }

  set(blockId: string, errorId: string, rects: DOMRect[]): void {
    const key = `${blockId}:${errorId}`;
    this.cache.set(key, rects);
    this.dirtyBlocks.delete(blockId);
  }

  clearBlock(blockId: string): void {
    this.dirtyBlocks.add(blockId);
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${blockId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  getBlockVersion(blockId: string): number {
    return this.versionMap.get(blockId) || 0;
  }

  clear(): void {
    this.cache.clear();
    this.dirtyBlocks.clear();
    this.versionMap.clear();
  }
}
