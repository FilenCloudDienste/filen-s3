import { type Request, type Response, type NextFunction } from "express"
import Responses from "../responses"
import type Server from "../"
import { streamToXML, promiseAllSettledChunked, extractKeyAndBucketFromRequestParams } from "../utils"
import pathModule from "path"
import { Readable } from "stream"
import { validateQuery } from "../validate-query"

export type DeleteObjectsXML = {
	Delete?: {
		Object?: { Key: string }[]
	}
}

export class DeleteObjects {
	public constructor(private readonly server: Server) {
		this.handle = this.handle.bind(this)
	}

	public async handle(req: Request, res: Response, next: NextFunction): Promise<void> {
		try {
			const isQueryAllowed = validateQuery(req.query, { delete: { required: true, anyValue: true }, "x-id": "DeleteObjects" })
			if (!isQueryAllowed || typeof req.decodedBody === "undefined") {
				next()

				return
			}

			const { bucket } = extractKeyAndBucketFromRequestParams(req)

			if (!bucket) {
				await Responses.error(res, 404, "NoSuchBucket", "Bucket not found.")

				return
			}

			const xml = await streamToXML<DeleteObjectsXML>(Readable.from(req.decodedBody))

			if (!xml || !xml.Delete || !xml.Delete.Object) {
				await Responses.error(res, 400, "BadRequest", "Malformed XML request body.")

				return
			}

			const objects = xml.Delete.Object
			const deleted: { Key: string }[] = []
			const errors: { Key: string; Code: string; Message: string }[] = []

			await promiseAllSettledChunked(
				objects.map(
					object =>
						new Promise<void>(resolve => {
							const path = pathModule.posix.join(bucket, object.Key)
							const normalizedKey = path.startsWith("/") ? path.slice(1) : path

							this.server
								.getObject(path)
								.then(obj => {
									const key = `${normalizedKey}${obj.exists && obj.stats.type === "directory" ? "/" : ""}`

									if (!obj.exists) {
										deleted.push({
											Key: key
										})

										resolve()

										return
									}

									this.server.sdk
										.fs()
										.unlink({
											path,
											permanent: false
										})
										.then(() => {
											deleted.push({
												Key: key
											})

											resolve()
										})
										.catch(() => {
											errors.push({
												Key: key,
												Code: "InternalError",
												Message: "Internal server error."
											})

											resolve()
										})
								})
								.catch(() => {
									errors.push({
										Key: normalizedKey,
										Code: "InternalError",
										Message: "Internal server error."
									})

									resolve()
								})
						})
				)
			)

			await Responses.deleteObjects(res, deleted, errors)
		} catch (e) {
			this.server.logger.log("error", e, "deleteObjects")
			this.server.logger.log("error", e)

			Responses.error(res, 500, "InternalError", "Internal server error.").catch(() => {})
		}
	}
}

export default DeleteObjects
