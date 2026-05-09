package com.ai.chatbot_backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;

@Service
public class EmailService {

    private static final Logger logger = LoggerFactory.getLogger(EmailService.class);

    @Value("${brevo.api.key}")
    private String apiKey;

    @Value("${brevo.api.url}")
    private String apiUrl;

    @Value("${brevo.sender.email}")
    private String senderEmail;

    @Value("${brevo.sender.name}")
    private String senderName;

    @Value("${otp.expiration.minutes:10}")
    private int otpExpirationMinutes;

    private final HttpClient httpClient = HttpClient.newHttpClient();
    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * Method 1: Send OTP email (called by OTPService)
     */
    public void sendOTPEmail(String toEmail, String otp) {
        sendEmail(toEmail, "Your OTP Verification Code", buildOtpHtmlContent(otp));
    }

    /**
     * Method 2: Send password reset OTP (called by OTPService)
     */
    public void sendPasswordResetOTP(String toEmail, String otp) {
        sendEmail(toEmail, "Password Reset OTP", buildPasswordResetHtmlContent(otp));
    }

    /**
     * Method 3: Alternative method name (alias for sendOTPEmail)
     */
    public void sendOtpEmail(String toEmail, String otp) {
        sendOTPEmail(toEmail, otp);
    }

    /**
     * Method 4: Send welcome email
     */
    public void sendWelcomeEmail(String toEmail, String userName) {
        sendEmail(toEmail, "Welcome to ChatBot!", buildWelcomeHtmlContent(userName));
    }

    /**
     * Generic email sending method using Brevo REST API
     */
    private void sendEmail(String toEmail, String subject, String htmlContent) {
        try {
            logger.info("Sending email to: {} with subject: {}", toEmail, subject);

            Map<String, Object> body = Map.of(
                    "sender", Map.of("name", senderName, "email", senderEmail),
                    "to", List.of(Map.of("email", toEmail)),
                    "subject", subject,
                    "htmlContent", htmlContent
            );

            String requestBody = objectMapper.writeValueAsString(body);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(apiUrl))
                    .header("Content-Type", "application/json")
                    .header("api-key", apiKey)
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 201) {
                logger.info("Email sent successfully to: {}", toEmail);
            } else {
                logger.error("Failed to send email to {}. Status: {}, Body: {}", toEmail, response.statusCode(), response.body());
                throw new RuntimeException("Failed to send email. Brevo responded with status: " + response.statusCode());
            }

        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            logger.error("Unexpected error sending email to {}: {}", toEmail, e.getMessage(), e);
            throw new RuntimeException("Unexpected error sending email", e);
        }
    }

    /**
     * Build HTML content for OTP email
     */
    private String buildOtpHtmlContent(String otp) {
        return String.format("""
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 5px; }
                    .otp-code { font-size: 36px; font-weight: bold; color: #4CAF50; text-align: center;
                                padding: 20px; letter-spacing: 5px; background-color: #f4f4f4;
                                border-radius: 5px; margin: 20px 0; font-family: monospace; }
                    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h2>ChatBot Verification</h2>
                    </div>
                    <p>Hello,</p>
                    <p>Your OTP verification code is:</p>
                    <div class="otp-code">%s</div>
                    <p>This code will expire in <strong>%d minutes</strong>.</p>
                    <p>If you didn't request this code, please ignore this email.</p>
                    <div class="footer">
                        <p>This is an automated message, please do not reply.</p>
                        <p>&copy; 2026 Nexus AI. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
            """, otp, otpExpirationMinutes);
    }

    /**
     * Build HTML content for password reset email
     */
    private String buildPasswordResetHtmlContent(String otp) {
        return String.format("""
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background-color: #ff6b6b; color: white; padding: 20px; text-align: center; border-radius: 5px; }
                    .otp-code { font-size: 36px; font-weight: bold; color: #ff6b6b; text-align: center;
                                padding: 20px; letter-spacing: 5px; background-color: #f4f4f4;
                                border-radius: 5px; margin: 20px 0; font-family: monospace; }
                    .warning { color: #ff6b6b; font-size: 12px; }
                    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h2>Password Reset Request</h2>
                    </div>
                    <p>Hello,</p>
                    <p>We received a request to reset your password. Your OTP verification code is:</p>
                    <div class="otp-code">%s</div>
                    <p>This code will expire in <strong>%d minutes</strong>.</p>
                    <p class="warning">If you didn't request this password reset, please ignore this email and your password will remain unchanged.</p>
                    <div class="footer">
                        <p>This is an automated message, please do not reply.</p>
                        <p>&copy; 2025 ChatBot. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
            """, otp, otpExpirationMinutes);
    }

    /**
     * Build HTML content for welcome email
     */
    private String buildWelcomeHtmlContent(String userName) {
        return String.format("""
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 5px; }
                    .content { padding: 20px; }
                    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h2>Welcome to Nexus AI!</h2>
                    </div>
                    <div class="content">
                        <p>Dear %s,</p>
                        <p>Thank you for registering with ChatBot! We're excited to have you on board.</p>
                        <p>You can now start using our AI-powered chatbot to get instant answers to your questions.</p>
                        <p>If you have any questions, feel free to reach out to our support team.</p>
                    </div>
                    <div class="footer">
                        <p>Best regards,<br>The Nexus AI Team</p>
                        <p>&copy; 2026 Nexus AI ChatBot. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
            """, userName);
    }
}