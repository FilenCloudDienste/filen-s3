import { type Request, type Response } from "express"
import Responses from "../responses"
import type Server from "../"

export class DeleteObject {
	public constructor(private readonly server: Server) {
		this.handle = this.handle.bind(this)
	}

	public async handle(req: Request, res: Response): Promise<void> {
		const key = req.params.key

		if (typeof key !== "string") {
			await Responses.error(res, 404, "NoSuchKey", "The specified key does not exist.")

			return
		}

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
