import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../../core/auth';

@Controller('/api/paperless')
export class PaperlessSearchController {
  @Public()
  @Get('/search')
  async search(@Query('query') query: string) {
    if (!query) return { results: [] };

    // 1. Try MCP Server endpoint on local server network
    const mcpEndpoints = [
      'http://paperless-ngx-paperless-mcp-1:3001/',
      'http://localhost:3001/',
      'http://localhost:3001/',
    ];

    for (const endpoint of mcpEndpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/call',
            params: {
              name: 'search_documents',
              arguments: { query },
            },
          }),
        });

        if (response.ok) {
          const json = await response.json();
          if (json.result && Array.isArray(json.result.content)) {
            const parsed = json.result.content.map((c: any, idx: number) => ({
              id: idx + 1,
              title: `Document Match ${idx + 1}`,
              content: c.text || JSON.stringify(c),
            }));
            return { results: parsed };
          }
        }
      } catch {
        // Fallback
      }
    }

    // 2. Direct Fallback to Paperless REST API
    try {
      const resp = await fetch(
        `https://paperless.yourdomain.com/api/documents/?query=${encodeURIComponent(query)}`,
        {
          headers: {
            Authorization:
              'Basic ' + Buffer.from('admin:psksxsfFJHsjswsw').toString('base64'),
          },
        }
      );

      if (resp.ok) {
        const data = await resp.json();
        const docs = (data.results || []).map((doc: any) => ({
          id: doc.id,
          title: doc.title || `Document #${doc.id}`,
          created: doc.created ? doc.created.slice(0, 10) : undefined,
          content: doc.content ? doc.content.slice(0, 400) : '',
        }));
        return { results: docs };
      }
    } catch {
      // Ignore
    }

    return { results: [] };
  }
}
