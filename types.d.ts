import { type PassThrough } from "stream"

declare global {
	namespace Express {
		interface Request {
			bodyHash?: string
			bodyStream?: PassThrough
			bodySize?: number
		}
	}
}
