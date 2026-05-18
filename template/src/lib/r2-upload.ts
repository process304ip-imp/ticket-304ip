// Client-side wrapper for R2 uploads — no AWS SDK here (server-side only)

/**
 * Upload a file to Cloudflare R2 via Netlify Function
 * @param file - File to upload
 * @param ticketId - Ticket ID used as folder prefix (e.g. "T260515-0001")
 * @returns Public URL of the uploaded file
 */
export async function uploadToR2(file: File, ticketId: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('ticketId', ticketId);

  const res = await fetch('/.netlify/functions/upload-r2', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || `R2 upload failed (HTTP ${res.status})`);
  }

  const { url } = await res.json() as { url: string };
  return url;
}

/**
 * Delete a file from Cloudflare R2 via Netlify Function
 * @param url - Full public URL of the file to delete
 */
export async function deleteFromR2(url: string): Promise<void> {
  const res = await fetch('/.netlify/functions/delete-r2', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || `R2 delete failed (HTTP ${res.status})`);
  }
}

/**
 * Detect which storage provider a URL belongs to
 */
export function detectStorageProvider(url: string): 'supabase' | 'r2' | 'unknown' {
  if (!url) return 'unknown';
  if (url.includes('supabase.co')) return 'supabase';
  if (url.includes('r2.dev') || url.includes('r2.cloudflarestorage.com')) return 'r2';
  return 'unknown';
}
