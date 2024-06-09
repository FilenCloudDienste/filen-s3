import { type Request, type Response } from "express"
import Responses from "../responses"
import type Server from "../"
import pathModule from "path"
import { promiseAllChunked } from "../utils"
import { type FSStats } from "@filen/sdk"

export type FSStatsObject = FSStats & { path: string }

export class ListObjectsV2 {
	public constructor(private readonly server: Server) {
		this.handle = this.handle.bind(this)
	}

	private parseQueryParams(req: Request): { prefix: string } {
		if (!req || !req.query) {
			throw new Error("Invalid request.")
		}

		return {
			prefix: typeof req.query["prefix"] === "string" ? req.query["prefix"] : ""
		}
	}

	/**
	 * Normalize the prefix so we can properly use it in the SDK.
	 *
	 * @private
	 * @param {string} prefix
	 * @returns {string}
	 */
	private normalizePrefix(prefix: string): string {
		let trimmed = prefix.trim()

		if (trimmed.length === 0 || trimmed === "/" || trimmed.startsWith("./") || trimmed.startsWith("../") || trimmed.includes("../")) {
			return "/"
		}

		if (!trimmed.startsWith("/")) {
			trimmed = `/${trimmed}`
		}

		if (trimmed.endsWith("/")) {
			trimmed = trimmed.substring(0, trimmed.length - 1)
		}

		return trimmed
	}

	public async handle(req: Request, res: Response): Promise<void> {
		const params = this.parseQueryParams(req)
		const normalizedPrefix = this.normalizePrefix(params.prefix)
		const dirname = normalizedPrefix === "/" ? "/" : pathModule.dirname(normalizedPrefix)
		const objects: FSStatsObject[] = []
		const topLevelItems: string[] = []

		const { exists: dirnameExists } = await this.server.getObject(dirname)

		if (!dirnameExists) {
			await Responses.listObjectsV2(res, params.prefix, [])

			return
		}

		const topLevelReaddir = await this.server.sdk.fs().readdir({ path: dirname })

		for (const item of topLevelReaddir) {
			const itemPath = pathModule.posix.join(dirname, item)

			if (!itemPath.startsWith(normalizedPrefix)) {
				continue
			}

			topLevelItems.push(itemPath)
		}

		const promises: Promise<void>[] = []

		for (const path of topLevelItems) {
			promises.push(
				new Promise((resolve, reject) => {
					this.server.sdk
						.fs()
						.stat({ path })
						.then(stat => {
							if (stat.type === "file") {
								objects.push({
									...stat,
									path
								})

								resolve()

								return
							}

							this.server.sdk
								.fs()
								.readdir({ path })
								.then(contents => {
									const innerPromises: Promise<void>[] = []

									for (const item of contents) {
										const itemPath = pathModule.posix.join(path, item)

										innerPromises.push(
											new Promise((resolve, reject) => {
												this.server.sdk
													.fs()
													.stat({ path: itemPath })
													.then(stats => {
														if (stats.type !== "file") {
															resolve()

															return
														}

														objects.push({
															...stats,
															path: itemPath
														})

														resolve()
													})
													.catch(reject)
											})
										)
									}

									promiseAllChunked(innerPromises)
										.then(() => {
											resolve()
										})
										.catch(reject)
								})
								.catch(reject)
						})
						.catch(reject)
				})
			)
		}

		await promiseAllChunked(promises)

		const objectsSorted = objects
			.sort((a, b) => a.path.length - b.path.length)
			.filter(object => (normalizedPrefix === "/" ? !object.path.slice(1).includes("/") : true))

		await Responses.listObjectsV2(res, params.prefix, objectsSorted)
	}
}

export default ListObjectsV2
