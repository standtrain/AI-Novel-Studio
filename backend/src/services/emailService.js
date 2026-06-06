// 邮件发送服务 — 基于 Resend API
const { Resend } = require('resend');
const configService = require('./configService');

let _resendClient = null;
let _cachedApiKey = null;

async function _getClient() {
  const apiKey = (await configService.get('resend_api_key')) || process.env.RESEND_API_KEY || '';
  if (!apiKey) return null;
  if (_resendClient && _cachedApiKey === apiKey) return _resendClient;
  _cachedApiKey = apiKey;
  _resendClient = new Resend(apiKey);
  return _resendClient;
}

/**
 * 发送邮件
 * @param {string} to - 收件人邮箱
 * @param {string} subject - 邮件主题
 * @param {string} html - HTML 内容
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendEmail(to, subject, html) {
  const client = await _getClient();
  if (!client) {
    return { success: false, error: '邮件服务未配置：缺少 Resend API Key' };
  }

  const fromName = (await configService.get('email_from_name')) || 'AI Novel Studio';
  const fromEmail = (await configService.get('email_from')) || 'noreply@your-domain.com';

  try {
    const result = await client.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to,
      subject,
      html,
    });
    return { success: true, messageId: result.id };
  } catch (err) {
    // Resend 错误通常有 .message 包含详细信息
    const errMsg = err?.response?.body?.message || err?.message || '邮件发送失败';
    console.error('[EmailService] 发送失败:', errMsg);
    return { success: false, error: errMsg };
  }
}

/**
 * 发送邮箱验证码邮件
 * @param {string} to - 收件人邮箱
 * @param {string} code - 6 位数字验证码
 * @param {string} purpose - 用途说明：'注册验证' / '密码重置' / '邮箱变更'
 * @returns {Promise<{success: boolean, error?: string}>}
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
