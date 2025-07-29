import { getConfigValue, isFeatureEnabled } from "./videoConfiguration";
import Log from "./log";

/**
 * Dead Letter Handler for managing failed events with retry logic,
 * backoff strategies, and persistent storage capabilities.
 */
export class DeadLetterHandler {
  constructor() {
    this.deadLetterQueue = [];
    this.maxRetries = getConfigValue('videoAnalytics.deadLetterMaxRetries') || 3;
    this.retryDelayMs = getConfigValue('videoAnalytics.deadLetterRetryDelayMs') || 5000;
    this.maxQueueSize = getConfigValue('videoAnalytics.eventProcessing.maxQueueSize') || 5000;
    this.retryTimers = new Map();
    this.retryAttempts = new Map();
    
    // Backoff configuration
    this.backoffConfig = getConfigValue('videoAnalytics.httpClient.retryPolicy') || {
      maxRetries: 3,
      backoffMultiplier: 2,
      initialDelayMs: 1000,
      maxDelayMs: 30000
    };

    // Statistics
    this.stats = {
      eventsReceived: 0,
      eventsRetried: 0,
      eventsDiscarded: 0,
      retriesSuccessful: 0,
      retriesFailed: 0,
      averageRetryTime: 0
    };

    // Bind methods for proper context
    this.processRetry = this.processRetry.bind(this);
    
    // Initialize storage if offline support is enabled
    this.initializeStorage();
  }

  /**
   * Adds failed events to the dead letter queue for retry processing.
   * @param {Array|object} events - Failed event(s) to add to dead letter queue
   * @param {object} error - Error information from the failed request
   * @param {object} metadata - Additional metadata about the failure
   */
  addFailedEvents(events, error = {}, metadata = {}) {
    if (!this.isFeatureEnabled()) {
      Log.debug("Dead letter handling is disabled, discarding failed events");
      return;
    }

    try {
      const eventsArray = Array.isArray(events) ? events : [events];
      const timestamp = Date.now();
      
      for (const event of eventsArray) {
        const deadLetterItem = {
          id: this.generateId(),
          event: { ...event },
          originalTimestamp: event.timestamp || timestamp,
          failureTimestamp: timestamp,
          retryCount: 0,
          maxRetries: this.maxRetries,
          error: {
            message: error.message || 'Unknown error',
            status: error.status || 0,
            code: error.code || 'UNKNOWN'
          },
          metadata: {
            userAgent: navigator.userAgent,
            url: window.location.href,
            ...metadata
          }
        };

        // Check queue size and make room if necessary
        if (this.deadLetterQueue.length >= this.maxQueueSize) {
          this.evictOldestEvent();
        }

        this.deadLetterQueue.push(deadLetterItem);
        this.scheduleRetry(deadLetterItem);
        
        this.stats.eventsReceived++;
      }

      Log.debug(`Added ${eventsArray.length} events to dead letter queue`, {
        queueSize: this.deadLetterQueue.length,
        error: error.message
      });

      // Persist to storage if enabled
      this.persistToStorage();

    } catch (err) {
      Log.error("Failed to add events to dead letter queue:", err.message);
    }
  }

  /**
   * Schedules a retry for a dead letter item with exponential backoff.
   * @param {object} item - Dead letter item to retry
   * @private
   */
  scheduleRetry(item) {
    if (item.retryCount >= item.maxRetries) {
      this.discardEvent(item, 'Max retries exceeded');
      return;
    }

    const delay = this.calculateBackoffDelay(item.retryCount);
    const timerId = setTimeout(() => this.processRetry(item), delay);
    
    this.retryTimers.set(item.id, timerId);
    
    Log.debug(`Scheduled retry for event ${item.id}`, {
      retryCount: item.retryCount + 1,
      delayMs: delay,
      eventType: item.event.eventType
    });
  }

  /**
   * Processes a retry attempt for a dead letter item.
   * @param {object} item - Dead letter item to retry
   * @private
   */
  async processRetry(item) {
    try {
      item.retryCount++;
      this.stats.eventsRetried++;
      
      Log.debug(`Processing retry ${item.retryCount} for event ${item.id}`, {
        eventType: item.event.eventType,
        actionName: item.event.actionName
      });

      const retryStartTime = Date.now();
      
      // Attempt to resend the event
      const success = await this.resendEvent(item.event);
      
      const retryDuration = Date.now() - retryStartTime;
      this.updateAverageRetryTime(retryDuration);

      if (success) {
        this.handleSuccessfulRetry(item);
      } else {
        this.handleFailedRetry(item);
      }

    } catch (error) {
      Log.error(`Retry processing failed for event ${item.id}:`, error.message);
      this.handleFailedRetry(item);
    }
  }

  /**
   * Handles a successful retry attempt.
   * @param {object} item - Dead letter item that was successfully retried
   * @private
   */
  handleSuccessfulRetry(item) {
    this.removeFromQueue(item.id);
    this.stats.retriesSuccessful++;
    
    Log.info(`Successfully retried event ${item.id}`, {
      retryCount: item.retryCount,
      eventType: item.event.eventType
    });
  }

  /**
   * Handles a failed retry attempt.
   * @param {object} item - Dead letter item that failed retry
   * @private
   */
  handleFailedRetry(item) {
    this.stats.retriesFailed++;
    
    if (item.retryCount >= item.maxRetries) {
      this.discardEvent(item, 'Max retries exceeded after failure');
    } else {
      // Schedule next retry
      this.scheduleRetry(item);
    }
  }

  /**
   * Attempts to resend a failed event.
   * @param {object} event - Event to resend
   * @returns {Promise<boolean>} True if successful, false otherwise
   * @private
   */
  async resendEvent(event) {
    try {
      // Import the callApi function dynamically to avoid circular dependencies
      const { callApi } = await import('./utils');
      
      // Reconstruct the URL (this should ideally be passed as metadata)
      const url = this.buildRetryUrl();
      const payload = { body: { ins: [event] } };
      
      return new Promise((resolve) => {
        callApi(
          { url, payload, options: {} },
          (result) => {
            resolve(!result.retry);
          }
        );
      });
    } catch (error) {
      Log.error("Failed to resend event:", error.message);
      return false;
    }
  }

  /**
   * Builds the retry URL for resending events.
   * @returns {string} Retry URL
   * @private
   */
  buildRetryUrl() {
    try {
      const { beacon, licenseKey, applicationID, sa } = window.NRVIDEO?.info || {};
      if (!beacon || !licenseKey || !applicationID) {
        throw new Error("Required configuration missing for retry URL");
      }

      const queryParams = new URLSearchParams({
        a: applicationID,
        sa: sa || 0,
        v: '3.1.1', // Should get this from package.json
        t: "Unnamed Transaction",
        rst: Date.now(),
        ck: "0",
        s: 0,
        ref: window.location.href,
        ptid: "",
        ca: "VA"
      });

      return `https://${beacon}/ins/1/${licenseKey}?${queryParams.toString()}`;
    } catch (error) {
      Log.error("Failed to build retry URL:", error.message);
      return null;
    }
  }

  /**
   * Removes an item from the dead letter queue.
   * @param {string} itemId - ID of the item to remove
   * @private
   */
  removeFromQueue(itemId) {
    const index = this.deadLetterQueue.findIndex(item => item.id === itemId);
    if (index !== -1) {
      this.deadLetterQueue.splice(index, 1);
    }

    // Clear retry timer
    if (this.retryTimers.has(itemId)) {
      clearTimeout(this.retryTimers.get(itemId));
      this.retryTimers.delete(itemId);
    }

    this.persistToStorage();
  }

  /**
   * Discards an event that cannot be retried.
   * @param {object} item - Dead letter item to discard
   * @param {string} reason - Reason for discarding
   * @private
   */
  discardEvent(item, reason) {
    this.removeFromQueue(item.id);
    this.stats.eventsDiscarded++;
    
    Log.warn(`Discarded event ${item.id}`, {
      reason,
      retryCount: item.retryCount,
      eventType: item.event.eventType,
      originalTimestamp: item.originalTimestamp
    });
  }

  /**
   * Evicts the oldest event from the queue to make room.
   * @private
   */
  evictOldestEvent() {
    if (this.deadLetterQueue.length > 0) {
      const oldest = this.deadLetterQueue.shift();
      this.discardEvent(oldest, 'Queue full - evicted oldest');
    }
  }

  /**
   * Calculates backoff delay with exponential backoff and jitter.
   * @param {number} retryCount - Current retry count
   * @returns {number} Delay in milliseconds
   * @private
   */
  calculateBackoffDelay(retryCount) {
    const { backoffMultiplier, initialDelayMs, maxDelayMs } = this.backoffConfig;
    
    // Exponential backoff
    const exponentialDelay = initialDelayMs * Math.pow(backoffMultiplier, retryCount);
    
    // Apply maximum delay limit
    const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
    
    // Add jitter (±25%)
    const jitter = cappedDelay * 0.25 * (Math.random() - 0.5);
    
    return Math.max(cappedDelay + jitter, initialDelayMs);
  }

  /**
   * Updates the average retry time statistic.
   * @param {number} retryDuration - Duration of the retry attempt
   * @private
   */
  updateAverageRetryTime(retryDuration) {
    const totalRetries = this.stats.eventsRetried;
    const currentAverage = this.stats.averageRetryTime;
    
    // Calculate running average
    this.stats.averageRetryTime = 
      ((currentAverage * (totalRetries - 1)) + retryDuration) / totalRetries;
  }

  /**
   * Generates a unique ID for dead letter items.
   * @returns {string} Unique ID
   * @private
   */
  generateId() {
    return `dl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets the current dead letter queue size.
   * @returns {number} Queue size
   */
  getQueueSize() {
    return this.deadLetterQueue.length;
  }

  /**
   * Gets dead letter handler statistics.
   * @returns {object} Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      queueSize: this.deadLetterQueue.length,
      activeRetries: this.retryTimers.size
    };
  }

  /**
   * Resets statistics.
   */
  resetStats() {
    this.stats = {
      eventsReceived: 0,
      eventsRetried: 0,
      eventsDiscarded: 0,
      retriesSuccessful: 0,
      retriesFailed: 0,
      averageRetryTime: 0
    };
  }

  /**
   * Clears the dead letter queue and cancels all pending retries.
   */
  clear() {
    // Cancel all pending retries
    for (const timerId of this.retryTimers.values()) {
      clearTimeout(timerId);
    }
    
    this.retryTimers.clear();
    this.deadLetterQueue = [];
    this.retryAttempts.clear();
    
    this.clearStorage();
    
    Log.debug("Dead letter queue cleared");
  }

  /**
   * Initializes persistent storage for offline support.
   * @private
   */
  initializeStorage() {
    if (!isFeatureEnabled('offlineSupport')) {
      return;
    }

    try {
      const stored = localStorage.getItem('nrvideo_dead_letter_queue');
      if (stored) {
        const parsedQueue = JSON.parse(stored);
        if (Array.isArray(parsedQueue)) {
          this.deadLetterQueue = parsedQueue;
          // Reschedule retries for persisted items
          this.deadLetterQueue.forEach(item => {
            if (item.retryCount < item.maxRetries) {
              this.scheduleRetry(item);
            }
          });
        }
      }
    } catch (error) {
      Log.warn("Failed to load dead letter queue from storage:", error.message);
    }
  }

  /**
   * Persists the dead letter queue to storage.
   * @private
   */
  persistToStorage() {
    if (!isFeatureEnabled('offlineSupport')) {
      return;
    }

    try {
      localStorage.setItem('nrvideo_dead_letter_queue', JSON.stringify(this.deadLetterQueue));
    } catch (error) {
      Log.warn("Failed to persist dead letter queue to storage:", error.message);
    }
  }

  /**
   * Clears the persisted dead letter queue from storage.
   * @private
   */
  clearStorage() {
    if (!isFeatureEnabled('offlineSupport')) {
      return;
    }

    try {
      localStorage.removeItem('nrvideo_dead_letter_queue');
    } catch (error) {
      Log.warn("Failed to clear dead letter queue from storage:", error.message);
    }
  }

  /**
   * Checks if the dead letter handling feature is enabled.
   * @returns {boolean} True if enabled
   * @private
   */
  isFeatureEnabled() {
    return isFeatureEnabled('deadLetterHandling');
  }

  /**
   * Forces immediate retry of all queued events.
   * @returns {Promise<void>}
   */
  async forceRetryAll() {
    Log.info(`Force retrying ${this.deadLetterQueue.length} dead letter events`);
    
    const retryPromises = this.deadLetterQueue.map(item => {
      // Cancel existing timer
      if (this.retryTimers.has(item.id)) {
        clearTimeout(this.retryTimers.get(item.id));
        this.retryTimers.delete(item.id);
      }
      
      return this.processRetry(item);
    });

    await Promise.allSettled(retryPromises);
  }
}

export default DeadLetterHandler;
