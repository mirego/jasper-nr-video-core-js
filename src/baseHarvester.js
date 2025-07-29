import Constants from "./constants";
import pkg from "../package.json";
import { callApi } from "./utils";
import Log from "./log";

const { MAX_EVENTS_PER_BATCH, MAX_PAYLOAD_SIZE, MAX_BEACON_SIZE } = Constants;

/**
 * Base harvester class that provides common functionality for event chunking,
 * URL building, and chunk sending operations.
 */
export class BaseHarvester {
  /**
   * Splits an array of events into multiple smaller arrays (chunks).
   * @param {Array} events - Events to chunk
   * @param {number} maxChunkSize - Maximum size per chunk in bytes
   * @returns {Array} Array of event chunks
   */
  chunkEvents(events, maxChunkSize) {
    const chunks = [];
    let currentChunk = [];

    for (const event of events) {
      // Check if adding this event would exceed event count limit
      if (currentChunk.length >= MAX_EVENTS_PER_BATCH) {
        chunks.push(currentChunk);
        currentChunk = [];
      }

      currentChunk.push(event);
      
      // Check payload size
      const payloadSize = this.calculateChunkSize(currentChunk);

      if (payloadSize > maxChunkSize) {
        // Remove the last event and start a new chunk with it
        const lastEvent = currentChunk.pop();
        
        if (currentChunk.length > 0) {
          chunks.push(currentChunk);
        }
        
        currentChunk = [lastEvent];
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    Log.debug(`Chunked ${events.length} events into ${chunks.length} chunks`, {
      maxChunkSize,
      maxEventsPerChunk: MAX_EVENTS_PER_BATCH
    });

    return chunks;
  }

  /**
   * Calculates the size of a chunk in bytes.
   * @param {Array} chunk - Events chunk
   * @returns {number} Size in bytes
   */
  calculateChunkSize(chunk) {
    const payload = { ins: chunk };
    return new Blob([JSON.stringify(payload)]).size;
  }

  /**
   * Builds the harvest URL with proper query parameters.
   * @returns {string} Harvest URL
   */
  buildHarvestUrl() {
    try {
      const { beacon, licenseKey, applicationID, sa } = window.NRVIDEO?.info || {};
      
      if (!beacon || !licenseKey || !applicationID) {
        throw new Error("Required configuration missing for harvest URL");
      }

      const queryParams = new URLSearchParams({
        a: applicationID,
        sa: sa || 0,
        v: pkg.version,
        t: "Unnamed Transaction",
        rst: Date.now(),
        ck: "0",
        s: 0,
        ref: window.location.href,
        ptid: "",
        ca: "VA"
      });

      return `https://${beacon}/ins/1/${licenseKey}?${queryParams.toString()}`;
    } catch (error) {
      Log.error("Failed to build harvest URL:", error.message);
      throw error;
    }
  }

  /**
   * Sends a chunk of events using the basic callApi utility.
   * This is the legacy implementation used by the original Harvester.
   * @param {Array} chunk - Events to send
   * @param {object} options - Send options
   * @param {Function} callback - Callback for handling response
   */
  sendChunkLegacy(chunk, options, callback) {
    const payload = { body: { ins: chunk } };
    const url = this.buildHarvestUrl();

    callApi(
      {
        url,
        payload,
        options
      },
      (result) => {
        // Pass the failed chunk back for retry handling
        if (result.retry) {
          result.chunk = chunk;
        }
        
        callback(result);
      }
    );
  }

  /**
   * Determines the maximum chunk size based on harvest type.
   * @param {boolean} isFinalHarvest - Whether this is a final harvest
   * @returns {number} Maximum chunk size in bytes
   */
  getMaxChunkSize(isFinalHarvest) {
    return isFinalHarvest ? MAX_BEACON_SIZE : MAX_PAYLOAD_SIZE;
  }
}

export default BaseHarvester;
