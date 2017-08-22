#!/usr/bin/env node
'use strict';
const Dockerode = require('dockerode');
const Logr = require('logr');
const logrFlat = require('logr-flat');
const async = require('async');

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
const expirationLimit = process.argv[2] * 24 * 60 * 60 * 1000;
log(`will halt all docker instances older than ${process.argv[2]} days`);

const isExpired = (expirationCutoff, containerInfo) => {
  return new Date().getTime() - containerInfo.Created > expirationCutoff;
};

const docker = new Dockerode();

async.autoInject({
  list(done) {
    docker.listContainers(done);
  },
  expired(list, done) {
    const expiredContainers = [];
    for (var i = 0; i < list.length; i++) {
      const containerInfo = list[i];
      if (isExpired(expirationLimit, containerInfo)) {
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
