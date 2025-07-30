import { customEventAggregator } from "./agent.js";
import { getPayloadSize } from "./utils.js";
import Constants from "./constants";

const { VALID_EVENT_TYPES, MAX_EVENT_SIZE } = Constants;

/**
 * Records a video event with the specified type and attributes
 * @param {string} eventType - The type of event to record
 * @param {Object} attributes - Additional attributes to include with the event
 * @returns {boolean} - True if event was recorded successfully, false otherwise
 */
export function recordEvent(eventType, attributes = {}) {
  // Input validation
  if (
    typeof eventType !== "string" ||
    eventType.length === 0 ||
    !VALID_EVENT_TYPES.includes(eventType)
  ) {
    console.warn("recordEvent: Invalid eventType provided:", eventType);
    return false;
  }

  // Validate attributes parameter
  if (
    attributes !== null &&
    (typeof attributes !== "object" || Array.isArray(attributes))
  ) {
    console.warn("recordEvent: attributes must be a plain object");
    return false;
  }

  // Ensure attributes is an object (handle null case)
  attributes = attributes || {};

  // Check if NRVIDEO is properly initialized
  if (!window.NRVIDEO || !window.NRVIDEO.info) {
    console.error("recordEvent: NRVIDEO not properly initialized");
    return false;
  }

  try {
    const { appName } = window.NRVIDEO.info;

    const eventObject = {
      ...attributes,
      eventType,
      appName,
      timestamp: Date.now(),
    };

    // Check event size to prevent oversized payloads
    const eventSize = getPayloadSize(eventObject);

    if (eventSize > MAX_EVENT_SIZE) {
      console.warn(
        `recordEvent: Event size (${eventSize} bytes) exceeds maximum (${MAX_EVENT_SIZE} bytes)`
      );
      return false;
    }

    customEventAggregator.add(eventObject);
    return true;
  } catch (error) {
    console.error("recordEvent: Error recording event:", error);
    return false;
  }
}
