const Minio = require('minio');

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin123'
});

const BUCKET_NAME = process.env.MINIO_BUCKET || 'streamflow-videos';

async function initMinIO() {
  try {
    const bucketExists = await minioClient.bucketExists(BUCKET_NAME);
    
    if (!bucketExists) {
      await minioClient.makeBucket(BUCKET_NAME, 'us-east-1');
      console.log(`MinIO bucket '${BUCKET_NAME}' created successfully`);
      
      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${BUCKET_NAME}/*`]
          }
        ]
      };
      
      await minioClient.setBucketPolicy(BUCKET_NAME, JSON.stringify(policy));
      console.log(`MinIO bucket policy set for public read access`);
    } else {
      console.log(`MinIO bucket '${BUCKET_NAME}' already exists`);
    }
  } catch (error) {
    console.error('Error initializing MinIO:', error);
    throw error;
  }
}

async function uploadFile(filePath, objectName, contentType) {
  try {
    const metaData = {
      'Content-Type': contentType || 'application/octet-stream'
    };
    
    await minioClient.fPutObject(BUCKET_NAME, objectName, filePath, metaData);
    console.log(`File uploaded successfully: ${objectName}`);
    
    return {
      success: true,
      objectName,
      url: `/${BUCKET_NAME}/${objectName}`
    };
  } catch (error) {
    console.error('Error uploading file to MinIO:', error);
    throw error;
  }
}

async function uploadBuffer(buffer, objectName, contentType, size) {
  try {
    const metaData = {
      'Content-Type': contentType || 'application/octet-stream'
    };
    
    await minioClient.putObject(BUCKET_NAME, objectName, buffer, size, metaData);
    console.log(`Buffer uploaded successfully: ${objectName}`);
    
    return {
      success: true,
      objectName,
      url: `/${BUCKET_NAME}/${objectName}`
    };
  } catch (error) {
    console.error('Error uploading buffer to MinIO:', error);
    throw error;
  }
}

async function downloadFile(objectName, filePath) {
  try {
    await minioClient.fGetObject(BUCKET_NAME, objectName, filePath);
    console.log(`File downloaded successfully: ${objectName}`);
    return { success: true, filePath };
  } catch (error) {
    console.error('Error downloading file from MinIO:', error);
    throw error;
  }
}

async function getFileStream(objectName) {
  try {
    const stream = await minioClient.getObject(BUCKET_NAME, objectName);
    return stream;
  } catch (error) {
    console.error('Error getting file stream from MinIO:', error);
    throw error;
  }
}

async function deleteFile(objectName) {
  try {
    await minioClient.removeObject(BUCKET_NAME, objectName);
    console.log(`File deleted successfully: ${objectName}`);
    return { success: true };
  } catch (error) {
    console.error('Error deleting file from MinIO:', error);
    throw error;
  }
}

async function getFileInfo(objectName) {
  try {
    const stat = await minioClient.statObject(BUCKET_NAME, objectName);
    return stat;
  } catch (error) {
    console.error('Error getting file info from MinIO:', error);
    throw error;
  }
}

function getPublicUrl(objectName) {
  const endpoint = process.env.MINIO_ENDPOINT || 'localhost';
  const port = process.env.MINIO_PORT || 9000;
  const useSSL = process.env.MINIO_USE_SSL === 'true';
  const protocol = useSSL ? 'https' : 'http';
  
  return `${protocol}://${endpoint}:${port}/${BUCKET_NAME}/${objectName}`;
}

async function getPresignedUrl(objectName, expirySeconds = 3600) {
  try {
    const url = await minioClient.presignedGetObject(BUCKET_NAME, objectName, expirySeconds);
    return url;
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    throw error;
  }
}

module.exports = {
  minioClient,
  BUCKET_NAME,
  initMinIO,
  uploadFile,
  uploadBuffer,
  downloadFile,
  getFileStream,
  deleteFile,
  getFileInfo,
  getPublicUrl,
  getPresignedUrl
};
