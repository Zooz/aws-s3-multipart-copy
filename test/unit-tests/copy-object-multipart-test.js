'use strict';

let bunyan = require('bunyan'),
    sinon = require('sinon'),
    should = require('should'),
    deepCopy = require('deepcopy'),
    rewire = require('rewire'),
    s3Module = rewire('../../src/copy-object-multipart'),
    AWS = require('aws-sdk'),
    pkginfo = require('pkginfo')(module, 'version'),
    testData = require('../utils/unit-tests-data'),
    APP_VERSION = module.exports.version,
    logger = bunyan.createLogger({
        name: 'copy-object-multipart',
        level: 'info',
        version: APP_VERSION,
        logType: 'copy-object-multipart-log',
        serializers: { err: bunyan.stdSerializers.err }
    });

let sandBox, loggerInfoSpy, loggerErrorSpy, createMultipartUploadStub, uploadPartCopyStub, completeMultipartUploadStub, abortMultipartUploadStub, listPartsStub, s3;

describe('AWS S3 multipart copy client unit tests', function () {
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

            s3Module.init(s3, logger);

            should(loggerInfoSpy.calledOnce).equal(true);
            should(loggerInfoSpy.args[0][0]).eql({ msg: 'S3 client initialized successfully' });
            should(s3Module.__get__('s3')).equal(s3);
        });

        it('Should throw error when given an invalid s3 object', function () {
            let notS3 = [];
            let expected_error = new Error('Invalid AWS.S3 object received');

            try {
                s3Module.init(notS3, logger);
            } catch (err) {
                should(loggerInfoSpy.notCalled).equal(true);
                should(err).eql(expected_error);
            }
        });

        it('Should throw error when s3 object is not passed', function () {
            let expected_error = new Error('Invalid AWS.S3 object received');

            try {
                s3Module.init(undefined, logger);
            } catch (err) {
                should(loggerInfoSpy.notCalled).equal(true);
                should(err).eql(expected_error);
            }
        });

        it('Should throw error when given an invalid logger object', function () {
            let notLogger = [];
            let s3 = new AWS.S3();
            let expected_error = new Error('Invalid logger object received');

            try {
                s3Module.init(s3, notLogger);
            } catch (err) {
                should(loggerInfoSpy.notCalled).equal(true);
                should(err).eql(expected_error);
            }
        });

        it('Should throw error when logger object is not passed', function () {
            s3 = new AWS.S3();
            let expected_error = new Error('Invalid logger object received');

            try {
                s3Module.init(s3, undefined);
            } catch (err) {
                should(loggerInfoSpy.notCalled).equal(true);
                should(err).eql(expected_error);
            }
        });
    });

    describe('Testing copyObjectMultipart', function () {
        before(() => {
            s3 = new AWS.S3();
            s3Module.init(s3, logger);
            loggerInfoSpy.reset();
            createMultipartUploadStub = sandBox.stub(s3, 'createMultipartUpload');
            uploadPartCopyStub = sandBox.stub(s3, 'uploadPartCopy');
            completeMultipartUploadStub = sandBox.stub(s3, 'completeMultipartUpload');
            abortMultipartUploadStub = sandBox.stub(s3, 'abortMultipartUpload');
            listPartsStub = sandBox.stub(s3, 'listParts');
        });

        it('Should succeed with all variables passed', function () {
            createMultipartUploadStub.returns(testData.createMultipartUploadStub_positive_response);
            uploadPartCopyStub.returns(testData.uploadPartCopyStub_positive_response);
            completeMultipartUploadStub.returns(testData.completeMultipartUploadStub_positive_response);

            return s3Module.copyObjectMultipart(testData.full_request_options, testData.request_context)
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

        it('Should succeed with all mandatory variables passed', function () {
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

            return s3Module.copyObjectMultipart(testData.partial_request_options, testData.request_context)
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

        it('Should url-encode CopySource key', function () {
            createMultipartUploadStub.returns(testData.createMultipartUploadStub_positive_response);
            uploadPartCopyStub.returns(testData.uploadPartCopyStub_positive_response);
            completeMultipartUploadStub.returns(testData.completeMultipartUploadStub_positive_response);

            const partial_request_options = deepCopy(testData.partial_request_options);
            partial_request_options.object_key = '+?=/&_-.txt';
            const expected_uploadPartCopy_firstCallArgs = deepCopy(testData.expected_uploadPartCopy_firstCallArgs);
            expected_uploadPartCopy_firstCallArgs.CopySource = 'source_bucket%2F%2B%3F%3D%2F%26_-.txt';
            const expected_uploadPartCopy_secondCallArgs = deepCopy(testData.expected_uploadPartCopy_secondCallArgs);
            expected_uploadPartCopy_secondCallArgs.CopySource = 'source_bucket%2F%2B%3F%3D%2F%26_-.txt';
            expected_uploadPartCopy_secondCallArgs.CopySourceRange = 'bytes=50000000-99999999';

            return s3Module.copyObjectMultipart(partial_request_options, testData.request_context)
                .then(() => {
                    should(uploadPartCopyStub.args[0][0]).eql(expected_uploadPartCopy_firstCallArgs);
                    should(uploadPartCopyStub.args[1][0]).eql(expected_uploadPartCopy_secondCallArgs);
                })
        });

        it('Should succeed with all variables passed and object_size is smaller then copy_part_size_bytes', function () {
            createMultipartUploadStub.returns(testData.createMultipartUploadStub_positive_response);
            uploadPartCopyStub.returns(testData.uploadPartCopyStub_positive_response);
            completeMultipartUploadStub.returns(testData.completeMultipartUploadStub_positive_response);

            let full_request_options = deepCopy(testData.full_request_options);
            full_request_options.object_size = 25000000;
            let expected_uploadPartCopy_firstCallArgs = deepCopy(testData.expected_uploadPartCopy_firstCallArgs);
            expected_uploadPartCopy_firstCallArgs.CopySourceRange = 'bytes=0-24999999';
            let expected_completeMultipartUploadStub_args = deepCopy(testData.expected_completeMultipartUploadStub_args);
            expected_completeMultipartUploadStub_args.MultipartUpload.Parts = [{ ETag: '1a1b2s3d2f1e2g3sfsgdsg', PartNumber: 1 }]

            return s3Module.copyObjectMultipart(full_request_options, testData.request_context)
                .then(() => {
                    should(loggerInfoSpy.callCount).equal(4)
                    should(loggerInfoSpy.args[0][0]).eql({ msg: 'multipart copy initiated successfully: ' + JSON.stringify({ UploadId: '1a2b3c4d' }), context: 'request_context' })
                    should(createMultipartUploadStub.calledOnce).equal(true);
                    should(createMultipartUploadStub.args[0][0]).eql(testData.expected_createMultipartUpload_args);
                    should(uploadPartCopyStub.calledOnce).equal(true);
                    should(uploadPartCopyStub.args[0][0]).eql(expected_uploadPartCopy_firstCallArgs);
                    should(completeMultipartUploadStub.calledOnce).equal(true);
                    should(completeMultipartUploadStub.args[0][0]).eql(expected_completeMultipartUploadStub_args);
                })
        });

        it('Should fail due to createMultipartUpload error and not call abortMultipartCopy', function () {
            createMultipartUploadStub.returns(testData.all_stubs_error_response);

            return s3Module.copyObjectMultipart(testData.partial_request_options, testData.request_context)
                .then(() => {
                    throw new Error('s3Module resolved when an error should have been rejected');
                })
                .catch((err) => {
                    should(loggerErrorSpy.calledOnce).equal(true);
                    should(loggerErrorSpy.args[0][0]).eql({ msg: 'multipart copy failed to initiate', context: 'request_context', error: 'test_error' });
                    should(uploadPartCopyStub.notCalled).equal(true);
                    should(completeMultipartUploadStub.notCalled).equal(true);
                    should(abortMultipartUploadStub.notCalled).equal(true);
                    should(listPartsStub.notCalled).equal(true);
                    should(err).eql('test_error');
                })
        });

        it('Should call abortMultipartCopy upon error from uploadPartCopy error and succeed', function () {
            createMultipartUploadStub.returns(testData.createMultipartUploadStub_positive_response);
            uploadPartCopyStub.returns(testData.all_stubs_error_response);
            abortMultipartUploadStub.returns(testData.abortMultipartUploadStub_positive_response);
            listPartsStub.returns(testData.listPartsStub_positive_response);

            let expected_error = new Error('multipart copy aborted');
            expected_error.details = {
                Bucket: 'destination_bucket',
                Key: 'copied_object_name',
                UploadId: '1a2b3c4d'
            }

            return s3Module.copyObjectMultipart(testData.full_request_options, testData.request_context)
                .then(() => {
                    throw new Error('s3Module resolved when an error should have been rejected');
                })
                .catch((err) => {
                    should(loggerInfoSpy.callCount).equal(2)
                    should(loggerInfoSpy.args[1][0]).eql({ msg: 'multipart copy aborted successfully: ' + JSON.stringify({ Parts: [] }), context: 'request_context' });
                    should(loggerErrorSpy.calledTwice).equal(true);
                    should(loggerErrorSpy.args[0][0]).eql({msg: 'CopyPart 1 Failed: "test_error"', error: 'test_error'});
                    should(loggerErrorSpy.args[1][0]).eql({msg: 'CopyPart 2 Failed: "test_error"', error: 'test_error'});
                    should(createMultipartUploadStub.calledOnce).equal(true);
                    should(createMultipartUploadStub.args[0][0]).eql(testData.expected_createMultipartUpload_args);
                    should(uploadPartCopyStub.calledTwice).equal(true);
                    should(uploadPartCopyStub.args[0][0]).eql(testData.expected_uploadPartCopy_firstCallArgs);
                    should(uploadPartCopyStub.args[1][0]).eql(testData.expected_uploadPartCopy_secondCallArgs);
                    should(abortMultipartUploadStub.calledOnce).equal(true);
                    should(abortMultipartUploadStub.args[0][0]).eql(testData.expected_abortMultipartUploadStub_args);
                    should(listPartsStub.calledOnce).equal(true);
                    should(listPartsStub.args[0][0]).eql(testData.expected_abortMultipartUploadStub_args);
                    should(err).eql(testData.expected_abort_rejection_response);
                })
        });

        it('Should call abortMultipartCopy upon error from completeMultipartUpload', function () {
            createMultipartUploadStub.returns(testData.createMultipartUploadStub_positive_response);
            uploadPartCopyStub.returns(testData.uploadPartCopyStub_positive_response);
            completeMultipartUploadStub.returns(testData.all_stubs_error_response);
            abortMultipartUploadStub.returns(testData.abortMultipartUploadStub_positive_response);
            listPartsStub.returns(testData.listPartsStub_positive_response);

            return s3Module.copyObjectMultipart(testData.full_request_options, testData.request_context)
                .then(() => {
                    throw new Error('s3Module resolved when an error should have been rejected');
                })
                .catch((err) => {
                    should(loggerInfoSpy.callCount).equal(5)
                    should(loggerInfoSpy.args[4][0]).eql({ msg: 'multipart copy aborted successfully: ' + JSON.stringify({ Parts: [] }), context: 'request_context' });
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
                    should(listPartsStub.calledOnce).equal(true);
                    should(listPartsStub.args[0][0]).eql(testData.expected_abortMultipartUploadStub_args);
                    should(err).eql(testData.expected_abort_rejection_response);
                })
        });

        it('Should call abortMultipartCopy upon error from completeMultipartUpload and a list of parts returned from listParts', async function () {
            createMultipartUploadStub.returns(testData.createMultipartUploadStub_positive_response);
            uploadPartCopyStub.returns(testData.uploadPartCopyStub_positive_response);
            completeMultipartUploadStub.returns(testData.all_stubs_error_response);
            abortMultipartUploadStub.returns(testData.abortMultipartUploadStub_positive_response);
            listPartsStub.returns(testData.listPartsStub_negative_response);

            let expected_abortMultipartUpload_error = new Error('Abort procedure passed but copy parts were not removed');
            expected_abortMultipartUpload_error.details = { Parts: ['part 1', 'part 2'] }
            const uploadPartCopyStubResponse = await testData.uploadPartCopyStub_positive_response.promise();
            const error = new Error('Abort procedure passed but copy parts were not removed');
            error.details = { Parts: ['part 1', 'part 2'] };

            return s3Module.copyObjectMultipart(testData.full_request_options, testData.request_context)
                .then(() => {
                    throw new Error('s3Module resolved when an error should have been rejected');
                })
                .catch((err) => {
                    should(loggerInfoSpy.callCount).equal(4)
                    should(loggerInfoSpy.args[3][0]).eql({
                        msg: 'copied all parts successfully: ' +
                        JSON.stringify([uploadPartCopyStubResponse, uploadPartCopyStubResponse]),
                        context: 'request_context'
                    });
                    should(loggerErrorSpy.calledTwice).equal(true);
                    should(loggerErrorSpy.args[0][0]).eql({ msg: 'Multipart upload failed', context: 'request_context', error: 'test_error' });
                    should(loggerErrorSpy.args[1][0]).eql({ msg: 'abort multipart copy failed, copy parts were not removed', context: 'request_context', error });
                    should(createMultipartUploadStub.calledOnce).equal(true);
                    should(createMultipartUploadStub.args[0][0]).eql(testData.expected_createMultipartUpload_args);
                    should(uploadPartCopyStub.calledTwice).equal(true);
                    should(uploadPartCopyStub.args[0][0]).eql(testData.expected_uploadPartCopy_firstCallArgs);
                    should(uploadPartCopyStub.args[1][0]).eql(testData.expected_uploadPartCopy_secondCallArgs);
                    should(completeMultipartUploadStub.calledOnce).equal(true);
                    should(completeMultipartUploadStub.args[0][0]).eql(testData.expected_completeMultipartUploadStub_args);
                    should(abortMultipartUploadStub.calledOnce).equal(true);
                    should(abortMultipartUploadStub.args[0][0]).eql(testData.expected_abortMultipartUploadStub_args);
                    should(listPartsStub.calledOnce).equal(true);
                    should(listPartsStub.args[0][0]).eql(testData.expected_abortMultipartUploadStub_args);
                    should(err).eql(expected_abortMultipartUpload_error);
                })
        });

        it('Should call abortMultipartCopy upon error from completeMultipartUpload and fail due to abortMultipartCopy error', async function () {
            createMultipartUploadStub.returns(testData.createMultipartUploadStub_positive_response);
            uploadPartCopyStub.returns(testData.uploadPartCopyStub_positive_response);
            completeMultipartUploadStub.returns(testData.all_stubs_error_response);
            abortMultipartUploadStub.returns(testData.all_stubs_error_response);
            const uploadPartCopyStubResponse = await testData.uploadPartCopyStub_positive_response.promise();

            return s3Module.copyObjectMultipart(testData.full_request_options, testData.request_context)
                .then(() => {
                    throw new Error('s3Module resolved when an error should have been rejected');
                })
                .catch((err) => {
                    should(loggerInfoSpy.callCount).equal(4)
                    should(loggerInfoSpy.args[3][0]).eql({
                        msg: 'copied all parts successfully: ' +
                        JSON.stringify([uploadPartCopyStubResponse, uploadPartCopyStubResponse]),
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

        it('Should call abortMultipartCopy upon error from completeMultipartUpload and fail due to listParts error', async function () {
            createMultipartUploadStub.returns(testData.createMultipartUploadStub_positive_response);
            uploadPartCopyStub.returns(testData.uploadPartCopyStub_positive_response);
            completeMultipartUploadStub.returns(testData.all_stubs_error_response);
            abortMultipartUploadStub.returns(testData.abortMultipartUploadStub_positive_response);
            listPartsStub.returns(testData.all_stubs_error_response);
            const uploadPartCopyStubResponse = await testData.uploadPartCopyStub_positive_response.promise();

            return s3Module.copyObjectMultipart(testData.full_request_options, testData.request_context)
                .then(() => {
                    throw new Error('s3Module resolved when an error should have been rejected');
                })
                .catch((err) => {
                    should(loggerInfoSpy.callCount).equal(4)
                    should(loggerInfoSpy.args[3][0]).eql({
                        msg: 'copied all parts successfully: ' +
                        JSON.stringify([uploadPartCopyStubResponse, uploadPartCopyStubResponse]),
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
    });
});
