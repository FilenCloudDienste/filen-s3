declare global {
	namespace Express {
		interface Request {
			bodyHash?: string
			rawBody?: Buffer
			bodySize?: number
		}
	}
}

export {}
