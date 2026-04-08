import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiExtraModels,
  getSchemaPath,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiPayloadTooLargeResponse,
  ApiInternalServerErrorResponse,
  ApiResponseOptions,
} from '@nestjs/swagger';
import { ApiResponseDto, ErrorResponseDto } from '@core/dto';

const defaultErrorStatuses = [400, 401, 403, 404, 500] as const;

const errorResponseDetails: Record<number, { decorator: (options: ApiResponseOptions) => MethodDecorator; error: string; message: string | string[] }> = {
  400: {
    decorator: ApiBadRequestResponse,
    error: 'Bad Request',
    message: ['validation_failed', 'email must be an email'],
  },
  401: {
    decorator: ApiUnauthorizedResponse,
    error: 'Unauthorized',
    message: 'Unauthorized. Please log in.',
  },
  403: {
    decorator: ApiForbiddenResponse,
    error: 'Forbidden',
    message: 'You do not have permission to perform this action.',
  },
  404: {
    decorator: ApiNotFoundResponse,
    error: 'Not Found',
    message: 'Resource not found.',
  },
  409: {
    decorator: ApiConflictResponse,
    error: 'Conflict',
    message: 'database_unique_constraint',
  },
  413: {
    decorator: ApiPayloadTooLargeResponse,
    error: 'Payload Too Large',
    message: 'Payload too large',
  },
  500: {
    decorator: ApiInternalServerErrorResponse,
    error: 'Internal Server Error',
    message: 'Internal Server Error.',
  },
};

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

const createSuccessSchema = (model: Type<any>, isArray: boolean, genericType?: Type<any>) => {
  if (genericType) {
    return {
      allOf: [
        { $ref: getSchemaPath(model) },
        {
          properties: {
            items: {
              type: 'array',
              items: { $ref: getSchemaPath(genericType) },
            },
          },
        },
      ],
    };
  } else if (isArray) return { type: 'array', items: { $ref: getSchemaPath(model) } };
  else return { $ref: getSchemaPath(model) };
};

const createErrorDecorator = (status: number): MethodDecorator | null => {
  const response = errorResponseDetails[status];
  return response ? response.decorator(createErrorSchema(status, response.error, response.message)) : null;
};

export const ApiStandardResponse = <TModel extends Type<any>>(model: TModel, isArray: boolean = false, genericType?: Type<any>, options?: { errorStatuses?: number[] }) => {
  const modelsToExtract = genericType ? [ApiResponseDto, ErrorResponseDto, model, genericType] : [ApiResponseDto, ErrorResponseDto, model];
  const dataProperty = createSuccessSchema(model, isArray, genericType);
  const errorStatuses = options?.errorStatuses ?? [...defaultErrorStatuses];

  return applyDecorators(
    ApiExtraModels(...modelsToExtract),

    ApiOkResponse({
      description: 'Successful operation',
      schema: {
        allOf: [
          { $ref: getSchemaPath(ApiResponseDto) },
          {
            properties: {
              statusCode: { example: 200 },
              timestamp: { example: new Date().toISOString() },
              data: dataProperty,
            },
          },
        ],
      },
    }),

    ...errorStatuses.map((status) => createErrorDecorator(status)).filter((decorator): decorator is MethodDecorator => Boolean(decorator)),
  );
};
