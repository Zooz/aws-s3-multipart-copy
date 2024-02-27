'use strict';

let bunyan = require('bunyan'),
    sinon = require('sinon'),
    should = require('should'),
    deepCopy = require('deepcopy'),
    rewire = require('rewire'),
    s3Module = rewire('../../src/copy-object-multipart'),
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

    const { mockClient } = require('aws-sdk-client-mock');

    const { S3Client } = require('@aws-sdk/client-s3');
    const {
        CreateMultipartUploadCommand,
        UploadPartCopyCommand,
        CompleteMultipartUploadCommand,
        AbortMultipartUploadCommand,
        ListPartsCommand
    } = require("@aws-sdk/client-s3");

const s3Mock = mockClient(S3Client);

let sandBox, loggerInfoSpy, loggerErrorSpy, createMultipartUploadStub, uploadPartCopyStub, completeMultipartUploadStub, abortMultipartUploadStub, listPartsStub, s3;

describe('AWS S3 multupart copy client unit tests', function () {
    before(() => {
        sandBox = sinon.sandbox.create();
        loggerInfoSpy = sandBox.spy(logger, 'info');
        loggerErrorSpy = sandBox.spy(logger, 'error');
    });

    afterEach(() => {
        sandBox.resetHistory();
        s3Mock.reset();
    });

    after(() => {
        sandBox.resetHistory();
        s3Mock.restore();
    });

    describe('Testing init function', function () {
        it('Should pass when given valid s3 and logger objects', function () {
            s3 = new S3Client();

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
            let s3 = new S3Client();
            let expected_error = new Error('Invalid logger object received');

            try {
                s3Module.init(s3, notLogger);
            } catch (err) {
                should(loggerInfoSpy.notCalled).equal(true);
                should(err).eql(expected_error);
            }
        });

        it('Should throw error when logger object is not passed', function () {
            s3 = new S3Client();
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
            s3 = new S3Client();
            s3Module.init(s3, logger);
            loggerInfoSpy.reset();
        });

        it('Should succeed with all variables passed', async () => {
            s3Mock.on(CreateMultipartUploadCommand).resolves(testData.createMultipartUploadStub_positive_response);
            s3Mock.on(UploadPartCopyCommand).resolves(testData.uploadPartCopyStub_positive_response);
            s3Mock.on(CompleteMultipartUploadCommand).resolves(testData.completeMultipartUploadStub_positive_response);

            await s3Module.copyObjectMultipart(testData.full_request_options, testData.request_context)

            should(loggerInfoSpy.callCount).equal(5)
            should(loggerInfoSpy.args[0][0]).eql({ msg: 'multipart copy initiated successfully: ' + JSON.stringify({ UploadId: '1a2b3c4d' }), context: 'request_context' })
            should(s3Mock.commandCalls(CreateMultipartUploadCommand).length).equal(1);
            should(s3Mock.commandCalls(CreateMultipartUploadCommand, testData.expected_createMultipartUpload_args).length).equal(1);
            should(s3Mock.commandCalls(UploadPartCopyCommand).length).equal(2);
            should(s3Mock.commandCalls(UploadPartCopyCommand, testData.expected_uploadPartCopy_firstCallArgs).length).equal(1);
            should(s3Mock.commandCalls(UploadPartCopyCommand, testData.expected_uploadPartCopy_secondCallArgs).length).equal(1);
            should(s3Mock.commandCalls(CompleteMultipartUploadCommand).length).equal(1);
            should(s3Mock.commandCalls(CompleteMultipartUploadCommand, testData.expected_completeMultipartUploadStub_args).length).equal(1);
        });

        it('Should succeed with all mandatory variables passed', async () => {
            s3Mock.on(CreateMultipartUploadCommand).resolves(testData.createMultipartUploadStub_positive_response);
            s3Mock.on(UploadPartCopyCommand).resolves(testData.uploadPartCopyStub_positive_response);
            s3Mock.on(CompleteMultipartUploadCommand).resolves(testData.completeMultipartUploadStub_positive_response);

            let expected_uploadPartCopy_secondCallArgs = deepCopy(testData.expected_uploadPartCopy_secondCallArgs);
            expected_uploadPartCopy_secondCallArgs.CopySourceRange = 'bytes=50000000-99999999';

            let expected_createMultipartUpload_args = {
                Bucket: 'destination_bucket',
                Key: 'copied_object_name',
                ACL: 'private'
            }

            await s3Module.copyObjectMultipart(testData.partial_request_options, testData.request_context);
                
            should(loggerInfoSpy.callCount).equal(5)
            should(loggerInfoSpy.args[0][0]).eql({ msg: 'multipart copy initiated successfully: ' + JSON.stringify({ UploadId: '1a2b3c4d' }), context: 'request_context' })
            should(s3Mock.commandCalls(CreateMultipartUploadCommand).length).equal(1);
            should(s3Mock.commandCalls(CreateMultipartUploadCommand, expected_createMultipartUpload_args).length).equal(1);
            should(s3Mock.commandCalls(UploadPartCopyCommand).length).equal(2);
            should(s3Mock.commandCalls(UploadPartCopyCommand, testData.expected_uploadPartCopy_firstCallArgs).length).equal(1);
            should(s3Mock.commandCalls(UploadPartCopyCommand, expected_uploadPartCopy_secondCallArgs).length).equal(1);
            should(s3Mock.commandCalls(CompleteMultipartUploadCommand).length).equal(1);
            should(s3Mock.commandCalls(CompleteMultipartUploadCommand, testData.expected_completeMultipartUploadStub_args).length).equal(1);
        });

        it('Should url-encode CopySource key', async () => {
            s3Mock.on(CreateMultipartUploadCommand).resolves(testData.createMultipartUploadStub_positive_response);
            s3Mock.on(UploadPartCopyCommand).resolves(testData.uploadPartCopyStub_positive_response);
            s3Mock.on(CompleteMultipartUploadCommand).resolves(testData.completeMultipartUploadStub_positive_response);

            const partial_request_options = deepCopy(testData.partial_request_options);
            partial_request_options.object_key = '+?=/&_-.txt';
            const expected_uploadPartCopy_firstCallArgs = deepCopy(testData.expected_uploadPartCopy_firstCallArgs);
            expected_uploadPartCopy_firstCallArgs.CopySource = 'source_bucket%2F%2B%3F%3D%2F%26_-.txt';
            const expected_uploadPartCopy_secondCallArgs = deepCopy(testData.expected_uploadPartCopy_secondCallArgs);
            expected_uploadPartCopy_secondCallArgs.CopySource = 'source_bucket%2F%2B%3F%3D%2F%26_-.txt';
            expected_uploadPartCopy_secondCallArgs.CopySourceRange = 'bytes=50000000-99999999';

            await s3Module.copyObjectMultipart(partial_request_options, testData.request_context);
            should(s3Mock.commandCalls(UploadPartCopyCommand).length).equal(2);
            should(s3Mock.commandCalls(UploadPartCopyCommand, expected_uploadPartCopy_firstCallArgs).length).equal(1);
            should(s3Mock.commandCalls(UploadPartCopyCommand, expected_uploadPartCopy_secondCallArgs).length).equal(1);

        });

        it('Should succeed with all variables passed and object_size is smaller then copy_part_size_bytes', async () => {
            s3Mock.on(CreateMultipartUploadCommand).resolves(testData.createMultipartUploadStub_positive_response);
            s3Mock.on(UploadPartCopyCommand).resolves(testData.uploadPartCopyStub_positive_response);
            s3Mock.on(CompleteMultipartUploadCommand).resolves(testData.completeMultipartUploadStub_positive_response);

            let full_request_options = deepCopy(testData.full_request_options);
            full_request_options.object_size = 25000000;
            let expected_uploadPartCopy_firstCallArgs = deepCopy(testData.expected_uploadPartCopy_firstCallArgs);
            expected_uploadPartCopy_firstCallArgs.CopySourceRange = 'bytes=0-24999999';
            let expected_completeMultipartUploadStub_args = deepCopy(testData.expected_completeMultipartUploadStub_args);
            expected_completeMultipartUploadStub_args.MultipartUpload.Parts = [{ ETag: '1a1b2s3d2f1e2g3sfsgdsg', PartNumber: 1 }]

            await s3Module.copyObjectMultipart(full_request_options, testData.request_context);
            should(loggerInfoSpy.callCount).equal(4)
            should(loggerInfoSpy.args[0][0]).eql({ msg: 'multipart copy initiated successfully: ' + JSON.stringify({ UploadId: '1a2b3c4d' }), context: 'request_context' })
            should(s3Mock.commandCalls(CreateMultipartUploadCommand).length).equal(1);
            should(s3Mock.commandCalls(CreateMultipartUploadCommand, testData.expected_createMultipartUpload_args).length).equal(1);
            should(s3Mock.commandCalls(UploadPartCopyCommand).length).equal(1);
            should(s3Mock.commandCalls(UploadPartCopyCommand, expected_uploadPartCopy_firstCallArgs).length).equal(1);
            should(s3Mock.commandCalls(CompleteMultipartUploadCommand).length).equal(1);
            should(s3Mock.commandCalls(CompleteMultipartUploadCommand, expected_completeMultipartUploadStub_args).length).equal(1);
        });

        it('Should fail due to createMultipartUpload error and not call abortMultipartCopy', async () => {

            s3Mock.on(CreateMultipartUploadCommand).callsFake(input => {
                throw testData.all_stubs_error_response;
            });

            try {
                await s3Module.copyObjectMultipart(testData.partial_request_options, testData.request_context);
                throw new Error('s3Module resolved when an error should have been rejected');
            } 
            catch(err) {
                    should(loggerErrorSpy.calledOnce).equal(true);
                    should(loggerErrorSpy.args[0][0]).eql({ msg: 'multipart copy failed to initiate', context: 'request_context', error: 'test_error' });
                    should(s3Mock.commandCalls(UploadPartCopyCommand).length).equal(0);
                    should(s3Mock.commandCalls(CompleteMultipartUploadCommand).length).equal(0);
                    should(s3Mock.commandCalls(AbortMultipartUploadCommand).length).equal(0);
                    should(s3Mock.commandCalls(ListPartsCommand).length).equal(0);
                    should(err.message).eql('test_error');
                }
        });

        it('Should call abortMultipartCopy upon error from uploadPartCopy error and succeed', async () => {
            s3Mock.on(CreateMultipartUploadCommand).resolves(testData.createMultipartUploadStub_positive_response);
            s3Mock.on(AbortMultipartUploadCommand).resolves(testData.abortMultipartUploadStub_positive_response);
            s3Mock.on(ListPartsCommand).resolves(testData.listPartsStub_positive_response);
            s3Mock.on(UploadPartCopyCommand).callsFake(input => {
                throw testData.all_stubs_error_response;
            });
            
            try {
                await s3Module.copyObjectMultipart(testData.full_request_options, testData.request_context);
                throw new Error('s3Module resolved when an error should have been rejected');
            }
            catch(err) {
                should(loggerInfoSpy.callCount).equal(2)
                should(loggerInfoSpy.args[1][0]).eql({ msg: 'multipart copy aborted successfully: ' + JSON.stringify({ Parts: [] }), context: 'request_context' });
                should(loggerErrorSpy.calledTwice).equal(true);
                should(loggerErrorSpy.args[0][0]).eql({msg: 'CopyPart 1 Failed: "test_error"', error: 'test_error'});
                should(loggerErrorSpy.args[1][0]).eql({msg: 'CopyPart 2 Failed: "test_error"', error: 'test_error'});
                should(s3Mock.commandCalls(CreateMultipartUploadCommand).length).equal(1);
                should(s3Mock.commandCalls(CreateMultipartUploadCommand, testData.expected_createMultipartUpload_args).length).equal(1);
                should(s3Mock.commandCalls(UploadPartCopyCommand).length).equal(2);
                should(s3Mock.commandCalls(UploadPartCopyCommand, testData.expected_uploadPartCopy_firstCallArgs).length).equal(1);
                should(s3Mock.commandCalls(UploadPartCopyCommand, testData.expected_uploadPartCopy_secondCallArgs).length).equal(1);
                should(s3Mock.commandCalls(AbortMultipartUploadCommand).length).equal(1);
                should(s3Mock.commandCalls(AbortMultipartUploadCommand, testData.expected_abortMultipartUploadStub_args).length).equal(1);
                should(s3Mock.commandCalls(ListPartsCommand).length).equal(1);
                should(s3Mock.commandCalls(ListPartsCommand, testData.expected_abortMultipartUploadStub_args).length).equal(1);
                should(err).eql(testData.expected_abort_rejection_response);
            }
        });

        it('Should call abortMultipartCopy upon error from completeMultipartUpload', async () => {
            s3Mock.on(CreateMultipartUploadCommand).resolves(testData.createMultipartUploadStub_positive_response);
            s3Mock.on(UploadPartCopyCommand).resolves(testData.uploadPartCopyStub_positive_response);
            s3Mock.on(AbortMultipartUploadCommand).resolves(testData.abortMultipartUploadStub_positive_response);
            s3Mock.on(ListPartsCommand).resolves(testData.listPartsStub_positive_response);
            s3Mock.on(CompleteMultipartUploadCommand).callsFake(input => {
                throw testData.all_stubs_error_response;
            });

            try{
                await s3Module.copyObjectMultipart(testData.full_request_options, testData.request_context);
                throw new Error('s3Module resolved when an error should have been rejected');
            }
            catch(err) {
                should(loggerInfoSpy.callCount).equal(5)
                should(loggerInfoSpy.args[4][0]).eql({ msg: 'multipart copy aborted successfully: ' + JSON.stringify({ Parts: [] }), context: 'request_context' });
                should(loggerErrorSpy.calledOnce).equal(true);
                should(loggerErrorSpy.args[0][0]).eql({ msg: 'Multipart upload failed', context: 'request_context', error: 'test_error' });
                should(s3Mock.commandCalls(CreateMultipartUploadCommand).length).equal(1);
                should(s3Mock.commandCalls(CreateMultipartUploadCommand, testData.expected_createMultipartUpload_args).length).equal(1);
                should(s3Mock.commandCalls(UploadPartCopyCommand).length).equal(2);
                should(s3Mock.commandCalls(UploadPartCopyCommand, testData.expected_uploadPartCopy_firstCallArgs).length).equal(1);
                should(s3Mock.commandCalls(UploadPartCopyCommand, testData.expected_uploadPartCopy_secondCallArgs).length).equal(1)
                should(s3Mock.commandCalls(CompleteMultipartUploadCommand).length).equal(1)
                should(s3Mock.commandCalls(CompleteMultipartUploadCommand, testData.expected_completeMultipartUploadStub_args).length).equal(1)
                should(s3Mock.commandCalls(AbortMultipartUploadCommand).length).equal(1)
                should(s3Mock.commandCalls(AbortMultipartUploadCommand, testData.expected_abortMultipartUploadStub_args).length).equal(1)
                should(s3Mock.commandCalls(ListPartsCommand).length).equal(1)
                should(s3Mock.commandCalls(ListPartsCommand, testData.expected_abortMultipartUploadStub_args).length).equal(1)
                should(err).eql(testData.expected_abort_rejection_response);
            }
        });

        it('Should call abortMultipartCopy upon error from completeMultipartUpload and a list of parts returned from listParts', async function () {
            s3Mock.on(CreateMultipartUploadCommand).resolves(testData.createMultipartUploadStub_positive_response);
            s3Mock.on(UploadPartCopyCommand).resolves(testData.uploadPartCopyStub_positive_response);
            s3Mock.on(AbortMultipartUploadCommand).resolves(testData.abortMultipartUploadStub_positive_response);
            s3Mock.on(ListPartsCommand).resolves(testData.listPartsStub_negative_response);
            s3Mock.on(CompleteMultipartUploadCommand).callsFake(input => {
                throw testData.all_stubs_error_response;
            });

            let expected_abortMultipartUpload_error = new Error('Abort procedure passed but copy parts were not removed');
            expected_abortMultipartUpload_error.details = { Parts: ['part 1', 'part 2'] }
            const uploadPartCopyStubResponse = testData.uploadPartCopyStub_positive_response;
            const error = new Error('Abort procedure passed but copy parts were not removed');
            error.details = { Parts: ['part 1', 'part 2'] };

            try{
                await s3Module.copyObjectMultipart(testData.full_request_options, testData.request_context);
                throw new Error('s3Module resolved when an error should have been rejected');
            }
            catch(err) {
                should(loggerInfoSpy.callCount).equal(4)
                should(loggerInfoSpy.args[3][0]).eql({
                    msg: 'copied all parts successfully: ' +
                    JSON.stringify([uploadPartCopyStubResponse, uploadPartCopyStubResponse]),
                    context: 'request_context'
                });
                should(loggerErrorSpy.calledTwice).equal(true);
                should(loggerErrorSpy.args[0][0]).eql({ msg: 'Multipart upload failed', context: 'request_context', error: 'test_error' });
                should(loggerErrorSpy.args[1][0]).eql({ msg: 'abort multipart copy failed, copy parts were not removed', context: 'request_context', error });
                should(s3Mock.commandCalls(CreateMultipartUploadCommand).length).equal(1);
                should(s3Mock.commandCalls(CreateMultipartUploadCommand, testData.expected_createMultipartUpload_args).length).equal(1);
                should(s3Mock.commandCalls(UploadPartCopyCommand).length).equal(2);
                should(s3Mock.commandCalls(UploadPartCopyCommand, testData.expected_uploadPartCopy_firstCallArgs).length).equal(1);
                should(s3Mock.commandCalls(UploadPartCopyCommand, testData.expected_uploadPartCopy_secondCallArgs).length).equal(1);
                should(s3Mock.commandCalls(CompleteMultipartUploadCommand).length).equal(1);
                should(s3Mock.commandCalls(CompleteMultipartUploadCommand, testData.expected_completeMultipartUploadStub_args).length).equal(1);
                should(s3Mock.commandCalls(AbortMultipartUploadCommand).length).equal(1);
                should(s3Mock.commandCalls(AbortMultipartUploadCommand, testData.expected_abortMultipartUploadStub_args).length).equal(1);
                should(s3Mock.commandCalls(ListPartsCommand).length).equal(1);
                should(s3Mock.commandCalls(ListPartsCommand, testData.expected_abortMultipartUploadStub_args).length).equal(1);
                should(err).eql(expected_abortMultipartUpload_error);
            }
        });

        it('Should call abortMultipartCopy upon error from completeMultipartUpload and fail due to abortMultipartCopy error', async () => {
            s3Mock.on(CreateMultipartUploadCommand).resolves(testData.createMultipartUploadStub_positive_response);
            s3Mock.on(UploadPartCopyCommand).resolves(testData.uploadPartCopyStub_positive_response);
            s3Mock.on(ListPartsCommand).resolves(testData.listPartsStub_negative_response);
            s3Mock.on(CompleteMultipartUploadCommand).callsFake(input => {
                throw testData.all_stubs_error_response;
            });
            s3Mock.on(AbortMultipartUploadCommand).callsFake(input => {
                throw testData.all_stubs_error_response;
            });
            const uploadPartCopyStubResponse = testData.uploadPartCopyStub_positive_response;

            try {
                await s3Module.copyObjectMultipart(testData.full_request_options, testData.request_context);
                throw new Error('s3Module resolved when an error should have been rejected');
            }
            catch(err) {
                    should(loggerInfoSpy.callCount).equal(4)
                    should(loggerInfoSpy.args[3][0]).eql({
                        msg: 'copied all parts successfully: ' +
                        JSON.stringify([uploadPartCopyStubResponse, uploadPartCopyStubResponse]),
                        context: 'request_context'
                    });
                    should(loggerErrorSpy.calledTwice).equal(true);
                    should(loggerErrorSpy.args[0][0]).eql({ msg: 'Multipart upload failed', context: 'request_context', error: 'test_error' });
                    should(loggerErrorSpy.args[1][0]).eql({ msg: 'abort multipart copy failed', context: 'request_context', error: 'test_error' });
                    should(s3Mock.commandCalls(CreateMultipartUploadCommand).length).equal(1);
                    should(s3Mock.commandCalls(CreateMultipartUploadCommand, testData.expected_createMultipartUpload_args).length).equal(1);
                    should(s3Mock.commandCalls(UploadPartCopyCommand).length).equal(2);
                    should(s3Mock.commandCalls(UploadPartCopyCommand, testData.expected_uploadPartCopy_firstCallArgs).length).equal(1);
                    should(s3Mock.commandCalls(UploadPartCopyCommand, testData.expected_uploadPartCopy_secondCallArgs).length).equal(1);
                    should(s3Mock.commandCalls(CompleteMultipartUploadCommand).length).equal(1);
                    should(s3Mock.commandCalls(CompleteMultipartUploadCommand, testData.expected_completeMultipartUploadStub_args).length).equal(1);
                    should(s3Mock.commandCalls(AbortMultipartUploadCommand).length).equal(1);
                    should(s3Mock.commandCalls(AbortMultipartUploadCommand, testData.expected_abortMultipartUploadStub_args).length).equal(1);
                    should(err).equal(testData.all_stubs_error_response);
                }
        });

        it('Should call abortMultipartCopy upon error from completeMultipartUpload and fail due to listParts error', async function () {
            s3Mock.on(CreateMultipartUploadCommand).resolves(testData.createMultipartUploadStub_positive_response);
            s3Mock.on(UploadPartCopyCommand).resolves(testData.uploadPartCopyStub_positive_response);
            s3Mock.on(AbortMultipartUploadCommand).resolves(testData.abortMultipartUploadStub_positive_response);
            s3Mock.on(CompleteMultipartUploadCommand).callsFake(input => {
                throw testData.all_stubs_error_response;
            });
            s3Mock.on(ListPartsCommand).callsFake(input => {
                throw testData.all_stubs_error_response;
            });
            const uploadPartCopyStubResponse = testData.uploadPartCopyStub_positive_response;

            try {
                await s3Module.copyObjectMultipart(testData.full_request_options, testData.request_context);
                throw new Error('s3Module resolved when an error should have been rejected');
            }
            catch(err) {
                should(loggerInfoSpy.callCount).equal(4)
                should(loggerInfoSpy.args[3][0]).eql({
                    msg: 'copied all parts successfully: ' +
                    JSON.stringify([uploadPartCopyStubResponse, uploadPartCopyStubResponse]),
                    context: 'request_context'
                });
                should(loggerErrorSpy.calledTwice).equal(true);
                should(loggerErrorSpy.args[0][0]).eql({ msg: 'Multipart upload failed', context: 'request_context', error: 'test_error' });
                should(loggerErrorSpy.args[1][0]).eql({ msg: 'abort multipart copy failed', context: 'request_context', error: 'test_error' });
                should(s3Mock.commandCalls(CreateMultipartUploadCommand).length).equal(1);
                should(s3Mock.commandCalls(CreateMultipartUploadCommand, testData.expected_createMultipartUpload_args).length).equal(1);
                should(s3Mock.commandCalls(UploadPartCopyCommand).length).equal(2);
                should(s3Mock.commandCalls(UploadPartCopyCommand, testData.expected_uploadPartCopy_firstCallArgs).length).equal(1);
                should(s3Mock.commandCalls(UploadPartCopyCommand, testData.expected_uploadPartCopy_secondCallArgs).length).equal(1);
                should(s3Mock.commandCalls(CompleteMultipartUploadCommand).length).equal(1);
                should(s3Mock.commandCalls(CompleteMultipartUploadCommand, testData.expected_completeMultipartUploadStub_args).length).equal(1);
                should(s3Mock.commandCalls(AbortMultipartUploadCommand).length).equal(1);
                should(s3Mock.commandCalls(AbortMultipartUploadCommand, testData.expected_abortMultipartUploadStub_args).length).equal(1);
                should(err).equal(testData.all_stubs_error_response);
            }
        })
    })
})
