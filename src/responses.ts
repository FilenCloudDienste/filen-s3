import { type Response } from "express"
import { Builder } from "xml2js"
import { type FSStatsObject } from "./handlers/listObjects"
import crypto from "crypto"

export class Responses {
	public static readonly xmlBuilder = new Builder({
		xmldec: {
			version: "1.0",
			encoding: "utf-8"
		}
	})

	public static async listBuckets(
		res: Response,
		buckets: { name: string; creationDate: number }[],
		owner: {
			id: string
			displayName: string
		}
	): Promise<void> {
		if (res.headersSent) {
			return
		}

		const response = this.xmlBuilder.buildObject({
			ListAllMyBucketsResult: {
				$: { xmlns: "http://s3.amazonaws.com/doc/2006-03-01/" },
				Buckets: {
					Bucket: buckets.map(bucket => ({
						CreationDate: new Date(bucket.creationDate).toISOString(),
						Name: bucket.name,
						BucketRegion: "filen"
					}))
				},
				Owner: {
					ID: crypto.createHash("sha256").update(owner.id).digest("hex"),
					DisplayName: ""
				}
			}
		})

		res.set("Content-Type", "application/xml; charset=utf-8")
		res.set("Content-Length", Buffer.byteLength(response).toString())
		res.set("Date", new Date().toUTCString())
		res.status(200)

		await new Promise<void>(resolve => {
			res.end(response, () => {
				resolve()
			})
		})
	}

	public static async error(res: Response, status: number, code: string, message: string): Promise<void> {
		if (res.headersSent) {
			return
		}

		const response = this.xmlBuilder.buildObject({
			Error: {
				Code: code,
				Message: message
			}
		})

		res.set("Content-Type", "application/xml; charset=utf-8")
		res.set("Content-Length", Buffer.byteLength(response).toString())
		res.set("Date", new Date().toUTCString())
		res.status(status)

		await new Promise<void>(resolve => {
			res.end(response, () => {
				resolve()
			})
		})
	}

	public static async listObjectsV2(
		res: Response,
		prefix: string,
		objects: FSStatsObject[],
		commonPrefixes: string[],
		bucket: string,
		delimiter: string
	): Promise<void> {
		if (res.headersSent) {
			return
		}

		const response = this.xmlBuilder.buildObject({
			ListBucketResult: {
				IsTruncated: false,
				Contents: objects.map(object => ({
					Key: object.path,
					LastModified: new Date(object.mtimeMs).toISOString(),
					Size: object.size.toString(),
					ETag: `"${object.uuid}"`,
					StorageClass: "STANDARD",
					ChecksumAlgorithm: []
				})),
				CommonPrefixes: commonPrefixes.map(prefix => ({
					Prefix: prefix
				})),
				KeyCount: objects.length.toString(),
				Prefix: prefix,
				Delimeter: delimiter,
				MaxKeys: 1000000,
				Name: bucket
			}
		})

		res.set("Content-Type", "application/xml; charset=utf-8")
		res.set("Content-Length", Buffer.byteLength(response).toString())
		res.set("Date", new Date().toUTCString())
		res.status(200)

		await new Promise<void>(resolve => {
			res.end(response, () => {
				resolve()
			})
		})
	}

	public static async copyObject(res: Response, result: { eTag: string; lastModified: number }): Promise<void> {
		if (res.headersSent) {
			return
		}

		const response = this.xmlBuilder.buildObject({
			CopyObjectResult: {
				ETag: result.eTag,
				LastModified: new Date(result.lastModified).toISOString()
			}
		})

		res.set("Content-Type", "application/xml; charset=utf-8")
		res.set("Content-Length", Buffer.byteLength(response).toString())
		res.set("E-Tag", `"${result.eTag}"`)
		res.set("Date", new Date().toUTCString())
		res.status(200)

		await new Promise<void>(resolve => {
			res.end(response, () => {
				resolve()
			})
		})
	}

	public static async deleteObjects(
		res: Response,
		deleted: { Key: string }[],
		errors: { Key: string; Code: string; Message: string }[]
	): Promise<void> {
		if (res.headersSent) {
			return
		}

		const response = this.xmlBuilder.buildObject({
			DeleteResult: {
				Deleted: deleted.map(del => ({
					Key: del.Key
				})),
				Error: errors.map(error => ({
					Key: error.Key,
					Code: error.Code,
					Message: error.Message
				}))
			}
		})

		res.set("Content-Type", "application/xml; charset=utf-8")
		res.set("Content-Length", Buffer.byteLength(response).toString())
		res.set("Date", new Date().toUTCString())
		res.status(200)

		await new Promise<void>(resolve => {
			res.end(response, () => {
				resolve()
			})
		})
	}

	public static async getBucketLocation(res: Response): Promise<void> {
		if (res.headersSent) {
			return
		}

		const response = this.xmlBuilder.buildObject({
			LocationConstraint: {
				LocationConstraint: "filen"
			}
		})

		res.set("Content-Type", "application/xml; charset=utf-8")
		res.set("Content-Length", Buffer.byteLength(response).toString())
		res.set("Date", new Date().toUTCString())
		res.status(200)

		await new Promise<void>(resolve => {
			res.end(response, () => {
				resolve()
			})
		})
	}

	public static async ok(res: Response): Promise<void> {
		if (res.headersSent) {
			return
		}

		res.set("Content-Length", "0")
		res.set("Date", new Date().toUTCString())
		res.status(200)

		await new Promise<void>(resolve => {
			res.end(() => {
				resolve()
			})
		})
	}

	public static async noContent(res: Response): Promise<void> {
		if (res.headersSent) {
			return
		}

		res.set("Content-Length", "0")
		res.set("Date", new Date().toUTCString())
		res.status(204)

		await new Promise<void>(resolve => {
			res.end(() => {
				resolve()
			})
		})
	}

	public static async badRequest(res: Response): Promise<void> {
		if (res.headersSent) {
			return
		}

		res.set("Content-Length", "0")
		res.set("Date", new Date().toUTCString())
		res.status(400)

		await new Promise<void>(resolve => {
			res.end(() => {
				resolve()
			})
		})
	}
}

export default Responses
