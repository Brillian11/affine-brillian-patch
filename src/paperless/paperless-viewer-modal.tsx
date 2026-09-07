import { Button, Loading, Modal } from '@affine/component';
import React, { useEffect, useRef, useState } from 'react';

export interface PaperlessViewerModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  docId?: number | string;
  title?: string;
}

const noop = () => {};

const PAPERLESS_TOKEN = 'YOUR_PAPERLESS_API_TOKEN';
const PAPERLESS_REST_PRIMARY = '/api/paperless-rest';
const PAPERLESS_BASE_URL = 'https://paperless.yourdomain.com';

// Global helper to open the Paperless PDF Viewer from anywhere (including markdown links, AI chat, etc.)
export function openPaperlessViewer(docId: number | string, title?: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('affine:open-paperless-viewer', {
        detail: { docId, title: title || `Document #${docId}` },
      })
    );
  }
}

// Global click listener to intercept paperless:// and /paperless-doc/:id links clicked anywhere in the DOM (including Shadow DOM and editor blocks)
if (typeof window !== 'undefined') {
  window.addEventListener(
    'click',
    (e: MouseEvent) => {
      const path = e.composedPath ? e.composedPath() : [e.target];
      let anchor: HTMLAnchorElement | null = null;
      for (const el of path) {
        if (el instanceof HTMLAnchorElement || (el as HTMLElement)?.tagName === 'A') {
          anchor = el as HTMLAnchorElement;
          break;
        }
      }

      if (anchor) {
        const href = anchor.getAttribute('href') || anchor.href || '';
        if (href.startsWith('paperless://')) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation?.();
          const docId = href.replace('paperless://', '').split('?')[0];
          const title = anchor.innerText || `Document #${docId}`;
          openPaperlessViewer(docId, title);
        } else if (href.includes('/paperless-doc/')) {
          const match = href.match(/\/paperless-doc\/(\d+)/);
          if (match && match[1]) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation?.();
            const docId = match[1];
            const title = anchor.innerText || `Document #${docId}`;
            openPaperlessViewer(docId, title);
          }
        } else if (href.includes('paperless.yourdomain.com/documents/')) {
          const match = href.match(/\/documents\/(\d+)/);
          if (match && match[1]) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation?.();
            const docId = match[1];
            const title = anchor.innerText || `Document #${docId}`;
            openPaperlessViewer(docId, title);
          }
        }
      }
    },
    true
  );
}

// Global host component that can be mounted at root level
export const GlobalPaperlessViewer = () => {
  const [activeDoc, setActiveDoc] = useState<{ docId: number | string; title: string } | null>(null);

  useEffect(() => {
    const handleOpen = (e: Event) => {
      const customEvent = e as CustomEvent<{ docId: number | string; title: string }>;
      if (customEvent.detail) {
        setActiveDoc(customEvent.detail);
      }
    };

    window.addEventListener('affine:open-paperless-viewer', handleOpen);
    return () => {
      window.removeEventListener('affine:open-paperless-viewer', handleOpen);
    };
  }, []);

  return (
    <PaperlessViewerModal
      open={Boolean(activeDoc)}
      onOpenChange={open => {
        if (!open) setActiveDoc(null);
      }}
      docId={activeDoc?.docId || ''}
      title={activeDoc?.title || ''}
    />
  );
};

export const PaperlessViewerModal = ({
  open = false,
  onOpenChange = noop,
  docId = '',
  title = '',
}: PaperlessViewerModalProps) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const activeUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !docId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);
    setPdfUrl(null);

    const downloadPdf = async () => {
      try {
        const downloadEndpoint = `${PAPERLESS_REST_PRIMARY}/api/documents/${docId}/download/`;
        let res: Response;
        try {
          res = await fetch(downloadEndpoint, {
            headers: { Authorization: `Token ${PAPERLESS_TOKEN}` },
          });
        } catch {
          res = await fetch(`${PAPERLESS_BASE_URL}/api/documents/${docId}/download/`, {
            headers: { Authorization: `Token ${PAPERLESS_TOKEN}` },
          });
        }

        if (!res.ok) {
          throw new Error(`Failed to fetch document PDF (status ${res.status})`);
        }

        const blob = await res.blob();
        if (isMounted) {
          const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
          activeUrlRef.current = url;
          setPdfUrl(url);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Could not load PDF');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    downloadPdf().catch(console.error);

    return () => {
      isMounted = false;
      if (activeUrlRef.current) {
        URL.revokeObjectURL(activeUrlRef.current);
        activeUrlRef.current = null;
      }
    };
  }, [open, docId]);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`📄 ${title || `Document #${docId}`}`}
      width={900}
      contentOptions={{
        style: {
          height: '82vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px',
        },
      }}
    >
      <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%', borderRadius: '8px', overflow: 'hidden', background: '#f1f5f9' }}>
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px' }}>
            <Loading size={32} />
            <span style={{ fontSize: '14px', color: '#64748b' }}>Loading PDF document from Paperless...</span>
          </div>
        )}

        {error && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px' }}>
            <span style={{ fontSize: '14px', color: '#ef4444' }}>⚠️ {error}</span>
            <Button
              onClick={() => {
                window.open(`${PAPERLESS_BASE_URL}/documents/${docId}`, '_blank');
              }}
            >
              Open in Paperless Web
            </Button>
          </div>
        )}

        {pdfUrl && !loading && (
          <iframe
            src={pdfUrl}
            title={title}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
            }}
          />
        )}
      </div>
    </Modal>
  );
};
