// 邮件发送服务 — 支持 Resend API 和 SMTP 两种方式
const { Resend } = require('resend');
const nodemailer = require('nodemailer');
const configService = require('./configService');

let _resendClient = null;
let _cachedApiKey = null;

async function _getResendClient() {
  const apiKey = (await configService.get('resend_api_key')) || process.env.RESEND_API_KEY || '';
  if (!apiKey) return null;
  if (_resendClient && _cachedApiKey === apiKey) return _resendClient;
  _cachedApiKey = apiKey;
  _resendClient = new Resend(apiKey);
  return _resendClient;
}

let _smtpTransporter = null;
let _smtpConfigHash = '';

async function _getSmtpTransporter() {
  const host = await configService.get('smtp_host');
  if (!host) return null;

  const port = parseInt(await configService.get('smtp_port') || '587', 10);
  const secure = (await configService.get('smtp_secure')) === 'true';
  const user = await configService.get('smtp_user');
  const pass = await configService.get('smtp_pass');
  const authLogin = (await configService.get('smtp_auth_login')) === 'true';

  if (!user || !pass) return null;

  const hash = `${host}:${port}:${secure}:${user}:${pass}:${authLogin}`;
  if (_smtpTransporter && _smtpConfigHash === hash) return _smtpTransporter;

  const auth = authLogin
    ? { user, pass, method: 'LOGIN' }
    : { user, pass };

  _smtpTransporter = nodemailer.createTransport({ host, port, secure, auth });
  _smtpConfigHash = hash;
  return _smtpTransporter;
}

/**
 * 发送邮件（根据 email_provider 配置自动选择 Resend 或 SMTP）
 */
async function sendEmail(to, subject, html) {
  const provider = (await configService.get('email_provider')) || 'resend';

  if (provider === 'smtp') {
    return _sendViaSmtp(to, subject, html);
  }
  return _sendViaResend(to, subject, html);
}

async function _sendViaResend(to, subject, html) {
  const client = await _getResendClient();
  if (!client) {
    return { success: false, error: 'Resend API Key 未配置' };
  }

  const fromName = (await configService.get('email_from_name')) || 'AI Novel Studio';
  const fromEmail = (await configService.get('email_from')) || 'noreply@your-domain.com';

  try {
    const result = await client.emails.send({ from: `${fromName} <${fromEmail}>`, to, subject, html });
    return { success: true, messageId: result.id };
  } catch (err) {
    const errMsg = err?.response?.body?.message || err?.message || '邮件发送失败';
    console.error('[EmailService/Resend] 发送失败:', errMsg);
    return { success: false, error: errMsg };
  }
}

async function _sendViaSmtp(to, subject, html) {
  const transporter = await _getSmtpTransporter();
  if (!transporter) {
    return { success: false, error: 'SMTP 配置不完整，请检查主机、用户名和密码' };
  }

  const fromRaw = (await configService.get('smtp_from')) || '';
  const fromName = (await configService.get('email_from_name')) || 'AI Novel Studio';
  let from = fromRaw;
  if (fromRaw && !fromRaw.includes('<')) {
    from = `${fromName} <${fromRaw}>`;
  }

  try {
    const info = await transporter.sendMail({ from, to, subject, html });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    const errMsg = err?.message || 'SMTP 发送失败';
    console.error('[EmailService/SMTP] 发送失败:', errMsg);
    return { success: false, error: errMsg };
  }
}

/**
 * 发送邮箱验证码邮件
 */
async function sendVerificationCode(to, code, purpose) {
  const siteName = (await configService.get('site_name')) || 'AI Novel Studio';
  const expiresMinutes = 10;

  const html = `
<div style="max-width:480px;margin:0 auto;padding:32px;font-family:'Noto Sans SC',system-ui,sans-serif;background:#1e293b;border-radius:16px;border:1px solid rgba(99,102,241,0.2);">
  <div style="text-align:center;margin-bottom:24px;">
    <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;background:linear-gradient(135deg,rgba(99,102,241,0.2) 0%,rgba(139,92,246,0.2) 100%);border-radius:16px;margin-bottom:12px;">
      <span style="font-size:28px;background:linear-gradient(135deg,#818cf8 0%,#a78bfa 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">✦</span>
    </div>
    <h2 style="color:#f1f5f9;margin:0 0 4px;font-size:20px;">${siteName}</h2>
    <p style="color:#94a3b8;font-size:14px;margin:0;">${purpose}</p>
  </div>
  <div style="background:#0f172a;border-radius:12px;padding:24px;text-align:center;margin-bottom:20px;border:1px solid rgba(99,102,241,0.1);">
    <p style="color:#64748b;font-size:13px;margin:0 0 12px;">验证码 ${expiresMinutes} 分钟内有效，请勿泄露给他人</p>
    <div style="font-size:36px;font-weight:700;letter-spacing:8px;color:#e2e8f0;background:rgba(99,102,241,0.08);border-radius:8px;padding:12px 24px;display:inline-block;font-family:monospace;">
      ${code}
    </div>
  </div>
  <p style="color:#475569;font-size:12px;text-align:center;margin:0;">
    如果这不是你的操作，请忽略此邮件。<br/>此邮件由系统自动发送，请勿回复。
  </p>
</div>`;

  return sendEmail(to, `${siteName} - ${purpose}验证码`, html);
}

module.exports = { sendEmail, sendVerificationCode };
