interface Env {
  R2_BUCKET: R2Bucket;
  R2_PUBLIC_DOMAIN: string;
}

const ALLOWED_TYPES: Record<string, number> = {
  'image/jpeg':      20 * 1024 * 1024,
  'image/png':       20 * 1024 * 1024,
  'image/webp':      20 * 1024 * 1024,
  'image/gif':       20 * 1024 * 1024,
  'video/mp4':      100 * 1024 * 1024,
  'video/quicktime': 100 * 1024 * 1024,
  'video/webm':     100 * 1024 * 1024,
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const formData = await context.request.formData();
    const file = formData.get('file') as File | null;
    const ticketId = (formData.get('ticketId') as string | null) || 'unknown';

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file in request' }), {
        status: 400,
        headers,
      });
    }

    const mimeType = file.type || 'application/octet-stream';
    const originalName = file.name || 'upload';

    // Validate type
    if (!ALLOWED_TYPES[mimeType]) {
      return new Response(JSON.stringify({ error: `Unsupported file type: ${mimeType}` }), {
        status: 400,
        headers,
      });
    }

    // Validate size
    const maxSize = ALLOWED_TYPES[mimeType];
    if (file.size > maxSize) {
      const maxMB = Math.round(maxSize / 1024 / 1024);
      return new Response(JSON.stringify({ error: `File too large. Max ${maxMB} MB` }), {
        status: 400,
        headers,
      });
    }

    // Generate safe filename: {ticketId}/{uuid}-{timestamp}.{ext}
    const ext = originalName.includes('.') ? originalName.split('.').pop()!.toLowerCase() : 'bin';
    const rawFolder = ticketId.trim();
    const folder = rawFolder.startsWith('draft-') ? `drafts/${rawFolder}` : rawFolder;
    const uuid = crypto.randomUUID();
    const fileName = `${folder}/${uuid}-${Date.now()}.${ext}`;

    const publicDomain = context.env.R2_PUBLIC_DOMAIN;

    // Convert file to array buffer
    const fileBuffer = await file.arrayBuffer();

    await context.env.R2_BUCKET.put(fileName, fileBuffer, {
      httpMetadata: { contentType: mimeType },
    });

    const url = `${publicDomain}/${fileName}`;
    console.log(`[R2 Upload] Uploaded ${fileName} (${mimeType}) -> ${url}`);

    return new Response(JSON.stringify({ url }), {
      status: 200,
      headers,
    });
  } catch (error: any) {
    console.error('[R2 Upload] Error:', error.message);
    return new Response(
      JSON.stringify({ error: 'Upload failed', detail: error.message }),
      {
        status: 500,
        headers,
      }
    );
  }
};
