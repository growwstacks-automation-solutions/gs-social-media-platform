// Vercel Serverless Function — proxies multipart uploads from the browser to ImageKit
// with the private key attached server-side. Path: /api/imagekit-upload
//
// Mirrors what vite.config.js does for local dev. The frontend POSTs multipart/form-data
// here; this function streams the body forward to https://upload.imagekit.io/api/v1/files/upload
// with HTTP Basic Auth (private key + empty password) and returns ImageKit's response.
//
// Requires env var IMAGEKIT_PRIVATE_KEY set in the Vercel project (Settings → Environment Variables).

export const config = {
  api: {
    bodyParser: false  // keep the raw multipart body intact so the boundary survives the proxy hop
  }
};

const IMAGEKIT_UPLOAD = 'https://upload.imagekit.io/api/v1/files/upload';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    // Same-origin → CORS preflight not normally needed, but answer it cleanly just in case.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!privateKey) {
    return res.status(500).json({ error: 'IMAGEKIT_PRIVATE_KEY not configured on the server' });
  }

  // Collect the raw request body (browser sends multipart/form-data with a boundary)
  const chunks = [];
  try {
    for await (const chunk of req) chunks.push(chunk);
  } catch (e) {
    return res.status(400).json({ error: `Failed to read request body: ${e.message}` });
  }
  const body = Buffer.concat(chunks);

  const auth = 'Basic ' + Buffer.from(privateKey + ':').toString('base64');

  try {
    const upstream = await fetch(IMAGEKIT_UPLOAD, {
      method: 'POST',
      headers: {
        Authorization: auth,
        // Pass through the original Content-Type so the multipart boundary stays valid
        'Content-Type': req.headers['content-type'] || 'multipart/form-data'
      },
      body
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (e) {
    return res.status(502).json({ error: `Upstream ImageKit error: ${e.message}` });
  }
}
