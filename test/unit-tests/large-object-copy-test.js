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
            s3LargeCopyClient.init(s3, logger);
            loggerInfoSpy.reset();
            createMultipartUploadStub = sandBox.stub(s3, 'createMultipartUpload');
            uploadPartCopyStub = sandBox.stub(s3, 'uploadPartCopy');
            completeMultipartUploadStub = sandBox.stub(s3, 'completeMultipartUpload');
            abortMultipartUploadStub = sandBox.stub(s3, 'abortMultipartUpload');
        });

        it('Should succeed with mandatory variables passed', function () {
            createMultipartUploadStub.returns({
                promise: function () {
                    return Promise.resolve({ UploadId: '1a2b3c4d' })
                }
            });
            uploadPartCopyStub.returns({
                promise: function () {
                    return Promise.resolve({
                        CopyPartResult: {
                            LastModified: 'LastModified',
                            ETag: '1a1b2s3d2f1e2g3sfsgdsg'
                        }
                    })
                }
            });
            completeMultipartUploadStub.returns({
                promise: function () {
                    return Promise.resolve();
                }
            });

            let options = {
                source_bucket: 'source_bucket',
                object_key: 'object_key',
                destination_bucket: 'destination_bucket',
                copied_object_name: 'copied_object_name',
                object_size: 70000000,
                copy_part_size_bytes: 50000000,
                copied_object_permissions: 'copied_object_permissions',
                expiration_period: 100000
            }
            let request_context = 'request_context';
            let expected_createMultipartUpload_args = {
                Bucket: 'destination_bucket',
                Key: 'copied_object_name',
                ACL: 'copied_object_permissions',
                Expires: 100000
            }
            let expected_uploadPartCopy_firstCallArgs = {
                Bucket: 'destination_bucket',
                CopySource: 'source_bucket/object_key',
                CopySourceRange: 'bytes=0-49999999',
                Key: 'copied_object_name',
                PartNumber: 1,
                UploadId: '1a2b3c4d'
            }
            let expected_uploadPartCopy_secondCallArgs = {
                Bucket: 'destination_bucket',
                CopySource: 'source_bucket/object_key',
                CopySourceRange: 'bytes=50000000-69999999',
                Key: 'copied_object_name',
                PartNumber: 2,
                UploadId: '1a2b3c4d'
            }
            let expected_completeMultipartUploadStub_args = {
                Bucket: 'destination_bucket',
                Key: 'copied_object_name',
                MultipartUpload: {
                    Parts: [
                        {
                            ETag: '1a1b2s3d2f1e2g3sfsgdsg',
                            PartNumber: 1
                        }, {
                            ETag: '1a1b2s3d2f1e2g3sfsgdsg',
                            PartNumber: 2
                        }]
                },
                UploadId: '1a2b3c4d'
            }

            return s3LargeCopyClient.copyLargeObject(options, request_context)
                .then(() => {
                    should(loggerInfoSpy.callCount).equal(5)
                    should(loggerInfoSpy.args[0][0]).eql({ msg: 'multipart copy initiated successfully: ' + JSON.stringify({ UploadId: '1a2b3c4d' }), context: 'request_context' })
                    should(createMultipartUploadStub.calledOnce).equal(true);
                    should(createMultipartUploadStub.args[0][0]).eql(expected_createMultipartUpload_args);
                    should(uploadPartCopyStub.calledTwice).equal(true);
                    should(uploadPartCopyStub.args[0][0]).eql(expected_uploadPartCopy_firstCallArgs);
                    should(uploadPartCopyStub.args[1][0]).eql(expected_uploadPartCopy_secondCallArgs);
                    should(completeMultipartUploadStub.calledOnce).equal(true);
                    should(completeMultipartUploadStub.args[0][0]).eql(expected_completeMultipartUploadStub_args);
                })
        });

        it('Should succeed with all variables passed', function () {

        });
    });
});