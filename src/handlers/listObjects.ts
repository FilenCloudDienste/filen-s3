import { type Request, type Response } from "express"
import Responses from "../responses"
import type Server from "../"

export class ListObjects {
	public constructor(private readonly server: Server) {
		this.handle = this.handle.bind(this)
	}

	public async handle(req: Request, res: Response): Promise<void> {}
}

export default ListObjects
