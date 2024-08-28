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

	public constructor({
		hostname = "127.0.0.1",
		port = 1700,
		user,
		https = false
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
	}) {
		this.serverConfig = {
			hostname,
			port,
			https
		}

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
		this.server.disable("x-powered-by")

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
					})
					.catch(reject)
			} else {
				this.serverInstance = http.createServer(this.server).listen(this.serverConfig.port, this.serverConfig.hostname, () => {
					resolve()
				})
			}
		})
	}

	/**
	 * Stop the server.
	 *
	 * @public
	 * @async
	 * @returns {Promise<void>}
	 */
	public async stop(): Promise<void> {
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
		})
	}
}

export default S3Server
