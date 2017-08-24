#!/usr/bin/env node
'use strict';
const Dockerode = require('dockerode');
const Logr = require('logr');
const async = require('async');
const modifyLater = require('later-timezone').timezone;

const argv = require('yargs')
.option('d', {
  description: 'containers more than this number of days old will be purged',
  default: 1,
  type: 'number',
  alias: 'days'
})
.option('i', {
  description: 'interval of time at which to rerun the script, see https://bunkat.github.io/later/ for syntax ',
  type: 'string',
  default: 'at 12:00am',
  alias: 'interval'
})
.option('z', {
  description: 'current timezone in which interval takes place',
  default: 'America/Los_Angeles',
  type: 'string',
  alias: 'timezone'
})
.option('r', {
  description: 'immediately purge docker instances instead of scheduling',
  default: false,
  type: 'boolean',
  alias: 'runNow'
})
.option('s', {
  description: 'swarm mode, when purging a container will also purge any docker services in its swarm',
  type: 'boolean',
  default: false,
  alias: 'swarm'
})
.option('I', {
  description: 'only remove containers matching this (using JS RegEx notation) ',
  default: false,
  alias: 'include'
})
.option('e', {
  description: 'do not remove containers matching this (using JS RegEx notation) ',
  default: false,
  alias: 'exclude'
})
.help('h', 'help')
.argv;

const later = require('later');
modifyLater(later, argv.timezone);

const colors = {
  start: 'bgGreen',
  stop: 'bgRed'
};

const logOptions = {
  reporters: {
    flat: {
      reporter: require('logr-flat'),
      options: {
        timestamp: false,
        appColor: true,
        colors
      }
    }
  }
};

const log = Logr.createLogger(logOptions);
log(`will halt all docker instances older than ${argv.days} days at ${argv.interval}, ${argv.timezone} timezone`);

const docker = new Dockerode();

const expirationLimit = argv.days * 24 * 60 * 60;
const isExpired = (containerCreated) => containerCreated > expirationLimit;

const nameMatches = (argv, name) => {
  if (argv.exclude) {
    const match = name.match(argv.exclude);
    if (match) {
      return false;
    }
  }
  if (argv.include) {
    const match = name.match(argv.include);
    if (!match) {
      return false;
    }
  }
  return true;
};

const needsRemoval = (argv, name, created) => {
  return isExpired(created) && nameMatches(argv, name);
};

const getServices = require('./lib/services.js').getServices;
const removeService = require('./lib/services.js').removeService;
const getContainers = require('./lib/containers.js').getContainers;
const removeContainer = require('./lib/containers.js').removeContainer;

const purge = (argv) => {
  log(`Purging outstanding docker containers at ${new Date()}`);
  const fetcher = argv.swarm ? getServices : getContainers;
  const remover = argv.swarm ? removeService : removeContainer;
  async.autoInject({
    fetch(done) {
      fetcher(docker, done);
    },
    filter(fetch, done) {
      const allItems = [];
      fetch.forEach((fetchedItem) => {
        if (needsRemoval(argv, fetchedItem.name, fetchedItem.created)) {
          allItems.push(fetchedItem);
        }
      });
      done(null, allItems);
    },
    remove(filter, done) {
      async.eachSeries(filter, (item, eachDone) => {
        remover(log, item, eachDone);
      }, done);
    },
  }, (err) => {
    if (err) {
      log(err);
    }
  });
};
    //   async.eachSeries(expiredServices, (expired, eachDone) => {
    //   }, done);
    // },
    //
    // // once services are removed, kill relevant containers:
    // expired(list, done) {
    //   const expiredContainers = [];
    //   for (let i = 0; i < list.length; i++) {
    //     const containerInfo = list[i];
    //     if (isExpired(expirationLimit, containerInfo.Created)) {
    //       expiredContainers.push(containerInfo);
    //     }
    //   }
    //   return done(null, expiredContainers);
    // },
    // stop(containers, done) {
    //   async.eachSeries(containers, (container, eachDone) => {
    //     container.stop((err) => {
    //       if (err) {
    //         log(err);
    //       }
    //       log(['stopped'], { id: container.Name });
    //       eachDone();
    //     });
    //   }, done);
    // },
    // remove(stop, containers, done) {
    //   async.eachSeries(containers, (container, eachDone) => {
    //     container.remove((err) => {
    //       if (err) {
    //         log(err);
    //       }
    //       log(['removed'], { id: container.Name });
    //       eachDone();
    //     });
    //   }, done);
    // }


if (argv.runNow) {
  purge(argv);
} else {
  later.setInterval(() => {
    purge(argv);
  }, later.parse.text(argv.interval));
}
