import { type Request, type Response, type NextFunction } from "express"
import Responses from "../responses"
import type Server from "../"
import { extractKeyAndBucketFromRequestParams } from "../utils"
import { validateQuery } from "../validate-query"

export class DeleteObject {
	public constructor(private readonly server: Server) {
		this.handle = this.handle.bind(this)
	}

	public async handle(req: Request, res: Response, next: NextFunction): Promise<void> {
		try {
			const isQueryAllowed = validateQuery(req.query, { "x-id": "DeleteObject" })
			if (!isQueryAllowed) {
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
