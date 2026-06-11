import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { SubscriptionStatus } from '@enums';

const PREMIUM_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.TRIAL,
  SubscriptionStatus.ACTIVE,
];

@Injectable()
export class PremiumGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();

    const isPremium =
      PREMIUM_STATUSES.includes(user.subscriptionStatus) ||
      user.role === 'ADMIN' ||
      user.role === 'SUPER_ADMIN';

    if (!isPremium) {
      throw new ForbiddenException({
        message: 'Esta función requiere una suscripción premium',
        code: 'PREMIUM_REQUIRED',
      });
    }

    return true;
  }
}
