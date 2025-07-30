import { NRVideoEventAggregator } from "./eventAggregator.js";
import { NRVideoHarvester } from "./harvester.js";

export const customEventAggregator = new NRVideoEventAggregator();
const harvester = new NRVideoHarvester(customEventAggregator);
harvester.startTimer();
