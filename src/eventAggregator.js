import { getPayloadSize } from "./utils";
import Constants from "./constants";
const { MAX_EVENTS_PER_BATCH, MAX_PAYLOAD_SIZE } = Constants;

/**
 * A simple aggregator that queues raw events without any statistical aggregation.
 * It includes the necessary save/reload logic for the harvester's retry mechanism.
 */
export class NRVideoEventAggregator {
  #queue = [];
  #retryQueue = [];

  /**
   * Checks if the event queue is empty.
   * @returns {boolean}
   */
  isEmpty() {
    return this.#queue.length === 0 && this.#retryQueue.length === 0;
  }

  /**
   * Drains the entire queue and returns all events.
   * Called by the harvester to begin the chunking process.
   */
  drain() {
    const allEvents = [...this.#retryQueue, ...this.#queue];
    this.#queue = []; // Clear the active queue
    this.#retryQueue = []; // Clear the retry queue

    return allEvents;
  }

  /**
   * Adds a complete, enriched event object to the queue.
   * @param {object} eventObject - The event to queue.
   */
  add(eventObject) {
    this.#queue.push(eventObject);
  }

  // --- Methods for the Harvester ---

  /**
   * Cleans up the queue after a harvest attempt, based on the result.
   * @param {object} result - The result from the harvester, containing a 'retry' flag.
   */
  postHarvestCleanup(result) {
    if (!result.retry || !result.chunk?.length) {
      this.#retryQueue = [];
      return;
    }

    while (
      this.#retryQueue.length > 0 &&
      (getPayloadSize(this.#retryQueue) + getPayloadSize(result.chunk) >
        MAX_PAYLOAD_SIZE ||
        this.#retryQueue.length + result.chunk.length > MAX_EVENTS_PER_BATCH)
    ) {
      // Removes the oldest item from the retry queue to make space
      this.#retryQueue.shift();
    }

    // Add the entire failed chunk to the retry queue.
    this.#retryQueue.push(...result.chunk); // result.chunk will be never greater than 1mb or 1000
  }
}
