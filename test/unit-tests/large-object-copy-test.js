'use strict';

var bunyan = require('bunyan'),
    sinon = require('sinon'),
    should = require('should'),
    rewire = require('rewire'),
    s3LargeCopyClient = rewire('../../src/large-object-copy'),
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

let sandBox, loggerInfoSpy, loggerErrorSpy, createMultipartUploadStub, uploadPartCopyStub, completeMultipartUploadStub, abortMultipartUploadStub, s3;

describe('AWS S3 multupart copy client unit tests', function () {
    before(() => {
        sandBox = sinon.sandbox.create();
        loggerInfoSpy = sandBox.spy(logger, 'info');
        loggerErrorSpy = sandBox.spy(logger, 'error');
    });

    afterEach(() => {
        sandBox.reset();
    });

    after(() => {
        sandBox.restore();
    });

    describe('Testing init function', function () {
        it('Should pass when given valid s3 and logger objects', function () {
            s3 = new AWS.S3();

            s3LargeCopyClient.init(s3, logger);

            should(loggerInfoSpy.calledOnce).equal(true);
            should(loggerInfoSpy.args[0][0]).eql({ msg: 'S3 client initialized successfuly' });
            should(s3LargeCopyClient.__get__('s3')).equal(s3);
        });

        it('Should throw error when given an invalid s3 object', function () {
            let notS3 = [];
            let expected_error = new Error('Invalid AWS.S3 object recieved');

            try {
                s3LargeCopyClient.init(notS3, logger);
            } catch (err) {
                should(loggerInfoSpy.notCalled).equal(true);
                should(err).eql(expected_error);
            }
        });

        it('Should throw error when s3 object is not passed', function () {
            let expected_error = new Error('Invalid AWS.S3 object recieved');

            try {
                s3LargeCopyClient.init(undefined, logger);
            } catch (err) {
                should(loggerInfoSpy.notCalled).equal(true);
                should(err).eql(expected_error);
            }
        });

        it('Should throw error when given an invalid logger object', function () {
            let notLogger = [];
            let s3 = new AWS.S3();
            let expected_error = new Error('Invalid logger object recieved');

            try {
                s3LargeCopyClient.init(s3, notLogger);
            } catch (err) {
                should(loggerInfoSpy.notCalled).equal(true);
                should(err).eql(expected_error);
            }
        });

        it('Should throw error when logger object is not passed', function () {
            s3 = new AWS.S3();
            let expected_error = new Error('Invalid logger object recieved');

            try {
                s3LargeCopyClient.init(s3, undefined);
            } catch (err) {
                should(loggerInfoSpy.notCalled).equal(true);
                should(err).eql(expected_error);
            }
        });
    });

    describe('Testing copyLargeObject', function () {
        before(() => {
            s3 = new AWS.S3();
            createMultipartUploadStub = sandBox.stub(s3, 'createMultipartUpload');
            uploadPartCopyStub = sandBox.stub(s3, 'uploadPartCopy');
            completeMultipartUploadStub = sandBox.stub(s3, 'completeMultipartUpload');
            abortMultipartUploadStub = sandBox.stub(s3, 'abortMultipartUpload');
        });

        it.skip('Should succeed with mandatory variables passed', function () {
            createMultipartUploadStub.resolves({ UploadId: '1a2b3c4d' });
            uploadPartCopyStub.resolves({
                CopyPartResult: {
                    LastModified: 'LastModified',
                    ETag: '1a1b2s3d2f1e2g3sfsgdsg'
                }
            });
            completeMultipartUploadStub.resolves();

            let options = {
                source_bucket: 'source_bucket',
                object_key: 'object_key',
                destination_bucket: 'destination_bucket',
                copied_object_name: 'copied_object_name',
                object_size: 1700000000,
                copy_part_size_bytes: 50000000,
                copied_object_permissions: 'copied_object_permissions',
                expiration_period: 100000
            }
            let request_context = 'request_context';

            return s3LargeCopyClient.copyLargeObject(options, request_context)
                .then(() => {

                })
        });

        it('Should succeed with all variables passed', function () {

        });
    });
});