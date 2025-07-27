import Constants from "./constants";
const { MAX_EVENTS_PER_BATCH } = Constants;

/**
 * A simple aggregator that queues raw events without any statistical aggregation.
 * It includes the necessary save/reload logic for the harvester's retry mechanism.
 */
export class EventAggregator {
  #queue = [];
  #isRetry = false;

  /**
   * Checks if the event queue is empty.
   * @returns {boolean}
   */
  isEmpty() {
    return this.#queue.length === 0;
  }

  /**
   * Drains the entire queue and returns all events.
   * Called by the harvester to begin the chunking process.
   */
  drain() {
    const allEvents = this.#queue;
    this.#queue = []; // Clear the active queue
    return allEvents;
  }

  /**
   * Adds a complete, enriched event object to the queue.
   * @param {object} eventObject - The event to queue.
   */
  add(eventObject) {
    if (this.#isRetry && this.#queue.length >= MAX_EVENTS_PER_BATCH) {
      this.#queue.shift();
    }
    this.#queue.push(eventObject);
  }

  // --- Methods for the Harvester ---

  /**
   * Cleans up the queue after a harvest attempt, based on the result.
   * @param {object} result - The result from the harvester, containing a 'retry' flag.
   */
  postHarvestCleanup(result) {
    if (result.retry && result.chunk) {
      this.#isRetry = true;
      let retryLength = result.chunk.length;
      for (let i = 0; i < retryLength; i++) {
        const shiftObj = result.chunk.shift();
        this.add(shiftObj);
      }
    } else {
      this.#isRetry = false;
    }
  }
}
