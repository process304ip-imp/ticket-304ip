interface Env {
  R2_BUCKET: R2Bucket;
  R2_PUBLIC_DOMAIN: string;
}

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
    const body: any = await context.request.json().catch(() => ({}));
    const { draftId, ticketId } = body;

    if (!draftId || !ticketId) {
      return new Response(JSON.stringify({ error: 'Missing draftId or ticketId' }), {
        status: 400,
        headers,
      });
    }

    const draftPrefix = `drafts/${draftId.trim()}/`;
    const targetPrefix = `${ticketId.trim()}/`;

    console.log(`[R2 Finalize] Listing draft files under prefix: ${draftPrefix}`);

    // List all files in the draft folder
    const listResult = await context.env.R2_BUCKET.list({
      prefix: draftPrefix,
    });

    const objects = listResult.objects || [];
    const finalizedUrls: string[] = [];

    if (objects.length === 0) {
      console.log(`[R2 Finalize] No draft files found for prefix: ${draftPrefix}`);
      return new Response(JSON.stringify({ urls: [] }), {
        status: 200,
        headers,
      });
    }

    const publicDomain = context.env.R2_PUBLIC_DOMAIN;

    // Loop and copy each file, then delete the original
    for (const obj of objects) {
      const filename = obj.key.substring(draftPrefix.length);
      if (!filename) continue;

      const targetKey = `${targetPrefix}${filename}`;
      console.log(`[R2 Finalize] Copying ${obj.key} -> ${targetKey}`);

      // Get object (stream body)
      const sourceObj = await context.env.R2_BUCKET.get(obj.key);
      if (!sourceObj) continue;

      // Put to target
      await context.env.R2_BUCKET.put(targetKey, sourceObj.body, {
        httpMetadata: sourceObj.httpMetadata,
        customMetadata: sourceObj.customMetadata,
      });

      // Delete draft object
      await context.env.R2_BUCKET.delete(obj.key);

      finalizedUrls.push(`${publicDomain}/${targetKey}`);
    }

    console.log(`[R2 Finalize] Successfully finalized ${finalizedUrls.length} files`);
    return new Response(JSON.stringify({ urls: finalizedUrls }), {
      status: 200,
      headers,
    });
  } catch (error: any) {
    console.error('[R2 Finalize] Error:', error.message);
    return new Response(
      JSON.stringify({ error: 'Failed to finalize attachments', detail: error.message }),
      {
        status: 500,
        headers,
      }
    );
  }
};
