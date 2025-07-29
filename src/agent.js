import { EventAggregator } from "./eventAggregator.js";
import { Harvester } from "./harvester.js";
import { HarvestScheduler } from "./harvestScheduler.js";
import { PriorityEventBuffer } from "./priorityEventBuffer.js";
import { isFeatureEnabled } from "./videoConfiguration.js";
import Log from "./log.js";

/**
 * Enhanced video analytics agent with configurable harvesting strategies.
 */
class VideoAnalyticsAgent {
  constructor() {
    this.isInitialized = false;
    this.harvester = null;
    this.eventBuffer = null;
  }

  /**
   * Initializes the video analytics agent with the appropriate harvesting strategy.
   */
  initialize() {
    if (this.isInitialized) {
      Log.warn("Video analytics agent already initialized");
      return;
    }

    try {
      // Choose event buffer based on configuration
      if (isFeatureEnabled('priorityEventBuffer')) {
        Log.info("Initializing with enhanced priority event buffer");
        this.eventBuffer = new PriorityEventBuffer();
        this.harvester = new HarvestScheduler(this.eventBuffer);
      } else {
        Log.info("Initializing with standard event aggregator");
        this.eventBuffer = new EventAggregator();
        this.harvester = new Harvester(this.eventBuffer);
      }

      // Start the harvester
      if (this.harvester instanceof HarvestScheduler) {
        this.harvester.startScheduler();
      } else {
        this.harvester.startTimer();
      }

      this.isInitialized = true;
      Log.info("Video analytics agent initialized successfully");

    } catch (error) {
      Log.error("Failed to initialize video analytics agent:", error.message);
    }
  }

  /**
   * Adds an event to the harvesting system.
   * @param {object} eventObject - Event to add
   * @returns {boolean} True if event was added successfully
   */
  addEvent(eventObject) {
    if (!this.isInitialized) {
      Log.warn("Video analytics agent not initialized, initializing now");
      this.initialize();
    }

    try {
      if (this.eventBuffer instanceof PriorityEventBuffer) {
        return this.eventBuffer.add(eventObject);
      } else {
        this.eventBuffer.add(eventObject);
        return true;
      }
    } catch (error) {
      Log.error("Failed to add event to harvesting system:", error.message);
      return false;
    }
  }

  /**
   * Forces an immediate harvest of all pending events.
   * @returns {Promise<object>} Harvest result
   */
  async forceHarvest() {
    if (!this.isInitialized) {
      throw new Error("Video analytics agent not initialized");
    }

    if (this.harvester instanceof HarvestScheduler) {
      return await this.harvester.forceHarvest();
    } else {
      // Trigger harvest on legacy harvester
      this.harvester.triggerHarvest({ force: true });
      return { success: true, legacy: true };
    }
  }

  /**
   * Gets comprehensive metrics from the harvesting system.
   * @returns {object} System metrics
   */
  getMetrics() {
    if (!this.isInitialized) {
      return { error: "Agent not initialized" };
    }

    if (this.harvester instanceof HarvestScheduler) {
      return this.harvester.getMetrics();
    } else {
      return {
        legacy: true,
        bufferSize: this.eventBuffer?.queue?.length || 0
      };
    }
  }

  /**
   * Resets all system metrics.
   */
  resetMetrics() {
    if (!this.isInitialized) {
      return;
    }

    if (this.harvester instanceof HarvestScheduler) {
      this.harvester.resetMetrics();
    }
  }

  /**
   * Destroys the video analytics agent and cleans up resources.
   */
  destroy() {
    if (!this.isInitialized) {
      return;
    }

    if (this.harvester instanceof HarvestScheduler) {
      this.harvester.destroy();
    }

    this.eventBuffer = null;
    this.harvester = null;
    this.isInitialized = false;

    Log.info("Video analytics agent destroyed");
  }
}

// Create singleton instance
const videoAnalyticsAgent = new VideoAnalyticsAgent();

// Legacy compatibility - maintain existing exports
export const customEventAggregator = {
  add: (eventObject) => videoAnalyticsAgent.addEvent(eventObject),
  isEmpty: () => {
    const buffer = videoAnalyticsAgent.eventBuffer;
    if (buffer instanceof PriorityEventBuffer) {
      return buffer.isEmpty();
    }
    return buffer?.isEmpty() || true;
  },
  drain: () => {
    const buffer = videoAnalyticsAgent.eventBuffer;
    if (buffer instanceof PriorityEventBuffer) {
      return buffer.drain();
    }
    return buffer?.drain() || [];
  },
  postHarvestCleanup: (result) => {
    const buffer = videoAnalyticsAgent.eventBuffer;
    if (buffer instanceof PriorityEventBuffer) {
      buffer.postHarvestCleanup(result);
    } else if (buffer?.postHarvestCleanup) {
      buffer.postHarvestCleanup(result);
    }
  }
};

// Legacy harvester for backward compatibility
const legacyHarvester = new Harvester(customEventAggregator);
legacyHarvester.startTimer();

// Enhanced video analytics harvester
export const videoAnalyticsHarvester = videoAnalyticsAgent;

// Initialize agent automatically
videoAnalyticsAgent.initialize();
