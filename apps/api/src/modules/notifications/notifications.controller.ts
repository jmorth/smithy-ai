import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  RequestUser,
} from '../../common/decorators/current-user.decorator';
import { InAppService } from './channels/in-app.service';
import { WebhookService } from './channels/webhook.service';
import {
  ListNotificationsQueryDto,
  CreateWebhookEndpointDto,
} from './dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(
    private readonly inAppService: InAppService,
    private readonly webhookService: WebhookService,
  ) {}

  @Get('notifications')
  async listNotifications(
    @CurrentUser() user: RequestUser,
    @Query() query: ListNotificationsQueryDto,
  ) {
    const result = await this.inAppService.listNotifications(
      user.id,
      {
        status: query.status,
        type: query.type,
      },
      {
        page: query.page,
        limit: query.limit,
      },
    );

    const unreadCount = await this.inAppService.getUnreadCount(user.id);

    return {
      data: result.data,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        unreadCount,
      },
    };
  }

  @Patch('notifications/:id/read')
  async markRead(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    try {
      const notification = await this.inAppService.markRead(id);

      if (notification.recipient !== user.id) {
        throw new NotFoundException(`Notification not found: ${id}`);
      }

      return notification;
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : String(error);
      if (message.includes('not found')) {
        throw new NotFoundException(`Notification not found: ${id}`);
      }
      throw error;
    }
  }

  @Patch('notifications/read-all')
  async markAllRead(@CurrentUser() user: RequestUser) {
    const count = await this.inAppService.markAllRead(user.id);
    return { updatedCount: count };
  }

  @Post('webhook-endpoints')
  @HttpCode(HttpStatus.CREATED)
  async createWebhookEndpoint(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateWebhookEndpointDto,
  ) {
    const endpoint = await this.webhookService.registerEndpoint(
      dto.url,
      dto.secret,
      dto.events,
      user.id,
    );

    // Test ping (non-blocking, log warning on failure)
    this.testPingEndpoint(endpoint.id, endpoint.url).catch(() => {
      // Intentionally swallowed — warning already logged
    });

    return endpoint;
  }

  @Get('webhook-endpoints')
  async listWebhookEndpoints(@CurrentUser() user: RequestUser) {
    return this.webhookService.listEndpoints(user.id);
  }

  @Delete('webhook-endpoints/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWebhookEndpoint(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const endpoints = await this.webhookService.listEndpoints(user.id);
    const endpoint = endpoints.find((ep) => ep.id === id);

    if (!endpoint) {
      throw new NotFoundException(`Webhook endpoint not found: ${id}`);
    }

    await this.webhookService.deleteEndpoint(id);
  }

  private async testPingEndpoint(
    endpointId: string,
    url: string,
  ): Promise<void> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'test.ping' }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        this.logger.debug(
          `Test ping successful for webhook endpoint: ${endpointId}`,
        );
      } else {
        this.logger.warn(
          `Test ping failed for webhook endpoint ${endpointId}: HTTP ${response.status}`,
        );
      }
    } catch {
      this.logger.warn(
        `Test ping failed for webhook endpoint ${endpointId}: could not reach URL`,
      );
    }
  }
}
