import { type Request, type Response } from "express"
import type Server from "../"
import Responses from "../responses"

export class HeadBucket {
	public constructor(private readonly server: Server) {
		this.handle = this.handle.bind(this)
	}

	public async handle(req: Request, res: Response): Promise<void> {
		try {
			if (req.url !== `/${this.server.bucketName}`) {
				await Responses.error(res, 404, "NoSuchBucket", "Bucket not found")

				return
			}

			res.set("x-amz-bucket-region", this.server.region)
			res.set("Content-Length", "0")
			res.status(200)

			await new Promise<void>(resolve => {
				res.end(() => {
					resolve()
				})
			})
		} catch {
			Responses.error(res, 500, "InternalError", "Internal server error.").catch(() => {})
		}
	}
}

export default HeadBucket
