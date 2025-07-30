import Constants from "./constants";

const { COLLECTOR } = Constants;

/**
 * Validates and initializes New Relic video tracking information.
 * @param {object} info - The options object containing authentication information.
 * @param {string} info.licenseKey - The New Relic license key.
 * @param {string} [info.appName] - The name of the application (required if no applicationID).
 * @param {string} [info.region] - The region for the New Relic collector (required if no beacon).
 * @param {string} [info.beacon] - Custom beacon URL (optional, overrides region-based beacon).
 * @param {string} [info.sa] - Security attributes (optional).
 * @param {string} [info.applicationID] - Application ID for beacon-based configuration (optional).
 * @returns {boolean} True if configuration was set successfully, false otherwise.
 * @throws {Error} Throws error for invalid configuration parameters.
 */
export function setAuthConfig(info) {
  try {
    // Input validation
    if (!info || typeof info !== "object" || Array.isArray(info)) {
      throw new Error("setAuthConfig: info parameter must be a valid object");
    }

    if (isAuthorised(info)) {
      const { licenseKey, appName, region, beacon, sa, applicationID } = info;

      // Initialize NRVIDEO global object
      window.NRVIDEO = window.NRVIDEO || {};

      // Determine beacon URL with fallback
      let beaconUrl = beacon;
      if (!beaconUrl && region) {
        if (!COLLECTOR[region]) {
          throw new Error(
            `setAuthConfig: Invalid region '${region}'. Valid regions: ${Object.keys(
              COLLECTOR
            ).join(", ")}`
          );
        }
        beaconUrl = COLLECTOR[region];
      }

      window.NRVIDEO.info = {
        beacon: beaconUrl,
        licenseKey,
        applicationID: applicationID || null,
        appName: appName || null,
        sa: sa || 0,
      };

      return true;
    } else {
      const validationError = getValidationError(info);
      throw new Error(`setAuthConfig: ${validationError}`);
    }
  } catch (error) {
    console.error("setAuthConfig:", error.message);
    return false;
  }
}

/**
 * Checks if the provided information contains valid authentication parameters.
 * @param {object} info - The options object.
 * @returns {boolean} True if authorized, false otherwise.
 */
function isAuthorised(info) {
  if (!info || typeof info !== "object") {
    return false;
  }

  const { licenseKey, appName, region, applicationID, beacon } = info;

  // License key is always required
  if (
    !licenseKey ||
    typeof licenseKey !== "string" ||
    licenseKey.trim().length === 0
  ) {
    return false;
  }

  // Two valid configuration modes:
  // 1. applicationID + beacon (for direct beacon configuration)
  // 2. appName + region (for region-based beacon resolution)
  if (applicationID) {
    return !!(beacon && typeof beacon === "string" && beacon.trim().length > 0);
  }

  return !!(
    appName &&
    typeof appName === "string" &&
    appName.trim().length > 0 &&
    region &&
    typeof region === "string" &&
    region.trim().length > 0
  );
}

/**
 * Provides detailed validation error message for debugging.
 * @param {object} info - The options object.
 * @returns {string} Detailed error message.
 */
function getValidationError(info) {
  if (!info || typeof info !== "object") {
    return "info parameter must be a valid object";
  }

  const { licenseKey, appName, region, applicationID, beacon } = info;

  if (
    !licenseKey ||
    typeof licenseKey !== "string" ||
    licenseKey.trim().length === 0
  ) {
    return "licenseKey is required and must be a non-empty string";
  }

  if (applicationID) {
    if (!beacon || typeof beacon !== "string" || beacon.trim().length === 0) {
      return "beacon URL is required when using applicationID";
    }
  } else {
    if (
      !appName ||
      typeof appName !== "string" ||
      appName.trim().length === 0
    ) {
      return "appName is required when not using applicationID";
    }
    if (!region || typeof region !== "string" || region.trim().length === 0) {
      return "region is required when not using applicationID";
    }
  }

  return "configuration validation failed";
}
