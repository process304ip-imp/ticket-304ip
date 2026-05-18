import type { Handler } from '@netlify/functions';
import { S3Client, ListObjectsV2Command, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
  requestChecksumCalculation: 'WHEN_REQUIRED' as any,
  responseChecksumValidation: 'WHEN_REQUIRED' as any,
});

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { draftId, ticketId } = body;

    if (!draftId || !ticketId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing draftId or ticketId' }),
      };
    }

    const bucketName = process.env.R2_BUCKET_NAME!;
    const publicDomain = process.env.R2_PUBLIC_DOMAIN!;
    const draftPrefix = `drafts/${draftId.trim()}/`;
    const targetPrefix = `${ticketId.trim()}/`;

    console.log(`[R2 Finalize] Listing draft files under prefix: ${draftPrefix}`);

    // 1. List all files inside the draft folder
    const listResult = await r2.send(new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: draftPrefix,
    }));

    const objects = listResult.Contents || [];
    const finalizedUrls: string[] = [];

    if (objects.length === 0) {
      console.log(`[R2 Finalize] No draft files found for prefix: ${draftPrefix}`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ urls: [] }),
      };
    }

    console.log(`[R2 Finalize] Found ${objects.length} files to finalize`);

    // 2. Loop and copy each file, then delete the original
    for (const obj of objects) {
      if (!obj.Key) continue;

      const filename = obj.Key.substring(draftPrefix.length);
      if (!filename) continue; // Skip if it's just the folder itself

      const targetKey = `${targetPrefix}${filename}`;

      console.log(`[R2 Finalize] Copying ${obj.Key} -> ${targetKey}`);

      // Copy object
      await r2.send(new CopyObjectCommand({
        Bucket: bucketName,
        CopySource: encodeURIComponent(`${bucketName}/${obj.Key}`), // AWS S3 requires URL-encoded CopySource
        Key: targetKey,
      }));

      // Delete old draft object
      await r2.send(new DeleteObjectCommand({
        Bucket: bucketName,
        Key: obj.Key,
      }));

      const newPublicUrl = `${publicDomain}/${targetKey}`;
      finalizedUrls.push(newPublicUrl);
    }

    console.log(`[R2 Finalize] Successfully finalized ${finalizedUrls.length} files`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ urls: finalizedUrls }),
    };

  } catch (error: any) {
    console.error('[R2 Finalize] Error:', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to finalize attachments', detail: error.message }),
    };
  }
};
