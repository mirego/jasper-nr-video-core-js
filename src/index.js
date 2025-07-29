import Core from "./core";
import Constants from "./constants";
import Chrono from "./chrono";
import Log from "./log";
import Emitter from "./emitter";
import Tracker from "./tracker";
import VideoTracker from "./videotracker";
import VideoTrackerState from "./videotrackerstate";
import { videoConfiguration, setVideoConfig, getVideoConfig, isFeatureEnabled } from "./videoConfiguration";
import { PriorityEventBuffer } from "./priorityEventBuffer";
import { DeadLetterHandler } from "./deadLetterHandler";
import { OptimizedHttpClient } from "./optimizedHttpClient";
import { HarvestScheduler } from "./harvestScheduler";
import { recordEvent, recordCustomVideoEvent } from "./recordEvent";
import { version } from "../package.json";

const nrvideo = {
  // Core components (existing)
  Constants,
  Chrono,
  Log,
  Emitter,
  Tracker,
  VideoTracker,
  VideoTrackerState,
  Core,
  version,

  // Enhanced video analytics components (new)
  VideoConfiguration: videoConfiguration,
  PriorityEventBuffer,
  DeadLetterHandler,
  OptimizedHttpClient,
  HarvestScheduler,

  // Configuration utilities
  setVideoConfig,
  getVideoConfig,
  isFeatureEnabled,

  // Enhanced event recording
  recordEvent,
  recordCustomVideoEvent,

  // Convenience methods for backward compatibility
  setConfig: setVideoConfig,
  getConfig: getVideoConfig,
  
  // Performance and monitoring
  getMetrics: () => Core.getMetrics(),
  forceHarvest: () => Core.forceHarvest(),
};

export default nrvideo;
