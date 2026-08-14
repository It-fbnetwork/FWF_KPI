import "server-only";

import dns from "node:dns";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

type SmtpTransportOptionsWithSocketFamily = SMTPTransport.Options & {
  family?: number;
};

dns.setDefaultResultOrder("ipv4first");

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
}

function getFirstEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value) {
      return value;
    }
  }

  return undefined;
}

function getSmtpConfig() {
  return {
    host: getFirstEnv("SMTP_HOST", "EMAIL_HOST") ?? getRequiredEnv("SMTP_HOST"),
    port: Number(getFirstEnv("SMTP_PORT", "EMAIL_PORT") ?? "587"),
    secure: process.env.SMTP_SECURE === "true",
    family: Number(process.env.SMTP_FAMILY ?? "4"),
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS ?? "15000"),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS ?? "15000"),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS ?? "30000"),
    user: getFirstEnv("SMTP_USER", "EMAIL_USER") ?? getRequiredEnv("SMTP_USER"),
    pass: getFirstEnv("SMTP_PASS", "EMAIL_PASSWORD") ?? getRequiredEnv("SMTP_PASS"),
    from:
      getFirstEnv("SMTP_FROM", "EMAIL_FROM") ??
      getFirstEnv("SMTP_USER", "EMAIL_USER") ??
      getRequiredEnv("SMTP_USER")
  };
}

export function isOtpEmailConfigured() {
  return Boolean(
    getFirstEnv("SMTP_HOST", "EMAIL_HOST") &&
      getFirstEnv("SMTP_USER", "EMAIL_USER") &&
      getFirstEnv("SMTP_PASS", "EMAIL_PASSWORD")
  );
}

export async function sendOtpEmail({
  email,
  name,
  otp
}: {
  email: string;
  name: string;
  otp: string;
}) {
  const smtp = getSmtpConfig();
  const transportOptions: SmtpTransportOptionsWithSocketFamily = {
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    family: smtp.family,
    connectionTimeout: smtp.connectionTimeout,
    greetingTimeout: smtp.greetingTimeout,
    socketTimeout: smtp.socketTimeout,
    auth: {
      user: smtp.user,
      pass: smtp.pass
    }
  };
  const transporter = nodemailer.createTransport(transportOptions);

  await transporter.sendMail({
    from: smtp.from,
    to: email,
    subject: "Mã OTP xác minh tài khoản Face Wash Fox",
    text: `Xin chào ${name}, mã OTP của bạn là ${otp}. Mã có hiệu lực trong 5 phút.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
        <h2 style="margin-bottom: 12px;">Xác minh tài khoản Face Wash Fox</h2>
        <p>Xin chào ${name},</p>
        <p>Mã OTP để xác minh tài khoản của bạn là:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px; margin: 16px 0;">${otp}</p>
        <p>Mã có hiệu lực trong 5 phút.</p>
        <p>Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email.</p>
      </div>
    `
  });
}

async function sendTransactionalEmail({
  to,
  subject,
  text,
  html
}: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const smtp = getSmtpConfig();
  const transportOptions: SmtpTransportOptionsWithSocketFamily = {
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    family: smtp.family,
    connectionTimeout: smtp.connectionTimeout,
    greetingTimeout: smtp.greetingTimeout,
    socketTimeout: smtp.socketTimeout,
    auth: {
      user: smtp.user,
      pass: smtp.pass
    }
  };
  const transporter = nodemailer.createTransport(transportOptions);

  await transporter.sendMail({
    from: smtp.from,
    to,
    subject,
    text,
    html
  });
}

export async function sendRoleApprovalRequestEmail({
  to,
  requesterName,
  requesterEmail,
  role,
  department
}: {
  to: string;
  requesterName: string;
  requesterEmail: string;
  role: string;
  department: string;
}) {
  await sendTransactionalEmail({
    to,
    subject: "Yêu cầu duyệt quyền Admin/CEO mới",
    text: `Có yêu cầu đăng ký quyền ${role} mới từ ${requesterName} (${requesterEmail}) thuộc phòng ban ${department}. Vui lòng đăng nhập hệ thống để duyệt.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
        <h2 style="margin-bottom: 12px;">Yêu cầu duyệt quyền Admin/CEO mới</h2>
        <p>Có một tài khoản vừa hoàn tất OTP và đang chờ bạn duyệt:</p>
        <ul>
          <li><strong>Họ tên:</strong> ${requesterName}</li>
          <li><strong>Email:</strong> ${requesterEmail}</li>
          <li><strong>Role:</strong> ${role}</li>
          <li><strong>Phòng ban:</strong> ${department}</li>
        </ul>
        <p>Vui lòng đăng nhập hệ thống Face Wash Fox để xác nhận.</p>
      </div>
    `
  });
}

export async function sendRoleApprovalGrantedEmail({
  to,
  name,
  role
}: {
  to: string;
  name: string;
  role: string;
}) {
  await sendTransactionalEmail({
    to,
    subject: "Tài khoản Face Wash Fox đã được duyệt",
    text: `Xin chào ${name}, tài khoản với quyền ${role} của bạn đã được duyệt. Bạn có thể đăng nhập và sử dụng hệ thống ngay bây giờ.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
        <h2 style="margin-bottom: 12px;">Tài khoản đã được duyệt</h2>
        <p>Xin chào ${name},</p>
        <p>Tài khoản với quyền <strong>${role}</strong> của bạn đã được admin xác nhận.</p>
        <p>Bạn có thể đăng nhập và sử dụng hệ thống Face Wash Fox ngay bây giờ.</p>
      </div>
    `
  });
}

export async function sendRoleApprovalRejectedEmail({
  to,
  name,
  role
}: {
  to: string;
  name: string;
  role: string;
}) {
  await sendTransactionalEmail({
    to,
    subject: "Yêu cầu quyền Face Wash Fox chưa được duyệt",
    text: `Xin chào ${name}, yêu cầu cấp quyền ${role} của bạn chưa được admin gốc phê duyệt. Nếu cần, hãy liên hệ quản trị hệ thống để biết thêm chi tiết.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
        <h2 style="margin-bottom: 12px;">Yêu cầu chưa được duyệt</h2>
        <p>Xin chào ${name},</p>
        <p>Yêu cầu cấp quyền <strong>${role}</strong> của bạn hiện chưa được admin gốc phê duyệt.</p>
        <p>Nếu cần, hãy liên hệ quản trị hệ thống để được hỗ trợ thêm.</p>
      </div>
    `
  });
}

export async function sendLearningAnnouncementEmail({
  to,
  recipientName,
  actorName,
  title,
  kind
}: {
  to: string;
  recipientName: string;
  actorName: string;
  title: string;
  kind: "document" | "quiz";
}) {
  const kindLabel = kind === "quiz" ? "bài kiểm tra" : "tài liệu";
  await sendTransactionalEmail({
    to,
    subject: `FWF KPI - ${kindLabel} mới cho phòng ban Cửa hàng`,
    text: `Xin chào ${recipientName}, ${actorName} vừa tạo ${kindLabel} mới: ${title}. Vui lòng đăng nhập ứng dụng để xem chi tiết.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
        <h2 style="margin-bottom: 12px;">${kindLabel === "bài kiểm tra" ? "Bài kiểm tra mới" : "Tài liệu mới"}</h2>
        <p>Xin chào ${recipientName},</p>
        <p><strong>${actorName}</strong> vừa tạo ${kindLabel} mới cho phòng ban Cửa hàng:</p>
        <p style="font-weight: 700; margin: 14px 0;">${title}</p>
        <p>Vui lòng đăng nhập ứng dụng để xem và thực hiện.</p>
      </div>
    `
  });
}
