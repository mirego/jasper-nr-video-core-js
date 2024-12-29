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

Constants.ACTION_TABLE = [
  {
    actionName: "PLAYER_READY",
    time: 0,
  },
  {
    actionName: "DOWNLOAD",
    time: 0,
  },
  {
    actionName: "CONTENT_REQUEST",
    time: 0,
  },
  {
    actionName: "CONTENT_START",
    time: 0,
  },
  {
    actionName: "CONTENT_END",
    time: 0,
  },
  {
    actionName: "CONTENT_PAUSE",
    time: 0,
  },
  {
    actionName: "CONTENT_RESUME",
    time: 0,
  },
  {
    actionName: "CONTENT_SEEK_START",
    time: 0,
  },
  {
    actionName: "CONTENT_SEEK_END",
    time: 0,
  },
  {
    actionName: "CONTENT_BUFFER_START",
    time: 0,
  },
  {
    actionName: "CONTENT_BUFFER_END",
    time: 0,
  },
  {
    actionName: "CONTENT_ERROR",
    time: 0,
  },
  {
    actionName: "CONTENT_HEARTBEAT",
    time: 0,
  },

  {
    actionName: "CONTENT_RENDITION_CHANGE",
    time: 0,
  },
  {
    actionName: "AD_REQUEST",
    time: 0,
  },
  {
    actionName: "AD_START",
    time: 0,
  },
  {
    actionName: "AD_END",
    time: 0,
  },
  {
    actionName: "AD_SEEK_START",
    time: 0,
  },
  {
    actionName: "AD_SEEK_END",
    time: 0,
  },
  {
    actionName: "AD_PAUSE",
    time: 0,
  },
  {
    actionName: "AD_RESUME",
    time: 0,
  },
  {
    actionName: "AD_BUFFER_START",
    time: 0,
  },
  {
    actionName: "AD_BUFFER_END",
    time: 0,
  },
  {
    actionName: "AD_RENDITION_CHANGE",
    time: 0,
  },
  {
    actionName: "AD_BREAK_START",
    time: 0,
  },
  {
    actionName: "AD_BREAK_END",
    time: 0,
  },
  {
    actionName: "AD_QUARTILE",
    time: 0,
  },
  {
    actionName: "AD_CLICK",
    time: 0,
  },
  {
    actionName: "AD_ERROR",
    time: 0,
  },
  {
    actionName: "AD_HEARTBEAT",
    time: 0,
  },
];

export default Constants;
