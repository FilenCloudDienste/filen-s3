import { type Request, type Response } from "express"
import type Server from ".."
import Responses from "../responses"
import { extractKeyAndBucketFromRequestParams, normalizeKey, isValidBucketName } from "../utils"

export class CreateBucket {
	public constructor(private readonly server: Server) {
		this.handle = this.handle.bind(this)
	}

	public async handle(req: Request, res: Response): Promise<void> {
		try {
			const { bucket } = extractKeyAndBucketFromRequestParams(req)

			if (!bucket || !isValidBucketName(bucket)) {
				await Responses.error(res, 400, "BadRequest", "Invalid bucket specified.")

				return
			}

			await this.server.sdk.fs().mkdir({ path: normalizeKey(bucket) })

			await Responses.ok(res)
		} catch (e) {
			this.server.logger.log("error", e, "createBucket")
			this.server.logger.log("error", e)

			Responses.error(res, 500, "InternalError", "Internal server error.").catch(() => {})
		}
	}
}

export default CreateBucket
