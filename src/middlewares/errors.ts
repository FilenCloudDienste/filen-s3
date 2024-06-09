import { type ErrorRequestHandler } from "express"
import Responses from "../responses"

/**
 * Error handling middleware.
 *
 * @param {*} err
 * @param {*} req
 * @param {*} res
 * @returns {void}
 */
export const Errors: ErrorRequestHandler = (err, req, res): void => {
	Responses.error(res, 500, "InternalError", "Internal server error.").catch(() => {})
}

export default Errors
