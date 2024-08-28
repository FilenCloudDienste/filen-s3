import { type ErrorRequestHandler, type Response, type Request } from "express"
import Responses from "../responses"

/**
 * Error handling middleware.
 *
 * @param {Error} err
 * @param {Request} req
 * @param {Response} res
 * @returns {void}
 */
export const Errors: ErrorRequestHandler = (err: Error, req: Request, res: Response): void => {
	if (!err) {
		return
	}

	Responses.error(res, 500, "InternalError", "Internal server error.").catch(() => {})
}

export default Errors
