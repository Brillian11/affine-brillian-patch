import { Entity, LiveData, effect } from '@toeverything/infra';
import { truncate } from 'lodash-es';
import { switchMap, from, of, throttleTime, tap } from 'rxjs';
import { FileIcon } from '@blocksuite/icons/rc';

import type { QuickSearchSession } from '../providers/quick-search-provider';
import type { QuickSearchGroup } from '../types/group';
import type { QuickSearchItem } from '../types/item';

export interface PaperlessDocPayload {
  id: number | string;
  title: string;
  content?: string;
  distance?: number;
  score?: number;
  url: string;
}

const MCP_PRIMARY_ENDPOINT = '/api/paperless-mcp/mcp';
const MCP_DIRECT_ENDPOINT = 'http://localhost:3001/mcp';
const PAPERLESS_REST_PRIMARY = '/api/paperless-rest';
const PAPERLESS_BASE_URL = 'https://paperless.yourdomain.com';
const PAPERLESS_TOKEN = 'YOUR_PAPERLESS_API_TOKEN';

let mcpSessionId: string | null = null;

async function postMcp(payload: any): Promise<any> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${PAPERLESS_TOKEN}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream, */*',
  };
  if (mcpSessionId) {
    headers['Mcp-Session-Id'] = mcpSessionId;
  }

  let res: Response;
  try {
    res = await fetch(MCP_PRIMARY_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch {
    res = await fetch(MCP_DIRECT_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  }

  const sess = res.headers.get('Mcp-Session-Id');
  if (sess) {
    mcpSessionId = sess;
  }

  const text = await res.text();
  if (!text.trim()) return null;

  // Handle SSE formatted output (data: ...)
  if (text.includes('data:')) {
    const lines = text.split('\n');
    const dataLines = lines
      .filter(l => l.trim().startsWith('data:'))
      .map(l => l.trim().slice(5).trim());
    if (dataLines.length > 0) {
      try {
        return JSON.parse(dataLines.join(''));
      } catch {}
    }
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function ensureMcp(): Promise<void> {
  if (mcpSessionId) return;
  try {
    const initRes = await postMcp({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'affine-cmdk', version: '1.0.0' },
      },
    });
    if (initRes?.result) {
      await postMcp({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {},
      }).catch(() => {});
    }
  } catch (err) {
    console.warn('[PaperlessQuickSearch] MCP init error:', err);
  }
}

export class PaperlessQuickSearchSession
  extends Entity
  implements QuickSearchSession<'paperless', PaperlessDocPayload>
{
  isLoading$ = new LiveData(false);
  items$ = new LiveData<QuickSearchItem<'paperless', PaperlessDocPayload>[]>([]);
  lastQuery = '';

  query = effect(
    tap(q => {
      this.lastQuery = q;
    }),
    throttleTime<string>(200, undefined, { leading: true, trailing: true }),
    switchMap((q: string) => {
      const trimmed = q.trim();
      if (!trimmed || trimmed.length < 2) {
        this.items$.next([]);
        return of([]);
      }

      this.isLoading$.next(true);

      return from(
        (async () => {
          const group: QuickSearchGroup = {
            id: 'paperless-documents',
            label: 'Paperless Documents',
            score: 12,
          };

          const itemMap = new Map<string | number, QuickSearchItem<'paperless', PaperlessDocPayload>>();

          // 1. FAST PATH: Immediate REST keyword search
          const fetchRestPromise = (async () => {
            try {
              let resp: Response;
              try {
                resp = await fetch(
                  `${PAPERLESS_BASE_URL}/api/documents/?query=${encodeURIComponent(trimmed)}`,
                  {
                    headers: {
                      Authorization: `Token ${PAPERLESS_TOKEN}`,
                    },
                  }
                );
              } catch {
                resp = await fetch(
                  `${PAPERLESS_REST_PRIMARY}/api/documents/?query=${encodeURIComponent(trimmed)}`,
                  {
                    headers: {
                      Authorization: `Token ${PAPERLESS_TOKEN}`,
                    },
                  }
                );
              }

              if (resp.ok) {
                const json = await resp.json();
                const results = json.results || [];
                for (const doc of results.slice(0, 8)) {
                  const docTitle = doc.title || `Document #${doc.id}`;
                  itemMap.set(doc.id, {
                    id: `paperless:${doc.id}`,
                    source: 'paperless' as const,
                    group,
                    icon: FileIcon,
                    label: {
                      title: `📄 ${docTitle}`,
                      subTitle: doc.content
                        ? truncate(doc.content.replace(/\s+/g, ' '), { length: 85 })
                        : 'Paperless Archive • Click to preview PDF',
                    },
                    score: 90,
                    payload: {
                      id: doc.id,
                      title: docTitle,
                      score: 90,
                      url: `${PAPERLESS_BASE_URL}/documents/${doc.id}`,
                    },
                  });
                }
                const currentItems = Array.from(itemMap.values());
                this.items$.next(currentItems);
              }
            } catch (err) {
              console.warn('[PaperlessQuickSearch] REST search failed:', err);
            }
          })();

          // 2. PARALLEL PATH: MCP Semantic vector search
          const fetchSemanticPromise = (async () => {
            try {
              await ensureMcp();
              const res = await postMcp({
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'tools/call',
                params: {
                  name: 'semantic_search',
                  arguments: { query: trimmed },
                },
              });

              const text = res?.result?.content?.[0]?.text;
              if (text) {
                const parsed = JSON.parse(text);
                if (Array.isArray(parsed.results) && parsed.results.length > 0) {
                  for (const r of parsed.results) {
                    const dist = typeof r.distance === 'number' ? Math.round(r.distance * 100) / 100 : undefined;
                    const score = dist !== undefined ? Math.max(0, Math.round((1 - dist / 2) * 100)) : 85;
                    const docTitle = r.title || `Document #${r.id}`;

                    const existing = itemMap.get(r.id);
                    itemMap.set(r.id, {
                      id: `paperless:${r.id}`,
                      source: 'paperless' as const,
                      group,
                      icon: FileIcon,
                      label: {
                        title: `📄 ${docTitle}`,
                        subTitle: `Relevance: ${score}% • Click to preview PDF`,
                      },
                      score: Math.max(score, existing?.score || 85),
                      payload: {
                        id: r.id,
                        title: docTitle,
                        distance: dist,
                        score,
                        url: `${PAPERLESS_BASE_URL}/documents/${r.id}`,
                      },
                    });
                  }
                  const currentItems = Array.from(itemMap.values());
                  this.items$.next(currentItems);
                }
              }
            } catch (err) {
              // Ignore semantic fallback errors
            }
          })();

          // Wait for REST first (fast), then let semantic search complete in background or parallel
          await Promise.allSettled([fetchRestPromise, fetchSemanticPromise]);
          return Array.from(itemMap.values());
        })().finally(() => {
          this.isLoading$.next(false);
        })
      );
    })
  );
}
