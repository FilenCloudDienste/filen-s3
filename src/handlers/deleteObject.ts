import { type Request, type Response, type NextFunction } from "express"
import Responses from "../responses"
import type Server from "../"
import { extractKeyAndBucketFromRequestParams } from "../utils"

export class DeleteObject {
	public constructor(private readonly server: Server) {
		this.handle = this.handle.bind(this)
	}

	public async handle(req: Request, res: Response, next: NextFunction): Promise<void> {
		try {
			if (req.url.includes("?")) {
				next()

				return
			}

			const { path } = extractKeyAndBucketFromRequestParams(req)

			if (!path) {
				await Responses.noContent(res)

				return
			}

			const object = await this.server.getObject(path)

			if (!object.exists) {
				await Responses.noContent(res)

				return
			}

			await this.server.sdk.fs().unlink({
				path,
				permanent: false
			})

			await Responses.noContent(res)
		} catch (e) {
			this.server.logger.log("error", e, "deleteObject")
			this.server.logger.log("error", e)

			Responses.error(res, 500, "InternalError", "Internal server error.").catch(() => {})
		}
	}
}

export default DeleteObject
