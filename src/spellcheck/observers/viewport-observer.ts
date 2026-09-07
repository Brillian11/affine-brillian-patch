import type { PositionCache } from '../caches/position-cache';
import type { CanvasOverlayRenderer } from '../renderers/canvas-overlay-renderer';
import type { RenderScheduler } from '../schedulers/render-scheduler';
import type { ErrorMarker, ErrorMarkerStore } from '../stores/error-marker-store';
import { getErrorRects } from '../utils/range-utils';

export class ViewportObserver {
  private readonly observer: IntersectionObserver;
  private readonly visibleBlocks = new Set<string>();
  private readonly editorContainer: HTMLElement;
  private readonly errorStore: ErrorMarkerStore;
  private readonly positionCache: PositionCache;
  private readonly scheduler: RenderScheduler;
  private readonly renderer: CanvasOverlayRenderer;

  constructor(
    editorContainer: HTMLElement,
    errorStore: ErrorMarkerStore,
    positionCache: PositionCache,
    scheduler: RenderScheduler,
    renderer: CanvasOverlayRenderer
  ) {
    this.editorContainer = editorContainer;
    this.errorStore = errorStore;
    this.positionCache = positionCache;
    this.scheduler = scheduler;
    this.renderer = renderer;

    this.observer = new IntersectionObserver(
      entries => this.handleIntersection(entries),
      {
        root: editorContainer,
        rootMargin: '200px 0px',
        threshold: 0,
      }
    );

    this.observeBlocks();
  }

  private observeBlocks(): void {
    const blocks = this.editorContainer.querySelectorAll('[data-block-id]');
    blocks.forEach(block => this.observer.observe(block));
  }

  private handleIntersection(entries: IntersectionObserverEntry[]): void {
    let needsUpdate = false;

    for (const entry of entries) {
      const blockId = (entry.target as HTMLElement).dataset.blockId;
      if (!blockId) continue;

      if (entry.isIntersecting) {
        if (!this.visibleBlocks.has(blockId)) {
          this.visibleBlocks.add(blockId);
          needsUpdate = true;
        }
      } else {
        if (this.visibleBlocks.has(blockId)) {
          this.visibleBlocks.delete(blockId);
          this.positionCache.clearBlock(blockId);
          needsUpdate = true;
        }
      }
    }

    if (needsUpdate) {
      this.scheduler.schedule(() => this.renderVisibleErrors());
    }
  }

  public renderVisibleErrors(): void {
    const visibleErrors = this.errorStore.getAllMarkers().filter(marker => {
      return this.visibleBlocks.has(marker.blockId);
    });

    const rects: Array<{ marker: ErrorMarker; rects: DOMRect[] }> = [];

    for (const marker of visibleErrors) {
      const cached = this.positionCache.get(marker.blockId, marker.id);
      if (cached) {
        rects.push({ marker, rects: cached });
        continue;
      }

      const blockElement = this.editorContainer.querySelector(
        `[data-block-id="${marker.blockId}"]`
      ) as HTMLElement | null;

      if (!blockElement) continue;

      const errorRects = getErrorRects(
        blockElement,
        marker.startOffset,
        marker.endOffset,
        this.editorContainer
      );

      if (errorRects.length > 0) {
        this.positionCache.set(marker.blockId, marker.id, errorRects);
        rects.push({ marker, rects: errorRects });
      }
    }

    this.renderer.render(rects);
  }

  public invalidateBlock(blockId: string): void {
    this.positionCache.markDirty(blockId);
    if (this.visibleBlocks.has(blockId)) {
      this.scheduler.schedule(() => this.renderVisibleErrors());
    }
  }

  public refreshBlocks(): void {
    this.observer.disconnect();
    this.positionCache.clear();
    this.visibleBlocks.clear();
    this.observeBlocks();
  }

  public destroy(): void {
    this.observer.disconnect();
    this.visibleBlocks.clear();
  }
}
