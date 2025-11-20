const Stream = require('../models/Stream');
const scheduledTerminations = new Map();
const SCHEDULE_LOOKAHEAD_SECONDS = 60;
let streamingService = null;
let initialized = false;
let scheduleIntervalId = null;
let durationIntervalId = null;
let recurringCheckIntervalId = null;

function init(streamingServiceInstance) {
  if (initialized) {
    console.log('Stream scheduler already initialized');
    return;
  }
  streamingService = streamingServiceInstance;
  initialized = true;
  console.log('Stream scheduler initialized');
  scheduleIntervalId = setInterval(checkScheduledStreams, 60 * 1000);
  durationIntervalId = setInterval(checkStreamDurations, 60 * 1000);
  recurringCheckIntervalId = setInterval(checkRecurringStreams, 60 * 1000);
  checkScheduledStreams();
  checkStreamDurations();
  checkRecurringStreams();
}
async function checkScheduledStreams() {
  try {
    if (!streamingService) {
      console.error('StreamingService not initialized in scheduler');
      return;
    }
    const now = new Date();
    const lookAheadTime = new Date(now.getTime() + SCHEDULE_LOOKAHEAD_SECONDS * 1000);
    const streams = await Stream.findScheduledInRange(now, lookAheadTime);
    if (streams.length > 0) {
      console.log(`Found ${streams.length} streams to schedule start`);
      for (const stream of streams) {
        console.log(`Starting scheduled stream: ${stream.id} - ${stream.title}`);
        const result = await streamingService.startStream(stream.id);
        if (result.success) {
          console.log(`Successfully started scheduled stream: ${stream.id}`);
        } else {
          console.error(`Failed to start scheduled stream ${stream.id}: ${result.error}`);
        }
      }
    }
  } catch (error) {
    console.error('Error checking scheduled streams:', error);
  }
}
async function checkStreamDurations() {
  try {
    if (!streamingService) {
      console.error('StreamingService not initialized in scheduler');
      return;
    }
    const liveStreams = await Stream.findAll(null, 'live');
    for (const stream of liveStreams) {
      if (stream.duration && stream.start_time && !scheduledTerminations.has(stream.id)) {
        const startTime = new Date(stream.start_time);
        const durationMs = stream.duration * 60 * 1000;
        const shouldEndAt = new Date(startTime.getTime() + durationMs);
        const now = new Date();
        if (shouldEndAt <= now) {
          console.log(`Stream ${stream.id} exceeded duration, stopping now`);
          await streamingService.stopStream(stream.id);
        } else {
          const timeUntilEnd = shouldEndAt.getTime() - now.getTime();
          scheduleStreamTermination(stream.id, timeUntilEnd / 60000);
        }
      }
    }
  } catch (error) {
    console.error('Error checking stream durations:', error);
  }
}
function scheduleStreamTermination(streamId, durationMinutes) {
  if (!streamingService) {
    console.error('StreamingService not initialized in scheduler');
    return;
  }
  if (typeof durationMinutes !== 'number' || Number.isNaN(durationMinutes)) {
    console.error(`Invalid duration provided for stream ${streamId}: ${durationMinutes}`);
    return;
  }
  if (scheduledTerminations.has(streamId)) {
    clearTimeout(scheduledTerminations.get(streamId));
  }
  const clampedMinutes = Math.max(0, durationMinutes);
  const durationMs = clampedMinutes * 60 * 1000;
  console.log(`Scheduling termination for stream ${streamId} after ${clampedMinutes} minutes`);
  const timeoutId = setTimeout(async () => {
    try {
      console.log(`Terminating stream ${streamId} after ${clampedMinutes} minute duration`);
      await streamingService.stopStream(streamId);
      scheduledTerminations.delete(streamId);
    } catch (error) {
      console.error(`Error terminating stream ${streamId}:`, error);
    }
  }, durationMs);
  scheduledTerminations.set(streamId, timeoutId);
}
function cancelStreamTermination(streamId) {
  if (scheduledTerminations.has(streamId)) {
    clearTimeout(scheduledTerminations.get(streamId));
    scheduledTerminations.delete(streamId);
    console.log(`Cancelled scheduled termination for stream ${streamId}`);
    return true;
  }
  return false;
}
function handleStreamStopped(streamId) {
  return cancelStreamTermination(streamId);
}

async function checkRecurringStreams() {
  try {
    if (!streamingService) {
      console.error('StreamingService not initialized in scheduler');
      return;
    }
    const recurringStreams = await Stream.findRecurringStreams();
    const now = new Date();
    
    for (const stream of recurringStreams) {
      if (!stream.schedule_time || !stream.recurrence_type) {
        continue;
      }
      
      const baseTime = new Date(stream.schedule_time);
      const nextRunTime = calculateNextRecurrence(baseTime, stream.recurrence_type, stream.recurrence_value);
      
      if (nextRunTime <= now && nextRunTime.getTime() > now.getTime() - 60000) {
        // Within the last minute and time to run
        console.log(`[Scheduler] Running recurring stream ${stream.id} (${stream.recurrence_type})`);
        const result = await streamingService.startStream(stream.id);
        if (result.success) {
          console.log(`[Scheduler] Started recurring stream ${stream.id}`);
        } else {
          console.error(`[Scheduler] Failed to start recurring stream ${stream.id}: ${result.error}`);
        }
      }
    }
  } catch (error) {
    console.error('[Scheduler] Error checking recurring streams:', error);
  }
}

function calculateNextRecurrence(baseTime, type, value) {
  const next = new Date(baseTime);
  const now = new Date();
  
  if (type === 'daily') {
    next.setDate(next.getDate() + 1);
    while (next <= now) {
      next.setDate(next.getDate() + 1);
    }
  } else if (type === 'weekly') {
    const targetDayOfWeek = parseInt(value) || 0;
    const currentDayOfWeek = next.getDay();
    const daysUntilTarget = (targetDayOfWeek - currentDayOfWeek + 7) % 7 || 7;
    next.setDate(next.getDate() + daysUntilTarget);
    while (next <= now) {
      next.setDate(next.getDate() + 7);
    }
  } else if (type === 'monthly') {
    const targetDay = parseInt(value) || 1;
    next.setDate(targetDay);
    if (next <= now) {
      next.setMonth(next.getMonth() + 1);
      next.setDate(targetDay);
    }
    while (next <= now) {
      next.setMonth(next.getMonth() + 1);
    }
  }
  
  return next;
}

module.exports = {
  init,
  scheduleStreamTermination,
  cancelStreamTermination,
  handleStreamStopped
};
