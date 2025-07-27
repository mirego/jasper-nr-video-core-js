import Constants from "./constants";

const { COLLECTOR } = Constants;

/**
 * Validates and initializes New Relic video tracking information.
 * @param {object} info - The options object containing licenseKey, appName, and region.
 * @param {string} info.licenseKey - The New Relic license key.
 * @param {string} info.appName - The name of the application.
 * @param {string} info.region - The region for the New Relic collector.
 */

export function setAuthConfig(info) {
  try {
    if (isAuthorised(info)) {
      const { licenseKey, appName, region, beacon, sa, applicationID } = info;
      window.NRVIDEO = window.NRVIDEO || {};
      NRVIDEO.info = {
        beacon: beacon || COLLECTOR[region],
        licenseKey,
        applicationID,
        appName,
        sa,
      };
    } else {
      throw new Error(
        "options object provided by New Relic is not correctly initialised"
      );
    }
  } catch (error) {
    console.error(error.message);
  }
}

/**
 * Checks if the provided information contains valid licenseKey, appName, and region.
 * @param {object} info - The options object.
 * @returns {boolean} True if authorized, false otherwise.
 */

function isAuthorised(info) {
  const { licenseKey, appName, region, applicationID, beacon } = info;
  if (!licenseKey) {
    // Return false, If license key is not available.
    return false;
  }

  if (applicationID) {
    return !!beacon; // Return true if beacon is truthy, false otherwise
  }

  return !!(appName && region); // Return true if both appName and region are truthy
}
