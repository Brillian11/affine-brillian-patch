export function getValidRects(range: Range, container: HTMLElement): DOMRect[] {
  const rects = Array.from(range.getClientRects());
  const containerRect = container.getBoundingClientRect();

  return rects.filter(rect => {
    // Filter zero-area or collapsed rects
    if (rect.width < 1 || rect.height < 1) return false;

    // Filter rects far outside container bounds (likely image or offscreen layout artifacts)
    if (rect.top < containerRect.top - 200) return false;
    if (rect.bottom > containerRect.bottom + 200) return false;
    if (rect.left < containerRect.left - 200) return false;
    if (rect.right > containerRect.right + 200) return false;

    // Filter rects with NaN values
    if (
      Number.isNaN(rect.top) ||
      Number.isNaN(rect.left) ||
      Number.isNaN(rect.width) ||
      Number.isNaN(rect.height)
    ) {
      return false;
    }

    return true;
  });
}

function getTextNodes(root: Node): Text[] {
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        // Skip placeholder, toggle icons, widgets, and non-content elements
        if (
          parent?.closest(
            '.affine-paragraph-placeholder, affine-paragraph-heading-icon, blocksuite-toggle-button, .affine-block-children-container, [contenteditable="false"]'
          )
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  let current = walker.nextNode();
  while (current) {
    if (current instanceof Text) {
      textNodes.push(current);
    }
    current = walker.nextNode();
  }
  return textNodes;
}

export function getErrorRects(
  blockElement: HTMLElement,
  startOffset: number,
  endOffset: number,
  container: HTMLElement
): DOMRect[] {
  try {
    // Find the inline content root (e.g. .inline-editor, rich-text, or the block root)
    const contentRoot: Node =
      blockElement.querySelector('.inline-editor') ||
      blockElement.querySelector('rich-text') ||
      blockElement.shadowRoot?.querySelector('.inline-editor') ||
      blockElement.shadowRoot?.querySelector('rich-text') ||
      blockElement;

    const textNodes = getTextNodes(contentRoot);
    if (textNodes.length === 0) return [];

    let accumulatedLength = 0;
    let startNode: Text | null = null;
    let startNodeOffset = 0;
    let endNode: Text | null = null;
    let endNodeOffset = 0;

    for (const textNode of textNodes) {
      const len = textNode.textContent?.length ?? 0;
      const nodeStart = accumulatedLength;
      const nodeEnd = accumulatedLength + len;

      if (!startNode && startOffset >= nodeStart && startOffset <= nodeEnd) {
        startNode = textNode;
        startNodeOffset = startOffset - nodeStart;
      }

      if (!endNode && endOffset >= nodeStart && endOffset <= nodeEnd) {
        endNode = textNode;
        endNodeOffset = endOffset - nodeStart;
      }

      if (startNode && endNode) {
        break;
      }

      accumulatedLength += len;
    }

    // Clamp to boundaries if requested offset spans beyond text length
    if (!startNode && textNodes.length > 0 && startOffset <= accumulatedLength) {
      const last = textNodes[textNodes.length - 1];
      startNode = last;
      startNodeOffset = last.textContent?.length ?? 0;
    }

    if (!endNode && textNodes.length > 0 && endOffset <= accumulatedLength) {
      const last = textNodes[textNodes.length - 1];
      endNode = last;
      endNodeOffset = last.textContent?.length ?? 0;
    }

    if (!startNode || !endNode) return [];

    const range = document.createRange();
    range.setStart(startNode, Math.min(startNodeOffset, startNode.textContent?.length ?? 0));
    range.setEnd(endNode, Math.min(endNodeOffset, endNode.textContent?.length ?? 0));

    if (range.collapsed) return [];

    return getValidRects(range, container);
  } catch (e) {
    console.debug('Failed to calculate rects for range:', e);
    return [];
  }
}
