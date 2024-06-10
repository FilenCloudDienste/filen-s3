<br/>
<p align="center">
  <h3 align="center">Filen S3</h3>

  <p align="center">
    A package to start a S3 server for a Filen account.
    <br/>
    <br/>
  </p>
</p>

![Contributors](https://img.shields.io/github/contributors/FilenCloudDienste/filen-s3?color=dark-green) ![Forks](https://img.shields.io/github/forks/FilenCloudDienste/filen-s3?style=social) ![Stargazers](https://img.shields.io/github/stars/FilenCloudDienste/filen-s3?style=social) ![Issues](https://img.shields.io/github/issues/FilenCloudDienste/filen-s3) ![License](https://img.shields.io/github/license/FilenCloudDienste/filen-s3)

# Attention

The package is still a work in progress. DO NOT USE IT IN PRODUCTION YET. Class names, function names, types, definitions, constants etc. are subject to change until we release a fully tested and stable version.

### Installation

1. Install using NPM

```sh
npm install @filen/s3@latest
```

2. Initialize the server and query it using aws-sdk

```typescript
import S3Server from "@filen/s3"
import { S3 } from "aws-sdk"

const server = new S3Server({
	hostname: "127.0.0.1",
	port: 1700,
	user: {
		accessKeyId: "admin",
		secretKeyId: "admin",
		sdkConfig
	}
})

const s3 = new S3({
	accessKeyId: "admin",
	secretAccessKey: "admin",
	endpoint: "http://127.0.0.1:1700",
	s3ForcePathStyle: true, // Needed
	region: "filen" // Needed
})

// Start the server
await server.start()

// List objects
await s3
	.listObjectsV2({
		Bucket: "default",
		Prefix: ""
	})
	.promise()
```

## S3 Compatibility

<b>Only methods listed here are currently implemented.</b>
Due to the underlying storage most methods are not possible to implement, though we try to implement all "fundamental" needed methods.

<table>
  <thead>
    <tr>
      <th>
        Method
      </th>
      <th>
        100% Compatible
      </th>
      <th>
        Info
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        ListObjectsV2
      </td>
      <td>
        🟥
      </td>
      <td>
        <ul>
          <li>Only supports Prefix parameter.</li>
          <li>Delimeter is always set to "/".</li>
          <li>Depth is always 0.</li>
          <li>EncodingType is always UTF-8.</li>
          <li>There are no ContinuationTokens. The server always responds with all keys matching the Prefix.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>
        ListBuckets
      </td>
      <td>
        ✅
      </td>
      <td>
        &nbsp;
      </td>
    </tr>
    <tr>
      <td>
        HeadBucket
      </td>
      <td>
        🟥
      </td>
      <td>
        <ul>
          <li>Only returns "x-amz-bucket-region" header.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>
        HeadObject
      </td>
      <td>
        ✅
      </td>
      <td>
        &nbsp;
      </td>
    </tr>
    <tr>
      <td>
        GetObject
      </td>
      <td>
        ✅
      </td>
      <td>
        &nbsp;
      </td>
    </tr>
    <tr>
      <td>
        DeleteObject
      </td>
      <td>
        ✅
      </td>
      <td>
        <ul>
          <li>Also supports deleting directories.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>
        PutObject
      </td>
      <td>
        🟥
      </td>
      <td>
        <ul>
          <li>Only returns ETag header.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>
        CopyObject
      </td>
      <td>
        🟥
      </td>
      <td>
        <ul>
          <li>Only returns ETag and LastModified as the CopyObjectResult.</li>
        </ul>
      </td>
    </tr>
  </tbody>
</table>

## License

Distributed under the AGPL-3.0 License. See [LICENSE](https://github.com/FilenCloudDienste/filen-s3/blob/main/LICENSE.md) for more information.
