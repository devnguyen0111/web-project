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
