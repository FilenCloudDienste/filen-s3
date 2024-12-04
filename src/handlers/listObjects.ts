import { type Request, type Response } from "express"
import Responses from "../responses"
import type Server from ".."
import pathModule from "path"
import { promiseAllChunked, extractKeyAndBucketFromRequestParams } from "../utils"
import { type FSStats } from "@filen/sdk"

export type FSStatsObject = FSStats & { path: string }

export class ListObjectsV2 {
	public constructor(private readonly server: Server) {
		this.handle = this.handle.bind(this)
	}

	private parseQueryParams(req: Request): { prefix: string; delimiter: string } {
		if (!req || !req.query) {
			throw new Error("Invalid request.")
		}

		return {
			prefix: typeof req.query["prefix"] === "string" && req.query["prefix"].length > 0 ? req.query["prefix"] : "",
			delimiter: typeof req.query["delimiter"] === "string" && req.query["delimiter"].length > 0 ? req.query["delimiter"] : ""
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
		let trimmed = decodeURIComponent(prefix).trim()

		if (trimmed.length === 0 || trimmed === "/" || trimmed.startsWith("./") || trimmed.startsWith("../") || trimmed.includes("../")) {
			return "/"
		}

		if (!trimmed.startsWith("/")) {
			trimmed = `/${trimmed}`
		}

		// if (trimmed.endsWith("/")) {
		// 	trimmed = trimmed.substring(0, trimmed.length - 1)
		// }

		return trimmed
	}

	/**
	 * Read a cloud directory (recursively to a maximum depth).
	 *
	 * @private
	 * @async
	 * @param {string} path
	 * @param {number} depth
	 * @returns {Promise<string[]>}
	 */
	private async readdir(path: string, depth: number): Promise<string[]> {
		if (depth <= 0) {
			return await this.server.sdk.fs().readdir({ path })
		}

		const items: string[] = []

		const traverse = async (currentPath: string, currentDepth: number): Promise<void> => {
			if (currentDepth >= depth) {
				return
			}

			const dir = await this.server.sdk.fs().readdir({ path: currentPath })

			await promiseAllChunked(
				dir.map(async item => {
					const itemPath = pathModule.posix.join(currentPath, item)
					const stats = await this.server.sdk.fs().stat({ path: itemPath })

					items.push(itemPath.slice(path.length))

					if (stats.type === "directory") {
						await traverse(itemPath, currentDepth + 1)
					}
				})
			)
		}

		await traverse(path, 0)

		return items
	}

	public async handle(req: Request, res: Response): Promise<void> {
		try {
			if (req.url.includes("?location")) {
				await Responses.getBucketLocation(res)

				return
			}

			if (!req.url.includes("prefix=")) {
				await Responses.error(res, 400, "BadRequest", "Invalid prefix specified.")

				return
			}

			const { bucket } = extractKeyAndBucketFromRequestParams(req)

			if (!bucket) {
				await Responses.error(res, 404, "NoSuchBucket", "Bucket not found.")

				return
			}

			const params = this.parseQueryParams(req)
			const normalizedPrefix = this.normalizePrefix(params.prefix)
			let dirname = this.normalizePrefix(
				normalizedPrefix === "/" ? `/${bucket}` : pathModule.posix.dirname(pathModule.posix.join(bucket, normalizedPrefix))
			)
			const requestedPath = this.normalizePrefix(pathModule.posix.join(bucket, normalizedPrefix))
			const requestedPathStats = await this.server.getObject(requestedPath)

			if (requestedPathStats.exists && requestedPathStats.stats.type === "directory") {
				dirname = requestedPath
			}

			const dirnameStats = await this.server.getObject(dirname)

			if (!dirnameStats.exists) {
				await Responses.listObjectsV2(res, params.prefix, [], [], bucket, params.delimiter)

				return
			}

			const topLevelDirContent = await this.readdir(dirname, params.delimiter.length === 0 ? 10 : 0)
			const topLevelItems: string[] = []

			for (const item of topLevelDirContent) {
				const itemPath = this.normalizePrefix(pathModule.posix.join(dirname, item))

				if (!itemPath.startsWith(this.normalizePrefix(pathModule.posix.join(bucket, normalizedPrefix)))) {
					continue
				}

				topLevelItems.push(item)
			}

			const objects: FSStatsObject[] = (
				await promiseAllChunked(
					topLevelItems.map(async item => {
						const path = pathModule.posix.join(dirname, item)
						const stats = await this.server.sdk.fs().stat({ path })

						return {
							...stats,
							path: path.startsWith(`/${bucket}/`) ? path.slice(`/${bucket}/`.length) : path
						}
					})
				)
			).sort((a, b) => a.path.length - b.path.length)

			const commonPrefixes: string[] = []
			const finalObjects: FSStatsObject[] = []

			for (const object of objects) {
				if (object.type === "directory") {
					commonPrefixes.push(`${object.path}/`)

					finalObjects.push({
						...object,
						path: `${object.path}/`
					})
				} else {
					finalObjects.push(object)
				}
			}

			await Responses.listObjectsV2(
				res,
				normalizedPrefix === "/" ? "/" : normalizedPrefix.slice(1),
				finalObjects,
				commonPrefixes,
				bucket,
				params.delimiter
			)
		} catch (e) {
			this.server.logger.log("error", e, "listObjects")
			this.server.logger.log("error", e)

			Responses.error(res, 500, "InternalError", "Internal server error.").catch(() => {})
		}
	}
}

export default ListObjectsV2
