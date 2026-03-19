import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import Handlebars from 'handlebars';
import { createTransport, type Transporter } from 'nodemailer';
import { join } from 'path';

interface SendMailPayload {
  to: string;
  subject: string;
  text: string;
  html: string;
}

type MailTemplateName = 'email-verification' | 'password-reset';

interface MailTemplateContext {
  code: string;
  expiresInMinutes: number;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;
  private readonly templateCache = new Map<
    MailTemplateName,
    Handlebars.TemplateDelegate<MailTemplateContext>
  >();

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('mail.host') ?? '';
    const user = this.configService.get<string>('mail.user') ?? '';
    const pass = this.configService.get<string>('mail.pass') ?? '';
    const port = this.configService.get<number>('mail.port') ?? 587;
    const secure = this.configService.get<boolean>('mail.secure') ?? false;

    this.from =
      this.configService.get<string>('mail.from') ?? 'no-reply@example.com';

    if (!host || !user || !pass) {
      this.transporter = null;
      this.logger.warn(
        'SMTP is not fully configured. Email delivery will fallback to log preview mode.',
      );
      return;
    }

    this.transporter = createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
  }

  async sendVerificationCode(
    to: string,
    code: string,
    expiresInMinutes: number,
  ): Promise<void> {
    const subject = 'Email verification code';
    const text = `Your verification code is ${code}. It will expire in ${expiresInMinutes} minutes.`;
    const html = this.renderTemplate('email-verification', {
      code,
      expiresInMinutes,
    });

    await this.sendMail({ to, subject, text, html });
  }

  async sendPasswordResetCode(
    to: string,
    code: string,
    expiresInMinutes: number,
  ): Promise<void> {
    const subject = 'Password reset code';
    const text = `Your password reset code is ${code}. It will expire in ${expiresInMinutes} minutes.`;
    const html = this.renderTemplate('password-reset', {
      code,
      expiresInMinutes,
    });

    await this.sendMail({ to, subject, text, html });
  }

  async sendSubscriptionReminder(
    to: string,
    payload: {
      planName: string;
      expiresAt: Date;
      daysRemaining: number;
      requiredCoins: number;
    },
  ): Promise<void> {
    const subject = `Subscription reminder: ${payload.planName} expires in ${payload.daysRemaining} day(s)`;
    const text =
      `Your ${payload.planName} subscription will expire on ${payload.expiresAt.toISOString()}. ` +
      `Please keep at least ${payload.requiredCoins} coins in wallet for auto-renew.`;
    const html = `
      <p>Your <strong>${payload.planName}</strong> subscription will expire on <strong>${payload.expiresAt.toISOString()}</strong>.</p>
      <p>Please keep at least <strong>${payload.requiredCoins} coins</strong> in your wallet for auto-renew.</p>
    `;
    await this.sendMail({ to, subject, text, html });
  }

  async sendSubscriptionRenewed(
    to: string,
    payload: {
      planName: string;
      billingCycle: string;
      nextRenewalAt: Date;
      chargedCoins: number;
    },
  ): Promise<void> {
    const subject = `Subscription renewed: ${payload.planName}`;
    const text =
      `Your ${payload.planName} plan has been renewed (${payload.billingCycle}). ` +
      `Charged ${payload.chargedCoins} coins. Next renewal: ${payload.nextRenewalAt.toISOString()}.`;
    const html = `
      <p>Your <strong>${payload.planName}</strong> subscription has been renewed (${payload.billingCycle}).</p>
      <p>Charged: <strong>${payload.chargedCoins} coins</strong>.</p>
      <p>Next renewal: <strong>${payload.nextRenewalAt.toISOString()}</strong>.</p>
    `;
    await this.sendMail({ to, subject, text, html });
  }

  async sendSubscriptionRenewalFailed(
    to: string,
    payload: {
      planName: string;
      requiredCoins: number;
      gracePeriodEndsAt: Date;
    },
  ): Promise<void> {
    const subject = `Auto-renew failed: ${payload.planName}`;
    const text =
      `Auto-renew for ${payload.planName} failed due to insufficient wallet balance. ` +
      `Required: ${payload.requiredCoins} coins. Grace period ends at ${payload.gracePeriodEndsAt.toISOString()}.`;
    const html = `
      <p>Auto-renew for <strong>${payload.planName}</strong> failed due to insufficient wallet balance.</p>
      <p>Required: <strong>${payload.requiredCoins} coins</strong>.</p>
      <p>Grace period ends at <strong>${payload.gracePeriodEndsAt.toISOString()}</strong>.</p>
    `;
    await this.sendMail({ to, subject, text, html });
  }

  async sendSubscriptionExpired(
    to: string,
    payload: {
      previousPlanName: string;
      expiredAt: Date;
    },
  ): Promise<void> {
    const subject = `Subscription expired: ${payload.previousPlanName}`;
    const text =
      `Your ${payload.previousPlanName} subscription expired on ${payload.expiredAt.toISOString()} and is now downgraded to Free.`;
    const html = `
      <p>Your <strong>${payload.previousPlanName}</strong> subscription expired on <strong>${payload.expiredAt.toISOString()}</strong>.</p>
      <p>Your account is now on the <strong>Free</strong> plan.</p>
    `;
    await this.sendMail({ to, subject, text, html });
  }

  async sendNotificationAlert(
    to: string,
    payload: {
      title: string;
      message: string;
      createdAt?: Date;
    },
  ): Promise<void> {
    const subject = `[ALERT] ${payload.title}`;
    const createdAt = payload.createdAt ?? new Date();
    const text =
      `${payload.message}\n` +
      `Created at: ${createdAt.toISOString()}`;
    const html = `
      <p><strong>${payload.title}</strong></p>
      <p>${payload.message}</p>
      <p>Created at: <strong>${createdAt.toISOString()}</strong></p>
    `;

    await this.sendMail({ to, subject, text, html });
  }

  private renderTemplate(
    templateName: MailTemplateName,
    context: MailTemplateContext,
  ): string {
    const cachedTemplate = this.templateCache.get(templateName);
    if (cachedTemplate) {
      return cachedTemplate(context);
    }

    const templatePath = join(__dirname, 'templates', `${templateName}.hbs`);
    const templateSource = readFileSync(templatePath, 'utf8');
    const template = Handlebars.compile<MailTemplateContext>(templateSource);
    this.templateCache.set(templateName, template);

    return template(context);
  }

  private async sendMail(payload: SendMailPayload): Promise<void> {
    if (!this.transporter) {
      this.logger.log(
        `[MAIL_PREVIEW] to=${payload.to} subject="${payload.subject}" text="${payload.text}"`,
      );
      return;
    }

    await this.transporter.sendMail({
      from: this.from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
  }
}
