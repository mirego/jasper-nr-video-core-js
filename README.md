[![Community Project header](https://github.com/newrelic/open-source-office/raw/master/examples/categories/images/Community_Project.png)](https://github.com/newrelic/open-source-office/blob/master/examples/categories/index.md#community-project)

# New Relic Video Core - JavaScript

> **⚠️ BETA VERSION NOTICE**  
> This version is currently in **beta phase** and is under active development. Features and APIs may change without notice. Use with caution in production environments and expect potential breaking changes in future releases.

The New Relic video tracking core library is the base for all video trackers in the browser platform. It contains the classes and core mechanisms used by the player specific trackers.
It segregates the events into different event types based on action, such as video-related events going to `VideoAction`, ad-related events to `VideoAdAction`, errors to `VideoErrorAction`, and custom actions to `VideoCustomAction`.

## Build

Install dependencies:

```
$ npm install
```

And build:

```
$ npm run build:dev
```

Or if you need a production build:

```
$ npm run build
```

## Usage

Add **scripts** inside `dist` folder to your page.

> If you want to know how to generate `dist` folder, refer to **npm commands** section.

### Registering Trackers

`nrvideo` provides a class called `VideoTracker` that will serve as an interface with
_Browser Agent_, allowing you to manage and send events to New Relic.

First, configure the authentication options and initialize a tracker:

```javascript
const options = {
  info: {
    beacon: "your-beacon-url.nr-data.net",
    errorBeacon: "your-beacon-url.nr-data.net",
    licenseKey: "your-license-key",
    applicationID: "your-application-id",
    sa: 1,
  },
};

const tracker = new VideoTracker(player, options);
```

Once the tracker is added, any event it emits will be sent to New Relic and processed by the following functions:

```javascript
tracker.sendVideoAction("VideoEvent", { data: 1 });
tracker.sendVideoAdAction("AdEvent", { data: "test-1" });
tracker.sendVideoErrorAction("ErrorEvent", { data: "error-test" });
tracker.sendVideoCustomAction("CustomEvent", { data: "custom-test" });
```

## Data Model

To understand which actions and attributes are captured and emitted by the tracker under different event types, see [DataModel.md](DATAMODEL.md).

## Documentation

All classes are documented using autodocs. The documents, generated with [jsdoc](https://github.com/jsdoc/jsdoc), can be found in the `documentation` directory of the current repo.

# Support

New Relic has open-sourced this project. This project is provided AS-IS WITHOUT WARRANTY OR DEDICATED SUPPORT. Issues and contributions should be reported to the project here on GitHub.

We encourage you to bring your experiences and questions to the [Explorers Hub](https://discuss.newrelic.com) where our community members collaborate on solutions and new ideas.

## Community

New Relic hosts and moderates an online forum where customers can interact with New Relic employees as well as other customers to get help and share best practices. Like all official New Relic open source projects, there's a related Community topic in the New Relic Explorers Hub. You can find this project's topic/threads here:

https://discuss.newrelic.com/t/video-core-js-tracker/100303

## Issues / enhancement requests

Issues and enhancement requests can be submitted in the [Issues tab of this repository](../../issues). Please search for and review the existing open issues before submitting a new issue.

# Contributing

Contributions are encouraged! If you submit an enhancement request, we'll invite you to contribute the change yourself. Please review our [Contributors Guide](CONTRIBUTING.md).

Keep in mind that when you submit your pull request, you'll need to sign the CLA via the click-through using CLA-Assistant. If you'd like to execute our corporate CLA, or if you have any questions, please drop us an email at opensource+videoagent@newrelic.com.

# License

This project is distributed under the [Apache 2.0](https://apache.org/licenses/LICENSE-2.0.txt) License.

The video-core also uses source code from third-party libraries. Full details on which libraries are used and the terms under which they are licensed can be found in the [third-party notices document](THIRD_PARTY_NOTICES.md).
