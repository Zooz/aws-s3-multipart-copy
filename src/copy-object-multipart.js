'use strict';
const {
    CreateMultipartUploadCommand,
    UploadPartCopyCommand,
    CompleteMultipartUploadCommand,
    AbortMultipartUploadCommand,
    ListPartsCommand
} = require("@aws-sdk/client-s3");

const COPY_PART_SIZE_MINIMUM_BYTES = 5242880; // 5MB in bytes
const DEFAULT_COPY_PART_SIZE_BYTES = 50000000; // 50 MB in bytes
const DEFAULT_COPIED_OBJECT_PERMISSIONS = 'private';

let s3, logger;

const init = function (aws_s3_object, initialized_logger) {
    s3 = aws_s3_object;
    logger = initialized_logger;

    if ( s3 === undefined || s3.constructor.name !== 'S3Client') {
        throw new Error('Invalid AWS.S3 object received');
    } else {
        if (logger && typeof logger.info === 'function' && typeof logger.error === 'function') {
            logger.info({ msg: 'S3 client initialized successfully' });
        } else {
            throw new Error('Invalid logger object received');
        }
    }
};

/**
 * Throws the error of initiateMultipartCopy in case such occures
 * @param {*} options an object of parameters obligated to hold the below keys
 * (note that copy_part_size_bytes, copied_object_permissions, expiration_period are optional and will be assigned with default values if not given)
 * @param {*} request_context optional parameter for logging purposes
 */
const copyObjectMultipart = async function ({ source_bucket, object_key, destination_bucket, copied_object_name, object_size, copy_part_size_bytes, copied_object_permissions, expiration_period, server_side_encryption, content_type, content_disposition, content_encoding, content_language, metadata, cache_control, storage_class}, request_context) {
    const upload_id = await initiateMultipartCopy(destination_bucket, copied_object_name, copied_object_permissions, expiration_period, request_context, server_side_encryption, content_type, content_disposition,  content_encoding, content_language, metadata, cache_control, storage_class);
    const partitionsRangeArray = calculatePartitionsRangeArray(object_size, copy_part_size_bytes);
    const copyPartFunctionsArray = [];

    partitionsRangeArray.forEach((partitionRange, index) => {
        copyPartFunctionsArray.push(copyPart(source_bucket, destination_bucket, index + 1, object_key, partitionRange, copied_object_name, upload_id));
    });

    return Promise.all(copyPartFunctionsArray)
        .then((copy_results) => {
            logger.info({ msg: `copied all parts successfully: ${JSON.stringify(copy_results)}`, context: request_context });

            const copyResultsForCopyCompletion = prepareResultsForCopyCompletion(copy_results);
            return completeMultipartCopy(destination_bucket, copyResultsForCopyCompletion, copied_object_name, upload_id, request_context);
        })
        .catch(() => {
            return abortMultipartCopy(destination_bucket, copied_object_name, upload_id, request_context);
        });
};

async function initiateMultipartCopy(destination_bucket, copied_object_name, copied_object_permissions, expiration_period, request_context, server_side_encryption, content_type, content_disposition, content_encoding, content_language, metadata, cache_control, storage_class) {
    const params = {
        Bucket: destination_bucket,
        Key: copied_object_name,
        ACL: copied_object_permissions || DEFAULT_COPIED_OBJECT_PERMISSIONS
    };
    expiration_period ? params.Expires = expiration_period : null;
    content_type ? params.ContentType = content_type : null;
    content_disposition ? params.ContentDisposition = content_disposition : null;
    content_encoding ? params.ContentEncoding = content_encoding : null;
    content_language ? params.ContentLanguage = content_language : null;
    metadata ? params.Metadata = metadata : null;
    cache_control ? params.CacheControl = cache_control : null;
    server_side_encryption ? params.ServerSideEncryption = server_side_encryption : null;
    storage_class ? params.StorageClass = storage_class : null;

    try {
        const result = await s3.send(new CreateMultipartUploadCommand(params));
        logger.info({ msg: `multipart copy initiated successfully: ${JSON.stringify(result)}`, context: request_context });
        return result.UploadId;
    }
    catch (err) {
        logger.error({ msg: 'multipart copy failed to initiate', context: request_context, error: err.message });
        throw err;
    };
}

async function copyPart(source_bucket, destination_bucket, part_number, object_key, partition_range, copied_object_name, upload_id) {
    const encodedSourceKey = encodeURIComponent(`${source_bucket}/${object_key}`);
    const params = {
        Bucket: destination_bucket,
        CopySource: encodedSourceKey,
        CopySourceRange: 'bytes=' + partition_range,
        Key: copied_object_name,
        PartNumber: part_number,
        UploadId: upload_id
    };

    try {
        const result = await s3.send(new UploadPartCopyCommand(params));
        logger.info({ msg: `CopyPart ${part_number} succeeded: ${JSON.stringify(result)}` });
        return result;
    } 
    catch (err) {
        logger.error({ msg: `CopyPart ${part_number} Failed: ${JSON.stringify(err.message)}`, error: err.message });
        throw err;
    };
}

async function abortMultipartCopy(destination_bucket, copied_object_name, upload_id, request_context) {
    const params = {
        Bucket: destination_bucket,
        Key: copied_object_name,
        UploadId: upload_id
    };

    let parts_list;
    try { 
        await s3.send(new AbortMultipartUploadCommand(params)); 
        parts_list = await s3.send(new ListPartsCommand(params));
    }
    catch (err) {
        logger.error({ msg: 'abort multipart copy failed', context: request_context, error: err.message });
        throw err;
    }

    if (parts_list.Parts.length > 0) {
        const err = new Error('Abort procedure passed but copy parts were not removed');
        err.details = parts_list;
        logger.error({ msg: 'abort multipart copy failed, copy parts were not removed', context: request_context, error: err });
        throw err;
    } else {
        logger.info({ msg: `multipart copy aborted successfully: ${JSON.stringify(parts_list)}`, context: request_context });
        const err = new Error('multipart copy aborted');
        err.details = params;
        throw err;
    }
}

async function completeMultipartCopy(destination_bucket, ETags_array, copied_object_name, upload_id, request_context) {
    const params = {
        Bucket: destination_bucket,
        Key: copied_object_name,
        MultipartUpload: {
            Parts: ETags_array
        },
        UploadId: upload_id
    };

    try {
        const result = await s3.send(new CompleteMultipartUploadCommand(params)); 
        logger.info({ msg: `multipart copy completed successfully: ${JSON.stringify(result)}`, context: request_context });
            result;
        }
        catch(err)  {
            logger.error({ msg: 'Multipart upload failed', context: request_context, error: err.message });
            throw err;
        };
}

function calculatePartitionsRangeArray(object_size, copy_part_size_bytes) {
    const partitions = [];
    const copy_part_size = copy_part_size_bytes || DEFAULT_COPY_PART_SIZE_BYTES;
    const numOfPartitions = Math.floor(object_size / copy_part_size);
    const remainder = object_size % copy_part_size;
    let index, partition;

    for (index = 0; index < numOfPartitions; index++) {
        const nextIndex = index + 1;
        if (nextIndex === numOfPartitions && remainder < COPY_PART_SIZE_MINIMUM_BYTES) {
            partition = (index * copy_part_size) + '-' + ((nextIndex) * copy_part_size + remainder - 1);
        } else {
            partition = (index * copy_part_size) + '-' + ((nextIndex) * copy_part_size - 1);
        }
        partitions.push(partition);
    }

    if (remainder >= COPY_PART_SIZE_MINIMUM_BYTES) {
        partition = (index * copy_part_size) + '-' + (index * copy_part_size + remainder - 1);
        partitions.push(partition);
    }

    return partitions;
}

function prepareResultsForCopyCompletion(copy_parts_results_array) {
    const resultArray = [];

    copy_parts_results_array.forEach((copy_part, index) => {
        const newCopyPart = {};
        newCopyPart.ETag = copy_part.CopyPartResult.ETag;
        newCopyPart.PartNumber = index + 1;
        resultArray.push(newCopyPart);
    });

    return resultArray;
}

module.exports = {
    init: init,
    copyObjectMultipart: copyObjectMultipart
};
