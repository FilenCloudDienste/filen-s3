import { type Request, type Response, type NextFunction } from "express"
import Responses from "../responses"
import type Server from "../"
import { type FSStats } from "@filen/sdk"
import { Readable } from "stream"
import { type ReadableStream as ReadableStreamWebType } from "stream/web"
import mimeTypes from "mime-types"

export class GetObject {
	public constructor(private readonly server: Server) {
		this.handle = this.handle.bind(this)
	}

	public async handle(req: Request, res: Response, next: NextFunction): Promise<void> {
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

		const stream = await this.server.sdk.cloud().downloadFileToReadableStream({
			uuid: object.uuid,
			bucket: object.bucket,
			region: object.region,
			version: object.version,
			key: object.key,
			size: object.size,
			chunks: object.chunks
		})

		const nodeStream = Readable.fromWeb(stream as unknown as ReadableStreamWebType<Buffer>)

		res.set("Content-Type", mimeTypes.lookup(object.name) || "application/octet-stream")
		res.set("Content-Disposition", `attachment; filename="${object.name}"`)
		res.set("Content-Length", object.size.toString())
		res.status(200)

		nodeStream.once("error", next)

		nodeStream.pipe(res)
	}
}

export default GetObject
