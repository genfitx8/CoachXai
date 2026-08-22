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

if (!transporter) {
  console.warn(
    '[mail] SMTP_HOST가 설정되지 않았습니다. 메일은 발송되지 않고 콘솔에만 출력됩니다. ' +
      '운영 환경에서는 SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / MAIL_FROM 을 설정하세요.'
  );
}

/**
 * 실제로 메일을 내보낼 수 있는 상태인지. 비밀번호 찾기는 못 보내도 다른
 * 복구 경로가 있지만, 가입 이메일 인증은 코드가 도착하지 않으면 가입 자체가
 * 막히는 막다른 길이 된다. 그래서 호출부가 미리 확인할 수 있게 열어 둔다.
 */
export function isMailConfigured(): boolean {
  return transporter !== null;
}

export async function sendPasswordResetMail(
  to: string,
  resetUrl: string,
  expiresInMinutes: number
): Promise<void> {
  const subject = `[${SERVICE_NAME}] 비밀번호 재설정 안내`;
  const text = [
    `안녕하세요, ${SERVICE_NAME} 입니다.`,
    '',
    '비밀번호 재설정을 요청하셨다면 아래 링크를 눌러 새 비밀번호를 설정해주세요.',
    resetUrl,
    '',
    `본 링크는 ${expiresInMinutes}분 후 만료됩니다.`,
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

export async function sendSignupVerificationMail(
  to: string,
  code: string,
  expiresInMinutes: number
): Promise<void> {
  const subject = `[${SERVICE_NAME}] 회원가입 이메일 인증번호`;
  const text = [
    `안녕하세요, ${SERVICE_NAME} 입니다.`,
    '',
    '회원가입 이메일 인증번호는 아래와 같습니다.',
    '',
    `    ${code}`,
    '',
    `본 인증번호는 ${expiresInMinutes}분 후 만료됩니다.`,
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
