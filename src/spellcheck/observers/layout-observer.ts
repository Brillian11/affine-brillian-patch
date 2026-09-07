import type { ViewportObserver } from './viewport-observer';

export class LayoutObserver {
  private readonly resizeObserver: ResizeObserver;
  private readonly mutationObserver: MutationObserver;
  private readonly viewportObserver: ViewportObserver;
  private readonly editorContainer: HTMLElement;

  constructor(editorContainer: HTMLElement, viewportObserver: ViewportObserver) {
    this.editorContainer = editorContainer;
    this.viewportObserver = viewportObserver;

    this.resizeObserver = new ResizeObserver(() => {
      this.handleLayoutChange();
    });
    this.resizeObserver.observe(editorContainer);

    this.mutationObserver = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          this.handleDomChange(mutation);
        }
      }
    });
    this.mutationObserver.observe(editorContainer, {
      childList: true,
      subtree: true,
    });

    this.attachImageListeners();
  }

  private handleLayoutChange(): void {
    this.viewportObserver.refreshBlocks();
  }

  private handleDomChange(mutation: MutationRecord): void {
    let hasImageChange = false;

    for (const node of Array.from(mutation.addedNodes)) {
      if (node instanceof HTMLImageElement) {
        hasImageChange = true;
        this.attachImageListener(node);
      } else if (node instanceof HTMLElement) {
        const images = node.querySelectorAll('img');
        if (images.length > 0) {
          hasImageChange = true;
          images.forEach(img => this.attachImageListener(img));
        }
      }
    }

    if (hasImageChange) {
      this.handleLayoutChange();
    }
  }

  private attachImageListener(img: HTMLImageElement): void {
    const handleLoad = () => {
      const block = img.closest('[data-block-id]');
      if (block) {
        const blockId = (block as HTMLElement).dataset.blockId;
        if (blockId) {
          this.viewportObserver.invalidateBlock(blockId);
        }
      }
    };

    if (img.complete) {
      handleLoad();
    } else {
      img.addEventListener('load', handleLoad, { once: true });
      img.addEventListener('error', handleLoad, { once: true });
    }
  }

  private attachImageListeners(): void {
    const images = this.editorContainer.querySelectorAll('img');
    images.forEach(img => this.attachImageListener(img));
  }

  public destroy(): void {
    this.resizeObserver.disconnect();
    this.mutationObserver.disconnect();
  }
}
