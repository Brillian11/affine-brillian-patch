process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const http = require('node:http');
const PORT = process.env.PORT || 3002;

const fs = require('node:fs');
const path = require('node:path');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    console.log(`[Todoist Server] ${req.method} ${req.url}`);

    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            success: true,
            message: 'Todoist Sync Server is running',
            timestamp: new Date().toISOString()
        }));
    }

    // Serve uploaded files statically
    if (req.method === 'GET' && req.url.startsWith('/uploads/')) {
        const fileName = path.basename(req.url);
        const filePath = path.join(UPLOADS_DIR, fileName);
        if (fs.existsSync(filePath)) {
            const ext = path.extname(fileName).toLowerCase();
            const mimeMap = {
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.svg': 'image/svg+xml',
                '.mp3': 'audio/mpeg',
                '.wav': 'audio/wav',
                '.ogg': 'audio/ogg',
                '.mp4': 'video/mp4',
                '.pdf': 'application/pdf',
                '.txt': 'text/plain',
            };
            res.writeHead(200, {
                'Content-Type': mimeMap[ext] || 'application/octet-stream',
                'Cache-Control': 'public, max-age=86400',
            });
            return fs.createReadStream(filePath).pipe(res);
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'File not found' }));
    }

    // Direct file upload endpoint (uploads directly to Todoist official cloud or local storage fallback)
    if (req.method === 'POST' && req.url === '/api/todoist/upload') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const { file_name, file_data, file_type } = JSON.parse(body);
                if (!file_data) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Missing file_data' }));
                }

                // Strip data URL prefix if present
                const base64Data = file_data.replace(/^data:.*?;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');
                const safeName = `${Date.now()}-${(file_name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                const savePath = path.join(UPLOADS_DIR, safeName);
                fs.writeFileSync(savePath, buffer);
                const localFileUrl = `http://localhost:${PORT}/uploads/${safeName}`;

                const token = req.headers.authorization?.replace('Bearer ', '');
                if (token) {
                    try {
                        console.log(`[Todoist Server] Uploading ${safeName} (${buffer.length} bytes) to Todoist /api/v1/uploads...`);
                        const mimeType = file_type || 'application/octet-stream';
                        const blob = new Blob([buffer], { type: mimeType });
                        const formData = new FormData();
                        formData.append('file', blob, file_name || safeName);

                        const uploadResp = await fetch('https://api.todoist.com/api/v1/uploads', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`
                            },
                            body: formData
                        });

                        if (uploadResp.ok) {
                            const uploadResult = await uploadResp.json();
                            console.log(`[Todoist Server] Successfully uploaded to Todoist! File URL: ${uploadResult.file_url}`);
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            return res.end(JSON.stringify({
                                success: true,
                                file_url: uploadResult.file_url || localFileUrl,
                                file_name: uploadResult.file_name || file_name || safeName,
                                file_type: uploadResult.file_type || mimeType,
                                file_size: uploadResult.file_size || buffer.length,
                                upload_state: uploadResult.upload_state || 'completed',
                                image: uploadResult.image || null,
                                image_width: uploadResult.image_width || null,
                                image_height: uploadResult.image_height || null,
                                resource_type: uploadResult.resource_type || 'file'
                            }));
                        } else {
                            const errBody = await uploadResp.text();
                            console.warn(`[Todoist Server] Todoist upload failed (status ${uploadResp.status}): ${errBody}. Falling back to local file URL.`);
                        }
                    } catch (uploadErr) {
                        console.warn(`[Todoist Server] Error contacting Todoist upload endpoint: ${uploadErr.message}. Falling back to local.`);
                    }
                }

                console.log(`[Todoist Server] Saved upload locally: ${savePath} (${buffer.length} bytes) -> ${localFileUrl}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({
                    success: true,
                    file_url: localFileUrl,
                    file_name: file_name || safeName,
                    file_type: file_type || 'application/octet-stream',
                    file_size: buffer.length,
                }));
            } catch (err) {
                console.error('[Upload Error]:', err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    if (!req.url.startsWith('/api/todoist')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Not found' }));
    }

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Missing Todoist token' }));
    }
    console.log(`[Todoist Server Token]: ${token.slice(0, 6)}...${token.slice(-4)} (len: ${token.length})`);

    // Rewrite path to modern Todoist /api/v1/ endpoints
    let subPath = req.url.replace('/api/todoist', '');
    subPath = subPath.replace(/^\/rest\/v2/, '');
    if (!subPath.startsWith('/api/v1')) {
        subPath = `/api/v1${subPath.startsWith('/') ? subPath : `/${subPath}`}`;
    }

    const targetUrl = `https://api.todoist.com${subPath}`;

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
        try {
            const fetchOptions = {
                method: req.method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: ['POST', 'PUT', 'PATCH'].includes(req.method) && body ? body : undefined
            };

            // If GET /tasks without client-specified cursor, auto-paginate through all pages
            if (req.method === 'GET' && subPath.includes('/tasks') && !subPath.includes('completed') && !subPath.includes('cursor=')) {
                let allResults = [];
                let cursor = null;
                let page = 1;
                const baseSeparator = targetUrl.includes('?') ? '&' : '?';

                do {
                    const pageUrl = cursor ? `${targetUrl}${baseSeparator}cursor=${encodeURIComponent(cursor)}` : targetUrl;
                    const pageResp = await fetch(pageUrl, fetchOptions);
                    if (!pageResp.ok) {
                        const errText = await pageResp.text();
                        console.error(`[Todoist Server] Page ${page} error: ${pageResp.status}`, errText);
                        res.writeHead(pageResp.status, { 'Content-Type': 'application/json' });
                        return res.end(errText);
                    }
                    const pageData = await pageResp.json();
                    const items = Array.isArray(pageData) ? pageData : (pageData.results || pageData.items || []);
                    allResults.push(...items);
                    cursor = pageData.next_cursor || null;
                    console.log(`[Todoist Server] Auto-paginated page ${page}: got ${items.length} items (total so far: ${allResults.length}), next_cursor: ${cursor ? 'yes' : 'none'}`);
                    page++;
                } while (cursor && page <= 20); // safety max 20 pages (1000 tasks)

                console.log(`[Todoist Server] Returning all ${allResults.length} tasks combined`);
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                });
                return res.end(JSON.stringify({ results: allResults, next_cursor: null }));
            }

            const response = await fetch(targetUrl, fetchOptions);
            const data = await response.text();
            console.log(`[Todoist Server] Response: ${response.status} for ${req.method} ${subPath} (${data.length} bytes)`);
            if (response.status >= 400) {
                console.log(`[Todoist Server] Error body: ${data.slice(0, 300)}`);
            }
            res.writeHead(response.status, {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            res.end(data);
        } catch (err) {
            console.error('[Todoist Proxy Error]:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
    });
});

server.listen(PORT, () => {
    console.log(`\n🚀 Todoist Sync Server running on http://localhost:${PORT}`);
    console.log(`   Proxies /api/todoist/* to https://api.todoist.com/api/v1/*`);
});
