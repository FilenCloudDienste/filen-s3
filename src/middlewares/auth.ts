import { type Request, type Response, type NextFunction } from "express"
import type Server from "../"
import { awsVerify } from "@filen/aws4-express"

export type AuthDetails = {
	accessKeyId: string
	signature: string
	signedHeaders: string
	canonicalRequest: string
}

export class Auth {
	public constructor(private readonly server: Server) {
		this.handle = this.handle.bind(this)
	}

	public handle(req: Request, res: Response, next: NextFunction): void {
		awsVerify({
			onBeforeParse(req) {
				const authHeader = req.headers["authorization"] || req.headers["Authorization"]

				if (typeof authHeader === "string" && authHeader.length > 0) {
					const normalizedHeader = authHeader.replace(/,(\S)/g, ", $1")

					req.headers["Authorization"] = normalizedHeader
					req.headers["authorization"] = normalizedHeader
				}

				return true
			},
			onAfterParse(message, req) {
				req.bodyHash = message.bodyHash

				return true
			},
			secretKey: message => {
				if (message.accessKey === this.server.user.accessKeyId) {
					return this.server.user.secretKeyId
				}

				return undefined
			}
		})(req, res, next).catch(next)
	}
}

export default Auth
