import { Button, Input, Modal, notify } from '@affine/component';
import React, { useCallback, useEffect, useState } from 'react';

export interface PaperlessDocItem {
  id: number | string;
  title: string;
  created?: string;
  content?: string;
  score?: number;
}

const PAPERLESS_TOKEN = 'YOUR_PAPERLESS_API_TOKEN';
const PAPERLESS_REST_PRIMARY = '/api/paperless-rest';
const MCP_PRIMARY_ENDPOINT = '/api/paperless-mcp/mcp';
const MCP_DIRECT_ENDPOINT = 'http://localhost:3001/mcp';

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

  if (text.startsWith('event:') || text.startsWith('data:')) {
    const lines = text.split('\n');
    const dataLines = lines.filter(l => l.startsWith('data:')).map(l => l.slice(5).trim());
    if (dataLines.length > 0) {
      return JSON.parse(dataLines.join(''));
    }
  }

  return JSON.parse(text);
}

export function insertPaperlessLinkAtCursor(doc: PaperlessDocItem, mode: 'mention' | 'attach_reference') {
  try {
    const ctx = (window as any).__paperlessEditorCtx as
      | { store?: any; anchorBlockId?: string; cursorIndex?: number; selectionLength?: number; host?: any }
      | undefined;
    
    // Fallback to todoist editor ctx if paperless editor ctx is not set
    const fallbackCtx = (window as any).__todoistEditorCtx;
    const store = ctx?.store || fallbackCtx?.store;
    const anchorBlockId = ctx?.anchorBlockId || fallbackCtx?.anchorBlockId;

    if (!store) {
      notify.error({ title: 'Editor Not Found', message: 'Could not find active editor context to insert.' });
      return;
    }

    const root = store.root;
    if (!root) return;

    const note = root.children?.find((c: any) => c.flavour === 'affine:note');
    if (!note) return;

    if (mode === 'mention') {
      // 1. Try to insert directly INLINE into the active paragraph at the cursor position
      const targetModel = anchorBlockId ? store.getModelById(anchorBlockId) : null;
      if (targetModel && targetModel.text) {
        const cursorIndex = ctx?.cursorIndex;
        const selectionLength = ctx?.selectionLength || 0;
        const textLen = targetModel.text.length;
        const insertPos = typeof cursorIndex === 'number' && cursorIndex <= textLen ? cursorIndex : textLen;

        if (selectionLength > 0 && insertPos + selectionLength <= textLen) {
          targetModel.text.delete(insertPos, selectionLength);
        }

        targetModel.text.insert(`📄 ${doc.title}`, insertPos, { link: `/paperless-doc/${doc.id}` });
        notify.success({ title: 'Paperless Mention Added', message: `Inserted "${doc.title}" inline in paragraph.` });
        return;
      }

      // 2. Fallback: create a paragraph block if cursor is outside an editable text block
      let insertIndex: number | undefined;
      if (anchorBlockId) {
        const idx = note.children?.findIndex((c: any) => c.id === anchorBlockId);
        if (idx !== undefined && idx !== -1) {
          insertIndex = idx + 1;
        }
      }

      const newBlockId = store.addBlock('affine:paragraph', {}, note, insertIndex);
      if (newBlockId) {
        const model = store.getModelById(newBlockId);
        if (model?.text) {
          model.text.insert(`📄 ${doc.title}`, 0, { link: `/paperless-doc/${doc.id}` });
        }
      }
      notify.success({ title: 'Paperless Mention Added', message: `Inserted "${doc.title}".` });
    } else {
      // Attach to References / Footnotes at the end of the note
      const newBlockId = store.addBlock('affine:paragraph', {}, note);
      if (newBlockId) {
        const model = store.getModelById(newBlockId);
        if (model?.text) {
          model.text.insert('- 📎 ');
          model.text.insert(`📄 ${doc.title}`, model.text.length, { link: `/paperless-doc/${doc.id}` });
          model.text.insert(` (Paperless-ngx Archive ID: #${doc.id})`, model.text.length);
        }
      }
      notify.success({ title: 'Reference Attached', message: `Attached "${doc.title}" to document references.` });
    }
  } catch (err: any) {
    console.error('[PaperlessPickerModal] Failed to insert link:', err);
    notify.error({ title: 'Insertion Failed', message: err?.message || 'Error inserting into document' });
  }
}

export interface PaperlessPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: 'mention' | 'attach_reference';
}

export const PaperlessPickerModal: React.FC<PaperlessPickerModalProps> = ({
  open,
  onOpenChange,
  initialMode = 'mention',
}) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<PaperlessDocItem[]>([]);
  const [mode, setMode] = useState<'mention' | 'attach_reference'>(initialMode);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const searchDocs = useCallback(async (q: string) => {
    setLoading(true);
    try {
      if (q.trim()) {
        // 1. Try MCP semantic search
        try {
          const res = await postMcp({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/call',
            params: {
              name: 'semantic_search',
              arguments: { query: q, limit: 8 },
            },
          });
          const text = res?.result?.content?.[0]?.text;
          if (text) {
            const parsed = JSON.parse(text);
            const results = parsed.results || (Array.isArray(parsed) ? parsed : []);
            if (Array.isArray(results) && results.length > 0) {
              setDocs(
                results.map((r: any) => ({
                  id: r.id,
                  title: r.title || `Document #${r.id}`,
                  created: r.created,
                  content: r.content,
                  score: typeof r.distance === 'number' ? Math.max(0, Math.round((1 - r.distance / 2) * 100)) : undefined,
                }))
              );
              setLoading(false);
              return;
            }
          }
        } catch {
          // fallback to REST
        }

        // 2. REST Search fallback
        const res = await fetch(`${PAPERLESS_REST_PRIMARY}/api/documents/?query=${encodeURIComponent(q)}&page_size=8`, {
          headers: { Authorization: `Token ${PAPERLESS_TOKEN}` },
        });
        if (res.ok) {
          const data = await res.json();
          setDocs(
            (data.results || []).map((d: any) => ({
              id: d.id,
              title: d.title || `Document #${d.id}`,
              created: d.created,
              content: d.content,
            }))
          );
        }
      } else {
        // Fetch recent documents
        const res = await fetch(`${PAPERLESS_REST_PRIMARY}/api/documents/?ordering=-created&page_size=8`, {
          headers: { Authorization: `Token ${PAPERLESS_TOKEN}` },
        });
        if (res.ok) {
          const data = await res.json();
          setDocs(
            (data.results || []).map((d: any) => ({
              id: d.id,
              title: d.title || `Document #${d.id}`,
              created: d.created,
              content: d.content,
            }))
          );
        }
      }
    } catch (err) {
      console.error('[PaperlessPickerModal] Search error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      searchDocs(query).catch(console.error);
    }
  }, [open, query, searchDocs]);

  const handleSelectDoc = (doc: PaperlessDocItem, actionType: 'mention' | 'attach_reference') => {
    insertPaperlessLinkAtCursor(doc, actionType);
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={mode === 'mention' ? '📄 Mention Paperless Document' : '📎 Attach Document Reference'}
      width={640}
      contentOptions={{
        style: {
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          maxHeight: '80vh',
        },
      }}
    >
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <Input
          placeholder="Search Paperless documents..."
          value={query}
          onChange={setQuery}
          style={{ flex: 1 }}
          autoFocus
        />
        {query && (
          <Button variant="secondary" onClick={() => setQuery('')}>
            Clear
          </Button>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          overflowY: 'auto',
          maxHeight: '420px',
          paddingRight: '4px',
        }}
      >
        {loading && (
          <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
            Searching Paperless archive...
          </div>
        )}

        {!loading && docs.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
            No documents found matching &quot;{query}&quot;.
          </div>
        )}

        {!loading &&
          docs.map(doc => (
            <div
              key={doc.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--affine-border-color, #e2e8f0)',
                background: 'var(--affine-background-primary-color, #ffffff)',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '14px' }}>📄</span>
                  <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--affine-text-primary-color, #0f172a)' }}>
                    {doc.title}
                  </span>
                  {doc.score !== undefined && (
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: '#e0f2fe',
                        color: '#0369a1',
                        fontWeight: 500,
                      }}
                    >
                      {doc.score}% match
                    </span>
                  )}
                </div>
                {doc.created && (
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    Created: {doc.created} | ID: #{doc.id}
                  </span>
                )}
                {doc.content && (
                  <span
                    style={{
                      fontSize: '11px',
                      color: '#94a3b8',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '380px',
                    }}
                  >
                    {doc.content.slice(0, 120)}...
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <Button
                  size="small"
                  variant={mode === 'mention' ? 'primary' : 'secondary'}
                  onClick={() => handleSelectDoc(doc, 'mention')}
                  title="Insert inline mention at cursor"
                >
                  📄 Mention
                </Button>
                <Button
                  size="small"
                  variant={mode === 'attach_reference' ? 'primary' : 'secondary'}
                  onClick={() => handleSelectDoc(doc, 'attach_reference')}
                  title="Attach to document references / footnotes"
                >
                  📎 Reference
                </Button>
              </div>
            </div>
          ))}
      </div>
    </Modal>
  );
};

export const GlobalPaperlessPicker: React.FC = () => {
  const [modalState, setModalState] = useState<{
    open: boolean;
    mode: 'mention' | 'attach_reference';
  }>({
    open: false,
    mode: 'mention',
  });

  useEffect(() => {
    const handleOpen = (e: Event) => {
      const customEvent = e as CustomEvent<{ mode?: 'mention' | 'attach_reference' }>;
      setModalState({
        open: true,
        mode: customEvent.detail?.mode || 'mention',
      });
    };

    window.addEventListener('affine:paperless-open-picker-modal', handleOpen);
    return () => {
      window.removeEventListener('affine:paperless-open-picker-modal', handleOpen);
    };
  }, []);

  return (
    <PaperlessPickerModal
      open={modalState.open}
      onOpenChange={open => setModalState(prev => ({ ...prev, open }))}
      initialMode={modalState.mode}
    />
  );
};

