import { type Request, type Response, type NextFunction } from "express"
import Responses from "../responses"
import type Server from "../"
import { extractKeyAndBucketFromRequestParams } from "../utils"
import mimeTypes from "mime-types"

export class HeadObject {
	public constructor(private readonly server: Server) {
		this.handle = this.handle.bind(this)
	}

	public async handle(req: Request, res: Response, next: NextFunction): Promise<void> {
		try {
			if (req.url.includes("?")) {
				next()

				return
			}

			const { key, bucket, path } = extractKeyAndBucketFromRequestParams(req)

			if (!key || !bucket || !path) {
				await Responses.error(res, 404, "NoSuchKey", "The specified key does not exist.")

				return
			}

			const object = await this.server.getObject(path)

			if (!object.exists || object.stats.type === "directory") {
				await Responses.error(res, 404, "NoSuchKey", "The specified key does not exist.")

				return
			}

			const mimeType = mimeTypes.lookup(object.stats.name) || "application/octet-stream"

			res.set("Content-Type", mimeType)
			res.set("Accept-Ranges", "bytes")
			res.set("Last-Modified", new Date(object.stats.mtimeMs).toUTCString())
			res.set("E-Tag", `"${object.stats.uuid}"`)
			res.set("Content-Length", object.stats.size.toString())
			res.status(200)

			await new Promise<void>(resolve => {
				res.end(() => {
					resolve()
				})
			})
		} catch (e) {
			this.server.logger.log("error", e, "headObject")
			this.server.logger.log("error", e)

			Responses.error(res, 500, "InternalError", "Internal server error.").catch(() => {})
		}
	}
}

export default HeadObject
