/**
 * Helper to detect Paperless document mentions in markdown text
 * and automatically generate / synchronize bidirectional footnotes.
 */

export interface PaperlessDocRef {
  id: string;
  title: string;
  url: string;
  index: number;
}

/**
 * Extracts all Paperless document links from a markdown string.
 * Supports `paperless://<ID>`, `/paperless-doc/<ID>`, and direct paperless URLs.
 */
export function extractPaperlessRefs(markdown: string): PaperlessDocRef[] {
  if (!markdown) return [];

  const refs: PaperlessDocRef[] = [];
  const seenIds = new Set<string>();

  // Pattern 1: [Title](paperless://<ID>)
  // Pattern 2: [Title](/paperless-doc/<ID>)
  // Pattern 3: [Title](http://localhost:8080/paperless-doc/<ID>)
  // Pattern 4: [Title](https://paperless.yourdomain.com/documents/<ID>...)
  const linkRegex = /\[([^\]]+)\]\((?:(?:https?:\/\/[^/]+)?\/(?:paperless-doc\/|documents\/)|paperless:\/\/)?(\d+)[^)]*\)/g;

  let match: RegExpExecArray | null;
  let index = 1;

  while ((match = linkRegex.exec(markdown)) !== null) {
    const rawTitle = match[1].trim();
    const docId = match[2];

    if (!seenIds.has(docId)) {
      seenIds.add(docId);
      refs.push({
        id: docId,
        title: rawTitle,
        url: `/paperless-doc/${docId}`,
        index: index++,
      });
    }
  }

  return refs;
}

/**
 * Transforms markdown containing Paperless links to include inline citation markers
 * and an automated Footnotes & References section at the bottom.
 */
export function formatPaperlessWithFootnotes(markdown: string): string {
  if (!markdown || (!markdown.includes('paperless://') && !markdown.includes('/paperless-doc/') && !markdown.includes('paperless.yourdomain.com'))) {
    return markdown;
  }

  const refs = extractPaperlessRefs(markdown);
  if (refs.length === 0) {
    return markdown;
  }

  // Map docId -> ref info
  const refMap = new Map<string, PaperlessDocRef>();
  refs.forEach(r => refMap.set(r.id, r));

  // Check if a footnotes section already exists in the markdown
  const hasFootnotesSection = /---[\s\n]+(?:\*\*|###?\s*)?(?:Footnotes|References|Citations)/i.test(markdown);

  // Replace inline paperless links: [Title](paperless://ID) -> [Title](/paperless-doc/ID)[^index]
  let processed = markdown.replace(
    /\[([^\]]+)\]\((?:(?:https?:\/\/[^/]+)?\/(?:paperless-doc\/|documents\/)|paperless:\/\/)?(\d+)[^)]*\)(?:\[\^(\d+)\])?/g,
    (_fullMatch, title, docId, existingFootnoteNum) => {
      const ref = refMap.get(docId);
      const fnNum = existingFootnoteNum || ref?.index || '1';
      return `[${title}](/paperless-doc/${docId})[^${fnNum}]`;
    }
  );

  // If footnotes section is not already present, generate and append it
  if (!hasFootnotesSection) {
    const footnoteEntries = refs.map(
      ref => `- [^${ref.index}]: [${ref.title}](/paperless-doc/${ref.id}) *(Paperless-ngx Archive ID: #${ref.id})*`
    );

    processed = `${processed.trim()}\n\n---\n\n**Footnotes & Document References:**\n${footnoteEntries.join('\n')}`;
  }

  return processed;
}
