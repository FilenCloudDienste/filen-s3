import pathModule from "path"
import fs from "fs-extra"
import os from "os"
import { type Request } from "express"
import { parseString } from "xml2js"
import { type Readable } from "stream"

/**
 * Convert a UNIX style timestamp (in seconds) to milliseconds
 * @date 1/31/2024 - 4:10:35 PM
 *
 * @export
 * @param {number} timestamp
 * @returns {number}
 */
export function convertTimestampToMs(timestamp: number): number {
	const now = Date.now()

	if (Math.abs(now - timestamp) < Math.abs(now - timestamp * 1000)) {
		return timestamp
	}

	return Math.floor(timestamp * 1000)
}

/**
 * Chunk large Promise.all executions.
 * @date 2/14/2024 - 11:59:34 PM
 *
 * @export
 * @async
 * @template T
 * @param {Promise<T>[]} promises
 * @param {number} [chunkSize=10000]
 * @returns {Promise<T[]>}
 */
export async function promiseAllChunked<T>(promises: Promise<T>[], chunkSize = 10000): Promise<T[]> {
	const results: T[] = []

	for (let i = 0; i < promises.length; i += chunkSize) {
		const chunkResults = await Promise.all(promises.slice(i, i + chunkSize))

		results.push(...chunkResults)
	}

	return results
}

/**
 * Return the platforms config path.
 *
 * @export
 * @returns {string}
 */
export function platformConfigPath(): string {
	// Ref: https://github.com/FilenCloudDienste/filen-cli/blob/main/src/util.ts

	let configPath = ""

	switch (process.platform) {
		case "win32":
			configPath = pathModule.resolve(process.env.APPDATA!)
			break
		case "darwin":
			configPath = pathModule.resolve(pathModule.join(os.homedir(), "Library/Application Support/"))
			break
		default:
			configPath = process.env.XDG_CONFIG_HOME
				? pathModule.resolve(process.env.XDG_CONFIG_HOME)
				: pathModule.resolve(pathModule.join(os.homedir(), ".config/"))
			break
	}

	if (!configPath || configPath.length === 0) {
		throw new Error("Could not find homedir path.")
	}

	configPath = pathModule.join(configPath, "@filen", "s3")

	if (!fs.existsSync(configPath)) {
		fs.mkdirSync(configPath, {
			recursive: true
		})
	}

	return configPath
}

/**
 * Chunk large Promise.allSettled executions.
 * @date 3/5/2024 - 12:41:08 PM
 *
 * @export
 * @async
 * @template T
 * @param {Promise<T>[]} promises
 * @param {number} [chunkSize=10000]
 * @returns {Promise<T[]>}
 */
export async function promiseAllSettledChunked<T>(promises: Promise<T>[], chunkSize = 10000): Promise<T[]> {
	const results: T[] = []

	for (let i = 0; i < promises.length; i += chunkSize) {
		const chunkPromisesSettled = await Promise.allSettled(promises.slice(i, i + chunkSize))
		const chunkResults = chunkPromisesSettled.reduce((acc: T[], current) => {
			if (current.status === "fulfilled") {
				acc.push(current.value)
			} else {
				// Handle rejected promises or do something with the error (current.reason)
			}

			return acc
		}, [])

		results.push(...chunkResults)
	}

	return results
}

/**
 * Parse the requested byte range from the header.
 *
 * @export
 * @param {string} range
 * @param {number} totalLength
 * @returns {({ start: number; end: number } | null)}
 */
export function parseByteRange(range: string, totalLength: number): { start: number; end: number } | null {
	const [unit, rangeValue] = range.split("=")

	if (unit !== "bytes" || !rangeValue) {
		return null
	}

	const [startStr, endStr] = rangeValue.split("-")

	if (!startStr) {
		return null
	}

	const start = parseInt(startStr, 10)
	const end = endStr ? parseInt(endStr, 10) : totalLength - 1

	if (isNaN(start) || isNaN(end) || start < 0 || end >= totalLength || start > end) {
		return null
	}

	return {
		start,
		end
	}
}

/**
 * Normalize an object key so we can use it in the SDK.
 *
 * @export
 * @param {string} key
 * @returns {string}
 */
export function normalizeKey(key: string): string {
	key = key.trim()

	if (key.length === 0 || key === "./" || key === "../" || key === "/") {
		return "/"
	}

	if (!key.startsWith("/")) {
		key = `/${key}`
	}

	if (key.endsWith("/")) {
		key = key.substring(0, key.length - 1)
	}

	return key
}

/**
 * Extract the key and bucket parameter from the express router request.
 *
 * @export
 * @param {Request} req
 * @returns {({ bucket: string | null; key: string | null; path: string | null })}
 */
export function extractKeyAndBucketFromRequestParams(req: Request): { bucket: string | null; key: string | null; path: string | null } {
	const key =
		typeof req.params.key === "string" && req.params.key.length > 0
			? typeof req.params["0"] === "string" && req.params["0"].length > 0
				? pathModule.posix.join(decodeURIComponent(req.params.key), decodeURIComponent(req.params["0"]))
				: decodeURIComponent(req.params.key)
			: null

	const bucket =
		typeof req.params.bucket === "string" && req.params.bucket.length > 0 && !req.params.bucket.includes("/")
			? decodeURIComponent(req.params.bucket)
			: null

	return {
		key,
		bucket,
		path: key && bucket ? normalizeKey(pathModule.posix.join(bucket, key)) : null
	}
}

/**
 * Read a readable stream into a Buffer.
 *
 * @export
 * @param {Readable} stream
 * @returns {Promise<Buffer>}
 */
export function streamToBuffer(stream: Readable): Promise<Buffer> {
	return new Promise<Buffer>((resolve, reject) => {
		const buffers: Buffer[] = []

		stream.on("data", chunk => {
			buffers.push(chunk)
		})

		stream.on("end", () => {
			resolve(Buffer.concat(buffers))
		})

		stream.on("error", reject)
	})
}

/**
 * Parse a readable stream into XML.
 *
 * @export
 * @template T
 * @param {Readable} stream
 * @returns {Promise<T>}
 */
export function streamToXML<T>(stream: Readable): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		streamToBuffer(stream)
			.then(requestBuffer => {
				parseString(requestBuffer.toString("utf-8"), { explicitArray: false }, (err, result) => {
					if (err) {
						reject(err)

						return
					}

					resolve(result as T)
				})
			})
			.catch(reject)
	})
}

/**
 * Validates an S3 bucket name.
 * @param bucketName - The bucket name to validate.
 * @returns True if the bucket name is valid, otherwise false.
 */
export function isValidBucketName(bucketName: string): boolean {
	// Bucket name must be between 3 and 63 characters
	if (bucketName.length < 3 || bucketName.length > 63) {
		return false
	}

	// Bucket name can only contain lowercase letters, numbers, hyphens, and periods
	const bucketNameRegex = /^[a-z0-9.-]+$/

	if (!bucketNameRegex.test(bucketName)) {
		return false
	}

	// Bucket name must start and end with a letter or number
	if (!/^[a-z0-9]/.test(bucketName) || !/[a-z0-9]$/.test(bucketName)) {
		return false
	}

	// Consecutive periods are not allowed
	if (bucketName.includes("..")) {
		return false
	}

	// Bucket name cannot be formatted as an IP address
	const ipAddressRegex = /^(?:\d{1,3}\.){3}\d{1,3}$/

	if (ipAddressRegex.test(bucketName)) {
		return false
	}

	return true
}

/**
 * Validates an S3 object key.
 * @param key - The object key to validate.
 * @returns True if the key is valid, otherwise false.
 */
export function isValidObjectKey(key: string): boolean {
	// Key must not be empty
	if (key.length === 0) {
		return false
	}

	// Key length must be between 1 and 1024 characters
	if (key.length > 1024) {
		return false
	}

	// Key must not contain unprintable ASCII characters (ASCII 0-31) or delete (ASCII 127)
	// eslint-disable-next-line no-control-regex
	const controlCharsRegex = /[\x00-\x1F\x7F]/

	if (controlCharsRegex.test(key)) {
		return false
	}

	// Key must not contain invalid Unicode surrogates
	try {
		decodeURIComponent(encodeURIComponent(key)) // Validates UTF-8 encoding
	} catch {
		return false
	}

	return true
}
