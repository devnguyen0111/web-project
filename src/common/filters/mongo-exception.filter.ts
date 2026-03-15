import { Catch, ConflictException, ExceptionFilter } from '@nestjs/common';
import { MongoServerError } from 'mongodb';

@Catch(MongoServerError)
export class MongoExceptionFilter implements ExceptionFilter {
  catch(exception: MongoServerError): void {
    if (exception.code === 11000) {
      const keyPattern = (exception.keyPattern ?? {}) as Record<
        string,
        unknown
      >;
      const duplicateField = Object.keys(keyPattern)[0] ?? 'field';
      throw new ConflictException(`${duplicateField} already exists`);
    }

    throw exception;
  }
}
