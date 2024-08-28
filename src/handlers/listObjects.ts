import { type Request, type Response, type NextFunction } from "express"
import Responses from "../responses"
import type Server from ".."
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
		let trimmed = decodeURI(prefix).trim()

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

	public async handle(req: Request, res: Response, next: NextFunction): Promise<void> {
		try {
			if (!req.url.includes("prefix=")) {
				next()

				return
			}

			const params = this.parseQueryParams(req)
			const normalizedPrefix = this.normalizePrefix(params.prefix)
			const dirnameObject = await this.server.getObject(normalizedPrefix)
			const dirname =
				normalizedPrefix === "/"
					? "/"
					: dirnameObject.exists && dirnameObject.stats.type === "directory"
					? normalizedPrefix
					: pathModule.dirname(normalizedPrefix)
			const topLevelItems: string[] = []

			const { exists: dirnameExists } = await this.server.getObject(dirname)

			if (!dirnameExists) {
				await Responses.listObjectsV2(res, params.prefix, [], [])

				return
			}

			const topLevelReaddir = await this.server.sdk.fs().readdir({ path: dirname })

			for (const item of topLevelReaddir) {
				const itemPath = pathModule.posix.join(dirname, item)

				if (!itemPath.startsWith(normalizedPrefix)) {
					continue
				}

				topLevelItems.push(item)
			}

			const objects: FSStatsObject[] = (
				await promiseAllChunked(
					topLevelItems.map(
						item =>
							new Promise<FSStatsObject>((resolve, reject) => {
								this.server.sdk
									.fs()
									.stat({ path: pathModule.posix.join(dirname, item) })
									.then(stats => {
										resolve({
											...stats,
											path: pathModule.posix.join(dirname, item)
										})
									})
									.catch(reject)
							})
					)
				)
			).sort((a, b) => a.path.length - b.path.length)

			const commonPrefixes: string[] = []
			const finalObjects: FSStatsObject[] = []

			for (const object of objects) {
				if (object.type === "directory") {
					commonPrefixes.push(`${object.path.slice(1)}/`)
				} else {
					finalObjects.push(object)
				}
			}

			await Responses.listObjectsV2(res, params.prefix, finalObjects, commonPrefixes)
		} catch {
			Responses.error(res, 500, "InternalError", "Internal server error.").catch(() => {})
		}
	}
}

export default ListObjectsV2
