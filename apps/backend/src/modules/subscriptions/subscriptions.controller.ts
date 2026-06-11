import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Req,
  RawBodyRequest,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Request } from 'express';
import { SubscriptionsService } from './subscriptions.service';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Public } from '@common/decorators/public.decorator';

@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Post('checkout')
  @ApiOperation({ summary: 'Crear sesión de checkout de Stripe' })
  createCheckout(
    @CurrentUser('id') userId: string,
    @Body()
    body: {
      plan: 'MONTHLY' | 'ANNUAL';
      successUrl: string;
      cancelUrl: string;
    },
  ) {
    return this.subscriptionsService.createCheckoutSession(
      userId,
      body.plan,
      body.successUrl,
      body.cancelUrl,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Post('portal')
  @ApiOperation({ summary: 'Acceder al portal de cliente Stripe' })
  createPortal(
    @CurrentUser('id') userId: string,
    @Body() body: { returnUrl: string },
  ) {
    return this.subscriptionsService.createPortalSession(userId, body.returnUrl);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Get('me')
  @ApiOperation({ summary: 'Obtener suscripción del usuario' })
  getMySubscription(@CurrentUser('id') userId: string) {
    return this.subscriptionsService.getSubscription(userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Post('mobile/validate')
  @ApiOperation({ summary: 'Validar compra desde App Store / Google Play' })
  validateMobileReceipt(
    @CurrentUser('id') userId: string,
    @Body()
    body: {
      receiptData: string;
      platform: 'ios' | 'android';
      productId: string;
    },
  ) {
    return this.subscriptionsService.validateMobileReceipt(
      userId,
      body.receiptData,
      body.platform,
      body.productId,
    );
  }

  // ─── Webhook Stripe — SIN autenticación JWT ───────
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook de Stripe (uso interno)' })
  async stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    await this.subscriptionsService.handleStripeWebhook(
      req.rawBody!,
      signature,
    );
    return { received: true };
  }
}
