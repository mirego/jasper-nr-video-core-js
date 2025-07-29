import { getConfigValue, isFeatureEnabled } from "./videoConfiguration";
import { PriorityEventBuffer } from "./priorityEventBuffer";
import { DeadLetterHandler } from "./deadLetterHandler";
import { OptimizedHttpClient } from "./optimizedHttpClient";
import { BaseHarvester } from "./baseHarvester";
import Constants from "./constants";
import Log from "./log";

/**
 * Enhanced harvest scheduler that orchestrates the video analytics data collection,
 * processing, and transmission with adaptive scheduling and performance monitoring.
 * Extends BaseHarvester to eliminate code duplication.
 */
export class HarvestScheduler extends BaseHarvester {
  constructor(eventAggregator = null) {
    super(); // Call BaseHarvester constructor
    
    // Use provided aggregator or create enhanced priority buffer
    this.eventBuffer = eventAggregator || new PriorityEventBuffer();
    this.deadLetterHandler = new DeadLetterHandler();
    this.httpClient = new OptimizedHttpClient();

    // Scheduler state
    this.isStarted = false;
    this.currentTimerId = null;
    this.harvestCycle =
      getConfigValue("videoAnalytics.harvestCycleInMs") || Constants.INTERVAL;
    this.isHarvesting = false;
    this.consecutiveFailures = 0;
    this.lastSuccessfulHarvest = Date.now();

    // Adaptive scheduling configuration
    this.adaptiveConfig = {
      enabled: isFeatureEnabled("adaptiveHarvesting"),
      minInterval: 5000, // 5 seconds minimum
      maxInterval: 60000, // 60 seconds maximum
      backoffMultiplier: 1.5,
      maxConsecutiveFailures: 3,
    };

    // Performance monitoring
    this.performanceMetrics = {
      harvestsCompleted: 0,
      harvestsSuccessful: 0,
      harvestsFailed: 0,
      averageHarvestTime: 0,
      totalEventsHarvested: 0,
      totalDataTransmitted: 0,
      adaptiveAdjustments: 0,
    };

    // Page lifecycle handling
    this.setupPageLifecycleHandlers();

    // Bind methods
    this.triggerHarvest = this.triggerHarvest.bind(this);
    this.onHarvestInterval = this.onHarvestInterval.bind(this);
  }

  /**
   * Starts the harvest scheduler with adaptive timing.
   */
  startScheduler() {
    if (this.isStarted) {
      Log.warn("Harvest scheduler is already started");
      return;
    }

    this.isStarted = true;
    this.lastSuccessfulHarvest = Date.now();

    Log.info("Starting harvest scheduler", {
      harvestCycle: this.harvestCycle,
      adaptiveScheduling: this.adaptiveConfig.enabled,
    });

    this.scheduleNextHarvest();
  }

  /**
   * Stops the harvest scheduler.
   */
  stopScheduler() {
    if (!this.isStarted) {
      return;
    }

    this.isStarted = false;

    if (this.currentTimerId) {
      clearTimeout(this.currentTimerId);
      this.currentTimerId = null;
    }

    Log.info("Harvest scheduler stopped");
  }

  /**
   * Schedules the next harvest based on current conditions.
   * @private
   */
  scheduleNextHarvest() {
    if (!this.isStarted) {
      return;
    }

    const interval = this.calculateNextInterval();

    this.currentTimerId = setTimeout(this.onHarvestInterval, interval);

    Log.debug("Next harvest scheduled", {
      interval,
      adaptiveScheduling: this.adaptiveConfig.enabled,
      consecutiveFailures: this.consecutiveFailures,
    });
  }

  /**
   * Calculates the next harvest interval using adaptive scheduling.
   * @returns {number} Next interval in milliseconds
   * @private
   */
  calculateNextInterval() {
    if (!this.adaptiveConfig.enabled) {
      return this.harvestCycle;
    }

    let interval = this.harvestCycle;

    // Increase interval after consecutive failures
    if (this.consecutiveFailures > 0) {
      const backoffFactor = Math.pow(
        this.adaptiveConfig.backoffMultiplier,
        this.consecutiveFailures
      );
      interval = Math.min(
        interval * backoffFactor,
        this.adaptiveConfig.maxInterval
      );

      Log.debug("Adaptive scheduling: increased interval due to failures", {
        originalInterval: this.harvestCycle,
        adjustedInterval: interval,
        consecutiveFailures: this.consecutiveFailures,
      });

      this.performanceMetrics.adaptiveAdjustments++;
    }

    // Ensure interval is within bounds
    return Math.max(
      Math.min(interval, this.adaptiveConfig.maxInterval),
      this.adaptiveConfig.minInterval
    );
  }

  /**
   * Handles the harvest interval timer.
   * @private
   */
  async onHarvestInterval() {
    try {
      await this.triggerHarvest({});
    } catch (error) {
      Log.error("Error during scheduled harvest:", error.message);
    }

    // Schedule next harvest
    this.scheduleNextHarvest();
  }

  /**
   * Triggers a harvest cycle with comprehensive error handling and monitoring.
   * @param {object} options - Harvest options
   * @param {boolean} options.isFinalHarvest - Whether this is a final harvest on page unload
   * @param {boolean} options.force - Force harvest even if buffer is empty
   * @returns {Promise<object>} Harvest result
   */
  async triggerHarvest(options = {}) {
    if (this.isHarvesting && !options.force) {
      Log.debug("Harvest already in progress, skipping");
      return { success: false, reason: "harvest_in_progress" };
    }

    const harvestStartTime = Date.now();
    this.isHarvesting = true;

    try {
      Log.debug("Starting harvest cycle", {
        bufferSize: this.getBufferSize(),
        options,
        consecutiveFailures: this.consecutiveFailures,
      });

      // Check if there are events to harvest
      if (this.isBufferEmpty() && !options.force) {
        Log.debug("No events to harvest");
        return { success: true, reason: "no_events" };
      }

      // Drain events from buffer
      const events = this.drainEvents(options);

      if (events.length === 0) {
        Log.debug("No events drained from buffer");
        return { success: true, reason: "no_events_drained" };
      }

      // Process events in chunks using inherited method
      const chunks = this.chunkEvents(events, this.getMaxChunkSize(options.isFinalHarvest));
      const results = [];

      // Send chunks sequentially or in parallel based on configuration
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const isLastChunk = i === chunks.length - 1;

        const chunkResult = await this.sendChunk(chunk, options, isLastChunk);
        results.push(chunkResult);
      }

      // Analyze results and update state
      const harvestResult = this.analyzeHarvestResults(results, events);
      this.updateHarvestMetrics(harvestResult, harvestStartTime);

      return harvestResult;
    } catch (error) {
      Log.error("Harvest cycle failed:", error.message);
      this.handleHarvestFailure(error);

      return {
        success: false,
        error: error.message,
        consecutiveFailures: this.consecutiveFailures,
      };
    } finally {
      this.isHarvesting = false;
    }
  }

  /**
   * Drains events from the event buffer.
   * @param {object} options - Harvest options
   * @returns {Array} Drained events
   * @private
   */
  drainEvents(options) {
    if (this.eventBuffer instanceof PriorityEventBuffer) {
      // Use unified buffer's drain method
      return this.eventBuffer.drain();
    } else {
      // Fallback to standard aggregator
      return this.eventBuffer.drain();
    }
  }

  /**
   * Sends a chunk of events using the optimized HTTP client.
   * @param {Array} chunk - Events to send
   * @param {object} options - Harvest options
   * @param {boolean} isLastChunk - Whether this is the last chunk
   * @returns {Promise<object>} Send result
   * @private
   */
  async sendChunk(chunk, options, isLastChunk) {
    const url = this.buildHarvestUrl(); // Use inherited method
    const payload = { body: { ins: chunk } };

    const requestOptions = {
      url,
      payload,
      options: {
        ...options,
        isLastChunk,
      },
    };

    return new Promise((resolve) => {
      this.httpClient.send(requestOptions, (result) => {
        if (result.retry) {
          // Send failed events to dead letter handler
          this.deadLetterHandler.addFailedEvents(chunk, {
            status: result.status,
            message: result.error,
          });
        }

        resolve({
          success: !result.retry,
          status: result.status,
          error: result.error,
          chunk,
          eventCount: chunk.length,
        });
      });
    });
  }

  /**
   * Analyzes the results from all chunk sends.
   * @param {Array} results - Results from chunk sends
   * @param {Array} originalEvents - Original events that were harvested
   * @returns {object} Overall harvest result
   * @private
   */
  analyzeHarvestResults(results, originalEvents) {
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    const totalEvents = results.reduce((sum, r) => sum + r.eventCount, 0);
    const successfulEvents = successful.reduce(
      (sum, r) => sum + r.eventCount,
      0
    );
    const failedEvents = failed.reduce((sum, r) => sum + r.eventCount, 0);

    const harvestResult = {
      success: successful.length > 0,
      totalChunks: results.length,
      successfulChunks: successful.length,
      failedChunks: failed.length,
      totalEvents,
      successfulEvents,
      failedEvents,
      results,
    };

    Log.debug("Harvest results analyzed", harvestResult);

    return harvestResult;
  }

  /**
   * Updates harvest performance metrics.
   * @param {object} result - Harvest result
   * @param {number} startTime - Harvest start time
   * @private
   */
  updateHarvestMetrics(result, startTime) {
    const duration = Date.now() - startTime;

    this.performanceMetrics.harvestsCompleted++;
    this.performanceMetrics.totalEventsHarvested += result.totalEvents;

    if (result.success) {
      this.performanceMetrics.harvestsSuccessful++;
      this.consecutiveFailures = 0;
      this.lastSuccessfulHarvest = Date.now();
    } else {
      this.performanceMetrics.harvestsFailed++;
      this.consecutiveFailures++;
    }

    // Update average harvest time
    const totalHarvests = this.performanceMetrics.harvestsCompleted;
    const currentAverage = this.performanceMetrics.averageHarvestTime;
    this.performanceMetrics.averageHarvestTime =
      (currentAverage * (totalHarvests - 1) + duration) / totalHarvests;
  }

  /**
   * Handles harvest failure scenarios.
   * @param {Error} error - Harvest error
   * @private
   */
  handleHarvestFailure(error) {
    this.consecutiveFailures++;

    Log.warn("Harvest failure handled", {
      error: error.message,
      consecutiveFailures: this.consecutiveFailures,
    });

    // If too many consecutive failures, consider pausing
    if (
      this.consecutiveFailures >= this.adaptiveConfig.maxConsecutiveFailures
    ) {
      Log.error(
        "Maximum consecutive failures reached, harvest scheduler may need attention"
      );
    }
  }

  /**
   * Sets up page lifecycle event handlers.
   * @private
   */
  setupPageLifecycleHandlers() {
    // Handle page visibility changes
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        Log.debug("Page became hidden, triggering final harvest");
        this.triggerHarvest({ isFinalHarvest: true });
      }
    });

    // Handle page unload
    window.addEventListener("pagehide", () => {
      Log.debug("Page unloading, triggering final harvest");
      this.triggerHarvest({ isFinalHarvest: true });
    });

    // Handle beforeunload as backup
    window.addEventListener("beforeunload", () => {
      this.triggerHarvest({ isFinalHarvest: true });
    });
  }

  /**
   * Forces an immediate harvest of all pending events.
   * @returns {Promise<object>} Harvest result
   */
  async forceHarvest() {
    Log.info("Forcing immediate harvest");
    return await this.triggerHarvest({ force: true });
  }

  /**
   * Checks if the event buffer is empty.
   * @returns {boolean} True if buffer is empty
   */
  isBufferEmpty() {
    if (this.eventBuffer instanceof PriorityEventBuffer) {
      return this.eventBuffer.isEmpty();
    } else {
      return this.eventBuffer.isEmpty();
    }
  }

  /**
   * Gets the current buffer size.
   * @returns {number} Buffer size
   */
  getBufferSize() {
    if (this.eventBuffer instanceof PriorityEventBuffer) {
      return this.eventBuffer.size();
    } else {
      return this.eventBuffer.queue?.length || 0;
    }
  }

  /**
   * Gets comprehensive performance metrics.
   * @returns {object} Performance metrics
   */
  getMetrics() {
    return {
      scheduler: { ...this.performanceMetrics },
      buffer:
        this.eventBuffer instanceof PriorityEventBuffer
          ? this.eventBuffer.getStats()
          : { totalEvents: this.getBufferSize() },
      deadLetter: this.deadLetterHandler.getStats(),
      httpClient: this.httpClient.getMetrics(),
      state: {
        isStarted: this.isStarted,
        isHarvesting: this.isHarvesting,
        consecutiveFailures: this.consecutiveFailures,
        lastSuccessfulHarvest: this.lastSuccessfulHarvest,
        currentInterval: this.harvestCycle,
      },
    };
  }

  /**
   * Resets all performance metrics.
   */
  resetMetrics() {
    this.performanceMetrics = {
      harvestsCompleted: 0,
      harvestsSuccessful: 0,
      harvestsFailed: 0,
      averageHarvestTime: 0,
      totalEventsHarvested: 0,
      totalDataTransmitted: 0,
      adaptiveAdjustments: 0,
    };

    if (this.eventBuffer instanceof PriorityEventBuffer) {
      this.eventBuffer.resetStats();
    }

    this.deadLetterHandler.resetStats();
    this.httpClient.resetMetrics();

    this.consecutiveFailures = 0;
  }

  /**
   * Updates the harvest cycle interval.
   * @param {number} intervalMs - New interval in milliseconds
   */
  setHarvestInterval(intervalMs) {
    if (intervalMs < 1000 || intervalMs > 300000) {
      Log.warn("Harvest interval must be between 1 second and 5 minutes");
      return;
    }

    this.harvestCycle = intervalMs;

    Log.info("Harvest interval updated", {
      newInterval: intervalMs,
      oldInterval: this.harvestCycle,
    });

    // Restart scheduler with new interval if running
    if (this.isStarted) {
      this.stopScheduler();
      this.startScheduler();
    }
  }

  /**
   * Destroys the harvest scheduler and cleans up resources.
   */
  destroy() {
    this.stopScheduler();

    if (this.eventBuffer instanceof PriorityEventBuffer) {
      this.eventBuffer.clear();
    }

    this.deadLetterHandler.clear();
    this.httpClient.destroy();

    Log.info("Harvest scheduler destroyed");
  }
}

export default HarvestScheduler;
