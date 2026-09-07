import { z } from 'zod';

import { toolError } from './error';
import { defineTool } from './tool';

const PAPERLESS_TOKEN = 'YOUR_PAPERLESS_API_TOKEN';
const PAPERLESS_AUTH = { Authorization: `Token ${PAPERLESS_TOKEN}` };

export const createPaperlessSearchTool = () => {
  return defineTool({
    description:
      'Search documents, files, invoices, scanned papers, and records stored in the Paperless-ngx document management system using semantic search. Use this when the user asks about their documents, files, receipts, invoices, contracts, or any personal records.',
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          'The search query or keywords to find Paperless-ngx documents. Be descriptive for best semantic search results.'
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe('Maximum number of results to return (default: 10)'),
    }),
    execute: async ({ query, limit = 10 }) => {
      try {
        // 1. Try MCP Server for semantic search (Docker container name or direct IP)
        const mcpEndpoints = [
          'http://paperless-ngx-paperless-mcp-1:3001/mcp',
          'http://localhost:3001/mcp',
        ];

        for (const endpoint of mcpEndpoints) {
          try {
            const response = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: AbortSignal.timeout(8000),
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'tools/call',
                params: {
                  name: 'semantic_search',
                  arguments: { query, limit },
                },
              }),
            });

            if (response.ok) {
              const json = await response.json();
              if (json.result?.content) {
                // Parse MCP result
                const rawText = json.result.content
                  .map((c: { text?: string }) => c.text || JSON.stringify(c))
                  .join('\n');
                try {
                  const parsed = JSON.parse(rawText);
                  const results = parsed.results ?? parsed;
                  if (Array.isArray(results) && results.length > 0) {
                    return results
                      .slice(0, limit)
                      .map((d: { id: number; title: string; content?: string; distance?: number }) => {
                        const score =
                          d.distance !== undefined
                            ? Math.max(0, Math.round((1 - d.distance / 2) * 100))
                            : undefined;
                        const scoreStr = score !== undefined ? ` (relevance: ${score}%)` : '';
                        return `📄 [Document #${d.id}] ${d.title}${scoreStr}\n${d.content ? d.content.slice(0, 1500) : 'No text preview'}`;
                      })
                      .join('\n\n---\n\n');
                  }
                } catch {
                  // Not JSON, return raw text
                  if (rawText.trim()) return rawText;
                }
              }
            }
          } catch {
            // Try next endpoint
          }
        }

        // 2. Fallback to Paperless REST API full-text search
        const restEndpoints = [
          `http://paperless-ngx-webserver-1:8000/api/documents/?query=${encodeURIComponent(query)}&page_size=${limit}`,
          `https://paperless.yourdomain.com/api/documents/?query=${encodeURIComponent(query)}&page_size=${limit}`,
        ];

        for (const directUrl of restEndpoints) {
          try {
            const resp = await fetch(directUrl, {
              headers: PAPERLESS_AUTH,
              signal: AbortSignal.timeout(8000),
            });

            if (resp.ok) {
              const data = await resp.json();
              const results = data.results || [];
              if (results.length > 0) {
                return results
                  .slice(0, limit)
                  .map(
                    (d: { id: number; title: string; created: string; content?: string }) =>
                      `📄 [Document #${d.id}] ${d.title} (Created: ${d.created})\n${
                        d.content ? d.content.slice(0, 1500) : 'No text preview'
                      }`
                  )
                  .join('\n\n---\n\n');
              }
            }
          } catch {
            // Try next
          }
        }

        return 'No documents found matching your query in Paperless-ngx.';
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return toolError('Paperless Search Failed', msg);
      }
    },
  });
};
