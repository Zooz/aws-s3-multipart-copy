'use strict';

const DEFAULT_COPY_PART_SIZE_BYTES = 50000000; // 50 MB in bytes
const DEFAULT_COPIED_OBJECT_PERMISSIONS = 'private';

let s3, logger;

var init = async function (aws_s3_object, initialized_logger) {
    s3 = aws_s3_object;
    logger = initialized_logger;

    try {
        let s3Response = await s3.listBuckets().promise();
        logger.info({ msg: 'S3 client is valid' })

        return Promise.resolve();
    } catch (err) {
        let error = new Error('Failed to initiate s3 connection');
        error.details = 'Logger and\or S3 instance are invalid'
        error.err = err;

        return Promise.reject(error);
    }
};

var copyLargeObject = async function ({ source_bucket, object_key, destination_bucket, copied_object_name, object_size, copy_part_size_bytes, copied_object_permissions, expiration_period }, request_context) {
    let upload_id = await initiateMultipartCopy(destination_bucket, copied_object_name, copied_object_permissions, expiration_period, request_context);
    let partitionsRangeArray = calculatePartitionsRangeArray(object_size, copy_part_size_bytes);
    let copyPartFunctionsArray = [];

    partitionsRangeArray.forEach((partitionRange, index) => {
        copyPartFunctionsArray.push(copyPart(source_bucket, destination_bucket, index + 1, object_key, partitionRange, copied_object_name, upload_id));
    });

    return Promise.all(copyPartFunctionsArray)
        .then((copy_results) => {
            logger.info({ msg: 'copied all parts successfully: ' + copy_results.toString(), context: request_context })

            prepareResultsForCopyCompletion(copy_results);
            return completeMultipartCopy(destination_bucket, copy_results, copied_object_name, upload_id, request_context);
        })
        .catch((err) => {
            return abortMultipartCopy(destination_bucket, copied_object_name, upload_id, request_context);
        });
};

function initiateMultipartCopy(destination_bucket, copied_object_name, copied_object_permissions, expiration_period, request_context) {
    let params = {
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
    let params = {
        Bucket: destination_bucket,
        CopySource: source_bucket + '/' + object_key,
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
    let params = {
        Bucket: destination_bucket,
        Key: copied_object_name,
        UploadId: upload_id
    };

    return s3.abortMultipartCopy(params).promise()
        .then((result) => {
            logger.info({ msg: 'multipart copy aborted successfully: ' + JSON.stringify(result), context: request_context });
            return Promise.resolve(result);
        })
        .catch((err) => {
            logger.error({ msg: 'multipart copy failed to abort', context: request_context, error: err });
            return Promise.reject(err);
        });
};

function completeMultipartCopy(destination_bucket, ETags_array, copied_object_name, upload_id, request_context) {
    let params = {
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
    let partitions = [];
    let copy_part_size = copy_part_size_bytes || DEFAULT_COPY_PART_SIZE_BYTES;
    let numOfPartitions = Math.floor(object_size / copy_part_size);
    let remainder = object_size % copy_part_size;
    let index, partition;

    for (index = 0; index < numOfPartitions; index++) {
        partition = (index * copy_part_size) + '-' + ((index + 1) * copy_part_size - 1);
        partitions.push(partition);
    }

    if (remainder !== 0) {
        partition = (index * copy_part_size) + '-' + (index * copy_part_size + remainder);
        partitions.push(partition);
    }

    return partitions;
};

function prepareResultsForCopyCompletion(copy_parts_results_array) {
    copy_parts_results_array.forEach((copy_part, index) => {
        copy_part = copy_part.CopyPartResult;
        copy_part.LastModified ? delete copy_part.LastModified : null;
        copy_part.PartNumber = index + 1;
    });

    return;

    // for (let index = 0; index < copy_parts_results_array.length; index++) {
    //     copy_parts_results_array[index] = copy_parts_results_array[index].CopyPartResult
    //     copy_parts_results_array[index].LastModified ? delete copy_parts_results_array[index].LastModified : null;
    //     copy_parts_results_array[index].PartNumber = index + 1;
    // }
};

module.exports = {
    init: init,
    copyLargeObject: copyLargeObject
};