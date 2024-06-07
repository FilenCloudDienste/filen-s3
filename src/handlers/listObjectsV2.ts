import { type Request, type Response } from "express"
import Responses from "../responses"
import type Server from "../"
import pathModule from "path"
import { promiseAllChunked } from "../utils"

export class ListObjectsV2 {
	public constructor(private readonly server: Server) {
		this.handle = this.handle.bind(this)
	}

	private parseQueryParams(req: Request): { prefix: string } {
		if (!req || !req.query) {
			throw new Error("Invalid request.")
		}

		return {
			prefix: typeof req.query["prefix"] === "string" && req.query["prefix"].startsWith("/") ? req.query["prefix"].trim() : "/"
		}
	}

	public async handle(req: Request, res: Response): Promise<void> {
		try {
			const params = this.parseQueryParams(req)
			const path = params.prefix === "/" ? "/" : pathModule.posix.dirname(params.prefix)
			const objects = (
				await promiseAllChunked(
					(await this.server.sdk.fs().readdir({ path }))
						.filter(object => pathModule.posix.join(path, object).startsWith(params.prefix))
						.map(object => this.server.sdk.fs().stat({ path: pathModule.posix.join(path, object) }))
				)
			).filter(object => object.type === "file")

			await Responses.listObjectsV2(res, path, params.prefix, objects)
		} catch (e) {
			await Responses.error(res, 500, "InternalError", e instanceof Error ? e.message : "Internal server error.")
		}
	}
}

export default ListObjectsV2
