import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: configService.get<string>('smtp.host'),
      port: configService.get<number>('smtp.port', 465),
      secure: configService.get<boolean>('smtp.secure', true),
      auth: {
        user: configService.get<string>('smtp.user'),
        pass: configService.get<string>('smtp.pass'),
      },
    });
  }

  async sendVerificationEmail(
    email: string,
    name: string,
    token: string,
  ): Promise<void> {
    const apiUrl = this.configService.get<string>('app.apiUrl');
    const verifyUrl = `${apiUrl}/api/v1/auth/verify-email?token=${token}`;

    await this.transporter.sendMail({
      from: `"MacroVision AI" <${this.configService.get('smtp.from')}>`,
      to: email,
      subject: 'Verifica tu cuenta en MacroVision AI',
      html: this.buildVerificationTemplate(name, verifyUrl),
    });

    this.logger.log(`Email de verificación enviado a ${email}`);
  }

  async sendPasswordResetEmail(
    email: string,
    name: string,
    token: string,
  ): Promise<void> {
    const resetUrl = `macrovision://reset-password?token=${token}`;

    await this.transporter.sendMail({
      from: `"MacroVision AI" <${this.configService.get('smtp.from')}>`,
      to: email,
      subject: 'Recupera tu contraseña — MacroVision AI',
      html: this.buildPasswordResetTemplate(name, resetUrl),
    });
  }

  async sendWelcomeEmail(email: string, name: string): Promise<void> {
    await this.transporter.sendMail({
      from: `"MacroVision AI" <${this.configService.get('smtp.from')}>`,
      to: email,
      subject: '¡Bienvenido a MacroVision AI! 🎉',
      html: this.buildWelcomeTemplate(name),
    });
  }

  async sendSubscriptionConfirmation(
    email: string,
    name: string,
    plan: string,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: `"MacroVision AI" <${this.configService.get('smtp.from')}>`,
      to: email,
      subject: '¡Tu suscripción Premium está activa! ⭐',
      html: this.buildSubscriptionTemplate(name, plan),
    });
  }

  // ─── Templates HTML ───────────────────────────────

  private buildVerificationTemplate(name: string, url: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
</head>
<body style="margin:0;padding:0;background:#000;font-family:-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#111;border-radius:16px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#10b981,#059669);padding:40px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:28px;font-weight:700;">MacroVision AI</h1>
          <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;">Tu compañero nutricional con IA</p>
        </td></tr>
        <tr><td style="padding:40px;">
          <h2 style="color:#fff;margin:0 0 16px;font-size:22px;">Hola ${name} 👋</h2>
          <p style="color:#a1a1aa;line-height:1.6;margin:0 0 24px;">
            Gracias por unirte a MacroVision AI. Verifica tu email para empezar a contar calorías con inteligencia artificial.
          </p>
          <a href="${url}" style="display:block;background:#10b981;color:#fff;text-align:center;padding:16px;border-radius:12px;text-decoration:none;font-weight:600;font-size:16px;">
            Verificar mi cuenta
          </a>
          <p style="color:#52525b;font-size:12px;margin:24px 0 0;text-align:center;">
            Este enlace expira en 24 horas. Si no creaste esta cuenta, ignora este email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  private buildPasswordResetTemplate(name: string, url: string): string {
    return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#000;font-family:-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#111;border-radius:16px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#10b981,#059669);padding:40px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:28px;font-weight:700;">MacroVision AI</h1>
        </td></tr>
        <tr><td style="padding:40px;">
          <h2 style="color:#fff;margin:0 0 16px;">Recuperar contraseña</h2>
          <p style="color:#a1a1aa;line-height:1.6;margin:0 0 24px;">
            Hola ${name}, recibimos una solicitud para restablecer tu contraseña.
          </p>
          <a href="${url}" style="display:block;background:#10b981;color:#fff;text-align:center;padding:16px;border-radius:12px;text-decoration:none;font-weight:600;">
            Restablecer contraseña
          </a>
          <p style="color:#52525b;font-size:12px;margin:24px 0 0;text-align:center;">
            Válido por 1 hora. Si no solicitaste esto, ignora este email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  private buildWelcomeTemplate(name: string): string {
    return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#000;font-family:-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#111;border-radius:16px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#10b981,#059669);padding:40px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:36px;">🎉</h1>
          <h2 style="color:#fff;margin:8px 0 0;">¡Bienvenido, ${name}!</h2>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="color:#a1a1aa;line-height:1.6;">
            Tu cuenta está lista. Empieza a fotografiar tus comidas y deja que nuestra IA analice cada detalle nutricional.
          </p>
          <div style="background:#1a1a1a;border-radius:12px;padding:20px;margin:24px 0;">
            <p style="color:#fff;margin:0 0 8px;font-weight:600;">Lo que puedes hacer:</p>
            <p style="color:#a1a1aa;margin:0;">📸 Fotografía alimentos → resultado en &lt;5 segundos</p>
            <p style="color:#a1a1aa;margin:4px 0 0;">📊 Dashboard de macros en tiempo real</p>
            <p style="color:#a1a1aa;margin:4px 0 0;">🎯 Objetivos personalizados con tu TDEE</p>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  private buildSubscriptionTemplate(name: string, plan: string): string {
    return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#000;font-family:-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#111;border-radius:16px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:40px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:36px;">⭐</h1>
          <h2 style="color:#fff;margin:8px 0 0;">¡Eres Premium!</h2>
          <p style="color:rgba(255,255,255,0.9);margin:4px 0 0;">Plan ${plan}</p>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="color:#a1a1aa;line-height:1.6;">
            Hola ${name}, tu suscripción Premium está activa. Ahora tienes acceso ilimitado a todas las funciones de MacroVision AI.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }
}
