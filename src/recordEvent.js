import { customEventAggregator } from "./agent.js";

export function recordEvent(eventType, attributes = {}) {
  const events = [
    "VideoAction",
    "VideoAdAction",
    "VideoErrorAction",
    "VideoCustomAction",
  ];
  if (
    typeof eventType !== "string" ||
    eventType.length === 0 ||
    !events.includes(eventType)
  )
    return;
  const { appName } = window.NRVIDEO.info;

  const eventObject = {
    ...attributes,
    eventType,
    appName,
    timestamp: Date.now(),
  };
  customEventAggregator.add(eventObject);
}
