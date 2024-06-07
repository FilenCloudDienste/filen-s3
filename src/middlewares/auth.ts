import crypto from "crypto"
import { type Request, type Response, type NextFunction } from "express"
import type Server from "../"

export type AuthDetails = {
	accessKeyId: string
	signature: string
	signedHeaders: string
	canonicalRequest: string
}

export class Auth {
	public constructor(private readonly server: Server) {}

	public getSignatureKey(key: string, date: string, region: string, service: string): Buffer {
		const kDate = crypto
			.createHmac("sha256", "AWS4" + key)
			.update(date)
			.digest()
		const kRegion = crypto.createHmac("sha256", kDate).update(region).digest()
		const kService = crypto.createHmac("sha256", kRegion).update(service).digest()
		const kSigning = crypto.createHmac("sha256", kService).update("aws4_request").digest()

		return kSigning
	}

	public calculateSignature(authDetails: AuthDetails, secretAccessKey: string, date: string, region: string, service: string): string {
		const signingKey = this.getSignatureKey(secretAccessKey, date, region, service)

		return crypto.createHmac("sha256", signingKey).update(authDetails.canonicalRequest).digest("hex")
	}

	public createCanonicalRequest(req: Request, signedHeaders: string): string {
		const headers = signedHeaders.split(";").map(h => h.trim())
		const canonicalHeaders = headers.map(header => `${header}:${req.headers[header]}`).join("\n")

		const payloadHash = crypto
			.createHash("sha256")
			.update(req.body || "")
			.digest("hex")

		return [req.method, req.path, req.query || "", canonicalHeaders, "", signedHeaders, payloadHash].join("\n")
	}

	public getAuthDetails(req: Request): AuthDetails {
		const authHeader = req.headers["authorization"]

		if (!authHeader) {
			throw new Error("Authorization header missing")
		}

		const [, credential, signedHeaders, signature] =
			authHeader.match(/AWS4-HMAC-SHA256 Credential=(.*), SignedHeaders=(.*), Signature=(.*)/) || []

		if (!credential || !signedHeaders || !signature) {
			throw new Error("Invalid Authorization header format")
		}

		const [accessKeyId] = credential.split("/")
		const canonicalRequest = this.createCanonicalRequest(req, signedHeaders)

		if (!accessKeyId) {
			throw new Error("Invalid accessKeyId")
		}

		return {
			accessKeyId,
			signature,
			signedHeaders,
			canonicalRequest
		}
	}

	public async handle(req: Request, res: Response, next: NextFunction): Promise<void> {
		try {
			const authDetails = this.getAuthDetails(req)
			const xAmzDate = req.headers["x-amz-date"]

			if (typeof xAmzDate !== "string") {
				throw new Error("Invalid x-amz-date header")
			}

			const date = xAmzDate.substring(0, 8)
			const signature = this.calculateSignature(
				authDetails,
				this.server.user.secretKeyId,
				date,
				this.server.region,
				this.server.service
			)

			if (authDetails.accessKeyId !== this.server.user.accessKeyId || authDetails.signature !== signature) {
				res.status(403).send("Forbidden")
			} else {
				next()
			}
		} catch (error) {
			res.status(400).send("Bad Request")
		}
	}
}

export default Auth
