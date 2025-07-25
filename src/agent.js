import { EventAggregator } from "./eventAggregator.js";
import { Harvester } from "./harvester.js";

export const customEventAggregator = new EventAggregator();
const harvester = new Harvester(customEventAggregator);
harvester.startTimer();
