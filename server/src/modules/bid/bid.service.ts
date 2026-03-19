import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class BidService {
  private readonly logger = new Logger(BidService.name);

  constructor() {}
}
