import type { ErrorMarker } from '../stores/error-marker-store';

export interface RenderItem {
  marker: ErrorMarker;
  rects: DOMRect[];
}

export class CanvasOverlayRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly editorContainer: HTMLElement;
  private readonly colorMap: Record<ErrorMarker['type'], string> = {
    spelling: '#ff4d4f',
    grammar: '#faad14',
    style: '#1890ff',
  };

  constructor(editorContainer: HTMLElement) {
    this.editorContainer = editorContainer;
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.willChange = 'transform';
    this.canvas.style.zIndex = '10';

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context 2d is not supported in this browser environment');
    this.ctx = ctx;

    // Ensure container has relative positioning for absolute canvas attachment
    const computedPosition = window.getComputedStyle(editorContainer).position;
    if (computedPosition === 'static') {
      editorContainer.style.position = 'relative';
    }

    editorContainer.append(this.canvas);
    this.syncSize();
  }

  public syncSize(): void {
    const dpr = window.devicePixelRatio || 1;

    // Use scrollWidth & scrollHeight so canvas canvas-space matches entire scrollable content
    const width = Math.max(this.editorContainer.scrollWidth, this.editorContainer.clientWidth);
    const height = Math.max(this.editorContainer.scrollHeight, this.editorContainer.clientHeight);

    if (this.canvas.width !== width * dpr || this.canvas.height !== height * dpr) {
      this.canvas.width = width * dpr;
      this.canvas.height = height * dpr;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.ctx.scale(dpr, dpr);
    }
  }

  public syncTransform(): void {
    // If the canvas is attached inside the scrolling container, it naturally scrolls with the content.
    // However, if the container doesn't scroll itself and instead parent window scrolls, top: 0, left: 0 remains accurate.
    this.syncSize();
  }

  private drawSquiggly(x: number, y: number, width: number, height: number, color: string): void {
    if (width < 1 || height < 1) return;

    this.ctx.save();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 1.5;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    const baseY = y + height - 1.5;
    const amplitude = 1.8;
    const waveLength = 3.5;

    this.ctx.beginPath();
    for (let i = 0; i < width; i += 0.5) {
      const curY = baseY + amplitude * Math.sin((i / waveLength) * Math.PI * 2);
      if (i === 0) {
        this.ctx.moveTo(x + i, curY);
      } else {
        this.ctx.lineTo(x + i, curY);
      }
    }
    this.ctx.stroke();
    this.ctx.restore();
  }

  render(items: RenderItem[]): void {
    this.syncSize();

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (const { marker, rects } of items) {
      const color = this.colorMap[marker.type] || '#ff4d4f';
      for (const rect of rects) {
        const containerRect = this.editorContainer.getBoundingClientRect();
        // Calculate coordinate in canvas content space (taking container scroll into account)
        const x = rect.left - containerRect.left + this.editorContainer.scrollLeft;
        const y = rect.top - containerRect.top + this.editorContainer.scrollTop;

        this.drawSquiggly(x, y, rect.width, rect.height, color);
      }
    }
  }

  public destroy(): void {
    this.canvas.remove();
  }
}
