import nodemailer from 'nodemailer';

const SERVICE_NAME = 'CoachXai';

const smtpHost = process.env.SMTP_HOST;
const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const mailFrom = process.env.MAIL_FROM || `${SERVICE_NAME} <no-reply@coachxai.local>`;

const transporter = smtpHost
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
    })
  : null;

export async function sendPasswordResetMail(to: string, resetUrl: string): Promise<void> {
  const subject = `[${SERVICE_NAME}] 비밀번호 재설정 안내`;
  const text = [
    `안녕하세요, ${SERVICE_NAME} 입니다.`,
    '',
    '비밀번호 재설정을 요청하셨다면 아래 링크를 눌러 새 비밀번호를 설정해주세요.',
    resetUrl,
    '',
    '본 링크는 30분 후 만료됩니다.',
    '본인이 요청하지 않았다면 이 메일을 무시해 주세요.',
  ].join('\n');

  if (!transporter) {
    console.log('[mail] SMTP 미설정으로 메일 발송을 콘솔로 대체합니다.', {
      service: SERVICE_NAME,
      to,
      subject,
      text,
    });
    return;
  }

  await transporter.sendMail({
    from: mailFrom,
    to,
    subject,
    text,
  });
}
