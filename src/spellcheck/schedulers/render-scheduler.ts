export class RenderScheduler {
  private isPending = false;
  private readonly callbacks: Set<() => void> = new Set();

  schedule(callback: () => void): void {
    this.callbacks.add(callback);
    if (!this.isPending) {
      this.isPending = true;
      requestAnimationFrame(() => {
        this.isPending = false;
        const callbacks = Array.from(this.callbacks);
        this.callbacks.clear();
        for (const cb of callbacks) {
          cb();
        }
      });
    }
  }

  flush(): void {
    if (this.isPending || this.callbacks.size > 0) {
      this.isPending = false;
      const callbacks = Array.from(this.callbacks);
      this.callbacks.clear();
      for (const cb of callbacks) {
        cb();
      }
    }
  }

  cancel(): void {
    this.isPending = false;
    this.callbacks.clear();
  }
}
