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

### Installation

1. Install using NPM

```sh
npm install @filen/s3@latest
```

2. Initialize the server and query it using aws-sdk

```typescript
import { FilenSDK } from "@filen/sdk"
import path from "path"
import os from "os"
import { S3Server } from "@filen/s3"
import { S3 } from "aws-sdk"

// Initialize a SDK instance (optional)
const filen = new FilenSDK({
	metadataCache: true,
	connectToSocket: true,
	tmpPath: path.join(os.tmpdir(), "filen-sdk")
})

await filen.login({
	email: "your@email.com",
	password: "supersecret123",
	twoFactorCode: "123456"
})

const hostname = "127.0.0.1"
const port = 1700
const https = false
const endpoint = `${https ? "https" : "http"}://${hostname === "127.0.0.1" ? "local.s3.filen.io" : hostname}:${port}`

const server = new S3Server({
	hostname,
	port,
	https,
	user: {
		accessKeyId: "admin",
		secretKeyId: "admin",
		sdk: filen
	}
})

const s3 = new S3({
	accessKeyId: "admin",
	secretAccessKey: "admin",
	endpoint,
	s3ForcePathStyle: true, // Needed
	region: "filen" // Needed
})

// Start the server
await server.start()

console.log(`S3 server started on ${endpoint}`)

// List objects
await s3
	.listObjectsV2({
		Bucket: "filen",
		Prefix: ""
	})
	.promise()
```

3. Initialize the server in cluster mode

```typescript
import { FilenSDK } from "@filen/sdk"
import path from "path"
import os from "os"
import { S3ServerCluster } from "@filen/s3"
import { S3 } from "aws-sdk"

// Initialize a SDK instance (optional)
const filen = new FilenSDK({
	metadataCache: true,
	connectToSocket: true,
	tmpPath: path.join(os.tmpdir(), "filen-sdk")
})

await filen.login({
	email: "your@email.com",
	password: "supersecret123",
	twoFactorCode: "123456"
})

const hostname = "127.0.0.1"
const port = 1700
const https = false
const endpoint = `${https ? "https" : "http"}://${hostname === "127.0.0.1" ? "local.s3.filen.io" : hostname}:${port}`

const server = new S3ServerCluster({
	hostname,
	port,
	https,
	user: {
		accessKeyId: "admin",
		secretKeyId: "admin",
		sdk: filen
	},
	threads: 16 // Number of threads to spawn. Defaults to CPU core count if omitted.
})

// Start the cluster
await server.start()

console.log(`S3 server cluster started on ${endpoint}`)
```

## S3 Compatibility

<b>Only methods listed here are currently implemented.</b>
Due to the underlying storage most methods are impossible to implement, though we try to implement all "fundamental" needed methods.
<b>Top level directories in your cloud are seen as buckets.</b>

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
        ListObjects
      </td>
      <td>
        🟥
      </td>
      <td>
        <ul>
          <li>Only supports Prefix parameter.</li>
          <li>Depth is always 0 if delimiter is "/", otherwise 10.</li>
          <li>EncodingType is always URL.</li>
          <li>There are no Markers. The server always responds with all keys matching the Prefix + Depth.</li>
          <li>*</li>
        </ul>
      </td>
    </tr>
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
          <li>Depth is always 0 if delimiter is "/", otherwise 10.</li>
          <li>EncodingType is always URL.</li>
          <li>There are no ContinuationTokens. The server always responds with all keys matching the Prefix + Depth.</li>
          <li>*</li>
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
        CreateBucket
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
        DeleteBucket
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
        GetBucketLocation
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
        *
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
        *
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
        DeleteObjects
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
          <li>Only returns ETag header. *</li>
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
          <li>Only returns ETag and LastModified as the CopyObjectResult. *</li>
        </ul>
      </td>
    </tr>
  </tbody>
</table>

Multipart uploads are not supported. `putObject` requests are fully buffered in memory. Make sure to not overwhelm your system memory limit.

<small>Presigned URLs are not yet supported.</small>

<small>\* An objects ETag is always its UUID. Since Filen is fully end-to-end encrypted there is no way to know the real MD5 file hash.</small>

## License

Distributed under the AGPL-3.0 License. See [LICENSE](https://github.com/FilenCloudDienste/filen-s3/blob/main/LICENSE.md) for more information.
