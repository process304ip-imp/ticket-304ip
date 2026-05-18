// test-r2.mjs — ทดสอบ R2 connection (รัน: node test-r2.mjs)
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config(); // โหลด .env

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
  R2_PUBLIC_DOMAIN,
} = process.env;

// ตรวจว่ามีค่าครบ
const missing = ['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET_NAME','R2_PUBLIC_DOMAIN']
  .filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error('❌ Missing env vars:', missing.join(', '));
  process.exit(1);
}

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,  // ← จำเป็นสำหรับ R2 (ไม่ใช่ AWS S3)
});

const TEST_KEY = `test/connection-test-${Date.now()}.txt`;
const TEST_CONTENT = `R2 test from CRM 304IP — ${new Date().toISOString()}`;

async function run() {
  console.log('\n🔧 CRM 304IP — R2 Connection Test');
  console.log('══════════════════════════════════');
  console.log(`Bucket  : ${R2_BUCKET_NAME}`);
  console.log(`Endpoint: https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
  console.log(`Domain  : ${R2_PUBLIC_DOMAIN}`);
  console.log('');

  // 1. List (ping)
  try {
    process.stdout.write('① List bucket (ping)... ');
    await r2.send(new ListObjectsV2Command({ Bucket: R2_BUCKET_NAME, MaxKeys: 1 }));
    console.log('✅ OK');
  } catch (e) {
    console.log('❌ FAILED');
    console.error('   Error:', e.message);
    process.exit(1);
  }

  // 2. Upload test file
  try {
    process.stdout.write('② Upload test file...  ');
    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: TEST_KEY,
      Body: TEST_CONTENT,
      ContentType: 'text/plain',
    }));
    console.log('✅ OK');
    console.log(`   Public URL: ${R2_PUBLIC_DOMAIN}/${TEST_KEY}`);
  } catch (e) {
    console.log('❌ FAILED');
    console.error('   Error:', e.message);
    process.exit(1);
  }

  // 3. Delete test file (cleanup)
  try {
    process.stdout.write('③ Delete test file...  ');
    await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: TEST_KEY }));
    console.log('✅ OK');
  } catch (e) {
    console.log('⚠️  Delete failed (not critical):', e.message);
  }

  console.log('\n✅ R2 พร้อมใช้งาน! เริ่ม implement ได้เลย 🚀\n');
}

run().catch(e => {
  console.error('\n❌ Unexpected error:', e.message);
  process.exit(1);
});
