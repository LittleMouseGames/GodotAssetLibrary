import nodemailer from 'nodemailer'

export const sendMessage = async function (message: string, email: string, subject: string, from: string): Promise<void> {
  const host = process.env.SMTP_HOST ?? ''
  const port = Number(process.env.SMTP_PORT) ?? 0
  const user = process.env.SMTP_USER ?? ''
  const pass = process.env.SMTP_PASS ?? ''

  if (host !== '' && port !== 0 && user !== '' && pass !== '') {
    const transporter = nodemailer.createTransport({
      host: host,
      port: port,
      secure: true,
      auth: {
        user: user,
        pass: pass
      }
    })

    await transporter.sendMail({
      from: from,
      to: email,
      subject: subject,
      text: message
    })
  } else {
    throw new Error('Missing mailer info')
  }
}
