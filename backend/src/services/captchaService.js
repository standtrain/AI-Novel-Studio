// 图形验证码服务
// 使用 svg-captcha 生成数学算式 SVG 验证码，答案存储在服务端内存中
const svgCaptcha = require('svg-captcha');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// 加载与 UI 字体系统一致的字体，避免验证码数字风格与页面其他文字差异过大
(function loadCaptchaFont() {
  const fontPaths = [
    path.join(__dirname, '../../assets/fonts/consola.ttf'),  // 项目内置
    process.env.CAPTCHA_FONT_PATH,                             // 环境变量自定义
  ];
  for (const fp of fontPaths) {
    if (fp && fs.existsSync(fp)) {
      try {
        svgCaptcha.loadFont(fp);
        console.log('[captcha] 已加载字体:', path.basename(fp));
        return;
      } catch { /* 尝试下一个 */ }
    }
  }
  console.log('[captcha] 使用默认字体（建议放置 consola.ttf 到 backend/assets/fonts/ 以保持 UI 字体一致）');
})();

const store = new Map();            // captchaId -> { answer, createdAt }
const TTL = 5 * 60 * 1000;         // 5分钟过期

// 定期清理过期验证码
setInterval(() => {
  const now = Date.now();
  for (const [id, data] of store) {
    if (now - data.createdAt > TTL) store.delete(id);
  }
}, 60 * 1000);

const captchaService = {
  // 生成数学算式验证码
  generate() {
    const captcha = svgCaptcha.createMathExpr({
      mathMin: 1,
      mathMax: 20,
      mathOperator: '+',
      noise: 2,
      color: true,
      background: '#f0f2f5',
    });
    const captchaId = crypto.randomBytes(16).toString('hex');
    store.set(captchaId, {
      answer: captcha.text,        // 数学算式的结果，如 "15"
      createdAt: Date.now(),
    });
    return { captchaId, svg: captcha.data };
  },

  // 校验验证码（一次性消费，校验后删除）
  validate(captchaId, code) {
    if (!captchaId || code === undefined || code === null) return false;
    const data = store.get(captchaId);
    if (!data) return false;
    store.delete(captchaId);       // 一次性消费，防止重放
    if (Date.now() - data.createdAt > TTL) return false;
    return String(data.answer) === String(code).trim();
  },
};

module.exports = captchaService;
