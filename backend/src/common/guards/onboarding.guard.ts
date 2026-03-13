import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { User } from '../../users/user.entity';

/**
 * Guard that blocks access to protected routes until the user
 * has completed onboarding. Apply after JwtAuthGuard.
 *
 * Endpoints in the `auth` and `onboarding` controllers are exempt
 * (they don't use this guard).
 */
@Injectable()
export class OnboardingGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as User | undefined;

    if (user && !user.onboardingCompleted) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Onboarding not completed',
        error: 'onboarding_required',
      });
    }

    return true;
  }
}
