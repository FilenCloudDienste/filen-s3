import pathModule from "path"
import fs from "fs-extra"
import os from "os"
import { type Request } from "express"
import { parseString } from "xml2js"
import { type Readable } from "stream"

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
export async function promiseAllChunked<T>(promises: Promise<T>[], chunkSize = 100000): Promise<T[]> {
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
 * @param {number} [chunkSize=100000]
 * @returns {Promise<T[]>}
 */
export async function promiseAllSettledChunked<T>(promises: Promise<T>[], chunkSize = 100000): Promise<T[]> {
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

	return { start, end }
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
 * Extract the key parameter from the express router request.
 *
 * @export
 * @param {Request} req
 * @returns {string}
 */
export function extractKeyFromRequestParams(req: Request): string {
	const base = req.params.key

	if (typeof base !== "string" || base.length === 0) {
		throw new Error("Invalid key parameter.")
	}

	return typeof req.params["0"] === "string" && req.params["0"].length > 0
		? pathModule.posix.join(decodeURI(base), decodeURI(req.params["0"]))
		: base
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
