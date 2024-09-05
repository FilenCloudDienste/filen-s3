import express, { type Express, type Request, type Response } from "express"
import FilenSDK, { type FilenSDKConfig, type FSStats } from "@filen/sdk"
import https from "https"
import Certs from "./certs"
import Errors from "./middlewares/errors"
import Auth from "./middlewares/auth"
import ListBuckets from "./handlers/listBuckets"
import ListObjects from "./handlers/listObjects"
import GetObject from "./handlers/getObject"
import HeadObject from "./handlers/headObject"
import DeleteObject from "./handlers/deleteObject"
import PutObject from "./handlers/putObject"
import { normalizeKey } from "./utils"
import body from "./middlewares/body"
import HeadBucket from "./handlers/headBucket"
import DeleteObjects from "./handlers/deleteObjects"
import Responses from "./responses"
import { Semaphore, ISemaphore } from "./semaphore"
import http, { type IncomingMessage, type ServerResponse } from "http"
import { type Socket } from "net"
import { v4 as uuidv4 } from "uuid"
import { type Duplex } from "stream"
import { rateLimit } from "express-rate-limit"

export type ServerConfig = {
	hostname: string
	port: number
	https: boolean
}

export type User = {
	sdkConfig: FilenSDKConfig
	accessKeyId: string
	secretKeyId: string
}

export type RateLimit = {
	windowMs: number
	limit: number
}

export class S3Server {
	public readonly server: Express
	public readonly serverConfig: ServerConfig
	public readonly user: User
	public readonly sdk: FilenSDK
	public readonly region = "filen"
	public readonly service = "s3"
	public readonly bucketName = "filen"
	private readonly rwMutex: Record<string, ISemaphore> = {}
	public serverInstance:
		| https.Server<typeof IncomingMessage, typeof ServerResponse>
		| http.Server<typeof IncomingMessage, typeof ServerResponse>
		| null = null
	public connections: Record<string, Socket | Duplex> = {}
	public rateLimit: RateLimit

	public constructor({
		hostname = "127.0.0.1",
		port = 1700,
		user,
		https = false,
		rateLimit = {
			windowMs: 1000,
			limit: 1000
		}
	}: {
		hostname?: string
		port?: number
		https?: boolean
		user: {
			sdkConfig?: FilenSDKConfig
			sdk?: FilenSDK
			accessKeyId: string
			secretKeyId: string
		}
		rateLimit?: RateLimit
	}) {
		this.serverConfig = {
			hostname,
			port,
			https
		}

		this.rateLimit = rateLimit

		if (!user.sdk && !user.sdkConfig) {
			throw new Error("Either pass a configured SDK instance OR a SDKConfig object to the user object.")
		}

		if (user.sdk) {
			this.user = {
				...user,
				sdkConfig: user.sdk.config
			}
			this.sdk = user.sdk
		} else if (user.sdkConfig) {
			this.user = {
				...user,
				sdkConfig: user.sdkConfig
			}
			this.sdk = new FilenSDK({
				...user.sdkConfig,
				connectToSocket: true,
				metadataCache: true
			})
		} else {
			throw new Error("Either pass a configured SDK instance OR a SDKConfig object to the user object.")
		}

		this.server = express()
	}

	public getRWMutex(path: string): ISemaphore {
		if (!this.rwMutex[path]) {
			this.rwMutex[path] = new Semaphore(1)
		}

		return this.rwMutex[path]!
	}

	public async getObject(key: string): Promise<{ exists: false } | { exists: true; stats: FSStats }> {
		try {
			const stats = await this.sdk.fs().stat({ path: normalizeKey(key) })

			return {
				exists: true,
				stats
			}
		} catch {
			return {
				exists: false
			}
		}
	}

	/**
	 * Start the server.
	 *
	 * @public
	 * @async
	 * @returns {Promise<void>}
	 */
	public async start(): Promise<void> {
		this.connections = {}

		this.server.disable("x-powered-by")

		this.server.use(
			rateLimit({
				windowMs: this.rateLimit.windowMs,
				limit: this.rateLimit.limit,
				standardHeaders: "draft-7",
				legacyHeaders: true,
				keyGenerator: req => {
					const authHeader = req.headers["authorization"]

					if (!authHeader) {
						return req.ip ?? "ip"
					}

					const match = authHeader.match(
						/AWS4-HMAC-SHA256\s*Credential=([^,]+),\s*SignedHeaders=([^,]+),\s*Signature=([a-fA-F0-9]+)/
					)

					if (!match) {
						return req.ip ?? "ip"
					}

					const [, credential] = match

					if (!credential) {
						return req.ip ?? "ip"
					}

					const [accessKeyId] = credential.split("/")

					if (!accessKeyId) {
						return req.ip ?? "ip"
					}

					return accessKeyId
				}
			})
		)

		this.server.use(body)
		this.server.use(new Auth(this).handle)

		this.server.get("/", new ListBuckets(this).handle)
		this.server.get(`/${this.bucketName}`, new ListObjects(this).handle)
		this.server.head(`/${this.bucketName}`, new HeadBucket(this).handle)
		this.server.post(`/${this.bucketName}`, new DeleteObjects(this).handle)
		this.server.get(`/${this.bucketName}/:key*`, new GetObject(this).handle)
		this.server.head(`/${this.bucketName}/:key*`, new HeadObject(this).handle)
		this.server.delete(`/${this.bucketName}/:key*`, new DeleteObject(this).handle)
		this.server.put(`/${this.bucketName}/:key*`, new PutObject(this).handle)

		this.server.use((_: Request, res: Response) => {
			Responses.error(res, 501, "NotImplemented", "The requested method is not implemented.").catch(() => {})
		})

		this.server.use(Errors)

		await new Promise<void>((resolve, reject) => {
			if (this.serverConfig.https) {
				Certs.get()
					.then(certs => {
						this.serverInstance = https
							.createServer(
								{
									cert: certs.cert,
									key: certs.privateKey
								},
								this.server
							)
							.listen(this.serverConfig.port, this.serverConfig.hostname, () => {
								resolve()
							})
							.on("connection", socket => {
								const socketId = uuidv4()

								this.connections[socketId] = socket

								socket.once("close", () => {
									delete this.connections[socketId]
								})
							})
					})
					.catch(reject)
			} else {
				this.serverInstance = http
					.createServer(this.server)
					.listen(this.serverConfig.port, this.serverConfig.hostname, () => {
						resolve()
					})
					.on("connection", socket => {
						const socketId = uuidv4()

						this.connections[socketId] = socket

						socket.once("close", () => {
							delete this.connections[socketId]
						})
					})
			}
		})
	}

	/**
	 * Stop the server.
	 *
	 * @public
	 * @async
	 * @param {boolean} [terminate=false]
	 * @returns {Promise<void>}
	 */
	public async stop(terminate: boolean = false): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			if (!this.serverInstance) {
				resolve()

				return
			}

			this.serverInstance.close(err => {
				if (err) {
					reject(err)

					return
				}

				resolve()
			})

			if (terminate) {
				for (const socketId in this.connections) {
					try {
						this.connections[socketId]?.destroy()

						delete this.connections[socketId]
					} catch {
						// Noop
					}
				}
			}
		})
	}
}

export default S3Server
