import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";
import { MongoServerError } from "mongodb";

/**
 * Catches everything that bubbles out of a request and turns it into a
 * consistent JSON error envelope with a sane HTTP status code.
 *
 *  - HttpException (incl. ValidationPipe 400s) → its own status/message
 *  - Mongo duplicate key (E11000)             → 409 Conflict
 *  - anything else                            → 500 Internal Server Error
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = "Internal server error";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message = typeof body === "string" ? body : (body as object);
    } else if (
      exception instanceof MongoServerError &&
      exception.code === 11000
    ) {
      status = HttpStatus.CONFLICT;
      message = "Duplicate key: resource already exists";
    } else if (exception instanceof Error) {
      // Log the real error server-side, but never leak internals to the client.
      this.logger.error(exception.message, exception.stack);
    }

    response.status(status).json({
      statusCode: status,
      path: request.url,
      message,
    });
  }
}
