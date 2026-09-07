import { PositionCache } from './caches/position-cache';
import { LayoutObserver } from './observers/layout-observer';
import { ViewportObserver } from './observers/viewport-observer';
import { CanvasOverlayRenderer } from './renderers/canvas-overlay-renderer';
import { RenderScheduler } from './schedulers/render-scheduler';
import { type ErrorMarker, ErrorMarkerStore } from './stores/error-marker-store';

export * from './caches/position-cache';
export * from './observers/layout-observer';
export * from './observers/viewport-observer';
export * from './renderers/canvas-overlay-renderer';
export * from './schedulers/render-scheduler';
export * from './stores/error-marker-store';
export * from './utils/range-utils';

export class SpellcheckOverlayService {
  public readonly errorStore: ErrorMarkerStore;
  public readonly positionCache: PositionCache;
  public readonly scheduler: RenderScheduler;
  public readonly renderer: CanvasOverlayRenderer;
  public readonly viewportObserver: ViewportObserver;
  public readonly layoutObserver: LayoutObserver;

  private readonly mutationObserver: MutationObserver;
  private readonly scrollHandler: () => void;

  constructor(editorContainer: HTMLElement) {
    this.errorStore = new ErrorMarkerStore();
    this.positionCache = new PositionCache();
    this.scheduler = new RenderScheduler();
    this.renderer = new CanvasOverlayRenderer(editorContainer);
    this.viewportObserver = new ViewportObserver(
      editorContainer,
      this.errorStore,
      this.positionCache,
      this.scheduler,
      this.renderer
    );
    this.layoutObserver = new LayoutObserver(editorContainer, this.viewportObserver);

    this.mutationObserver = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          const block = mutation.target.parentElement?.closest('[data-block-id]');
          if (block) {
            const blockId = (block as HTMLElement).dataset.blockId;
            if (blockId) {
              this.viewportObserver.invalidateBlock(blockId);
            }
          }
        }
      }
    });

    this.mutationObserver.observe(editorContainer, {
      characterData: true,
      subtree: true,
    });

    this.scrollHandler = () => {
      this.renderer.syncTransform();
    };
    editorContainer.addEventListener('scroll', this.scrollHandler, { passive: true });
    window.addEventListener('scroll', this.scrollHandler, { passive: true });
  }

  public addError(
    blockId: string,
    startOffset: number,
    endOffset: number,
    type: ErrorMarker['type'] = 'spelling',
    message?: string,
    suggestions?: string[]
  ): ErrorMarker {
    const marker = this.errorStore.addMarker({
      blockId,
      startOffset,
      endOffset,
      type,
      message,
      suggestions,
      isTransient: true,
    });
    this.viewportObserver.invalidateBlock(blockId);
    return marker;
  }

  public setBlockErrors(
    blockId: string,
    errors: Array<{
      startOffset: number;
      endOffset: number;
      type?: ErrorMarker['type'];
      message?: string;
      suggestions?: string[];
    }>
  ): void {
    this.errorStore.setMarkersForBlock(
      blockId,
      errors.map(err => ({
        blockId,
        startOffset: err.startOffset,
        endOffset: err.endOffset,
        type: err.type ?? 'spelling',
        message: err.message,
        suggestions: err.suggestions,
        isTransient: true,
      }))
    );
    this.viewportObserver.invalidateBlock(blockId);
  }

  public removeError(markerId: string): void {
    this.errorStore.removeMarker(markerId);
    this.scheduler.schedule(() => this.viewportObserver.renderVisibleErrors());
  }

  public clearBlock(blockId: string): void {
    this.errorStore.clearBlock(blockId);
    this.positionCache.clearBlock(blockId);
    this.viewportObserver.invalidateBlock(blockId);
  }

  public clearAll(): void {
    this.errorStore.clear();
    this.positionCache.clear();
    this.renderer.render([]);
  }

  public destroy(): void {
    this.mutationObserver.disconnect();
    window.removeEventListener('scroll', this.scrollHandler);
    this.layoutObserver.destroy();
    this.viewportObserver.destroy();
    this.renderer.destroy();
  }
}
