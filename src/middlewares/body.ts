import { type Request, type Response, type NextFunction } from "express"

export default function body(req: Request, _: Response, next: NextFunction): void {
	const decodedChunks: Buffer[] = []
	const rawChunks: Buffer[] = []

	req.rawBody = Buffer.from([])
	req.decodedBody = Buffer.from([])
	req.bodySize = 0

	req.on("data", (chunk: Buffer) => {
		rawChunks.push(chunk)

		if (req.headers["x-amz-content-sha256"] === "STREAMING-AWS4-HMAC-SHA256-PAYLOAD") {
			const chunkStr = chunk.toString("binary")
			const segments = chunkStr.split("\r\n").filter(segment => segment.length > 0)

			for (const segment of segments) {
				if (segment.includes(";chunk-signature=")) {
					continue
				}

				const segmentBuffer = Buffer.from(segment, "binary")

				decodedChunks.push(segmentBuffer)
			}
		}
	})

	req.on("end", () => {
		req.rawBody = Buffer.concat(rawChunks)
		req.decodedBody = decodedChunks.length === 0 ? req.rawBody : Buffer.concat(decodedChunks)
		req.bodySize = req.decodedBody.byteLength

		next()
	})

	req.on("error", err => {
		next(err)
	})
}
