import { type Request, type Response, type NextFunction } from "express"
import Responses from "../responses"
import type Server from "../"
import pathModule from "path"
import { normalizeKey } from "../utils"

export class PutObject {
	public constructor(private readonly server: Server) {
		this.handle = this.handle.bind(this)
	}

	public async handle(req: Request, res: Response, next: NextFunction): Promise<void> {
		const key = req.params.key

		if (typeof key !== "string") {
			await Responses.error(res, 400, "BadRequest", "Invalid key specified.")

			return
		}

		const path = normalizeKey(key)
		const parentPath = pathModule.posix.dirname(path)
		const name = pathModule.posix.basename(path)
		const thisObject = await this.server.getObject(key)

		if (thisObject.exists && thisObject.stats.type === "directory") {
			await Responses.error(res, 400, "BadRequest", "Invalid key specified.")

			return
		}

		await this.server.sdk.fs().mkdir({ path: parentPath })

		const parentObject = await this.server.getObject(parentPath)

		if (!parentObject.exists || parentObject.stats.type !== "directory") {
			await Responses.error(res, 412, "PreconditionFailed", "Parent directory does not exist.")

			return
		}

		let didError = false
		const item = await this.server.sdk.cloud().uploadLocalFileStream({
			source: req,
			parent: parentObject.stats.uuid,
			name,
			onError: err => {
				didError = true

				next(err)
			}
		})

		if (didError) {
			return
		}

		if (item.type !== "file") {
			await Responses.error(res, 500, "InternalError", "Internal server error.")

			return
		}

		await this.server.sdk.fs()._removeItem({ path })
		await this.server.sdk.fs()._addItem({
			path,
			item: {
				type: "file",
				uuid: item.uuid,
				metadata: {
					name,
					size: item.size,
					lastModified: item.lastModified,
					creation: item.creation,
					hash: item.hash,
					key: item.key,
					bucket: item.bucket,
					region: item.region,
					version: item.version,
					chunks: item.chunks,
					mime: item.mime
				}
			}
		})

		res.set("ETag", item.uuid)

		await Responses.ok(res)
	}
}

export default PutObject
