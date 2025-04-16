import { type Request, type Response, type NextFunction } from "express"
import Responses from "../responses"
import type Server from "../"
import { Readable } from "stream"
import { type ReadableStream as ReadableStreamWebType } from "stream/web"
import mimeTypes from "mime-types"
import { parseByteRange, extractKeyAndBucketFromRequestParams } from "../utils"
import { validateQuery } from "../validate-query"

export class GetObject {
	public constructor(private readonly server: Server) {
		this.handle = this.handle.bind(this)
	}

	public async handle(req: Request, res: Response, next: NextFunction): Promise<void> {
		try {
			const isQueryAllowed = validateQuery(req.query, { "x-id": "GetObject" })
			if (!isQueryAllowed) {
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
			const totalLength = object.stats.size
			const range = req.headers.range || req.headers["content-range"]
			let start = 0
			let end = totalLength - 1

			if (range) {
				const parsedRange = parseByteRange(range, totalLength)

				if (!parsedRange) {
					await Responses.badRequest(res)

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

			res.set("Content-Disposition", `attachment; filename="${object.stats.name}"`)
			res.set("Content-Type", mimeType)
			res.set("Accept-Ranges", "bytes")
			res.set("Last-Modified", new Date(object.stats.mtimeMs).toUTCString())
			res.set("E-Tag", `"${object.stats.uuid}"`)

			const stream = this.server.sdk.cloud().downloadFileToReadableStream({
				uuid: object.stats.uuid,
				bucket: object.stats.bucket,
				region: object.stats.region,
				version: object.stats.version,
				key: object.stats.key,
				size: object.stats.size,
				chunks: object.stats.chunks,
				start,
				end
			})

			const nodeStream = Readable.fromWeb(stream as unknown as ReadableStreamWebType<Buffer>)

			const cleanup = () => {
				try {
					stream.cancel().catch(() => {})

					if (!nodeStream.closed && !nodeStream.destroyed) {
						nodeStream.destroy()
					}
				} catch {
					// Noop
				}
			}

			res.once("close", () => {
				cleanup()
			})

			res.once("error", () => {
				cleanup()
			})

			res.once("finish", () => {
				cleanup()
			})

			req.once("close", () => {
				cleanup()
			})

			req.once("error", () => {
				cleanup()
			})

			nodeStream.once("error", () => {
				cleanup()
			})

			nodeStream.pipe(res)
		} catch (e) {
			this.server.logger.log("error", e, "getObject")
			this.server.logger.log("error", e)

			Responses.error(res, 500, "InternalError", "Internal server error.").catch(() => {})
		}
	}
}

export default GetObject
