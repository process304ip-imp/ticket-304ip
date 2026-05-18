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
      'Access-Control-Allow-Methods': 'PUT, OPTIONS',
    },
  });
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const { searchParams } = new URL(context.request.url);
    const ticketId = searchParams.get('ticketId') || 'temp';
    const name = searchParams.get('name') || 'upload';
    const type = searchParams.get('type') || 'application/octet-stream';

    // Validate type
    if (!ALLOWED_TYPES[type]) {
      return new Response(JSON.stringify({ error: `Unsupported file type: ${type}` }), {
        status: 400,
        headers,
      });
    }

    // Generate safe filename
    const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : 'bin';
    const rawFolder = ticketId.trim();
    const folder = rawFolder.startsWith('draft-') ? `drafts/${rawFolder}` : rawFolder;
    
    // Create random UUID
    const uuid = crypto.randomUUID();
    const fileName = `${folder}/${uuid}-${Date.now()}.${ext}`;

    const publicDomain = context.env.R2_PUBLIC_DOMAIN;

    // Stream context.request.body directly to R2!
    if (!context.request.body) {
      return new Response(JSON.stringify({ error: 'No body provided' }), {
        status: 400,
        headers,
      });
    }

    await context.env.R2_BUCKET.put(fileName, context.request.body, {
      httpMetadata: { contentType: type },
    });

    const url = `${publicDomain}/${fileName}`;
    console.log(`[R2 Upload Direct] Uploaded: ${fileName} (${type}) -> ${url}`);

    return new Response(JSON.stringify({ url }), {
      status: 200,
      headers,
    });
  } catch (error: any) {
    console.error('[R2 Upload Direct] Error:', error.message);
    return new Response(
      JSON.stringify({ error: 'Direct upload failed', detail: error.message }),
      {
        status: 500,
        headers,
      }
    );
  }
};
