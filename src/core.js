import Log from "./log";
import { recordEvent, recordCriticalEvent } from "./recordEvent";
import { setVideoConfig } from "./videoConfiguration";

/**
 * Static class that sums up core functionalities of the library.
 * @static
 */
class Core {
  /**
   * Add a tracker to the system. Trackers added will start reporting its events to the video analytics backend.
   *
   * @param {(Emitter|Tracker)} tracker Tracker instance to add.
   * @param {object} options Configuration options including video analytics settings.
   */
  static addTracker(tracker, options) {
    // Set video analytics configuration
    if (options?.info) {
      setVideoConfig(options.info);
    }
    
    if (tracker.on && tracker.emit) {
      trackers.push(tracker);
      tracker.on("*", eventHandler);
      if (typeof tracker.trackerInit == "function") {
        tracker.trackerInit();
      }
    } else {
      Log.error("Tried to load a non-tracker.", tracker);
    }
  }

  /**
   * Disposes and remove given tracker. Removes its listeners.
   *
   * @param {Tracker} tracker Tracker to remove.
   */
  static removeTracker(tracker) {
    tracker.off("*", eventHandler);
    tracker.dispose();
    let index = trackers.indexOf(tracker);
    if (index !== -1) trackers.splice(index, 1);
  }

  /**
   * Returns the array of trackers.
   *
   * @returns {Tracker[]} Array of trackers.
   */
  static getTrackers() {
    return trackers;
  }

  /**
   * Enhanced send method with performance timing.
   * @param {string} eventType - Type of event
   * @param {string} actionName - Action name
   * @param {object} data - Event data
   */
  static send(eventType, actionName, data) {
    const enrichedData = {
      actionName,
      ...data,
      timeSinceLoad: window.performance ? window.performance.now() / 1000 : null
    };
    
    return recordEvent(eventType, enrichedData);
  }

  /**
   * Sends an error event.
   * This may be used for external errors launched by the app, the network or
   * any external factor. Note that errors within the player are normally reported with
   * tracker.sendError, so this method should not be used to report those.
   *
   * @param {object} att attributes to be sent along the error.
   */
  static sendError(att) {
    return recordEvent("VideoErrorAction", {
      actionName: "ERROR",
      ...att
    });
  }

  /**
   * Sends a custom event.
   * @param {string} actionName - Custom action name
   * @param {object} data - Event data
   */
  static sendCustom(actionName, data) {
    return Core.send("VideoCustomAction", actionName, data);
  }

  /**
   * Gets video analytics performance metrics.
   * @returns {object} Performance metrics
   */
  static getMetrics() {
    try {
      const { videoAnalyticsHarvester } = require("./agent");
      return videoAnalyticsHarvester.getMetrics();
    } catch (error) {
      Log.error("Failed to get video analytics metrics:", error.message);
      return { error: error.message };
    }
  }

  /**
   * Forces an immediate harvest of all pending events.
   * @returns {Promise<object>} Harvest result
   */
  static async forceHarvest() {
    try {
      const { videoAnalyticsHarvester } = require("./agent");
      return await videoAnalyticsHarvester.forceHarvest();
    } catch (error) {
      Log.error("Failed to force harvest:", error.message);
      return { success: false, error: error.message };
    }
  }
}

let trackers = [];
let isErrorShown = false;

/**
 * Enhanced event handler with error handling and performance monitoring.
 *
 * @private
 * @param {Event} e Event
 */
function eventHandler(e) {
  try {
    let data = cleanData(e.data);
    
    if (Log.level <= Log.Levels.DEBUG) {
      Log.notice("Sent", e.type, data);
    } else {
      Log.notice("Sent", e.type);
    }

    // Send event without priority discrimination
    Core.send(e.eventType, e.type, data);

  } catch (error) {
    Log.error("Error in event handler:", error.message);
  }
}

/**
 * Cleans given object, removing all items with value === null.
 * @private
 * @param {Object} data Data to clean
 * @returns {Object} Cleaned object
 */
function cleanData(data) {
  let ret = {};
  for (let i in data) {
    if (data[i] !== null && typeof data[i] !== "undefined") ret[i] = data[i];
  }
  return ret;
}

export default Core;
