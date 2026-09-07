import { Button, Input, notify } from '@affine/component';
import { SettingRow, SettingWrapper } from '@affine/component/setting-components';
import React, { useEffect, useState } from 'react';
import { PaperlessViewerModal } from '../../../../components/paperless-viewer-modal';

interface PaperlessDocResult {
  id: number | string;
  title: string;
  distance?: number;
  score?: number;
  created?: string;
  content?: string;
}

interface EmbeddingStatus {
  indexed_documents: number;
  provider: string;
  model: string;
  dimensions: number;
}

const MCP_PRIMARY_ENDPOINT = '/api/paperless-mcp/mcp';
const MCP_DIRECT_ENDPOINT = 'http://localhost:3001/mcp';
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

  if (text.startsWith('event:') || text.startsWith('data:')) {
    const lines = text.split('\n');
    const dataLines = lines.filter(l => l.startsWith('data:')).map(l => l.slice(5).trim());
    if (dataLines.length > 0) {
      return JSON.parse(dataLines.join(''));
    }
  }

  return JSON.parse(text);
}

async function ensureMcp(): Promise<void> {
  if (mcpSessionId) return;
  const initRes = await postMcp({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'affine-web', version: '1.0.0' },
    },
  });
  if (initRes?.result) {
    await postMcp({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    }).catch(() => {});
  }
}

export const PaperlessSearchPanel: React.FC = () => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<EmbeddingStatus | null>(null);
  const [results, setResults] = useState<PaperlessDocResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<{ id: number | string; title: string } | null>(null);

  const fetchStatus = async () => {
    try {
      await ensureMcp();
      const res = await postMcp({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: 'embedding_status', arguments: {} },
      });
      const text = res?.result?.content?.[0]?.text;
      if (text) {
        setStatus(JSON.parse(text));
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    fetchStatus().catch(() => {});
  }, []);

  const handleSyncEmbeddings = async () => {
    setSyncing(true);
    try {
      await ensureMcp();
      await postMcp({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: 'sync_embeddings', arguments: {} },
      });
      notify.success({ title: 'Embeddings Synced', message: 'Vector database updated with latest documents.' });
      await fetchStatus();
    } catch (err: any) {
      notify.error({ title: 'Sync Failed', message: err?.message || 'Could not sync vector database' });
    } finally {
      setSyncing(false);
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults([]);

    try {
      // 1. Semantic Vector Search via Ollama + MCP
      await ensureMcp();
      const mcpRes = await postMcp({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'semantic_search',
          arguments: { query: query.trim() },
        },
      });

      const text = mcpRes?.result?.content?.[0]?.text;
      if (text) {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed.results) && parsed.results.length > 0) {
          const docs: PaperlessDocResult[] = parsed.results.map((r: any) => ({
            id: r.id,
            title: r.title || `Document #${r.id}`,
            distance: typeof r.distance === 'number' ? Math.round(r.distance * 100) / 100 : undefined,
            score: typeof r.distance === 'number' ? Math.max(0, Math.round((1 - r.distance / 2) * 100)) : undefined,
          }));
          setResults(docs);
          return;
        }
      }

      // 2. Direct Fallback to Paperless REST API
      const res = await fetch(
        `${PAPERLESS_BASE_URL}/api/documents/?query=${encodeURIComponent(query)}`,
        {
          headers: {
            Authorization: `Token ${PAPERLESS_TOKEN}`,
          },
        }
      );

      if (res.ok) {
        const json = await res.json();
        const docs: PaperlessDocResult[] = (json.results || []).map((doc: any) => ({
          id: doc.id,
          title: doc.title || `Document #${doc.id}`,
          created: doc.created ? doc.created.slice(0, 10) : undefined,
          content: doc.content ? doc.content.slice(0, 300) : '',
        }));
        setResults(docs);
      } else {
        setError(`Search returned HTTP ${res.status}`);
      }
    } catch (err: any) {
      setError(err?.message || 'Error executing semantic search');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SettingWrapper
      title="Paperless-ngx Semantic Search"
      desc="Direct semantic search powered by Ollama Qwen3 embeddings and Paperless MCP."
    >
      {/* Vector Status Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 14px',
          background: 'var(--affine-background-secondary-color, #f8fafc)',
          borderRadius: '8px',
          border: '1px solid var(--affine-border-color, #e2e8f0)',
          marginBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
          <span style={{ fontSize: '13px', fontWeight: 500 }}>
            Vector Model: <strong>{status?.model || 'qwen-embed'}</strong> ({status?.dimensions || 1024}d) • Indexed Documents: <strong>{status?.indexed_documents ?? 1}</strong>
          </span>
        </div>
        <Button onClick={() => { handleSyncEmbeddings().catch(() => {}); }} loading={syncing} size="small">
          🔄 Sync & Re-index
        </Button>
      </div>

      <SettingRow
        name="Natural Language Query"
        desc="Search documents by concept, meaning, and text content."
      >
        <div style={{ display: 'flex', gap: '8px', width: '100%', maxWidth: '480px' }}>
          <Input
            value={query}
            onChange={v => setQuery(v)}
            placeholder="e.g. invoice or bank tax statement..."
            onKeyDown={e => {
              if (e.key === 'Enter') {
                handleSearch().catch(() => {});
              }
            }}
            style={{ flex: 1 }}
          />
          <Button onClick={() => { handleSearch().catch(() => {}); }} disabled={loading} type="primary">
            {loading ? 'Searching...' : '🔍 Semantic Search'}
          </Button>
        </div>
      </SettingRow>

      {error && (
        <div style={{ color: 'var(--affine-error-color, #ef4444)', fontSize: '13px', marginTop: '8px' }}>
          ⚠️ {error}
        </div>
      )}

      {results.length > 0 && (
        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--affine-text-secondary-color)' }}>
            Found {results.length} Document Match{results.length > 1 ? 'es' : ''}:
          </div>
          {results.map(doc => (
            <div
              key={doc.id}
              style={{
                border: '1px solid var(--affine-border-color, #e2e8f0)',
                borderRadius: '8px',
                padding: '12px 16px',
                background: 'var(--affine-background-secondary-color, #f8fafc)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontWeight: 600, fontSize: '14px' }}>📄 {doc.title}</span>
                {doc.score !== undefined && (
                  <span
                    style={{
                      fontSize: '12px',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: '#dcfce7',
                      color: '#15803d',
                      fontWeight: 600,
                    }}
                  >
                    Match: {doc.score}% (dist {doc.distance})
                  </span>
                )}
                {doc.created && <span style={{ fontSize: '12px', color: '#64748b' }}>{doc.created}</span>}
              </div>
              {doc.content && (
                <div style={{ fontSize: '13px', color: '#334155', lineHeight: '1.4', marginBottom: '8px', whiteSpace: 'pre-wrap' }}>
                  {doc.content}
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Button
                  onClick={() => setSelectedDoc({ id: doc.id, title: doc.title })}
                  type="primary"
                  style={{ height: '28px', fontSize: '12px' }}
                >
                  📄 Preview PDF in AFFiNE
                </Button>
                <a
                  href={`${PAPERLESS_BASE_URL}/documents/${doc.id}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontSize: '12px',
                    color: '#2563eb',
                    textDecoration: 'none',
                    fontWeight: 500,
                  }}
                >
                  🔗 Open in Paperless Web
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedDoc && (
        <PaperlessViewerModal
          open={!!selectedDoc}
          onOpenChange={open => !open && setSelectedDoc(null)}
          docId={selectedDoc.id}
          title={selectedDoc.title}
        />
      )}
    </SettingWrapper>
  );
};
