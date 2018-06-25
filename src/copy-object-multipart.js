'use strict';

const _ = require('lodash');
const path = require('path');

const DEFAULT_COPY_PART_SIZE_BYTES = 50000000; // 50 MB in bytes
const DEFAULT_COPIED_OBJECT_PERMISSIONS = 'private';

let s3, logger;

const init = function (aws_s3_object, initialized_logger) {
    s3 = aws_s3_object;
    logger = initialized_logger;

    if (!_.get(s3, '__proto__.api.fullName') || !(s3.__proto__.api.fullName === 'Amazon Simple Storage Service')) {
        throw new Error('Invalid AWS.S3 object received');
    } else {
        if (logger && typeof logger.info === 'function' && typeof logger.error === 'function') {
            logger.info({ msg: 'S3 client initialized successfully' });
            return;
        } else {
            throw new Error('Invalid logger object received');
        }
    };
};

/**
 * Throws the error of initiateMultipartCopy in case such occures
 * @param {*} options an object of parameters obligated to hold the below keys
 * (note that copy_part_size_bytes, copied_object_permissions, expiration_period are optional and will be assigned with default values if not given)
 * @param {*} request_context optional parameter for logging purposes
 */
const copyObjectMultipart = async function ({ source_bucket, object_key, destination_bucket, copied_object_name, object_size, copy_part_size_bytes, copied_object_permissions, expiration_period }, request_context) {
    const upload_id = await initiateMultipartCopy(destination_bucket, copied_object_name, copied_object_permissions, expiration_period, request_context);
    const partitionsRangeArray = calculatePartitionsRangeArray(object_size, copy_part_size_bytes);
    const copyPartFunctionsArray = [];

    partitionsRangeArray.forEach((partitionRange, index) => {
        copyPartFunctionsArray.push(copyPart(source_bucket, destination_bucket, index + 1, object_key, partitionRange, copied_object_name, upload_id));
    });

    return Promise.all(copyPartFunctionsArray)
        .then((copy_results) => {
            logger.info({ msg: 'copied all parts successfully: ' + copy_results.toString(), context: request_context })

            const copyResultsForCopyCompletion = prepareResultsForCopyCompletion(copy_results);
            return completeMultipartCopy(destination_bucket, copyResultsForCopyCompletion, copied_object_name, upload_id, request_context);
        })
        .catch(() => {
            return abortMultipartCopy(destination_bucket, copied_object_name, upload_id, request_context);
        });
};

function initiateMultipartCopy(destination_bucket, copied_object_name, copied_object_permissions, expiration_period, request_context) {
    const params = {
        Bucket: destination_bucket,
        Key: copied_object_name,
        ACL: copied_object_permissions || DEFAULT_COPIED_OBJECT_PERMISSIONS
    };
    expiration_period ? params.Expires = expiration_period : null;

    return s3.createMultipartUpload(params).promise()
        .then((result) => {
            logger.info({ msg: 'multipart copy initiated successfully: ' + JSON.stringify(result), context: request_context });
            return Promise.resolve(result.UploadId);
        })
        .catch((err) => {
            logger.error({ msg: 'multipart copy failed to initiate', context: request_context, error: err });
            return Promise.reject(err);
        });
};

function copyPart(source_bucket, destination_bucket, part_number, object_key, partition_range, copied_object_name, upload_id) {
    const encodedSourceKey = encodeURIComponent(path.join(source_bucket, object_key))
    const params = {
        Bucket: destination_bucket,
        CopySource: encodedSourceKey,
        CopySourceRange: 'bytes=' + partition_range,
        Key: copied_object_name,
        PartNumber: part_number,
        UploadId: upload_id
    };

    return s3.uploadPartCopy(params).promise()
        .then((result) => {
            logger.info(`CopyPart ${part_number} succeeded: ${JSON.stringify(result)}`);
            return Promise.resolve(result);
        })
        .catch((err) => {
            logger.error(`CopyPart ${part_number} Failed: ${JSON.stringify(err)}`);
            return Promise.reject(err);
        })
}

function abortMultipartCopy(destination_bucket, copied_object_name, upload_id, request_context) {
    const params = {
        Bucket: destination_bucket,
        Key: copied_object_name,
        UploadId: upload_id
    };

    return s3.abortMultipartUpload(params).promise()
        .then(() => {
            return s3.listParts(params).promise()
        })
        .catch((err) => {
            logger.error({ msg: 'abort multipart copy failed', context: request_context, error: err });

            return Promise.reject(err);
        })
        .then((parts_list) => {
            if (parts_list.Parts.length > 0) {
                logger.error({ msg: 'abort multipart copy failed, copy parts were not removed', context: request_context, parts_list: parts_list });

                const err = new Error('Abort procedure passed but copy parts were not removed')
                err.details = parts_list;

                return Promise.reject(err);
            } else {
                logger.info({ msg: 'multipart copy aborted successfully: ' + JSON.stringify(parts_list), context: request_context });

                const err = new Error('multipart copy aborted');
                err.details = params;

                return Promise.reject(err);
            }
        });
};

function completeMultipartCopy(destination_bucket, ETags_array, copied_object_name, upload_id, request_context) {
    const params = {
        Bucket: destination_bucket,
        Key: copied_object_name,
        MultipartUpload: {
            Parts: ETags_array
        },
        UploadId: upload_id
    }

    return s3.completeMultipartUpload(params).promise()
        .then((result) => {
            logger.info({ msg: 'multipart copy completed successfully: ' + JSON.stringify(result), context: request_context });
            return Promise.resolve(result);
        })
        .catch((err) => {
            logger.error({ msg: 'Multipart upload failed', context: request_context, error: err });
            return Promise.reject(err);
        });
}

function calculatePartitionsRangeArray(object_size, copy_part_size_bytes) {
    const partitions = [];
    const copy_part_size = copy_part_size_bytes || DEFAULT_COPY_PART_SIZE_BYTES;
    const numOfPartitions = Math.floor(object_size / copy_part_size);
    const remainder = object_size % copy_part_size;
    let index, partition;

    for (index = 0; index < numOfPartitions; index++) {
        partition = (index * copy_part_size) + '-' + ((index + 1) * copy_part_size - 1);
        partitions.push(partition);
    }

    if (remainder !== 0) {
        partition = (index * copy_part_size) + '-' + (index * copy_part_size + remainder - 1);
        partitions.push(partition);
    }

    return partitions;
};

function prepareResultsForCopyCompletion(copy_parts_results_array) {
    const resultArray = [];

    copy_parts_results_array.forEach((copy_part, index) => {
        const newCopyPart = {};
        newCopyPart.ETag = copy_part.CopyPartResult.ETag;
        newCopyPart.PartNumber = index + 1;
        resultArray.push(newCopyPart);
    });

    return resultArray;
};

module.exports = {
    init: init,
    copyObjectMultipart: copyObjectMultipart
};
