import { getConfigValue, isFeatureEnabled } from "./videoConfiguration";
import Log from "./log";

/**
 * Enhanced event buffer that manages video events with unified priority handling
 * and automatic size management. All events are treated with equal priority
 * unless explicitly specified otherwise.
 */
export class PriorityEventBuffer {
  constructor() {
    // Simplified to single priority queue for equal treatment
    this.buffer = [];
    this.maxBufferSize = getConfigValue('videoAnalytics.priorityBufferSize') || 100;
    this.totalEvents = 0;
    this.isRetry = false;
    this.eventCounter = 0;

    // Statistics tracking
    this.stats = {
      eventsAdded: 0,
      eventsDropped: 0,
      eventsDrained: 0,
      bufferOverflows: 0
    };
  }

  /**
   * Adds an event to the buffer with unified priority handling.
   * All events are treated equally unless explicit priority is provided for future extensibility.
   * @param {object} eventObject - The event to add
   * @param {string} priority - Optional priority override (for future use, currently ignored)
   */
  add(eventObject, priority = null) {
    if (!this.isFeatureEnabled()) {
      Log.debug("Priority event buffer is disabled, skipping event");
      return false;
    }

    try {
      // Add sequence number and timestamp if not present
      if (!eventObject.sequence) {
        eventObject.sequence = ++this.eventCounter;
      }
      
      if (!eventObject.timestamp) {
        eventObject.timestamp = Date.now();
      }

      // Add priority metadata for future use (but don't use for ordering)
      if (priority) {
        eventObject.priority = priority;
      }

      // Check if we need to make room
      if (this.totalEvents >= this.maxBufferSize) {
        this.makeRoom();
      }

      // Add to unified buffer
      this.buffer.push(eventObject);
      this.totalEvents++;
      this.stats.eventsAdded++;

      Log.debug(`Event added to unified buffer`, {
        eventType: eventObject.eventType,
        actionName: eventObject.actionName,
        totalEvents: this.totalEvents,
        sequence: eventObject.sequence
      });

      return true;
    } catch (error) {
      Log.error("Failed to add event to buffer:", error.message);
      return false;
    }
  }

  /**
   * Drains events from the buffer in FIFO order (first in, first out).
   * @param {number} maxEvents - Maximum number of events to drain
   * @returns {Array} Array of events in order they were added
   */
  drain(maxEvents = null) {
    const limit = maxEvents || this.totalEvents;
    const events = [];

    try {
      // Drain events in FIFO order
      while (this.buffer.length > 0 && events.length < limit) {
        events.push(this.buffer.shift());
      }

      this.totalEvents -= events.length;
      this.stats.eventsDrained += events.length;

      Log.debug(`Drained ${events.length} events from buffer`, {
        totalRemaining: this.totalEvents,
        bufferSize: this.buffer.length
      });

      return events;
    } catch (error) {
      Log.error("Failed to drain events from buffer:", error.message);
      return [];
    }
  }

  /**
   * Drains a specific number of events from the buffer.
   * @param {number} maxEvents - Maximum number of events to drain
   * @returns {Array} Array of events
   */
  drainSpecific(maxEvents) {
    if (!maxEvents || maxEvents <= 0) {
      Log.warn('Invalid maxEvents parameter for drainSpecific');
      return [];
    }

    const events = this.buffer.splice(0, maxEvents);
    this.totalEvents -= events.length;
    this.stats.eventsDrained += events.length;

    return events;
  }

  /**
   * Returns events without removing them from the buffer.
   * @param {number} maxEvents - Maximum number of events to peek
   * @returns {Array} Array of events in order they were added
   */
  peek(maxEvents = 10) {
    const limit = Math.min(maxEvents, this.totalEvents);
    const events = [];

    for (let i = 0; i < limit && i < this.buffer.length; i++) {
      events.push({ ...this.buffer[i] });
    }

    return events;
  }

  /**
   * Checks if the buffer is empty.
   * @returns {boolean} True if all buffers are empty
   */
  isEmpty() {
    return this.totalEvents === 0;
  }

  /**
   * Gets the total number of events across all buffers.
   * @returns {number} Total event count
   */
  size() {
    return this.totalEvents;
  }

  /**
   * Gets the size of the buffer.
   * @returns {object} Object with buffer information
   */
  getBufferSizes() {
    return {
      total: this.buffer.length,
      maxSize: this.maxBufferSize
    };
  }

  /**
   * Clears the entire buffer.
   */
  clear() {
    this.buffer = [];
    this.totalEvents = 0;
    this.eventCounter = 0;
    
    Log.debug("Event buffer cleared");
  }

  /**
   * Gets buffer statistics.
   * @returns {object} Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      totalEvents: this.totalEvents,
      bufferSizes: this.getBufferSizes(),
      maxBufferSize: this.maxBufferSize
    };
  }

  /**
   * Resets buffer statistics.
   */
  resetStats() {
    this.stats = {
      eventsAdded: 0,
      eventsDropped: 0,
      eventsDrained: 0,
      bufferOverflows: 0
    };
  }

  /**
   * Sets failed events back into the buffer for retry.
   * @param {Array} events - Events to retry
   */
  retryEvents(events) {
    if (!Array.isArray(events) || events.length === 0) {
      return;
    }

    this.isRetry = true;
    
    try {
      // Add retry events to the front of the buffer (higher priority for retries)
      for (let i = events.length - 1; i >= 0; i--) {
        this.buffer.unshift(events[i]);
        this.totalEvents++;
      }

      Log.debug(`Retrying ${events.length} failed events`, {
        totalEvents: this.totalEvents
      });
    } catch (error) {
      Log.error("Failed to retry events:", error.message);
    } finally {
      this.isRetry = false;
    }
  }

  /**
   * Post-harvest cleanup based on result.
   * @param {object} result - Harvest result with retry flag and chunk data
   */
  postHarvestCleanup(result) {
    if (result.retry && result.chunk) {
      this.retryEvents(result.chunk);
    }
  }

  /**
   * Makes room in the buffer by removing the oldest event.
   * Uses FIFO approach - removes the first (oldest) event.
   * @private
   */
  makeRoom() {
    if (this.buffer.length > 0) {
      const removed = this.buffer.shift();
      this.totalEvents--;
      this.stats.eventsDropped++;
      
      Log.debug(`Dropped oldest event to make room`, {
        droppedEvent: removed.actionName || removed.eventType,
        bufferSize: this.buffer.length
      });
      
      this.stats.bufferOverflows++;
    }
  }

  /**
   * Checks if the priority event buffer feature is enabled.
   * @returns {boolean} True if enabled
   * @private
   */
  isFeatureEnabled() {
    return isFeatureEnabled('priorityEventBuffer');
  }
}

export default PriorityEventBuffer;
