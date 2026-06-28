import { type Request, type Response, type NextFunction } from "express"
import Responses from "../responses"
import type Server from "../"
import pathModule from "path"
import { normalizeKey, extractKeyAndBucketFromRequestParams, convertTimestampToMs, isValidObjectKey } from "../utils"
import { Readable } from "stream"
import { validateQuery } from "../validate-query"

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

		const { key, bucket, path } = extractKeyAndBucketFromRequestParams(req)

		if (!key || !bucket || !path || !isValidObjectKey(key)) {
			await Responses.error(res, 400, "BadRequest", "Invalid key specified.")

			return
		}

		const copySourceNormalized = normalizeKey(decodeURIComponent(copySource))
		const copyObject = await this.server.getObject(copySourceNormalized)

		if (!copyObject.exists || copyObject.stats.type === "directory") {
			await Responses.error(res, 412, "PreconditionFailed", "Copy source does not exist.")

			return
		}

		const parentPath = pathModule.posix.dirname(path)

		await this.server.sdk.fs().mkdir({ path: parentPath })

		const thisObject = await this.server.getObject(path)

		if (thisObject.exists) {
			await this.server.sdk.fs().unlink({
				path,
				permanent: false
			})
		}

		await this.server.sdk.fs().copy({
			from: copySourceNormalized,
			to: path
		})

		await this.server.sdk.fs().readdir({ path: parentPath })

		const copiedStats = await this.server.getObject(path)

		if (!copiedStats.exists || copiedStats.stats.type === "directory") {
			await Responses.error(res, 500, "InternalError", "Internal server error.")

			return
		}

		await Responses.copyObject(res, {
			eTag: copiedStats.stats.uuid,
			lastModified: copiedStats.stats.lastModified
		})
	}

	public async mkdir(req: Request, res: Response): Promise<void> {
		const { key, path } = extractKeyAndBucketFromRequestParams(req)

		if (!key || !path || !isValidObjectKey(key)) {
			await Responses.error(res, 400, "BadRequest", "Invalid key specified.")

			return
		}

		const thisObject = await this.server.getObject(path)

		if (thisObject.exists) {
			await Responses.ok(res)

			return
		}

		await this.server.sdk.fs().mkdir({ path })
		await this.server.sdk.fs().readdir({ path: pathModule.posix.dirname(path) })

		await Responses.ok(res)
	}

	public async handle(req: Request, res: Response, next: NextFunction): Promise<void> {
		try {
			const isQueryAllowed = validateQuery(req.query, { "x-id": "PutObject" })
			if (!isQueryAllowed) {
				next()

				return
			}

			const { key, bucket, path } = extractKeyAndBucketFromRequestParams(req)

			if (!key || !bucket || !path || !isValidObjectKey(key)) {
				await Responses.error(res, 400, "BadRequest", "Invalid key specified.")

				return
			}

			const isCopy = typeof req.headers["x-amz-copy-source"] === "string" && req.headers["x-amz-copy-source"].length > 0

			if (isCopy) {
				await this.copy(req, res)

				return
			}

			if (req.url.trim().endsWith("/") && (req.bodySize === 0 || !req.decodedBody)) {
				await this.mkdir(req, res)

				return
			}

			if (req.bodySize === 0 || !req.decodedBody) {
				await Responses.error(res, 400, "BadRequest", "Invalid body.")

				return
			}

			const parentPath = pathModule.posix.dirname(path)
			const name = pathModule.posix.basename(path)

			await this.server.sdk.fs().mkdir({ path: parentPath })

			const parentObject = await this.server.getObject(parentPath)

			if (!parentObject.exists || parentObject.stats.type !== "directory") {
				await Responses.error(res, 412, "PreconditionFailed", "Parent directory does not exist.")

				return
			}

			const thisObject = await this.server.getObject(path)

			if (thisObject.exists) {
				await this.server.sdk.fs().unlink({
					path,
					permanent: false
				})
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
				source: Readable.from(req.decodedBody),
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

			await this.server.sdk.fs().readdir({ path: parentPath })

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
