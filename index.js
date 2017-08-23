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
const isExpired = (expirationCutoff, containerCreated) => new Date().getTime() - (containerCreated * 1000) > expirationCutoff;

const docker = new Dockerode();

const purge = (argv) => {
  log(`Purging outstanding docker containers at ${new Date()}`);
  async.autoInject({
    list(done) {
      docker.listContainers(done);
    },
    expired(list, done) {
      const expiredContainers = [];
      for (let i = 0; i < list.length; i++) {
        const containerInfo = list[i];
        const expirationLimit = argv.days * 24 * 60 * 60 * 1000;
        if (isExpired(expirationLimit, containerInfo.Created)) {
          expiredContainers.push(containerInfo);
        }
      }
      return done(null, expiredContainers);
    },
    containers(expired, done) {
      const allContainers = [];
      expired.forEach((containerInfo) => {
        const container = docker.getContainer(containerInfo.Id);
        container.Name = containerInfo.Names;
        allContainers.push(container);
      });
      return done(null, allContainers);
    },
    stop(containers, done) {
      async.eachSeries(containers, (container, eachDone) => {
        container.stop((err) => {
          if (err) {
            log(err);
          }
          log(['stopped'], { id: container.Name });
          eachDone();
        });
      }, done);
    },
    remove(stop, containers, done) {
      async.eachSeries(containers, (container, eachDone) => {
        container.remove((err) => {
          if (err) {
            log(err);
          }
          log(['removed'], { id: container.Name });
          eachDone();
        });
      }, done);
    }
  }, (err) => {
    if (err) {
      log(err);
    }
  });
};
if (argv.runNow) {
  purge(argv);
} else {
  later.setInterval(() => {
    purge(argv);
  }, later.parse.text(argv.interval));
}
