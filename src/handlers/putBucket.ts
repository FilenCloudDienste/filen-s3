import { type Request, type Response } from "express"
import type Server from "../"
import Responses from "../responses"

export class PutBucket {
	public constructor(private readonly server: Server) {
		this.handle = this.handle.bind(this)
	}

	public async handle(_: Request, res: Response): Promise<void> {
		try {
			await Responses.ok(res)
		} catch (e) {
			this.server.logger.log("error", e, "putBucket")
			this.server.logger.log("error", e)

			Responses.error(res, 500, "InternalError", "Internal server error.").catch(() => {})
		}
	}
}

export default PutBucket
