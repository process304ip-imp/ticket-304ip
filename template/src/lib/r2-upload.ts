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
 * Upload a file directly to Cloudflare R2 using a Presigned URL with progress monitoring
 * @param file - File to upload
 * @param ticketId - Ticket ID or draft prefix (e.g. "T260515-0001" or "temp")
 * @param onProgress - Callback function for upload progress (0 to 100)
 */
export async function uploadWithProgress(
  file: File,
  ticketId: string,
  onProgress: (percent: number) => void
): Promise<string> {
  // 1. Request presigned URL from Netlify function
  const res = await fetch('/.netlify/functions/get-presigned-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contentType: file.type,
      originalName: file.name,
      ticketId,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || `Failed to get presigned URL (HTTP ${res.status})`);
  }

  const { uploadUrl, publicUrl } = await res.json() as { uploadUrl: string; publicUrl: string };

  // 2. Perform direct PUT upload to Cloudflare R2 using XMLHttpRequest
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', file.type);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        onProgress(percentComplete);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve(publicUrl);
      } else {
        reject(new Error(`Direct upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Direct upload network error'));
    };

    xhr.send(file);
  });
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

/**
 * Finalize draft attachments in Cloudflare R2 by copying them to the real ticket folder
 * @param draftId - Draft prefix (e.g. "draft-260518-abcd")
 * @param ticketId - Real ticket ID (e.g. "T260518-0001")
 * @returns Array of new public URLs for the finalized attachments
 */
export async function finalizeR2Attachments(draftId: string, ticketId: string): Promise<string[]> {
  const res = await fetch('/.netlify/functions/finalize-attachments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draftId, ticketId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || `R2 finalize failed (HTTP ${res.status})`);
  }

  const { urls } = await res.json() as { urls: string[] };
  return urls;
}
