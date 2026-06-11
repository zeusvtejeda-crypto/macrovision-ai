import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '@database/prisma.service';
import { EmailService } from '@common/services/email.service';
import {
  SubscriptionStatus,
  SubscriptionPlan,
  PaymentProvider,
  PaymentStatus,
} from '@enums';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);
  private stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {
    this.stripe = new Stripe(
      configService.get<string>('stripe.secretKey') || 'sk_test_placeholder',
      { apiVersion: '2025-02-24.acacia' as const },
    );
  }

  // ─── Crear sesión de checkout (web) ───────────────
  async createCheckoutSession(
    userId: string,
    plan: 'MONTHLY' | 'ANNUAL',
    successUrl: string,
    cancelUrl: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();

    // Crear o recuperar customer en Stripe
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: { userId },
      });
      customerId = customer.id;
      await this.prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customerId },
      });
    }

    const priceId =
      plan === 'ANNUAL'
        ? this.configService.get<string>('stripe.annualPriceId')
        : this.configService.get<string>('stripe.monthlyPriceId');

    const trialDays = this.configService.get<number>('stripe.trialDays', 7);

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: trialDays,
        metadata: { userId, plan },
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { userId, plan },
    });

    return { url: session.url, sessionId: session.id };
  }

  // ─── Portal de cliente Stripe ─────────────────────
  async createPortalSession(userId: string, returnUrl: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user?.stripeCustomerId) {
      throw new BadRequestException('No tienes una suscripción activa');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  }

  // ─── Obtener suscripción del usuario ──────────────
  async getSubscription(userId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { payments: { orderBy: { createdAt: 'desc' }, take: 5 } },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionStatus: true, subscriptionExpiry: true },
    });

    return {
      subscription,
      status: user?.subscriptionStatus,
      expiry: user?.subscriptionExpiry,
    };
  }

  // ─── Webhook Stripe ───────────────────────────────
  async handleStripeWebhook(body: Buffer, signature: string): Promise<void> {
    const webhookSecret = this.configService.get<string>('stripe.webhookSecret');

    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(body, signature, webhookSecret!);
    } catch (err: any) {
      throw new BadRequestException(`Webhook error: ${err.message}`);
    }

    this.logger.log(`Stripe event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
        );
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
        );
        break;

      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
    }
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const userId = session.metadata?.userId;
    if (!userId) return;

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    this.logger.log(`Checkout completado para usuario ${userId}`);
  }

  private async handleSubscriptionUpdated(sub: Stripe.Subscription) {
    const userId = sub.metadata?.userId;
    if (!userId) {
      // Buscar por customer
      const user = await this.prisma.user.findFirst({
        where: { stripeCustomerId: sub.customer as string },
      });
      if (!user) return;

      return this.updateUserSubscription(user.id, sub);
    }

    return this.updateUserSubscription(userId, sub);
  }

  private async updateUserSubscription(userId: string, sub: Stripe.Subscription) {
    const plan = this.detectPlan(sub);
    const status = this.mapStripeStatus(sub.status, sub.trial_end);
    const currentPeriodEnd = new Date((sub.current_period_end as number) * 1000);

    await Promise.all([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          subscriptionStatus: status,
          subscriptionExpiry: currentPeriodEnd,
        },
      }),
      this.prisma.subscription.upsert({
        where: { userId },
        update: {
          status,
          plan,
          currentPeriodStart: new Date((sub.current_period_start as number) * 1000),
          currentPeriodEnd,
          trialEnd: sub.trial_end ? new Date((sub.trial_end as number) * 1000) : null,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          externalSubscriptionId: sub.id,
        },
        create: {
          userId,
          plan,
          status,
          provider: PaymentProvider.STRIPE,
          externalSubscriptionId: sub.id,
          currentPeriodStart: new Date((sub.current_period_start as number) * 1000),
          currentPeriodEnd,
          trialEnd: sub.trial_end ? new Date((sub.trial_end as number) * 1000) : null,
        },
      }),
    ]);

    // Email de confirmación si acaba de activarse
    if (status === SubscriptionStatus.ACTIVE) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        this.emailService
          .sendSubscriptionConfirmation(user.email, user.name || 'Usuario', plan)
          .catch(() => null);
      }
    }
  }

  private async handleSubscriptionDeleted(sub: Stripe.Subscription) {
    const user = await this.prisma.user.findFirst({
      where: { stripeCustomerId: sub.customer as string },
    });

    if (!user) return;

    await Promise.all([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionStatus: SubscriptionStatus.CANCELED,
          subscriptionExpiry: new Date(),
        },
      }),
      this.prisma.subscription.updateMany({
        where: { userId: user.id },
        data: {
          status: SubscriptionStatus.CANCELED,
          canceledAt: new Date(),
        },
      }),
    ]);
  }

  private async handleInvoicePaid(invoice: Stripe.Invoice) {
    const customerId = invoice.customer as string;
    const user = await this.prisma.user.findFirst({
      where: { stripeCustomerId: customerId },
    });

    if (!user) return;

    const subscription = await this.prisma.subscription.findUnique({
      where: { userId: user.id },
    });

    if (!subscription) return;

    await this.prisma.payment.create({
      data: {
        subscriptionId: subscription.id,
        externalId: invoice.payment_intent as string,
        amount: (invoice.amount_paid || 0) / 100,
        currency: invoice.currency.toUpperCase(),
        status: PaymentStatus.SUCCEEDED,
        paidAt: new Date(),
      },
    });
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice) {
    const customerId = invoice.customer as string;
    const user = await this.prisma.user.findFirst({
      where: { stripeCustomerId: customerId },
    });

    if (!user) return;

    await this.prisma.user.update({
      where: { id: user.id },
      data: { subscriptionStatus: SubscriptionStatus.PAST_DUE },
    });
  }

  // ─── App Store / Google Play ──────────────────────
  async validateMobileReceipt(
    userId: string,
    receiptData: string,
    platform: 'ios' | 'android',
    productId: string,
  ) {
    // Implementación básica — en producción usar RevenueCat o similar
    this.logger.log(`Validando receipt de ${platform} para usuario ${userId}`);

    const plan = productId.includes('annual')
      ? SubscriptionPlan.ANNUAL
      : SubscriptionPlan.MONTHLY;

    const now = new Date();
    const expiry = new Date(now);

    if (plan === SubscriptionPlan.ANNUAL) {
      expiry.setFullYear(expiry.getFullYear() + 1);
    } else {
      expiry.setMonth(expiry.getMonth() + 1);
    }

    await Promise.all([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          subscriptionExpiry: expiry,
        },
      }),
      this.prisma.subscription.upsert({
        where: { userId },
        update: {
          status: SubscriptionStatus.ACTIVE,
          plan,
          currentPeriodEnd: expiry,
        },
        create: {
          userId,
          plan,
          status: SubscriptionStatus.ACTIVE,
          provider:
            platform === 'ios'
              ? PaymentProvider.APP_STORE
              : PaymentProvider.GOOGLE_PLAY,
          externalProductId: productId,
          currentPeriodStart: now,
          currentPeriodEnd: expiry,
        },
      }),
    ]);

    return { success: true, status: SubscriptionStatus.ACTIVE, expiry };
  }

  // ─── Helpers ──────────────────────────────────────
  private detectPlan(sub: Stripe.Subscription): SubscriptionPlan {
    const annualId = this.configService.get<string>('stripe.annualPriceId');
    const item = sub.items?.data?.[0];
    const priceId = item?.price?.id;
    return priceId === annualId ? SubscriptionPlan.ANNUAL : SubscriptionPlan.MONTHLY;
  }

  private mapStripeStatus(
    status: Stripe.Subscription.Status,
    trialEnd: number | null,
  ): SubscriptionStatus {
    switch (status) {
      case 'active':
        if (trialEnd && trialEnd > Date.now() / 1000) {
          return SubscriptionStatus.TRIAL;
        }
        return SubscriptionStatus.ACTIVE;
      case 'trialing':
        return SubscriptionStatus.TRIAL;
      case 'past_due':
        return SubscriptionStatus.PAST_DUE;
      case 'canceled':
        return SubscriptionStatus.CANCELED;
      case 'unpaid':
        return SubscriptionStatus.PAST_DUE;
      default:
        return SubscriptionStatus.FREE;
    }
  }
}
