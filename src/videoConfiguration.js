import Constants from "./constants";
import Log from "./log";

const { COLLECTOR } = Constants;

/**
 * Enhanced video analytics configuration system that extends the existing auth configuration.
 * Provides feature flags, retry policies, and advanced harvesting options.
 */
class VideoConfiguration {
  constructor() {
    this.defaultConfig = {
      // Existing auth configuration
      licenseKey: null,
      appName: null,
      region: "US",
      beacon: null,
      applicationID: null,
      sa: null,

      // Enhanced video analytics configuration
      videoAnalytics: {
        enabled: true,
        harvestCycleInMs: 10000,
        maxEventsPerBatch: 1000,
        maxPayloadSize: 1000000, // 1MB
        maxBeaconSize: 60000, // 60KB for sendBeacon
        priorityBufferSize: 100,
        deadLetterMaxRetries: 3,
        deadLetterRetryDelayMs: 5000,
        compressionEnabled: false,
        debugMode: false,
        
        // Feature flags
        features: {
          priorityEventBuffer: true,
          deadLetterHandling: true,
          adaptiveHarvesting: true,
          performanceMonitoring: true,
          offlineSupport: false
        },

        // HTTP client configuration
        httpClient: {
          timeout: 30000,
          retryPolicy: {
            maxRetries: 3,
            backoffMultiplier: 2,
            initialDelayMs: 1000,
            maxDelayMs: 30000
          },
          headers: {
            'Content-Type': 'text/plain',
            'User-Agent': 'NewRelic-VideoCore-JS'
          }
        },

        // Event processing configuration
        eventProcessing: {
          enableBatching: true,
          enableCompression: false,
          enableDeduplication: true,
          maxQueueSize: 5000,
          flushOnPageHide: true
        }
      }
    };

    this.config = { ...this.defaultConfig };
  }

  /**
   * Validates and sets the video analytics configuration.
   * @param {object} userConfig - User provided configuration
   * @returns {boolean} True if configuration is valid and set
   */
  setConfiguration(userConfig) {
    try {
      if (!this.validateConfiguration(userConfig)) {
        throw new Error("Invalid video analytics configuration provided");
      }

      // Merge user config with defaults
      this.config = this.mergeConfigurations(this.defaultConfig, userConfig);
      
      // Set global configuration
      this.initializeGlobalConfig();
      
      Log.info("Video analytics configuration initialized successfully");
      return true;
    } catch (error) {
      Log.error("Failed to set video analytics configuration:", error.message);
      return false;
    }
  }

  /**
   * Validates the provided configuration object.
   * @param {object} config - Configuration to validate
   * @returns {boolean} True if valid
   */
  validateConfiguration(config) {
    if (!config || typeof config !== 'object') {
      Log.error("Configuration must be an object");
      return false;
    }

    // Validate required fields
    const { licenseKey, appName, region, applicationID, beacon } = config;
    
    if (!licenseKey) {
      Log.error("licenseKey is required");
      return false;
    }

    if (applicationID) {
      if (!beacon) {
        Log.error("beacon is required when applicationID is provided");
        return false;
      }
    } else {
      if (!appName || !region) {
        Log.error("appName and region are required when applicationID is not provided");
        return false;
      }
      
      if (region && !COLLECTOR[region]) {
        Log.error(`Invalid region: ${region}. Valid regions are: ${Object.keys(COLLECTOR).join(', ')}`);
        return false;
      }
    }

    // Validate video analytics specific configuration
    if (config.videoAnalytics) {
      if (!this.validateVideoAnalyticsConfig(config.videoAnalytics)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validates video analytics specific configuration.
   * @param {object} videoConfig - Video analytics configuration
   * @returns {boolean} True if valid
   */
  validateVideoAnalyticsConfig(videoConfig) {
    const { harvestCycleInMs, maxEventsPerBatch, maxPayloadSize } = videoConfig;

    if (harvestCycleInMs && (harvestCycleInMs < 1000 || harvestCycleInMs > 300000)) {
      Log.error("harvestCycleInMs must be between 1000ms and 300000ms");
      return false;
    }

    if (maxEventsPerBatch && (maxEventsPerBatch < 1 || maxEventsPerBatch > 10000)) {
      Log.error("maxEventsPerBatch must be between 1 and 10000");
      return false;
    }

    if (maxPayloadSize && (maxPayloadSize < 1000 || maxPayloadSize > 10000000)) {
      Log.error("maxPayloadSize must be between 1KB and 10MB");
      return false;
    }

    return true;
  }

  /**
   * Deep merges two configuration objects.
   * @param {object} defaults - Default configuration
   * @param {object} userConfig - User configuration
   * @returns {object} Merged configuration
   */
  mergeConfigurations(defaults, userConfig) {
    const result = { ...defaults };

    for (const key in userConfig) {
      if (userConfig.hasOwnProperty(key)) {
        if (typeof userConfig[key] === 'object' && userConfig[key] !== null && !Array.isArray(userConfig[key])) {
          result[key] = this.mergeConfigurations(defaults[key] || {}, userConfig[key]);
        } else {
          result[key] = userConfig[key];
        }
      }
    }

    return result;
  }

  /**
   * Initializes the global NRVIDEO configuration object.
   */
  initializeGlobalConfig() {
    window.NRVIDEO = window.NRVIDEO || {};
    
    const { licenseKey, appName, region, beacon, applicationID, sa } = this.config;
    
    // Set existing format for backward compatibility
    window.NRVIDEO.info = {
      beacon: beacon || COLLECTOR[region],
      licenseKey,
      applicationID,
      appName,
      sa
    };

    // Set enhanced configuration
    window.NRVIDEO.config = this.config;
  }

  /**
   * Gets the current configuration.
   * @returns {object} Current configuration
   */
  getConfiguration() {
    return { ...this.config };
  }

  /**
   * Gets a specific configuration value.
   * @param {string} path - Dot notation path to the configuration value
   * @returns {any} Configuration value
   */
  get(path) {
    return this.getNestedValue(this.config, path);
  }

  /**
   * Sets a specific configuration value.
   * @param {string} path - Dot notation path to the configuration value
   * @param {any} value - Value to set
   */
  set(path, value) {
    this.setNestedValue(this.config, path, value);
    this.initializeGlobalConfig();
  }

  /**
   * Gets a nested value from an object using dot notation.
   * @param {object} obj - Object to get value from
   * @param {string} path - Dot notation path
   * @returns {any} Value at path
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current && current[key], obj);
  }

  /**
   * Sets a nested value in an object using dot notation.
   * @param {object} obj - Object to set value in
   * @param {string} path - Dot notation path
   * @param {any} value - Value to set
   */
  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => current[key] = current[key] || {}, obj);
    target[lastKey] = value;
  }

  /**
   * Checks if a feature is enabled.
   * @param {string} featureName - Name of the feature
   * @returns {boolean} True if feature is enabled
   */
  isFeatureEnabled(featureName) {
    return this.get(`videoAnalytics.features.${featureName}`) === true;
  }

  /**
   * Enables or disables a feature.
   * @param {string} featureName - Name of the feature
   * @param {boolean} enabled - Whether to enable the feature
   */
  setFeature(featureName, enabled) {
    this.set(`videoAnalytics.features.${featureName}`, enabled);
  }
}

// Create singleton instance
const videoConfiguration = new VideoConfiguration();

/**
 * Sets the video analytics configuration.
 * @param {object} config - Configuration object
 * @returns {boolean} True if configuration was set successfully
 */
export function setVideoConfig(config) {
  return videoConfiguration.setConfiguration(config);
}

/**
 * Gets the current video analytics configuration.
 * @returns {object} Current configuration
 */
export function getVideoConfig() {
  return videoConfiguration.getConfiguration();
}

/**
 * Gets a specific configuration value.
 * @param {string} path - Dot notation path to the configuration value
 * @returns {any} Configuration value
 */
export function getConfigValue(path) {
  return videoConfiguration.get(path);
}

/**
 * Sets a specific configuration value.
 * @param {string} path - Dot notation path to the configuration value
 * @param {any} value - Value to set
 */
export function setConfigValue(path, value) {
  videoConfiguration.set(path, value);
}

/**
 * Checks if a feature is enabled.
 * @param {string} featureName - Name of the feature
 * @returns {boolean} True if feature is enabled
 */
export function isFeatureEnabled(featureName) {
  return videoConfiguration.isFeatureEnabled(featureName);
}

/**
 * Enables or disables a feature.
 * @param {string} featureName - Name of the feature
 * @param {boolean} enabled - Whether to enable the feature
 */
export function setFeature(featureName, enabled) {
  videoConfiguration.setFeature(featureName, enabled);
}

export { videoConfiguration };
export default VideoConfiguration;
