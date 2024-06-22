import { type Request, type Response, type NextFunction } from "express"
import Responses from "../responses"
import type Server from "../"
import { extractKeyFromRequestParams } from "../utils"

export class DeleteObject {
	public constructor(private readonly server: Server) {
		this.handle = this.handle.bind(this)
	}

	public async handle(req: Request, res: Response, next: NextFunction): Promise<void> {
		if (req.url.includes("?")) {
			next()

			return
		}

		if (typeof req.params.key !== "string" || req.params.key.length === 0) {
			await Responses.error(res, 404, "NoSuchKey", "The specified key does not exist.")

			return
		}

		const key = extractKeyFromRequestParams(req)

		const object = await this.server.getObject(key)

		if (!object.exists) {
			await Responses.error(res, 404, "NoSuchKey", "The specified key does not exist.")

			return
		}

		await this.server.sdk.fs().unlink({
			path: `/${key}`,
			permanent: true
		})

		await Responses.noContent(res)
	}
}

export default DeleteObject
