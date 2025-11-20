require('dotenv').config();
require('./services/logger.js');
const { Worker } = require('bullmq');
const redisClient = require('./config/redis');
const { initDatabase } = require('./db/postgres');
const { initMinIO } = require('./config/minio');

let streamingService;

async function init() {
  try {
    await initDatabase();
    await initMinIO();
    
    streamingService = require('./services/streamingService');
    
    console.log('Worker initialized successfully');
  } catch (error) {
    console.error('Error initializing worker:', error);
    process.exit(1);
  }
}

const streamWorker = new Worker(
  'stream-scheduler',
  async (job) => {
    console.log(`Processing job: ${job.name} - ${job.id}`);
    
    try {
      switch (job.name) {
        case 'start-stream':
          return await handleStartStream(job.data);
        
        case 'stop-stream':
          return await handleStopStream(job.data);
        
        case 'recurring-stream':
          return await handleRecurringStream(job.data);
        
        default:
          console.warn(`Unknown job type: ${job.name}`);
          return { success: false, error: 'Unknown job type' };
      }
    } catch (error) {
      console.error(`Error processing job ${job.id}:`, error);
      throw error;
    }
  },
  {
    connection: redisClient,
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 1000
    }
  }
);

async function handleStartStream(data) {
  const { streamId } = data;
  
  try {
    console.log(`Starting stream: ${streamId}`);
    const result = await streamingService.startStream(streamId);
    
    if (result.success) {
      console.log(`Stream started successfully: ${streamId}`);
      return { success: true, streamId };
    } else {
      console.error(`Failed to start stream ${streamId}: ${result.error}`);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error(`Error starting stream ${streamId}:`, error);
    throw error;
  }
}

async function handleStopStream(data) {
  const { streamId } = data;
  
  try {
    console.log(`Stopping stream: ${streamId}`);
    const result = await streamingService.stopStream(streamId);
    
    if (result.success) {
      console.log(`Stream stopped successfully: ${streamId}`);
      return { success: true, streamId };
    } else {
      console.error(`Failed to stop stream ${streamId}: ${result.error}`);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error(`Error stopping stream ${streamId}:`, error);
    throw error;
  }
}

async function handleRecurringStream(data) {
  const { streamId } = data;
  
  try {
    console.log(`Starting recurring stream: ${streamId}`);
    const result = await streamingService.startStream(streamId);
    
    if (result.success) {
      console.log(`Recurring stream started successfully: ${streamId}`);
      return { success: true, streamId, recurring: true };
    } else {
      console.error(`Failed to start recurring stream ${streamId}: ${result.error}`);
      return { success: false, error: result.error, recurring: true };
    }
  } catch (error) {
    console.error(`Error starting recurring stream ${streamId}:`, error);
    throw error;
  }
}

streamWorker.on('completed', (job) => {
  console.log(`Job completed: ${job.id}`);
});

streamWorker.on('failed', (job, err) => {
  console.error(`Job failed: ${job.id}`, err);
});

streamWorker.on('error', (err) => {
  console.error('Worker error:', err);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing worker...');
  await streamWorker.close();
  await redisClient.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing worker...');
  await streamWorker.close();
  await redisClient.quit();
  process.exit(0);
});

init().then(() => {
  console.log('Stream worker is running...');
}).catch((error) => {
  console.error('Failed to start worker:', error);
  process.exit(1);
});
