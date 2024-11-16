import { type Request, type Response, type NextFunction } from "express"
import crypto from "crypto"
import Responses from "../responses"

export default function body(req: Request, res: Response, next: NextFunction): void {
	const hash = crypto.createHash("sha256")
	let size = 0
	const chunks: Buffer[] = []

	req.on("data", async chunk => {
		try {
			if (chunk instanceof Buffer) {
				size += chunk.byteLength

				chunks.push(chunk)
				hash.update(chunk)
			}
		} catch {
			Responses.error(res, 500, "InternalError", "Internal server error.").catch(() => {})
		}
	})

	req.on("end", () => {
		try {
			req.bodyHash = hash.digest("hex")
			req.bodySize = size
			req.rawBody = Buffer.concat(chunks)

			next()
		} catch {
			Responses.error(res, 500, "InternalError", "Internal server error.").catch(() => {})
		}
	})
}
