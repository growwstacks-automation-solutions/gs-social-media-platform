const UPLOAD_URL = import.meta.env.VITE_IMAGEKIT_UPLOAD_URL || '/api/imagekit-upload';

/**
 * Upload a single file to ImageKit via the Vite dev proxy.
 * In dev, /api/imagekit-upload is rewritten by Vite to
 * https://upload.imagekit.io/api/v1/files/upload with HTTP Basic Auth
 * (private key) attached server-side — the key never reaches the browser.
 *
 * @param {File} file
 * @param {Object} opts
 * @param {string} [opts.folder]   default '/matix-social/source'
 * @param {string} [opts.fileName] default file.name
 * @param {string[]} [opts.tags]   optional
 */
export async function uploadToImageKit(file, opts = {}) {
  if (!file) throw new Error('uploadToImageKit: no file');

  const form = new FormData();
  form.append('file', file);
  form.append('fileName', opts.fileName || file.name || `upload-${Date.now()}`);
  form.append('folder', opts.folder || '/matix-social/source');
  form.append('useUniqueFileName', 'true');
  if (opts.tags && opts.tags.length) form.append('tags', opts.tags.join(','));

  const res = await fetch(UPLOAD_URL, { method: 'POST', body: form });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Upload ${res.status}: ${txt || res.statusText}`);
  }

  const data = await res.json().catch(() => ({}));
  const url = data.url || data.URL || data.cdn_url || data.fileUrl || data.image_url;
  if (!url) throw new Error('Upload response missing `url` field');
  return url;
}

/**
 * Upload many files in parallel. Returns array of URLs in the same order.
 * Items already pointing at a remote URL (not blob:) are passed through.
 *
 * @param {Array<{ url: string, file?: File, name?: string }>} items
 */
export async function uploadManyToImageKit(items, opts = {}) {
  return Promise.all(
    items.map(async (item) => {
      if (!item) return null;
      if (item.url && !item.url.startsWith('blob:')) return item.url;
      if (!item.file) throw new Error(`Item "${item.name || ''}" has no File to upload`);
      return uploadToImageKit(item.file, { ...opts, fileName: item.name || item.file.name });
    })
  );
}
