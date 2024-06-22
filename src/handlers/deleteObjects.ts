import { type Request, type Response, type NextFunction } from "express"
import Responses from "../responses"
import type Server from "../"
import { normalizeKey, streamToXML, promiseAllSettledChunked } from "../utils"

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
		if (!req.url.includes("?delete") || !req.bodyStream) {
			next()

			return
		}

		const xml = await streamToXML<DeleteObjectsXML>(req.bodyStream)

		if (!xml || !xml.Delete || !xml.Delete.Object) {
			await Responses.error(res, 400, "BadRequest", "Invalid delete XML.")

			return
		}

		const objects = xml.Delete.Object
		const deleted: { Key: string }[] = []
		const errors: { Key: string; Code: string; Message: string }[] = []

		await promiseAllSettledChunked(
			objects.map(
				object =>
					new Promise<void>(resolve => {
						const normalizedKey = normalizeKey(object.Key)

						this.server
							.getObject(normalizedKey)
							.then(obj => {
								if (!obj.exists) {
									deleted.push({ Key: object.Key })

									resolve()

									return
								}

								this.server.sdk
									.fs()
									.unlink({ path: normalizedKey })
									.then(() => {
										deleted.push({ Key: object.Key })

										resolve()
									})
									.catch(() => {
										errors.push({
											Key: object.Key,
											Code: "InternalError",
											Message: "Internal server error."
										})

										resolve()
									})
							})
							.catch(() => {
								errors.push({
									Key: object.Key,
									Code: "InternalError",
									Message: "Internal server error."
								})

								resolve()
							})
					})
			)
		)

		await Responses.deleteObjects(res, deleted, errors)
	}
}

export default DeleteObjects
