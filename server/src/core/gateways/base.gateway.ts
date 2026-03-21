import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, WebSocketServer } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { AuthService } from '@modules/auth';
import { UsersService } from '@modules/users';
import { Server } from 'socket.io';

export abstract class BaseGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  protected abstract readonly logger: Logger;
  protected abstract readonly namespace: string;

  constructor(
    protected readonly authService: AuthService,
    protected readonly usersService: UsersService,
  ) {}

  afterInit() {
    this.logger.log(`WebSocket Gateway initialized - Namespace: ${this.namespace}`);
  }

  async handleConnection() {}

  async handleDisconnect() {}

  protected onClientConnect(): void {}

  protected async onClientDisconnect(): Promise<void> {}
}
