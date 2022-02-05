import nodemailer from 'nodemailer';

export const sendMessage = async function (message: string, email: string, subject: string, from: string) {
    let host = process.env.SMTP_HOST ?? ''
    let port = Number(process.env.SMTP_PORT) ?? 0
    let user = process.env.SMTP_USER ?? ''
    let pass = process.env.SMTP_PASS ?? ''

    if (host !== '' && port !== 0 && user !== '' && pass !== '') {
        let transporter = nodemailer.createTransport({
            host: host,
            port: port,
            secure: true,
            auth: {
                user: user,
                pass: pass,
            },
        });

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
