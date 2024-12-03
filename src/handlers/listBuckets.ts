import { type Request, type Response } from "express"
import Responses from "../responses"
import type Server from "../"
import { promiseAllChunked, isValidBucketName } from "../utils"
import { type FSStatsObject } from "./listObjects"

export class ListBuckets {
	public constructor(private readonly server: Server) {
		this.handle = this.handle.bind(this)
	}

	public async handle(_: Request, res: Response): Promise<void> {
		try {
			const topLevelItems = await this.server.sdk.fs().readdir({ path: "/" })

			const objects: FSStatsObject[] = (
				await promiseAllChunked(
					topLevelItems.map(
						item =>
							new Promise<FSStatsObject>((resolve, reject) => {
								this.server.sdk
									.fs()
									.stat({ path: `/${item}` })
									.then(stats => {
										resolve({
											...stats,
											path: `/${item}`
										})
									})
									.catch(reject)
							})
					)
				)
			).sort((a, b) => a.path.length - b.path.length)

			const buckets = objects
				.filter(object => object.type === "directory" && isValidBucketName(object.name))
				.map(object => ({
					name: object.name,
					creationDate: object.birthtimeMs
				}))

			await Responses.listBuckets(res, buckets, {
				id: this.server.user.accessKeyId,
				displayName: this.server.user.accessKeyId
			})
		} catch (e) {
			this.server.logger.log("error", e, "listBuckets")
			this.server.logger.log("error", e)

			Responses.error(res, 500, "InternalError", "Internal server error.").catch(() => {})
		}
	}
}

export default ListBuckets
