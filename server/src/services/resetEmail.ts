
import nodemailer from "nodemailer";

export const sendResetEmail = async (
  email: string,
  resetUrl: string
): Promise<void> => {
  // LOCAL DEVELOPMENT ONLY
  if (process.env.NODE_ENV !== "production") {
    console.log("\n=== DEVELOPMENT PASSWORD RESET ===");
    console.log("Reset link:", resetUrl);
    console.log("==================================\n");
    return;
  }

  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM,
  } = process.env;

  if (
    !SMTP_HOST ||
    !SMTP_USER ||
    !SMTP_PASS ||
    !SMTP_FROM
  ) {
    throw new Error("SMTP email service is not configured");
  }

  const port = Number(SMTP_PORT || 587);

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: SMTP_FROM,
    to: email,
    subject: "Reset your e-commerce password",
    text: `Use this link to reset your password:\n\n${resetUrl}\n\nThis link expires in 15 minutes. If you did not request this, ignore this email.`,
  });
};