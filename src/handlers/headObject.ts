import { type Request, type Response } from "express"
import Responses from "../responses"
import type Server from "../"
import { type FSStats } from "@filen/sdk"
import mimeTypes from "mime-types"

export class HeadObject {
	public constructor(private readonly server: Server) {
		this.handle = this.handle.bind(this)
	}

	public async handle(req: Request, res: Response): Promise<void> {
		const key = req.params.key

		if (typeof key !== "string") {
			await Responses.error(res, 404, "NoSuchKey", "The specified key does not exist.")

			return
		}

		let object: FSStats | null = null

		try {
			object = await this.server.sdk.fs().stat({ path: `/${key}` })
		} catch {
			await Responses.error(res, 404, "NoSuchKey", "The specified key does not exist.")

			return
		}

		if (!object || object.type === "directory") {
			await Responses.error(res, 404, "NoSuchKey", "The specified key does not exist.")

			return
		}

		res.set("Content-Type", mimeTypes.lookup(object.name) || "application/octet-stream")
		res.set("Content-Disposition", `attachment; filename="${object.name}"`)
		res.set("Content-Length", object.size.toString())

		await Responses.ok(res)
	}
}

export default HeadObject
