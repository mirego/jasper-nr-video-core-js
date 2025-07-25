/**
 * Constants for the library.
 * @class Constants
 * @static
 */
class Constants {}

/**
 * Enum for types/positions of ads.
 * @example var type = Constants.AdPositions.PRE
 * @enum {String}
 */
Constants.AdPositions = {
  /** For ads shown before the content. */
  PRE: "pre",
  /** For ads shown during the content. */
  MID: "mid",
  /** For ads shown after the content. */
  POST: "post",
};

Constants.INTERVAL = 10000;
Constants.MAX_EVENTS_PER_BATCH = 400;
Constants.MAX_PAYLOAD_SIZE = 1000000; // 1mb = 10^6 bytes
Constants.MAX_BEACON_SIZE = 60 * 1000;

Constants.COLLECTOR = {
  US: "bam.nr-data.net",
  EU: "bam.eu01.nr-data.net",
  Stage: "staging-bam-cell.nr-data.net",
  GOV: "gov-bam.nr-data.net",
};

export default Constants;
