import { type Request, type Response } from "express"
import Responses from "../responses"
import type Server from "../"

export class ListBuckets {
	public constructor(private readonly server: Server) {
		this.handle = this.handle.bind(this)
	}

	public async handle(_: Request, res: Response): Promise<void> {
		await Responses.listBuckets(
			res,
			[
				{
					name: this.server.bucketName,
					creationDate: Date.now()
				}
			],
			{
				id: this.server.user.accessKeyId,
				displayName: this.server.user.accessKeyId
			}
		)
	}
}

export default ListBuckets
