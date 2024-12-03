import express, { type Express, type Request, type Response } from "express"
import FilenSDK, { type FilenSDKConfig, type FSStats, type SocketEvent } from "@filen/sdk"
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
import HeadBucket from "./handlers/headBucket"
import DeleteObjects from "./handlers/deleteObjects"
import Responses from "./responses"
import { Semaphore, ISemaphore } from "./semaphore"
import http, { type IncomingMessage, type ServerResponse } from "http"
import { type Socket } from "net"
import { v4 as uuidv4 } from "uuid"
import { type Duplex } from "stream"
import { rateLimit } from "express-rate-limit"
import Logger from "./logger"
import cluster from "cluster"
import os from "os"
import CreateBucket from "./handlers/createBucket"
import body from "./middlewares/body"
import DeleteBucket from "./handlers/deleteBucket"

export type ServerConfig = {
	hostname: string
	port: number
	https: boolean
}

export type User = {
	sdkConfig?: FilenSDKConfig
	accessKeyId: string
	secretKeyId: string
	sdk?: FilenSDK
}

export type RateLimit = {
	windowMs: number
	limit: number
	key: "ip" | "accessKeyId"
}

/**
 * S3Server
 *
 * @export
 * @class S3Server
 * @typedef {S3Server}
 */
export class S3Server {
	public readonly server: Express
	public readonly serverConfig: ServerConfig
	public readonly user: User
	public readonly sdk: FilenSDK
	public readonly region = "filen"
	public readonly service = "s3"
	private readonly rwMutex: Record<string, ISemaphore> = {}
	public serverInstance:
		| https.Server<typeof IncomingMessage, typeof ServerResponse>
		| http.Server<typeof IncomingMessage, typeof ServerResponse>
		| null = null
	public connections: Record<string, Socket | Duplex> = {}
	public rateLimit: RateLimit
	public logger: Logger

	/**
	 * Creates an instance of S3Server.
	 *
	 * @constructor
	 * @public
	 * @param {{
	 * 		hostname?: string
	 * 		port?: number
	 * 		https?: boolean
	 * 		user: User
	 * 		rateLimit?: RateLimit
	 * 		disableLogging?: boolean
	 * 	}} param0
	 * @param {string} [param0.hostname="127.0.0.1"]
	 * @param {number} [param0.port=1700]
	 * @param {User} param0.user
	 * @param {boolean} [param0.https=false]
	 * @param {RateLimit} [param0.rateLimit={
	 * 			windowMs: 1000,
	 * 			limit: 1000,
	 * 			key: "accessKeyId"
	 * 		}]
	 * @param {boolean} [param0.disableLogging=false]
	 */
	public constructor({
		hostname = "127.0.0.1",
		port = 1700,
		user,
		https = false,
		rateLimit = {
			windowMs: 1000,
			limit: 1000,
			key: "accessKeyId"
		},
		disableLogging = false
	}: {
		hostname?: string
		port?: number
		https?: boolean
		user: User
		rateLimit?: RateLimit
		disableLogging?: boolean
	}) {
		this.serverConfig = {
			hostname,
			port,
			https
		}
		this.rateLimit = rateLimit
		this.logger = new Logger(disableLogging, false)

		if (!user.sdk && !user.sdkConfig) {
			throw new Error("Either pass a configured SDK instance OR a SDKConfig object to the user object.")
		}

		if (user.sdk) {
			this.sdk = user.sdk
			this.user = {
				...user,
				sdkConfig: user.sdk.config,
				sdk: this.sdk
			}
		} else if (user.sdkConfig) {
			this.sdk = new FilenSDK({
				...user.sdkConfig,
				connectToSocket: true,
				metadataCache: true
			})
			this.user = {
				...user,
				sdkConfig: user.sdkConfig,
				sdk: this.sdk
			}
		} else {
			throw new Error("Either pass a configured SDK instance OR a SDKConfig object to the user object.")
		}

		this.server = express()

		this.sdk.socket.on("socketEvent", (event: SocketEvent) => {
			if (event.type === "passwordChanged") {
				this.user.sdk = undefined
				this.user.sdkConfig = undefined

				this.stop(true).catch(() => {})
			}
		})
	}

	/**
	 * Get a read/write mutex for a path.
	 *
	 * @public
	 * @param {string} path
	 * @returns {ISemaphore}
	 */
	public getRWMutex(path: string): ISemaphore {
		if (!this.rwMutex[path]) {
			this.rwMutex[path] = new Semaphore(1)
		}

		return this.rwMutex[path]!
	}

	/**
	 * Get object stats.
	 *
	 * @public
	 * @async
	 * @param {string} key
	 * @returns {Promise<{ exists: false } | { exists: true; stats: FSStats }>}
	 */
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
		if (!this.user.sdk && !this.user.sdkConfig) {
			throw new Error("Either pass a configured SDK instance OR a SDKConfig object to the user object.")
		}

		this.connections = {}

		this.server.disable("x-powered-by")

		this.server.use(
			rateLimit({
				windowMs: this.rateLimit.windowMs,
				limit: this.rateLimit.limit,
				standardHeaders: "draft-7",
				legacyHeaders: true,
				keyGenerator: req => {
					if (this.rateLimit.key === "ip") {
						return req.ip ?? "ip"
					}

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

		this.server.use((req, res, next) => {
			console.log(req.method, req.url)

			next()
		})

		this.server.use(body)
		this.server.use(new Auth(this).handle)

		this.server.head("/:bucket/:key*", new HeadObject(this).handle)
		this.server.get("/:bucket/:key*", new GetObject(this).handle)
		this.server.delete("/:bucket/:key*", new DeleteObject(this).handle)
		this.server.put("/:bucket/:key*", new PutObject(this).handle)
		this.server.head("/:bucket", new HeadBucket(this).handle)
		this.server.put("/:bucket", new CreateBucket(this).handle)
		this.server.delete("/:bucket", new DeleteBucket(this).handle)
		this.server.get("/:bucket", new ListObjects(this).handle)
		this.server.post("/:bucket", new DeleteObjects(this).handle)
		this.server.get("/", new ListBuckets(this).handle)

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

export class S3ServerCluster {
	private user: User
	private serverConfig: ServerConfig
	private rateLimit: RateLimit
	private threads: number
	private workers: Record<
		number,
		{
			worker: ReturnType<typeof cluster.fork>
			ready: boolean
		}
	> = {}
	private stopSpawning: boolean = false
	private enableHTTPS: boolean
	private sdk: FilenSDK

	public constructor({
		hostname = "127.0.0.1",
		port = 1700,
		user,
		https = false,
		rateLimit = {
			windowMs: 1000,
			limit: 1000,
			key: "accessKeyId"
		},
		threads
	}: {
		hostname?: string
		port?: number
		https?: boolean
		user: User
		rateLimit?: RateLimit
		threads?: number
	}) {
		this.serverConfig = {
			hostname,
			port,
			https
		}
		this.rateLimit = rateLimit
		this.user = user
		this.threads = typeof threads === "number" ? threads : os.cpus().length
		this.enableHTTPS = https

		if (!this.user.sdk && !this.user.sdkConfig) {
			throw new Error("Either pass a configured SDK instance OR a SDKConfig object to the user object.")
		}

		if (this.user.sdk) {
			this.sdk = this.user.sdk
		} else {
			this.sdk = new FilenSDK({
				...this.user.sdkConfig,
				connectToSocket: true,
				metadataCache: true
			})
		}

		this.sdk.socket.on("socketEvent", (event: SocketEvent) => {
			if (event.type === "passwordChanged") {
				this.user.sdk = undefined
				this.user.sdkConfig = undefined

				this.stop().catch(() => {})
			}
		})
	}

	/**
	 * Spawn a worker.
	 *
	 * @private
	 */
	private spawnWorker(): void {
		if (this.stopSpawning) {
			return
		}

		const worker = cluster.fork()

		this.workers[worker.id] = {
			worker,
			ready: false
		}
	}

	/**
	 * Fork all needed threads.
	 *
	 * @private
	 * @async
	 * @returns {Promise<"master" | "worker">}
	 */
	private async startCluster(): Promise<"master" | "worker"> {
		if (cluster.isPrimary) {
			return await new Promise<"master" | "worker">((resolve, reject) => {
				try {
					let workersReady = 0

					for (let i = 0; i < this.threads; i++) {
						this.spawnWorker()
					}

					cluster.on("exit", async worker => {
						if (workersReady < this.threads) {
							return
						}

						workersReady--

						delete this.workers[worker.id]

						await new Promise<void>(resolve => setTimeout(resolve, 1000))

						try {
							this.spawnWorker()
						} catch {
							// Noop
						}
					})

					const errorTimeout = setTimeout(() => {
						reject(new Error("Could not spawn all workers."))
					}, 15000)

					cluster.on("message", (worker, message) => {
						if (message === "ready" && this.workers[worker.id]) {
							workersReady++

							this.workers[worker.id]!.ready = true

							if (workersReady >= this.threads) {
								clearTimeout(errorTimeout)

								resolve("master")
							}
						}
					})
				} catch (e) {
					reject(e)
				}
			})
		}

		const server = new S3Server({
			hostname: this.serverConfig.hostname,
			port: this.serverConfig.port,
			disableLogging: true,
			user: this.user,
			rateLimit: this.rateLimit,
			https: this.enableHTTPS
		})

		await server.start()

		if (process.send) {
			process.send("ready")
		}

		return "worker"
	}

	/**
	 * Start the S3 cluster.
	 *
	 * @public
	 * @async
	 * @returns {Promise<void>}
	 */
	public async start(): Promise<void> {
		if (!this.user.sdk && !this.user.sdkConfig) {
			throw new Error("Either pass a configured SDK instance OR a SDKConfig object to the user object.")
		}

		await new Promise<void>((resolve, reject) => {
			this.startCluster()
				.then(type => {
					if (type === "master") {
						resolve()
					}
				})
				.catch(reject)
		})
	}

	/**
	 * Stop the S3 cluster.
	 *
	 * @public
	 * @async
	 * @returns {Promise<void>}
	 */
	public async stop(): Promise<void> {
		cluster.removeAllListeners()

		this.stopSpawning = true

		for (const id in this.workers) {
			this.workers[id]!.worker.destroy()
		}

		await new Promise<void>(resolve => setTimeout(resolve, 1000))

		this.workers = {}
		this.stopSpawning = false
	}
}

export default S3Server
