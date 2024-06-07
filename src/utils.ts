import pathModule from "path"
import fs from "fs-extra"
import os from "os"

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

	configPath = pathModule.join(configPath, "filen-webdav")

	if (!fs.existsSync(configPath)) {
		fs.mkdirSync(configPath, {
			recursive: true
		})
	}

	return configPath
}
