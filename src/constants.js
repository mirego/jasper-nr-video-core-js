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
Constants.MAX_EVENTS_PER_BATCH = 1000;
Constants.MAX_PAYLOAD_SIZE = 1; // 1mb
Constants.MAX_BEACON_SIZE = 0.0625; // 64kb
Constants.MAX_EVENT_SIZE = 0.0625; // 64kb
Constants.VALID_EVENT_TYPES = [
  "VideoAction",
  "VideoAdAction",
  "VideoErrorAction",
  "VideoCustomAction",
];

Constants.COLLECTOR = {
  US: "bam-cell.nr-data.net",
  EU: "bam.eu01.nr-data.net",
  Stage: "staging-bam-cell.nr-data.net",
  GOV: "gov-bam.nr-data.net",
};

// "bam.nr-data.net",

export default Constants;
