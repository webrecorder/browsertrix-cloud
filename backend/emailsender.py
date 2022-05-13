""" Basic Email Sending Support"""

import os
import smtplib
import ssl


# pylint: disable=too-few-public-methods
class EmailSender:
    """SMTP Email Sender"""

    def __init__(self):
        self.sender = os.environ.get("EMAIL_SENDER")
        self.password = os.environ.get("EMAIL_PASSWORD", None)
        self.smtp_server = os.environ.get("EMAIL_SMTP_HOST")
        self.smtp_port = os.environ.get("EMAIL_SMTP_PORT", 587)
        self.smtp_starttls = os.environ.get("EMAIL_SMTP_STARTTLS", "true")

        self.default_origin = os.environ.get("APP_ORIGIN")

    def _send_encrypted(self, receiver, message):
        """Send Encrypted SMTP Message"""
        print(message, flush=True)

        if not self.smtp_server:
            print("Email: No SMTP Server, not sending", flush=True)
            return

        context = ssl.create_default_context()
        with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
            server.ehlo()  # Can be omitted
            if self.smtp_starttls.lower() == "true":
                server.starttls(context=context)
            server.ehlo()  # Can be omitted
            if self.password != None:
                server.login(self.sender, self.password)
            server.sendmail(self.sender, receiver, message)

    def get_origin(self, headers):
        """ Return origin of the received request"""
        if not headers:
            return self.default_origin

        scheme = headers.get("X-Forwarded-Proto")
        host = headers.get("Host")
        if not scheme or not host:
            return self.default_origin

        return scheme + "://" + host

    def send_user_validation(self, receiver_email, token, headers=None):
        """Send email to validate registration email address"""

        origin = self.get_origin(headers)

        message = f"""
Please verify your registration for Browsertrix Cloud for {receiver_email}

You can verify by clicking here: {origin}/verify?token={token}

The verification token is: {token}"""

        self._send_encrypted(receiver_email, message)

    # pylint: disable=too-many-arguments
    def send_new_user_invite(
        self, receiver_email, sender, archive_name, token, headers=None
    ):
        """Send email to invite new user"""

        origin = self.get_origin(headers)

        message = f"""
You are invited by {sender} to join their archive, "{archive_name}" on Browsertrix Cloud!

You can join by clicking here: {origin}/join/{token}?email={receiver_email}

The invite token is: {token}"""

        self._send_encrypted(receiver_email, message)

    # pylint: disable=too-many-arguments
    def send_existing_user_invite(
        self, receiver_email, sender, archive_name, token, headers=None
    ):
        """Send email to invite new user"""
        origin = self.get_origin(headers)

        message = f"""
You are invited by {sender} to join their archive, "{archive_name}" on Browsertrix Cloud!

You can join by clicking here: {origin}/invite/accept/{token}?email={receiver_email}

The invite token is: {token}"""

        self._send_encrypted(receiver_email, message)

    def send_user_forgot_password(self, receiver_email, token, headers=None):
        """Send password reset email with token"""
        origin = self.get_origin(headers)

        message = f"""
We received your password reset request. Please click here: {origin}/reset-password?token={token}
to create a new password
        """

        self._send_encrypted(receiver_email, message)
