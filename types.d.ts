declare global {
	namespace Express {
		interface Request {
			bodyHash?: string
			rawBody?: Buffer
			decodedBody?: Buffer
			bodySize?: number
		}
	}
}

export {}
