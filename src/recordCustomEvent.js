import { customEventAggregator } from "./agent.js";

export function recordCustomEvent(eventType, attributes = {}) {
  if (typeof eventType !== "string" || eventType.length === 0) return;
  const { appName } = window.NRVIDEO.info;

  const eventObject = {
    ...attributes,
    eventType,
    appName,
    timestamp: Date.now(),
  };
  customEventAggregator.add(eventObject);
}
