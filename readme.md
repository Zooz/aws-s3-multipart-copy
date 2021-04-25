[![NPM Version][npm-image]][npm-url]
[![Build Status][travis-image]][travis-url]
[![Test Coverage][coveralls-image]][coveralls-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![NSP Status](https://nodesecurity.io/orgs/zooz/projects/5da31d63-65ef-4580-9989-b412767fa9cb/badge)](https://nodesecurity.io/orgs/zooz/projects/5da31d63-65ef-4580-9989-b412767fa9cb)

# aws-s3-multipart-copy

Wraps [aws-sdk](https://www.npmjs.com/package/aws-sdk) with a multipart-copy manager, in order to provide an easy way to copy large objects from one bucket to another in aws-s3.
The module manages the copy parts order and bytes range according to the size of the object and the desired copy part size. It speeds up the multipart copying process by sending multiple copy-part requests simultaneously.

** The package supports aws-sdk version '2006-03-01' and above.

** The package supports node 8 version and above.

[![NPM](https://nodei.co/npm/aws-s3-multipart-copy.png)](https://nodei.co/npm/aws-s3-multipart-copy/)

## Installing

```
npm install aws-s3-multipart-copy
```

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
<!--**Table of Contents**  *generated with [DocToc](https://github.com/thlorenz/doctoc)*-->

- [init](#init)
- [copyObjectMultipart](#copyobjectmultipart)
    - [Request parameters](#request-parameters)
    - [Response](#response)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## init

aws-s3-multipart-copy is based on the aws-sdk and therefore requires an initialized AWS.S3 instance.

Also, it requires a logger instance which supports 'info' and 'error' level of logging (meaning logger.info and logger.error are functions).

### Example
```js
let bunyan = require('bunyan'),
    AWS = require('aws-sdk'),
    s3Module = require('aws-s3-multipart-copy');

let logger = bunyan.createLogger({
        name: 'copy-object-multipart',
        level: 'info',
        version: 1.0.0,
        logType: 'copy-object-multipart-log',
        serializers: { err: bunyan.stdSerializers.err }
    });

let s3 = new AWS.S3();

s3Module.init(s3, logger);
```

## copyObjectMultipart

After module is initialized, the copyObjectMultipart functionality is ready for usage.
copyObjectMultipart returns a promise and can only copy (and not upload) objects from bucket to bucket.

** Objects size for multipart copy must be at least 5MB. 

The method receives two parameters: options and request_context

### Request parameters
- options: Object (mandatory) - keys inside this object must be as specified below
    - source_bucket: String (mandatory) - The bucket that holds the object you wish to copy
    - object_key: String (mandatory) - The full path (including the name of the object) to the object you wish to copy
    - destination_bucket: String (mandatory) - The bucket that you wish to copy to
    - copied_object_name: String (mandatory) - The full path (including the name of the object) for the copied object in the destination bucket
    - object_size: Integer (mandatory) - A number indicating the size of the object you wish to copy in bytes
    - copy_part_size_bytes: Integer (optional) - A number indicating the size of each copy part in the process, if not passed it will be set to a default of 50MB. This value must be between 5MB and 5GB - 5MB.
        ** if object size does not divide exactly with the part size desired, last part will be smaller or larger (depending on remainder size)
    - copied_object_permissions: String (optional) - The permissions to be given for the copied object as specified in [aws s3 ACL docs](https://docs.aws.amazon.com/AmazonS3/latest/dev/acl-overview.html#permissions), if not passed it will be set to a default of 'private'
    - expiration_period: Integer/Date (optional) - A number (milliseconds) or Date indicating the time the copied object will remain in the destination before it will be deleted, if not passed there will be no expiration period for the object
    - content_type: String (optional) A standard MIME type describing the format of the object data
    - metadata: Object (optional) - A map of metadata to store with the object in S3
    - cache_control: String (optional) - Specifies caching behavior along the request/reply chain
    - storage_class: String (optional) - Specifies the storage class as specified in [the s3 sdk](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#createMultipartUpload-property)
- request_context: String (optional) - this parameter will be logged in every log message, if not passed it will remain undefined.

### Response
- A successful result might hold any of the following keys as specified in [aws s3 completeMultipartUpload docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#completeMultipartUpload-property)

    - Location — (String)
    - Bucket — (String)
    - Key — (String)
    - Expiration — (String) If the object expiration is configured, this will contain the expiration date (expiry-date) and rule ID (rule-id). The value of rule-id is URL encoded.
    - ETag — (String) Entity tag of the object.
    - ServerSideEncryption — (String) The Server-side encryption algorithm used when storing this object in S3 (e.g., AES256, aws:kms). Possible values include:
        - "AES256"
        - "aws:kms"
    - VersionId — (String) Version of the object.
    - SSEKMSKeyId — (String) If present, specifies the ID of the AWS Key Management Service (KMS) master encryption key that was used for the object.
    - RequestCharged — (String) If present, indicates that the requester was successfully charged for the request. Possible values include:
        - "requester"

- In case multipart copy fails, three scenarios are possible:
    - The copy will be aborted and copy parts will be deleted from s3 - copyObjectMultipart will reject
    - The abort procedure passed but the copy parts were not deleted from s3 - copyObjectMultipart will reject
    - The abort procedure fails and the copy parts will remain in s3 - copyObjectMultipart will reject

### Example

Positive
```js
let request_context = 'request_context';
let options = {
        source_bucket: 'source_bucket',
        object_key: 'object_key',
        destination_bucket: 'destination_bucket',
        copied_object_name: 'someLogicFolder/copied_object_name',
        object_size: 70000000,
        copy_part_size_bytes: 50000000,
        copied_object_permissions: 'bucket-owner-full-control',
        expiration_period: 100000
    };

    return s3Module.copyObjectMultipart(options, request_context)
        .then((result) => {
            console.log(result);    
        })
        .catch((err) => {
            // handle error
        })

        /* Response:
            result = {
                Bucket: "acexamplebucket", 
                ETag: "\"4d9031c7644d8081c2829f4ea23c55f7-2\"", 
                Expiration: 100000,
                Key: "bigobject", 
                Location: "https://examplebucket.s3.amazonaws.com/bigobject"
            }
        */
```

Negative 1 - abort action passed but copy parts were not removed
```js
let request_context = 'request_context';
let options = {
        source_bucket: 'source_bucket',
        object_key: 'object_key',
        destination_bucket: 'destination_bucket',
        copied_object_name: 'someLogicFolder/copied_object_name',
        object_size: 70000000,
        copy_part_size_bytes: 50000000,
        copied_object_permissions: 'bucket-owner-full-control',
        expiration_period: 100000
    };

    return s3Module.copyObjectMultipart(options, request_context)
        .then((result) => {
            // handle result 
        })
        .catch((err) => {
            console.log(err);
        })

        /*
            err = {
                message: 'Abort procedure passed but copy parts were not removed'
                details: {
                    Parts: ['part 1', 'part 2']
                    }
                }
        */
```
Negative 2 - abort action succeded
```js
let request_context = 'request_context';
let options = {
        source_bucket: 'source_bucket',
        object_key: 'object_key',
        destination_bucket: 'destination_bucket',
        copied_object_name: 'someLogicFolder/copied_object_name',
        object_size: 70000000,
        copy_part_size_bytes: 50000000,
        copied_object_permissions: 'bucket-owner-full-control',
        expiration_period: 100000
    };

    return s3Module.copyObjectMultipart(options, request_context)
        .then((result) => {
            // handle result 
        })
        .catch((err) => {
            console.log(err);
        })

        /*
            err = {
                    message: 'multipart copy aborted',
                    details: {
                        Bucket: destination_bucket,
                        Key: copied_object_name,
                        UploadId: upload_id
                    }
                }
        */
```

[npm-image]: https://img.shields.io/npm/v/aws-s3-multipart-copy.svg?style=flat
[npm-url]: https://npmjs.org/package/aws-s3-multipart-copy
[travis-image]: https://api.travis-ci.org/Zooz/aws-s3-multipart-copy.svg?branch=master
[travis-url]: https://travis-ci.org/Zooz/aws-s3-multipart-copy
[coveralls-image]: https://coveralls.io/repos/github/Zooz/aws-s3-multipart-copy/badge.svg?branch=master
[coveralls-url]: https://coveralls.io/repos/github/Zooz/aws-s3-multipart-copy/badge.svg?branch=master
[downloads-image]: http://img.shields.io/npm/dm/aws-s3-multipart-copy.svg?style=flat
[downloads-url]: https://npmjs.org/package/aws-s3-multipart-copy
[npm-stats]: https://nodei.co/npm/aws-s3-multipart-copy/