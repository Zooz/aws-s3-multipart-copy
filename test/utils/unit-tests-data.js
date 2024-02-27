'use strict';

let expected_abortMultipartUpload_error = new Error('multipart copy aborted');
expected_abortMultipartUpload_error.details = {
    Bucket: 'destination_bucket',
    Key: 'copied_object_name',
    UploadId: '1a2b3c4d'
}

module.exports = {
    request_context: 'request_context',

    full_request_options: {
        source_bucket: 'source_bucket',
        object_key: 'object_key',
        destination_bucket: 'destination_bucket',
        copied_object_name: 'copied_object_name',
        object_size: 70000000,
        copy_part_size_bytes: 50000000,
        copied_object_permissions: 'copied_object_permissions',
        expiration_period: 100000,
        server_side_encryption: 'AES256',
        content_type: 'application/json',
        content_disposition: 'filename="copied_object_name.json"',
        content_encoding: 'gzip',
        content_language: 'en-US',
        metadata: { 'some-key': 'some-value' },
        cache_control: 'max-age=60',
        storage_class: 'STANDARD'
    },
    partial_request_options: { // no copy_part_size_bytes, no copied_object_permissions, no expiration_period,  no server_side_encryption, no content_type
        source_bucket: 'source_bucket',
        object_key: 'object_key',
        destination_bucket: 'destination_bucket',
        copied_object_name: 'copied_object_name',
        object_size: 100000000
    },
    expected_createMultipartUpload_args: {
        Bucket: 'destination_bucket',
        Key: 'copied_object_name',
        ACL: 'copied_object_permissions',
        Expires: 100000,
        ServerSideEncryption: 'AES256',
        ContentType: 'application/json',
        ContentDisposition: 'filename="copied_object_name.json"',
        ContentEncoding: 'gzip',
        ContentLanguage: 'en-US',
        CacheControl: 'max-age=60',
        Metadata: {
            'some-key': 'some-value'
        },
        StorageClass: 'STANDARD'
    },
    expected_uploadPartCopy_firstCallArgs: {
        Bucket: 'destination_bucket',
        CopySource: 'source_bucket%2Fobject_key',
        CopySourceRange: 'bytes=0-49999999',
        Key: 'copied_object_name',
        PartNumber: 1,
        UploadId: '1a2b3c4d'
    },
    expected_uploadPartCopy_secondCallArgs: {
        Bucket: 'destination_bucket',
        CopySource: 'source_bucket%2Fobject_key',
        CopySourceRange: 'bytes=50000000-69999999',
        Key: 'copied_object_name',
        PartNumber: 2,
        UploadId: '1a2b3c4d'
    },
    expected_completeMultipartUploadStub_args: {
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
    },
    expected_abortMultipartUploadStub_args: {
        Bucket: 'destination_bucket',
        Key: 'copied_object_name',
        UploadId: '1a2b3c4d'
    },

    // stubs responses
    uploadPartCopyStub_positive_response: {
        CopyPartResult: {
            LastModified: 'LastModified',
            ETag: '1a1b2s3d2f1e2g3sfsgdsg'
        }
    },
    createMultipartUploadStub_positive_response: {
        UploadId: '1a2b3c4d' 
    },
    completeMultipartUploadStub_positive_response: {
        undefined
    },
    all_stubs_error_response: 
        new Error('test_error'),
    abortMultipartUploadStub_positive_response: {
        undefined
    },
    listPartsStub_positive_response: {
        Parts: [] 
    },
    listPartsStub_negative_response: {
        Parts: ['part 1', 'part 2']
    },
    expected_abort_rejection_response: expected_abortMultipartUpload_error
}
