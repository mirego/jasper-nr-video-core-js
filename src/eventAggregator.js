/**
 * A simple aggregator that queues raw events without any statistical aggregation.
 * It includes the necessary save/reload logic for the harvester's retry mechanism.
 */
export class EventAggregator {
  #queue = [];
  #backup = [];

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
    this.save(); // Back up the queue before draining
    const allEvents = this.#queue;
    this.#queue = []; // Clear the active queue
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
   * Creates a temporary backup of the current queue.
   * This is called by the harvester before a send attempt.
   */
  save() {
    this.#backup = [...this.#queue];
  }

  /**
   * Prepares the payload for the harvester.
   * For the 'ins' endpoint, the payload must have a specific structure.
   * @returns {object|null} The payload object for sending, or null if the queue is empty.
   */
  makeHarvestPayload() {
    if (this.#queue.length === 0) {
      return null;
    }
    return {
      body: { ins: this.#queue },
    };
  }

  /**
   * Cleans up the queue after a harvest attempt, based on the result.
   * @param {object} result - The result from the harvester, containing a 'retry' flag.
   */
  postHarvestCleanup(result) {
    if (result.retry && result.chunk) {
      this.#queue = [...result.chunk, ...this.#queue];
    }

    if (result.allChunksSent) {
      this.#backup = [];
    }
  }
}
