import { type Response } from "express"
import { Builder } from "xml2js"
import { type FSStats } from "@filen/sdk"
import pathModule from "path"

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
					ID: owner.id,
					DisplayName: owner.displayName
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

	public static async listObjectsV2(res: Response, path: string, prefix: string, objects: FSStats[]): Promise<void> {
		const response = this.xmlBuilder.buildObject({
			ListBucketResult: {
				IsTruncated: false,
				Contents: objects.map(object => ({
					Key: path === "/" ? object.name : pathModule.posix.join(path, object.name),
					LastModified: new Date(object.mtimeMs).toISOString(),
					Size: object.size.toString(),
					ETag: object.uuid,
					StorageClass: "default"
				})),
				KeyCount: objects.length.toString(),
				ContinuationToken: "",
				NextContinuationToken: "",
				Prefix: prefix,
				StartAfter: "",
				MaxKeys: Number.MAX_SAFE_INTEGER.toString()
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
}

export default Responses
