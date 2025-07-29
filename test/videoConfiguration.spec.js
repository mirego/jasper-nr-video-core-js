import { VideoConfiguration, setVideoConfig, getVideoConfig, isFeatureEnabled } from "../src/videoConfiguration";
import chai from "chai";
import sinon from "sinon";

const expect = chai.expect;

describe("VideoConfiguration", () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    // Reset global state
    delete window.NRVIDEO;
  });

  afterEach(() => {
    sandbox.restore();
    delete window.NRVIDEO;
  });

  describe("setVideoConfig", () => {
    it("should set basic configuration successfully", () => {
      const config = {
        licenseKey: "test-license",
        appName: "test-app",
        region: "US"
      };

      const result = setVideoConfig(config);
      expect(result).to.be.true;
      expect(window.NRVIDEO.info.licenseKey).to.equal("test-license");
      expect(window.NRVIDEO.info.appName).to.equal("test-app");
    });

    it("should reject configuration without license key", () => {
      const config = {
        appName: "test-app",
        region: "US"
      };

      const result = setVideoConfig(config);
      expect(result).to.be.false;
    });

    it("should reject configuration with invalid region", () => {
      const config = {
        licenseKey: "test-license",
        appName: "test-app",
        region: "INVALID"
      };

      const result = setVideoConfig(config);
      expect(result).to.be.false;
    });

    it("should merge video analytics configuration", () => {
      const config = {
        licenseKey: "test-license",
        appName: "test-app",
        region: "US",
        videoAnalytics: {
          harvestCycleInMs: 15000,
          features: {
            priorityEventBuffer: false
          }
        }
      };

      const result = setVideoConfig(config);
      expect(result).to.be.true;
      
      const fullConfig = getVideoConfig();
      expect(fullConfig.videoAnalytics.harvestCycleInMs).to.equal(15000);
      expect(fullConfig.videoAnalytics.features.priorityEventBuffer).to.be.false;
    });
  });

  describe("isFeatureEnabled", () => {
    it("should return correct feature status", () => {
      setVideoConfig({
        licenseKey: "test-license",
        appName: "test-app",
        region: "US",
        videoAnalytics: {
          features: {
            priorityEventBuffer: true,
            deadLetterHandling: false
          }
        }
      });

      expect(isFeatureEnabled("priorityEventBuffer")).to.be.true;
      expect(isFeatureEnabled("deadLetterHandling")).to.be.false;
      expect(isFeatureEnabled("nonExistentFeature")).to.be.false;
    });
  });

  describe("configuration validation", () => {
    it("should validate harvest cycle limits", () => {
      const config = {
        licenseKey: "test-license",
        appName: "test-app",
        region: "US",
        videoAnalytics: {
          harvestCycleInMs: 500 // Too low
        }
      };

      const result = setVideoConfig(config);
      expect(result).to.be.false;
    });

    it("should validate max events per batch", () => {
      const config = {
        licenseKey: "test-license",
        appName: "test-app",
        region: "US",
        videoAnalytics: {
          maxEventsPerBatch: 15000 // Too high
        }
      };

      const result = setVideoConfig(config);
      expect(result).to.be.false;
    });
  });
});
