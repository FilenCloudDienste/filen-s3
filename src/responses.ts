import { type Response } from "express"
import { Builder } from "xml2js"
import { type FSStatsObject } from "./handlers/listObjectsV2"
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
		const response = this.xmlBuilder.buildObject({
			ListAllMyBucketsResult: {
				Buckets: buckets.map(bucket => ({
					Bucket: {
						CreationDate: new Date(bucket.creationDate).toISOString(),
						Name: bucket.name
					}
				})),
				Owner: {
					ID: crypto.createHash("sha256").update(owner.id).digest("hex"),
					DisplayName: ""
				}
			}
		})

		res.set("Content-Type", "application/xml; charset=utf-8")
		res.set("Content-Length", Buffer.from(response, "utf-8").byteLength.toString())
		res.status(200)

		await new Promise<void>(resolve => {
			res.end(response, () => {
				resolve()
			})
		})
	}

	public static async error(res: Response, status: number, code: string, message: string): Promise<void> {
		const response = this.xmlBuilder.buildObject({
			Error: {
				Code: code,
				Message: message
			}
		})

		res.set("Content-Type", "application/xml; charset=utf-8")
		res.set("Content-Length", Buffer.from(response, "utf-8").byteLength.toString())
		res.status(status)

		await new Promise<void>(resolve => {
			res.end(response, () => {
				resolve()
			})
		})
	}

	public static async listObjectsV2(res: Response, prefix: string, objects: FSStatsObject[], commonPrefixes: string[]): Promise<void> {
		const response = this.xmlBuilder.buildObject({
			ListBucketResult: {
				IsTruncated: false,
				Contents: objects.map(object => ({
					Key: object.path.slice(1),
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
				Delimeter: "/"
			}
		})

		res.set("Content-Type", "application/xml; charset=utf-8")
		res.set("Content-Length", Buffer.from(response, "utf-8").byteLength.toString())
		res.status(200)

		await new Promise<void>(resolve => {
			res.end(response, () => {
				resolve()
			})
		})
	}

	public static async copyObject(res: Response, result: { eTag: string; lastModified: number }): Promise<void> {
		const response = this.xmlBuilder.buildObject({
			CopyObjectResult: {
				ETag: result.eTag,
				LastModified: new Date(result.lastModified).toISOString()
			}
		})

		res.set("Content-Type", "application/xml; charset=utf-8")
		res.set("Content-Length", Buffer.from(response, "utf-8").byteLength.toString())
		res.status(200)

		await new Promise<void>(resolve => {
			res.end(response, () => {
				resolve()
			})
		})
	}

	public static async ok(res: Response): Promise<void> {
		res.set("Content-Length", "0")
		res.status(200)

		await new Promise<void>(resolve => {
			res.end(() => {
				resolve()
			})
		})
	}

	public static async noContent(res: Response): Promise<void> {
		res.set("Content-Length", "0")
		res.status(204)

		await new Promise<void>(resolve => {
			res.end(() => {
				resolve()
			})
		})
	}

	public static async badRequest(res: Response): Promise<void> {
		res.set("Content-Length", "0")
		res.status(400)

		await new Promise<void>(resolve => {
			res.end(() => {
				resolve()
			})
		})
	}
}

export default Responses
