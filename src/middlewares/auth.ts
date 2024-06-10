import crypto from "crypto"
import { type Request, type Response, type NextFunction } from "express"
import type Server from "../"
import Responses from "../responses"

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

	public calculateSignature(stringToSign: string, date: string, region: string, service: string, secretAccessKey: string): string {
		const kDate = crypto.createHmac("sha256", `AWS4${secretAccessKey}`).update(date).digest()
		const kRegion = crypto.createHmac("sha256", kDate).update(region).digest()
		const kService = crypto.createHmac("sha256", kRegion).update(service).digest()
		const kSigning = crypto.createHmac("sha256", kService).update("aws4_request").digest()

		return crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex")
	}

	public createStringToSign(canonicalRequest: string, xAmzDate: string): string {
		const dateStamp = xAmzDate.substring(0, 8)
		const credentialScope = `${dateStamp}/${this.server.region}/${this.server.service}/aws4_request`
		const canonicalRequestHash = crypto.createHash("sha256").update(canonicalRequest).digest("hex")

		return ["AWS4-HMAC-SHA256", xAmzDate, credentialScope, canonicalRequestHash].join("\n")
	}

	public createCanonicalRequest(req: Request, signedHeaders: string): string {
		const headers = signedHeaders.split(";").map(h => h.trim().toLowerCase())
		const canonicalHeaders = headers
			.map(header => `${header}:${req.headers[header] || ""}`)
			.filter(header => header.length > 0)
			.join("\n")

		const sortedQueryParams = Object.keys(req.query)
			.sort()
			.map(key => `${encodeURIComponent(key)}=${encodeURIComponent(req.query[key] as string)}`)
			.join("&")

		if (!req.bodyHash) {
			throw new Error("No body hash computed.")
		}

		const payloadHash = req.bodyHash

		return [req.method.toUpperCase(), req.path, sortedQueryParams, canonicalHeaders, "", signedHeaders, payloadHash].join("\n")
	}

	public getAuthDetails(req: Request): AuthDetails {
		const authHeader = req.headers["authorization"]

		if (!authHeader) {
			throw new Error("Authorization header missing")
		}

		const match = authHeader.match(/AWS4-HMAC-SHA256 Credential=(.*), SignedHeaders=(.*), Signature=(.*)/)

		if (!match) {
			throw new Error("Invalid Authorization header format")
		}

		const [, credential, signedHeaders, signature] = match

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
			const xAmzDate = req.headers["x-amz-date"] as string

			if (!xAmzDate) {
				throw new Error("Invalid x-amz-date header")
			}

			const date = xAmzDate.substring(0, 8)
			const stringToSign = this.createStringToSign(authDetails.canonicalRequest, xAmzDate)
			const signature = this.calculateSignature(
				stringToSign,
				date,
				this.server.region,
				this.server.service,
				this.server.user.secretKeyId
			)

			if (authDetails.accessKeyId !== this.server.user.accessKeyId || authDetails.signature !== signature) {
				await Responses.error(res, 403, "Forbidden", "Invalid credentials.")
			} else {
				next()
			}
		} catch {
			await Responses.error(res, 400, "BadRequest", "Invalid auth.")
		}
	}
}

export default Auth
