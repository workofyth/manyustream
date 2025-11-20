const { Queue } = require('bullmq');
const redisClient = require('./redis');

const streamQueue = new Queue('stream-scheduler', {
  connection: redisClient,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: {
      count: 100,
      age: 24 * 3600
    },
    removeOnFail: {
      count: 500,
      age: 7 * 24 * 3600
    }
  }
});

streamQueue.on('error', (error) => {
  console.error('Stream queue error:', error);
});

async function addStreamJob(jobName, data, options = {}) {
  try {
    const job = await streamQueue.add(jobName, data, options);
    console.log(`Stream job added: ${jobName} - ${job.id}`);
    return job;
  } catch (error) {
    console.error('Error adding stream job:', error);
    throw error;
  }
}

async function addRecurringStreamJob(streamId, data, recurrenceType, recurrenceValue) {
  try {
    let repeatOptions = {};
    
    if (recurrenceType === 'daily') {
      const [hours, minutes] = recurrenceValue.split(':');
      repeatOptions = {
        pattern: `${minutes} ${hours} * * *`,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone
      };
    } else if (recurrenceType === 'weekly') {
      const { day, time } = JSON.parse(recurrenceValue);
      const [hours, minutes] = time.split(':');
      repeatOptions = {
        pattern: `${minutes} ${hours} * * ${day}`,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone
      };
    } else if (recurrenceType === 'monthly') {
      const { date, time } = JSON.parse(recurrenceValue);
      const [hours, minutes] = time.split(':');
      repeatOptions = {
        pattern: `${minutes} ${hours} ${date} * *`,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone
      };
    }
    
    const job = await streamQueue.add(
      'recurring-stream',
      { streamId, ...data },
      {
        jobId: `recurring-${streamId}`,
        repeat: repeatOptions
      }
    );
    
    console.log(`Recurring stream job added: ${streamId}`);
    return job;
  } catch (error) {
    console.error('Error adding recurring stream job:', error);
    throw error;
  }
}

async function removeRecurringStreamJob(streamId) {
  try {
    await streamQueue.removeRepeatableByKey(`recurring-stream:${streamId}:::*`);
    console.log(`Recurring stream job removed: ${streamId}`);
  } catch (error) {
    console.error('Error removing recurring stream job:', error);
    throw error;
  }
}

async function scheduleStreamStart(streamId, scheduleTime, data) {
  try {
    const delay = new Date(scheduleTime).getTime() - Date.now();
    
    if (delay <= 0) {
      console.log('Schedule time is in the past, starting immediately');
      return await addStreamJob('start-stream', { streamId, ...data });
    }
    
    const job = await streamQueue.add(
      'start-stream',
      { streamId, ...data },
      {
        jobId: `scheduled-${streamId}`,
        delay
      }
    );
    
    console.log(`Stream scheduled to start at ${scheduleTime}`);
    return job;
  } catch (error) {
    console.error('Error scheduling stream start:', error);
    throw error;
  }
}

async function cancelScheduledStream(streamId) {
  try {
    const job = await streamQueue.getJob(`scheduled-${streamId}`);
    if (job) {
      await job.remove();
      console.log(`Scheduled stream cancelled: ${streamId}`);
    }
  } catch (error) {
    console.error('Error cancelling scheduled stream:', error);
    throw error;
  }
}

async function scheduleStreamStop(streamId, duration) {
  try {
    const delay = duration * 60 * 1000;
    
    const job = await streamQueue.add(
      'stop-stream',
      { streamId },
      {
        jobId: `stop-${streamId}`,
        delay
      }
    );
    
    console.log(`Stream scheduled to stop after ${duration} minutes`);
    return job;
  } catch (error) {
    console.error('Error scheduling stream stop:', error);
    throw error;
  }
}

async function cancelScheduledStop(streamId) {
  try {
    const job = await streamQueue.getJob(`stop-${streamId}`);
    if (job) {
      await job.remove();
      console.log(`Scheduled stop cancelled: ${streamId}`);
    }
  } catch (error) {
    console.error('Error cancelling scheduled stop:', error);
  }
}

module.exports = {
  streamQueue,
  addStreamJob,
  addRecurringStreamJob,
  removeRecurringStreamJob,
  scheduleStreamStart,
  cancelScheduledStream,
  scheduleStreamStop,
  cancelScheduledStop
};
