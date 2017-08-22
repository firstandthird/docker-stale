#!/usr/bin/env node
'use strict';
const Dockerode = require('dockerode');
const Logr = require('logr');
const logrFlat = require('logr-flat');

const verboseMode = process.env.VERBOSE === '1';
const docker1 = new Docker();
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
