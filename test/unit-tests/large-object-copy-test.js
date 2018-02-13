'use strict';

let bunyan = require('bunyan'),
    sinon = require('sinon'),
    should = require('should'),
    deepCopy = require('deepCopy'),
    rewire = require('rewire'),
    s3LargeCopyClient = rewire('../../src/large-object-copy'),
    AWS = require('aws-sdk'),
    pkginfo = require('pkginfo')(module, 'version'),
    testData = require('../utils/unit-tests-data'),
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

        it('Should succeed with mandatory letiables passed', function () {
            createMultipartUploadStub.returns(testData.createMultipartUploadStub_positive_response);
            uploadPartCopyStub.returns(testData.uploadPartCopyStub_positive_response);
            completeMultipartUploadStub.returns(testData.completeMultipartUploadStub_positive_response);

            return s3LargeCopyClient.copyLargeObject(testData.full_request_options, testData.request_context)
                .then(() => {
                    should(loggerInfoSpy.callCount).equal(5)
                    should(loggerInfoSpy.args[0][0]).eql({ msg: 'multipart copy initiated successfully: ' + JSON.stringify({ UploadId: '1a2b3c4d' }), context: 'request_context' })
                    should(createMultipartUploadStub.calledOnce).equal(true);
                    should(createMultipartUploadStub.args[0][0]).eql(testData.expected_createMultipartUpload_args);
                    should(uploadPartCopyStub.calledTwice).equal(true);
                    should(uploadPartCopyStub.args[0][0]).eql(testData.expected_uploadPartCopy_firstCallArgs);
                    should(uploadPartCopyStub.args[1][0]).eql(testData.expected_uploadPartCopy_secondCallArgs);
                    should(completeMultipartUploadStub.calledOnce).equal(true);
                    should(completeMultipartUploadStub.args[0][0]).eql(testData.expected_completeMultipartUploadStub_args);
                })
        });

        it('Should succeed with only mandatory letiables passed', function () {
            createMultipartUploadStub.returns(testData.createMultipartUploadStub_positive_response);
            uploadPartCopyStub.returns(testData.uploadPartCopyStub_positive_response);
            completeMultipartUploadStub.returns(testData.completeMultipartUploadStub_positive_response);

            let expected_uploadPartCopy_secondCallArgs = deepCopy(testData.expected_uploadPartCopy_secondCallArgs);
            expected_uploadPartCopy_secondCallArgs.CopySourceRange = 'bytes=50000000-99999999';

            let expected_createMultipartUpload_args = {
                Bucket: 'destination_bucket',
                Key: 'copied_object_name',
                ACL: 'private'
            }

            return s3LargeCopyClient.copyLargeObject(testData.partial_request_options, testData.request_context)
                .then(() => {
                    should(loggerInfoSpy.callCount).equal(5)
                    should(loggerInfoSpy.args[0][0]).eql({ msg: 'multipart copy initiated successfully: ' + JSON.stringify({ UploadId: '1a2b3c4d' }), context: 'request_context' })
                    should(createMultipartUploadStub.calledOnce).equal(true);
                    should(createMultipartUploadStub.args[0][0]).eql(expected_createMultipartUpload_args);
                    should(uploadPartCopyStub.calledTwice).equal(true);
                    should(uploadPartCopyStub.args[0][0]).eql(testData.expected_uploadPartCopy_firstCallArgs);
                    should(uploadPartCopyStub.args[1][0]).eql(expected_uploadPartCopy_secondCallArgs);
                    should(completeMultipartUploadStub.calledOnce).equal(true);
                    should(completeMultipartUploadStub.args[0][0]).eql(testData.expected_completeMultipartUploadStub_args);
                })
        });

        it('Should fail due to createMultipartUpload error and not call abortMultipartCopy', function () {
            createMultipartUploadStub.returns(testData.all_stubs_negative_response);

            return s3LargeCopyClient.copyLargeObject(testData.partial_request_options, testData.request_context)
                .then(() => {
                    throw new Error('s3LargeCopyClient resolved when an error should have been rejected');
                })
                .catch((err) => {
                    should(loggerErrorSpy.calledOnce).equal(true);
                    should(loggerErrorSpy.args[0][0]).eql({ msg: 'multipart copy failed to initiate', context: 'request_context', error: 'test_error' });
                    should(err).eql('test_error');
                })
        });

        it('Should call abortMultipartCopy upon error from uploadPartCopy error and ', function () {
            createMultipartUploadStub.returns(testData.createMultipartUploadStub_positive_response);
            uploadPartCopyStub.returns(testData.all_stubs_negative_response);
            abortMultipartUploadStub.returns(testData.abortMultipartUploadStub_positive_response);

            return s3LargeCopyClient.copyLargeObject(testData.full_request_options, testData.request_context)
                .then(() => {
                    should(loggerInfoSpy.callCount).equal(2)
                    should(loggerInfoSpy.args[1][0]).eql({ msg: 'multipart copy aborted successfully: ' + JSON.stringify({}), context: 'request_context' });
                    should(loggerErrorSpy.calledTwice).equal(true);
                    should(loggerErrorSpy.args[0][0]).eql('CopyPart 1 Failed: "test_error"');
                    should(loggerErrorSpy.args[1][0]).eql('CopyPart 2 Failed: "test_error"');
                    should(createMultipartUploadStub.calledOnce).equal(true);
                    should(createMultipartUploadStub.args[0][0]).eql(testData.expected_createMultipartUpload_args);
                    should(uploadPartCopyStub.calledTwice).equal(true);
                    should(uploadPartCopyStub.args[0][0]).eql(testData.expected_uploadPartCopy_firstCallArgs);
                    should(uploadPartCopyStub.args[1][0]).eql(testData.expected_uploadPartCopy_secondCallArgs);
                    should(abortMultipartUploadStub.calledOnce).equal(true);
                    should(abortMultipartUploadStub.args[0][0]).eql(testData.expected_abortMultipartUploadStub_args);
                })
        });

        it('Should call abortMultipartCopy upon error from completeMultipartUpload', function () {
            createMultipartUploadStub.returns(testData.createMultipartUploadStub_positive_response);
            uploadPartCopyStub.returns(testData.uploadPartCopyStub_positive_response);
            completeMultipartUploadStub.returns(testData.all_stubs_negative_response);
            abortMultipartUploadStub.returns(testData.abortMultipartUploadStub_positive_response);

            return s3LargeCopyClient.copyLargeObject(testData.full_request_options, testData.request_context)
                .then(() => {
                    should(loggerInfoSpy.callCount).equal(5)
                    should(loggerInfoSpy.args[4][0]).eql({ msg: 'multipart copy aborted successfully: ' + JSON.stringify({}), context: 'request_context' });
                    should(loggerErrorSpy.calledOnce).equal(true);
                    should(loggerErrorSpy.args[0][0]).eql({ msg: 'Multipart upload failed', context: 'request_context', error: 'test_error' });
                    should(createMultipartUploadStub.calledOnce).equal(true);
                    should(createMultipartUploadStub.args[0][0]).eql(testData.expected_createMultipartUpload_args);
                    should(uploadPartCopyStub.calledTwice).equal(true);
                    should(uploadPartCopyStub.args[0][0]).eql(testData.expected_uploadPartCopy_firstCallArgs);
                    should(uploadPartCopyStub.args[1][0]).eql(testData.expected_uploadPartCopy_secondCallArgs);
                    should(completeMultipartUploadStub.calledOnce).equal(true);
                    should(completeMultipartUploadStub.args[0][0]).eql(testData.expected_completeMultipartUploadStub_args);
                    should(abortMultipartUploadStub.calledOnce).equal(true);
                    should(abortMultipartUploadStub.args[0][0]).eql(testData.expected_abortMultipartUploadStub_args);
                })
        });

        it('Should call abortMultipartCopy upon error from uploadPartCopy and fail due to abortMultipartCopy error', function () {
            createMultipartUploadStub.returns(testData.createMultipartUploadStub_positive_response);
            uploadPartCopyStub.returns(testData.uploadPartCopyStub_positive_response);
            completeMultipartUploadStub.returns(testData.all_stubs_negative_response);
            abortMultipartUploadStub.returns(testData.all_stubs_negative_response);

            return s3LargeCopyClient.copyLargeObject(testData.full_request_options, testData.request_context)
                .then(() => {
                    throw new Error('s3LargeCopyClient resolved when an error should have been rejected');
                })
                .catch((err) => {
                    should(loggerInfoSpy.callCount).equal(4)
                    should(loggerInfoSpy.args[3][0]).eql({
                        msg: 'copied all parts successfully: ' +
                        [testData.uploadPartCopyStub_positive_response, testData.uploadPartCopyStub_positive_response].toString(),
                        context: 'request_context'
                    });
                    should(loggerErrorSpy.calledTwice).equal(true);
                    should(loggerErrorSpy.args[0][0]).eql({ msg: 'Multipart upload failed', context: 'request_context', error: 'test_error' });
                    should(loggerErrorSpy.args[1][0]).eql({ msg: 'abort multipart copy failed', context: 'request_context', error: 'test_error' });
                    should(createMultipartUploadStub.calledOnce).equal(true);
                    should(createMultipartUploadStub.args[0][0]).eql(testData.expected_createMultipartUpload_args);
                    should(uploadPartCopyStub.calledTwice).equal(true);
                    should(uploadPartCopyStub.args[0][0]).eql(testData.expected_uploadPartCopy_firstCallArgs);
                    should(uploadPartCopyStub.args[1][0]).eql(testData.expected_uploadPartCopy_secondCallArgs);
                    should(completeMultipartUploadStub.calledOnce).equal(true);
                    should(completeMultipartUploadStub.args[0][0]).eql(testData.expected_completeMultipartUploadStub_args);
                    should(abortMultipartUploadStub.calledOnce).equal(true);
                    should(abortMultipartUploadStub.args[0][0]).eql(testData.expected_abortMultipartUploadStub_args);
                    should(err).equal('test_error');
                })
        });

        // it('Should check for retries configurations and not call abortMultipartCopy upon success', function () {

        // });

        // it('Should check for retries configurations and call abortMultipartCopy upon failure', function () {

        // });
    });
});