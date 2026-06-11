// 邮件发送服务：支持 Resend API 和 SMTP 两种方式。
const crypto = require('crypto');
const https = require('https');
const nodemailer = require('nodemailer');
const configService = require('./configService');
const { createLogger } = require('../utils/logger');

const logger = createLogger('email-service');
const DEFAULT_SITE_NAME = 'AI Novel Studio';

let _smtpTransporter = null;
let _smtpConfigHash = '';

async function _getSmtpTransporter() {
  const host = await configService.get('smtp_host');
  if (!host) return null;

  const port = parseInt((await configService.get('smtp_port')) || '587', 10);
  const secure = (await configService.get('smtp_secure')) === 'true';
  const user = await configService.get('smtp_user');
  const pass = await configService.get('smtp_pass');
  const authLogin = (await configService.get('smtp_auth_login')) === 'true';

  if (!user || !pass) return null;

  const passHash = crypto.createHash('sha256').update(pass).digest('hex').slice(0, 16);
  const hash = `${host}:${port}:${secure}:${user}:${passHash}:${authLogin}`;
  if (_smtpTransporter && _smtpConfigHash === hash) return _smtpTransporter;

  const auth = authLogin
    ? { user, pass, method: 'LOGIN' }
    : { user, pass };

  const transporter = nodemailer.createTransport({ host, port, secure, auth });
  try {
    await transporter.verify();
  } catch (err) {
    logger.error({ host, port, user }, 'SMTP 连接验证失败');
    return null;
  }
  _smtpTransporter = transporter;
  _smtpConfigHash = hash;
  return _smtpTransporter;
}

async function _getEmailBrand() {
  const siteName = ((await configService.get('site_name')) || DEFAULT_SITE_NAME).trim();
  const siteDescription = ((await configService.get('site_description')) || '').trim();
  const configuredFromName = ((await configService.get('email_from_name')) || '').trim();

  // 旧版本把 email_from_name 默认写死为 AI Novel Studio。
  // 为了避免改站点名后邮件发件人仍显示旧名称，默认值视为“跟随站点名称”。
  const fromName = configuredFromName && configuredFromName !== DEFAULT_SITE_NAME
    ? configuredFromName
    : siteName;

  return { siteName, siteDescription, fromName };
}

function _escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _appendQuery(url, key, value) {
  return `${url}${url.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`;
}

function _buildEmailShell({ siteName, siteDescription, title, children }) {
  const safeSiteName = _escapeHtml(siteName);
  const safeDescription = _escapeHtml(siteDescription);
  const safeTitle = _escapeHtml(title);
  const safeFooter = safeDescription ? `${safeSiteName} · ${safeDescription}` : safeSiteName;

  return `
<div style="max-width:520px;margin:0 auto;padding:40px 32px;font-family:'Noto Sans SC','PingFang SC','Microsoft YaHei',system-ui,sans-serif;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
  <div style="text-align:center;margin-bottom:28px;">
    <div style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);border-radius:12px;margin-bottom:16px;">
      <span style="font-size:22px;color:#ffffff;line-height:1;font-weight:700;">AI</span>
    </div>
    <h2 style="color:#1e293b;margin:0 0 6px;font-size:20px;font-weight:700;">${safeSiteName}</h2>
    <p style="color:#64748b;font-size:14px;margin:0;">${safeTitle}</p>
  </div>

  ${children}

  <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;line-height:1.8;">
    如果这不是您的操作，请忽略此邮件，无需采取任何措施。<br/>此邮件由系统自动发送，请勿回复。
  </p>

  <div style="margin-top:24px;padding-top:20px;border-top:1px solid #f1f5f9;text-align:center;">
    <p style="color:#cbd5e1;font-size:11px;margin:0;">${safeFooter}</p>
  </div>
</div>`;
}

/**
 * 发送邮件，根据 email_provider 配置自动选择 Resend 或 SMTP。
 */
async function sendEmail(to, subject, html) {
  const provider = (await configService.get('email_provider')) || 'resend';

  if (provider === 'smtp') {
    return _sendViaSmtp(to, subject, html);
  }
  return _sendViaResend(to, subject, html);
}

async function _sendViaResend(to, subject, html) {
  const apiKey = (await configService.get('resend_api_key')) || process.env.RESEND_API_KEY || '';
  if (!apiKey) {
    return { success: false, error: 'Resend API Key 未配置' };
  }

  const { fromName } = await _getEmailBrand();
  const fromEmail = ((await configService.get('email_from')) || '').trim();
  if (!fromEmail || fromEmail === 'noreply@your-domain.com') {
    return { success: false, error: '发件人邮箱未配置，请在邮件设置中填写已通过 Resend 验证的发件地址' };
  }

  try {
    const result = await _postResendEmail(apiKey, {
      from: `${fromName} <${fromEmail}>`,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    });
    return { success: true, messageId: result.id || (result.data && result.data.id) || '' };
  } catch (err) {
    const errMsg = err && err.message ? err.message : '邮件发送失败';
    logger.error({ err }, 'Resend 邮件发送失败');
    return { success: false, error: errMsg };
  }
}

function _postResendEmail(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 15000,
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        let parsed = {};
        if (raw) {
          try {
            parsed = JSON.parse(raw);
          } catch (e) {
            parsed = { message: raw };
          }
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parsed);
          return;
        }
        const message = parsed.message || (parsed.error && parsed.error.message) || `Resend API 返回 ${res.statusCode}`;
        reject(new Error(message));
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('Resend API 请求超时'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function _sendViaSmtp(to, subject, html) {
  const transporter = await _getSmtpTransporter();
  if (!transporter) {
    return { success: false, error: 'SMTP 配置不完整，请检查主机、用户名和密码' };
  }

  const fromRaw = (await configService.get('smtp_from')) || '';
  const { fromName } = await _getEmailBrand();
  let from = fromRaw;
  if (fromRaw && !fromRaw.includes('<')) {
    from = `${fromName} <${fromRaw}>`;
  }

  try {
    const info = await transporter.sendMail({ from, to, subject, html });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    const errMsg = err?.message || 'SMTP 发送失败';
    logger.error({ err }, 'SMTP 邮件发送失败');
    return { success: false, error: errMsg };
  }
}

// ===== 发送频率控制 =====
const COOLDOWN_SECONDS = 60;
const _sendCooldown = new Map(); // key: "email:type" -> timestamp(ms)
const _dailySendCount = new Map(); // key: "email:YYYY-MM-DD" -> count

setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of _sendCooldown) {
    if (now - ts > COOLDOWN_SECONDS * 1000) _sendCooldown.delete(key);
  }
  const today = new Date().toISOString().slice(0, 10);
  for (const [key] of _dailySendCount) {
    const datePart = key.split(':').pop();
    if (datePart !== today) _dailySendCount.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * 检查发送频率限制，超出则抛出异常。
 * @param {string} email
 * @param {string} type - register / reset_password / change_email
 */
async function checkSendLimit(email, type) {
  const emailLower = email.toLowerCase();

  const cooldownKey = `${emailLower}:${type}`;
  const lastSend = _sendCooldown.get(cooldownKey);
  if (lastSend) {
    const elapsed = Math.floor((Date.now() - lastSend) / 1000);
    if (elapsed < COOLDOWN_SECONDS) {
      const remaining = COOLDOWN_SECONDS - elapsed;
      throw { status: 429, message: `发送过于频繁，请 ${remaining} 秒后再试` };
    }
  }

  const dailyLimitRaw = await configService.get('email_daily_limit');
  const dailyLimit = parseInt(dailyLimitRaw || '0', 10);
  if (dailyLimit > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const dailyKey = `${emailLower}:${today}`;
    const count = _dailySendCount.get(dailyKey) || 0;
    if (count >= dailyLimit) {
      throw { status: 429, message: '该邮箱今日发送次数已达上限，请明天再试' };
    }
  }
}

function _recordSend(email) {
  const emailLower = email.toLowerCase();
  const today = new Date().toISOString().slice(0, 10);
  const dailyKey = `${emailLower}:${today}`;
  _dailySendCount.set(dailyKey, (_dailySendCount.get(dailyKey) || 0) + 1);
}

function _recordSendWithType(email, type) {
  const emailLower = email.toLowerCase();
  const cooldownKey = `${emailLower}:${type}`;
  _sendCooldown.set(cooldownKey, Date.now());
  _recordSend(email);
}

/**
 * 发送邮箱验证码邮件。
 */
async function sendVerificationCode(to, code, purpose) {
  const { siteName, siteDescription } = await _getEmailBrand();
  const expiresMinutes = 10;
  const purposeTitleMap = {
    register: '注册账号',
    reset_password: '重置密码',
    change_email: '变更邮箱',
    login: '登录账号',
  };
  const purposeText = purposeTitleMap[purpose] || purpose;
  const safePurposeText = _escapeHtml(purposeText);
  const safeCode = _escapeHtml(code);
  const safeSiteName = _escapeHtml(siteName);

  const children = `
  <div style="background:#f8fafc;border-radius:10px;padding:28px 20px;text-align:center;margin-bottom:24px;border:1px solid #e2e8f0;">
    <p style="color:#475569;font-size:14px;margin:0 0 6px;">您正在${safePurposeText}，请在 ${expiresMinutes} 分钟内输入以下验证码完成验证：</p>
    <div style="font-size:32px;font-weight:700;letter-spacing:10px;color:#1e293b;background:#ffffff;border-radius:8px;padding:14px 24px;display:inline-block;font-family:'SF Mono','Fira Code','Consolas',monospace;border:2px dashed #cbd5e1;margin-top:12px;">
      ${safeCode}
    </div>
  </div>

  <div style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:6px;padding:12px 16px;margin-bottom:20px;">
    <p style="color:#92400e;font-size:13px;margin:0;line-height:1.6;">
      <strong>安全提示：</strong>请勿向任何人透露此验证码，包括自称平台客服的人员。${safeSiteName} 工作人员不会以任何理由索要您的验证码。
    </p>
  </div>`;

  const html = _buildEmailShell({
    siteName,
    siteDescription,
    title: `${purposeText}验证码`,
    children,
  });

  return sendEmail(to, `[${siteName}] ${purposeText}验证码`, html);
}

/**
 * 发送通知邮件，批量发送时使用，不做频率限制。
 */
async function sendNotification(to, username, title, content) {
  const { siteName, siteDescription } = await _getEmailBrand();
  const greeting = username ? `${_escapeHtml(username)}，您好：` : '您好：';
  const safeTitle = _escapeHtml(title);
  const safeContent = _escapeHtml(content).replace(/\r?\n/g, '<br/>');

  const children = `
  <h3 style="color:#1e293b;margin:0 0 16px;font-size:17px;">${safeTitle}</h3>
  <p style="color:#475569;font-size:14px;line-height:1.8;margin:0 0 12px;">${greeting}</p>
  <div style="color:#475569;font-size:14px;line-height:1.8;margin-bottom:24px;">${safeContent}</div>`;

  const html = _buildEmailShell({
    siteName,
    siteDescription,
    title,
    children,
  });

  return sendEmail(to, `[${siteName}] ${title}`, html);
}

module.exports = {
  sendEmail,
  sendVerificationCode,
  sendNotification,
  checkSendLimit,
  _recordSendWithType,
  // 暴露给轻量脚本验证，业务代码不直接依赖。
  _getEmailBrand,
  _appendQuery,
};
