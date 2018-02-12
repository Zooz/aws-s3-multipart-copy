'use strict';

var bunyan = require('bunyan'),
    sinon = require('sinon'),
    should = require('should'),
    s3LargeCopyClient = require('../../src/large-object-copy'),
    // rewire = require('rewire'),
    AWS = require('aws-sdk'),
    // uuid = require('uuid'),
    pkginfo = require('pkginfo')(module, 'version'),
    _ = require('lodash'),
    APP_VERSION = module.exports.version,
    logger = bunyan.createLogger({
        name: 'reports-delivery',
        level: process.env.LOG_LEVEL || 'info',
        version: APP_VERSION,
        logType: 'reports-delivery-log',
        serializers: { err: bunyan.stdSerializers.err }
    });