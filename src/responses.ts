import { type Response } from "express"
import { Builder } from "xml2js"

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
}

export default Responses
