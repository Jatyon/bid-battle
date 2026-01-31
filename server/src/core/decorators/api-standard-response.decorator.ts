import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiExtraModels,
  getSchemaPath,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiTooManyRequestsResponse,
  ApiInternalServerErrorResponse,
  ApiConflictResponse,
  ApiRequestTimeoutResponse,
  ApiPayloadTooLargeResponse,
  ApiMethodNotAllowedResponse,
  ApiResponseOptions,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '@core/dto/error-response.dto';
import { ApiResponseDto } from '@core/dto/api-response.dto';

const createErrorSchema = (status: number, error: string, message: string | string[]): ApiResponseOptions => {
  return {
    description: error,
    schema: {
      allOf: [
        { $ref: getSchemaPath(ErrorResponseDto) },
        {
          properties: {
            statusCode: { example: status },
            error: { example: error },
            message: { example: message },
            timestamp: { example: new Date().toISOString() },
            path: { example: '/api/current-endpoint' },
            method: { example: 'GET' },
          },
        },
      ],
    },
  };
};

export const ApiStandardResponse = <TModel extends Type<any>>(model: TModel, isArray: boolean = false) => {
  return applyDecorators(
    ApiExtraModels(ApiResponseDto, ErrorResponseDto, model),

    ApiOkResponse({
      description: 'Successful operation',
      schema: {
        allOf: [
          { $ref: getSchemaPath(ApiResponseDto) },
          {
            properties: {
              statusCode: { example: 200 },
              timestamp: { example: new Date().toISOString() },
              data: isArray ? { type: 'array', items: { $ref: getSchemaPath(model) } } : { $ref: getSchemaPath(model) },
            },
          },
        ],
      },
    }),

    ApiBadRequestResponse(createErrorSchema(400, 'Bad Request', ['validation_failed', 'email must be an email'])),

    ApiUnauthorizedResponse(createErrorSchema(401, 'Unauthorized', 'Unauthorized. Please log in.')),

    ApiForbiddenResponse(createErrorSchema(403, 'Forbidden', 'You do not have permission to perform this action.')),

    ApiNotFoundResponse(createErrorSchema(404, 'Not Found', 'Resource not found.')),

    ApiMethodNotAllowedResponse(createErrorSchema(405, 'Method Not Allowed', 'Method not allowed')),

    ApiRequestTimeoutResponse(createErrorSchema(408, 'Request Timeout', 'timeout')),

    ApiConflictResponse(createErrorSchema(409, 'Conflict', 'database_unique_constraint')),

    ApiPayloadTooLargeResponse(createErrorSchema(413, 'Payload Too Large', 'Payload too large')),

    ApiTooManyRequestsResponse(createErrorSchema(429, 'Too Many Requests', 'Too many requests')),

    ApiInternalServerErrorResponse(createErrorSchema(500, 'Internal Server Error', 'Internal Server Error.')),
  );
};
