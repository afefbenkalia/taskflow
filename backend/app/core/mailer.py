"""Outgoing email (plain text, SMTP).

When SMTP_HOST is empty (local development), the message is written to the
application log instead of being sent, so links in it can still be used.
"""

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger("taskflow.mail")


def send_email(to: str, subject: str, body: str) -> None:
    if not settings.SMTP_HOST:
        logger.warning("SMTP_HOST is not set; email not sent.\nTo: %s\nSubject: %s\n\n%s", to, subject, body)
        return

    message = EmailMessage()
    message["From"] = settings.SMTP_FROM
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
        if settings.SMTP_STARTTLS:
            smtp.starttls()
        if settings.SMTP_USER:
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        smtp.send_message(message)
