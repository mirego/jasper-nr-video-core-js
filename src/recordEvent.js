import { videoAnalyticsHarvester } from "./agent.js";
import { isFeatureEnabled } from "./videoConfiguration.js";
import Log from "./log.js";

/**
 * Enhanced record event function with validation, enrichment, and unified handling.
 * @param {string} eventType - Type of event to record
 * @param {object} attributes - Event attributes
 */
export function recordEvent(eventType, attributes = {}) {
  try {
    // Validate event type
    const validEvents = [
      "VideoAction",
      "VideoAdAction", 
      "VideoErrorAction",
      "VideoCustomAction",
    ];
    
    if (
      typeof eventType !== "string" ||
      eventType.length === 0 ||
      !validEvents.includes(eventType)
    ) {
      Log.warn("Invalid event type provided to recordEvent", { eventType });
      return false;
    }

    // Check if video analytics is enabled
    if (!isFeatureEnabled('priorityEventBuffer') && !window.NRVIDEO?.config?.videoAnalytics?.enabled) {
      Log.debug("Video analytics disabled, skipping event recording");
      return false;
    }

    // Get app configuration
    const appConfig = window.NRVIDEO?.info;
    if (!appConfig?.appName) {
      Log.error("App name not configured, cannot record event");
      return false;
    }

    // Create enriched event object
    const eventObject = {
      ...attributes,
      eventType,
      appName: appConfig.appName,
      timestamp: Date.now(),
      sessionId: getSessionId(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      // Add performance timing if available
      ...(window.performance && {
        timeSinceLoad: window.performance.now() / 1000,
        navigationTiming: getNavigationTiming()
      })
    };

    // Send to video analytics harvester
    const success = videoAnalyticsHarvester.addEvent(eventObject);
    
    if (success) {
      Log.debug("Event recorded successfully", {
        eventType,
        actionName: attributes.actionName
      });
    }

    return success;

  } catch (error) {
    Log.error("Failed to record event:", error.message);
    return false;
  }
}

/**
 * Records a custom video event with enhanced metadata.
 * @param {string} actionName - Custom action name
 * @param {object} customData - Custom event data
 */
export function recordCustomVideoEvent(actionName, customData = {}) {
  return recordEvent('VideoCustomAction', {
    actionName,
    ...customData
  });
}

/**
 * Gets or creates a session ID for the current page load.
 * @returns {string} Session ID
 */
function getSessionId() {
  if (!window.NRVIDEO.sessionId) {
    window.NRVIDEO.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  return window.NRVIDEO.sessionId;
}

/**
 * Gets navigation timing information if available.
 * @returns {object|null} Navigation timing data
 */
function getNavigationTiming() {
  if (!window.performance || !window.performance.timing) {
    return null;
  }

  const timing = window.performance.timing;
  const loadTime = timing.loadEventEnd - timing.navigationStart;
  const domContentLoaded = timing.domContentLoadedEventEnd - timing.navigationStart;

  return {
    loadTime,
    domContentLoaded,
    connectTime: timing.connectEnd - timing.connectStart,
    responseTime: timing.responseEnd - timing.requestStart
  };
}
