import Constants from "./constants";
import pkg from "../package.json";
import { callApi, getPayloadSize } from "./utils";

const { INTERVAL, MAX_EVENTS_PER_BATCH, MAX_PAYLOAD_SIZE, MAX_BEACON_SIZE } =
  Constants;

/**
 * A scheduler and dispatcher for sending raw event data to the New Relic 'ins' endpoint.
 * It manages the harvest cycle, URL construction, and retries.
 */
export class NRVideoHarvester {
  #started = false;
  #aggregate; // EventAggregator instance
  #timerId = null; // Timer ID for cleanup

  /**
   * @param {object} agentController - The agent's configuration object.
   * @param {object} aggregate - The aggregator instance (e.g., EventAggregator).
   */
  constructor(aggregate) {
    this.#aggregate = aggregate;
    // Ensure any queued data is sent when the user navigates away.
    window.addEventListener("pagehide", () =>
      this.triggerHarvest({ isFinalHarvest: true })
    );
  }

  /**
   * Starts the periodic harvest timer.
   */
  startTimer() {
    if (this.#started) return;
    this.#started = true;
    const onHarvestInterval = () => {
      this.triggerHarvest({});
      if (this.#started) {
        this.#timerId = setTimeout(onHarvestInterval, INTERVAL);
      }
    };
    this.#timerId = setTimeout(onHarvestInterval, INTERVAL);
  }

  /**
   * Stops the harvest timer and cleans up resources.
   */
  stopTimer() {
    this.#started = false;
    if (this.#timerId) {
      clearTimeout(this.#timerId);
      this.#timerId = null;
    }
  }

  /**
   * Executes a harvest cycle by draining the queue and sending it in chunks.
   */

  triggerHarvest(options = {}) {
    if (this.#aggregate.isEmpty()) return;

    try {
      // 1. Drain the entire queue to get all pending events.
      const allEvents = this.#aggregate.drain();

      // 2. Determine the correct size limit for this harvest.
      const maxChunkSize = options.isFinalHarvest
        ? MAX_BEACON_SIZE
        : MAX_PAYLOAD_SIZE;

      // 3. Split the events into chunks that respect size and count limits.
      const chunks = this.chunkEvents(allEvents, maxChunkSize);

      // 4. Send each chunk sequentially.
      chunks.forEach((chunk, index) => {
        const isLastChunk = index === chunks.length - 1;
        this.sendChunk(chunk, options, isLastChunk);
      });
    } catch (error) {
      console.error("Error during harvest:", error);
      // Re-add events to the queue if something went wrong
      // This is a failsafe to prevent data loss
    }
  }

  /**
   * Splits an array of events into multiple smaller arrays (chunks).
   */
  chunkEvents(events, maxChunkSize) {
    const chunks = [];
    let currentChunk = [];

    for (const event of events) {
      if (currentChunk.length >= MAX_EVENTS_PER_BATCH) {
        chunks.push(currentChunk);
        currentChunk = [];
      }

      currentChunk.push(event);
      const payloadSize = getPayloadSize({ ins: currentChunk });
      // Use the maxChunkSize passed into the function
      if (payloadSize > maxChunkSize) {
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

    return chunks;
  }

  /**
   * Sends a single chunk of events.
   */
  sendChunk(chunk, options, isLastChunk) {
    const url = this.#buildUrl();
    if (!url) {
      // If URL construction failed, treat as a failed request that shouldn't be retried
      this.#aggregate.postHarvestCleanup({ retry: false, status: 0 });
      return;
    }

    const payload = { body: { ins: chunk } };

    callApi(
      {
        url: url,
        payload: payload,
        options: options,
      },
      (result) => {
        // Pass the failed chunk back to the aggregator for re-queuing.
        if (result.retry) {
          result.chunk = chunk;
        }
        this.#aggregate.postHarvestCleanup(result);
      }
    );
  }

  /**
   * Constructs the specific URL for the New Relic 'ins' endpoint with all required parameters.
   * @private
   */

  #buildUrl() {
    try {
      if (!window.NRVIDEO || !window.NRVIDEO.info) {
        throw new Error("NRVIDEO info is not available.");
      }

      const { beacon, licenseKey, applicationID, sa } = window.NRVIDEO.info;

      if (!beacon || !licenseKey || !applicationID)
        throw new Error(
          "Options object provided by New Relic is not correctly initialized"
        );
      const url = `https://${beacon}/ins/1/${licenseKey}?a=${applicationID}&v=${pkg.version}&ref=${window.location.href}&ca=VA`;
      return url;
    } catch (error) {
      console.error(error.message);
      return null; // Return null instead of undefined
    }
  }
}
