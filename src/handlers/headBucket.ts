import { type Request, type Response } from "express"
import type Server from "../"
import Responses from "../responses"
import { extractKeyAndBucketFromRequestParams, normalizeKey } from "../utils"

export class HeadBucket {
	public constructor(private readonly server: Server) {
		this.handle = this.handle.bind(this)
	}

	public async handle(req: Request, res: Response): Promise<void> {
		try {
			const { bucket } = extractKeyAndBucketFromRequestParams(req)

			if (!bucket) {
				await Responses.error(res, 404, "NoSuchBucket", "Bucket not found.")

				return
			}

			const object = await this.server.getObject(normalizeKey(bucket))

			if (!object.exists || object.stats.type !== "directory") {
				await Responses.error(res, 404, "NoSuchBucket", "Bucket not found.")

				return
			}

			res.set("x-amz-bucket-region", this.server.region)
			res.set("Content-Length", "0")
			res.status(200)

			await new Promise<void>(resolve => {
				res.end(() => {
					resolve()
				})
			})
		} catch (e) {
			this.server.logger.log("error", e, "headBucket")
			this.server.logger.log("error", e)

			Responses.error(res, 500, "InternalError", "Internal server error.").catch(() => {})
		}
	}
}

export default HeadBucket
