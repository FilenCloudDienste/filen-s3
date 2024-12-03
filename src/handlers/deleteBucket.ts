import { type Request, type Response } from "express"
import type Server from ".."
import Responses from "../responses"
import { extractKeyAndBucketFromRequestParams } from "../utils"

export class DeleteBucket {
	public constructor(private readonly server: Server) {
		this.handle = this.handle.bind(this)
	}

	public async handle(req: Request, res: Response): Promise<void> {
		try {
			const { bucket } = extractKeyAndBucketFromRequestParams(req)

			if (!bucket) {
				await Responses.noContent(res)

				return
			}

			await this.server.sdk.fs().unlink({
				path: `/${bucket}`,
				permanent: false
			})

			await Responses.noContent(res)
		} catch (e) {
			this.server.logger.log("error", e, "deleteBucket")
			this.server.logger.log("error", e)

			Responses.error(res, 500, "InternalError", "Internal server error.").catch(() => {})
		}
	}
}

export default DeleteBucket
