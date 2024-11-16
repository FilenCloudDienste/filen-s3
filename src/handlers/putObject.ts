import { type Request, type Response, type NextFunction } from "express"
import Responses from "../responses"
import type Server from "../"
import pathModule from "path"
import { normalizeKey, extractKeyFromRequestParams, convertTimestampToMs } from "../utils"
import { Readable } from "stream"

export class PutObject {
	public constructor(private readonly server: Server) {
		this.handle = this.handle.bind(this)
	}

	public async copy(req: Request, res: Response): Promise<void> {
		const copySource = req.headers["x-amz-copy-source"]

		if (typeof copySource !== "string" || copySource.length === 0) {
			await Responses.error(res, 400, "BadRequest", "Invalid copy source.")

			return
		}

		const copySourceDecoded = decodeURI(copySource)
		const copySourceNormalized = normalizeKey(
			copySourceDecoded.startsWith(`/${this.server.bucketName}/`)
				? copySourceDecoded.slice(`/${this.server.bucketName}/`.length)
				: copySourceDecoded.startsWith(`${this.server.bucketName}/`)
				? copySourceDecoded.slice(`${this.server.bucketName}/`.length)
				: copySourceDecoded
		)
		const copyObject = await this.server.getObject(copySourceNormalized)

		if (!copyObject.exists || copyObject.stats.type === "directory") {
			await Responses.error(res, 412, "PreconditionFailed", "Copy source does not exist.")

			return
		}

		const key = extractKeyFromRequestParams(req)
		const path = normalizeKey(key)
		const parentPath = pathModule.posix.dirname(path)
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

		await this.server.sdk.fs().copy({
			from: normalizeKey(copySourceNormalized),
			to: path
		})

		const copiedObject = await this.server.getObject(key)

		if (!copiedObject.exists || copiedObject.stats.type === "directory") {
			await Responses.error(res, 500, "InternalError", "Internal server error.")

			return
		}

		await Responses.copyObject(res, {
			eTag: copiedObject.stats.uuid,
			lastModified: copiedObject.stats.lastModified
		})
	}

	public async mkdir(req: Request, res: Response): Promise<void> {
		const key = extractKeyFromRequestParams(req)
		const path = normalizeKey(key)
		const thisObject = await this.server.getObject(key)

		if (thisObject.exists) {
			await Responses.ok(res)

			return
		}

		await this.server.sdk.fs().mkdir({ path })

		await Responses.ok(res)
	}

	public async handle(req: Request, res: Response, next: NextFunction): Promise<void> {
		try {
			if (req.url.includes("?")) {
				next()

				return
			}

			if (typeof req.params.key !== "string" || req.params.key.length === 0) {
				await Responses.error(res, 400, "BadRequest", "Invalid key specified.")

				return
			}

			const isCopy = typeof req.headers["x-amz-copy-source"] === "string" && req.headers["x-amz-copy-source"].length > 0

			if (isCopy) {
				await this.copy(req, res)

				return
			}

			if (req.url.trim().endsWith("/") && req.bodySize === 0) {
				await this.mkdir(req, res)

				return
			}

			if (!req.bodySize || req.bodySize === 0 || !req.rawBody) {
				await Responses.error(res, 400, "BadRequest", "Invalid body.")

				return
			}

			const key = extractKeyFromRequestParams(req)
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

			const now = Date.now()
			let lastModified =
				typeof req.headers["x-amz-meta-mtime"] === "string" && req.headers["x-amz-meta-mtime"].length > 0
					? convertTimestampToMs(parseInt(req.headers["x-amz-meta-mtime"]))
					: now
			let creation =
				typeof req.headers["x-amz-meta-creation-time"] === "string" && req.headers["x-amz-meta-creation-time"].length > 0
					? convertTimestampToMs(parseInt(req.headers["x-amz-meta-creation-time"]))
					: now

			if (lastModified >= now) {
				lastModified = now
			}

			if (creation >= now) {
				creation = now
			}

			let didError = false
			const item = await this.server.sdk.cloud().uploadLocalFileStream({
				source: Readable.from(req.rawBody),
				parent: parentObject.stats.uuid,
				name,
				lastModified,
				creation,
				onError: () => {
					didError = true

					Responses.error(res, 500, "InternalError", "Internal server error.").catch(() => {})
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

			res.set("E-Tag", `"${item.uuid}"`)
			res.set("Last-Modified", new Date(item.lastModified).toUTCString())

			await Responses.ok(res)
		} catch (e) {
			this.server.logger.log("error", e, "putObject")
			this.server.logger.log("error", e)

			Responses.error(res, 500, "InternalError", "Internal server error.").catch(() => {})
		}
	}
}

export default PutObject
