import { type Request, type Response, type NextFunction } from "express"
import Responses from "../responses"
import type Server from "../"
import { parseByteRange, extractKeyFromRequestParams } from "../utils"
import mimeTypes from "mime-types"

export class HeadObject {
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

		if (!object.exists || object.stats.type === "directory") {
			await Responses.error(res, 404, "NoSuchKey", "The specified key does not exist.")

			return
		}

		const mimeType = mimeTypes.lookup(object.stats.name) || "application/octet-stream"
		const totalLength = object.stats.size
		const range = req.headers.range || req.headers["content-range"]
		let start = 0
		let end = totalLength - 1

		if (range) {
			const parsedRange = parseByteRange(range, totalLength)

			if (!parsedRange) {
				res.status(400).end()

				return
			}

			start = parsedRange.start
			end = parsedRange.end

			res.status(206)
			res.set("Content-Range", `bytes ${start}-${end}/${totalLength}`)
			res.set("Content-Length", (end - start + 1).toString())
		} else {
			res.status(200)
			res.set("Content-Length", object.stats.size.toString())
		}

		res.set("Content-Type", mimeType)
		res.set("Accept-Ranges", "bytes")

		await new Promise<void>(resolve => {
			res.end(() => {
				resolve()
			})
		})
	}
}

export default HeadObject
