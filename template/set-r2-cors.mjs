// set-r2-cors.mjs — ตั้งค่า CORS ให้ R2 bucket
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3';
import { config } from 'dotenv';

config(); // โหลด .env

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
} = process.env;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  console.error('❌ Missing R2 env vars in .env file.');
  process.exit(1);
}

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

async function setupCors() {
  console.log('🔧 Configuring CORS for Cloudflare R2 bucket:', R2_BUCKET_NAME);

  const corsConfig = {
    Bucket: R2_BUCKET_NAME,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedHeaders: ['*'],
          AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
          AllowedOrigins: ['*'], // อนุญาตให้ทุก origin เข้าถึงได้ (รวมถึง localhost:3000 และ domain จริง)
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  };

  try {
    await r2.send(new PutBucketCorsCommand(corsConfig));
    console.log('✅ CORS configuration successfully applied to R2 Bucket!');
    
    // ดึงค่ากลับมาโชว์เพื่อความมั่นใจ
    const getCors = await r2.send(new GetBucketCorsCommand({ Bucket: R2_BUCKET_NAME }));
    console.log('📄 Current CORS Rules:', JSON.stringify(getCors.CORSRules, null, 2));
  } catch (err) {
    console.error('❌ Failed to configure CORS:', err.message);
  }
}

setupCors();
