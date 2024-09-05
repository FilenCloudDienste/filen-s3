import { type Request, type Response, type NextFunction } from "express"
import crypto from "crypto"
import { PassThrough } from "stream"
import Responses from "../responses"

export default function body(req: Request, res: Response, next: NextFunction): void {
	const hash = crypto.createHash("sha256")
	const passThrough = new PassThrough()
	let size = 0

	req.bodyStream = passThrough

	req.on("data", async chunk => {
		try {
			if (chunk instanceof Buffer) {
				size += chunk.byteLength

				hash.update(chunk)

				if (!passThrough.write(chunk)) {
					await new Promise<void>(resolve => passThrough.once("drain", resolve))
				}
			}
		} catch {
			Responses.error(res, 500, "InternalError", "Internal server error.").catch(() => {})
		}
	})

	req.on("end", () => {
		req.bodyHash = hash.digest("hex")
		req.bodySize = size

		passThrough.end()

		next()
	})

	req.on("error", err => {
		passThrough.emit("error", err)
	})
}
