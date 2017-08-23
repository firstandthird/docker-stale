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
const isExpired = (expirationCutoff, containerCreated) => new Date().getTime() - (containerCreated * 1000) > expirationCutoff;

const docker = new Dockerode();

const purge = (argv) => {
  log(`Purging outstanding docker containers at ${new Date()}`);
  const expirationLimit = argv.days * 24 * 60 * 60 * 1000;

  async.autoInject({
    // in swarm mode, all services are part of the swarm and should be killed first:
    services(done) {
      if (!argv.swarm) {
        return done();
      }
      docker.listServices(done);
    },
    expiredServices(services, done) {
      if (!argv.swarm) {
        return done();
      }
      const expiredServices = [];
      services.forEach((serviceInfo) => {
        const serviceCreated = (new Date().getTime() - new Date(serviceInfo.CreatedAt).getTime()) / 1000;
        if (isExpired(expirationLimit, serviceCreated)) {
          expiredServices.push(docker.getService(serviceInfo.ID));
        }
      });
      return done(null, expiredServices);
    },
    removeServices(expiredServices, done) {
      if (!argv.swarm) {
        return done();
      }
      async.eachSeries(expiredServices, (expired, eachDone) => {
        expired.remove((err) => {
          if (err) {
            log(err);
          }
          log(['removed'], { id: expired.Name });
          eachDone();
        });
      }, done);
    },

    // once services are removed, kill relevant containers:
    list(done) {
      docker.listContainers(done);
    },
    expired(list, done) {
      const expiredContainers = [];
      for (let i = 0; i < list.length; i++) {
        const containerInfo = list[i];
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
        if (argv.exclude) {
          for (let i = 0; i < containerInfo.Names.length; i++) {
            const name = containerInfo.Names[i];
            const match = name.match(argv.exclude);
            if (match) {
              return;
            }
          }
        }
        if (argv.include) {
          for (let i = 0; i < containerInfo.Names.length; i++) {
            const name = containerInfo.Names[i];
            const match = name.match(argv.include);
            if (!match) {
              return;
            }
          }
        }
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
