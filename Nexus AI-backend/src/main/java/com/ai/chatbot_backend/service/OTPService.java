package com.ai.chatbot_backend.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class OTPService {

    private static final Logger logger = LoggerFactory.getLogger(OTPService.class);
    private static final SecureRandom random = new SecureRandom();

    @Value("${otp.length:6}")
    private int otpLength;

    @Value("${otp.expiration.minutes:10}")
    private int expirationMinutes;

    @Autowired
    private EmailService emailService;

    private final Map<String, OTPData> otpCache = new ConcurrentHashMap<>();

    /**
     * Generate and send OTP for verification
     */
    public String generateAndSendOtp(String email) {
        String otp = generateOtp();

        OTPData otpData = new OTPData(otp, LocalDateTime.now().plusMinutes(expirationMinutes));
        otpCache.put(email, otpData);

        try {
            emailService.sendOTPEmail(email, otp);
            logger.info("OTP sent successfully to: {}", email);
            return otp;
        } catch (Exception e) {
            logger.error("Failed to send OTP to {}: {}", email, e.getMessage());
            otpCache.remove(email);
            throw new RuntimeException("Failed to send OTP. Please try again.", e);
        }
    }

    /**
     * Generate and send OTP for password reset
     */
    public String generateAndSendPasswordResetOtp(String email) {
        String otp = generateOtp();

        OTPData otpData = new OTPData(otp, LocalDateTime.now().plusMinutes(expirationMinutes));
        otpCache.put("password_reset_" + email, otpData);

        try {
            emailService.sendPasswordResetOTP(email, otp);
            logger.info("Password reset OTP sent successfully to: {}", email);
            return otp;
        } catch (Exception e) {
            logger.error("Failed to send password reset OTP to {}: {}", email, e.getMessage());
            otpCache.remove("password_reset_" + email);
            throw new RuntimeException("Failed to send password reset OTP. Please try again.", e);
        }
    }

    /**
     * Validate OTP
     */
    public boolean validateOtp(String email, String otp) {
        return validateOtpWithKey(email, otp, email);
    }

    /**
     * Validate password reset OTP
     */
    public boolean validatePasswordResetOtp(String email, String otp) {
        return validateOtpWithKey("password_reset_" + email, otp, email);
    }

    /**
     * Generic OTP validation
     */
    private boolean validateOtpWithKey(String key, String otp, String email) {
        OTPData otpData = otpCache.get(key);

        if (otpData == null) {
            logger.warn("OTP validation failed for {}: No OTP found", email);
            return false;
        }

        if (otpData.expiryTime.isBefore(LocalDateTime.now())) {
            logger.warn("OTP validation failed for {}: OTP expired", email);
            otpCache.remove(key);
            return false;
        }

        boolean isValid = otpData.otp.equals(otp);
        if (isValid) {
            otpCache.remove(key);
            logger.info("OTP validated successfully for: {}", email);
        } else {
            logger.warn("OTP validation failed for {}: Invalid OTP", email);
        }

        return isValid;
    }

    /**
     * Resend OTP
     */
    public void resendOtp(String email) {
        otpCache.remove(email);
        String newOtp = generateAndSendOtp(email);
        logger.info("OTP resent to {}: {}", email, newOtp);
    }

    /**
     * Resend password reset OTP
     */
    public void resendPasswordResetOtp(String email) {
        otpCache.remove("password_reset_" + email);
        String newOtp = generateAndSendPasswordResetOtp(email);
        logger.info("Password reset OTP resent to {}: {}", email, newOtp);
    }

    /**
     * Generate random OTP
     */
    private String generateOtp() {
        StringBuilder otp = new StringBuilder();
        for (int i = 0; i < otpLength; i++) {
            otp.append(random.nextInt(10));
        }
        return otp.toString();
    }

    /**
     * Inner class for OTP data
     */
    private static class OTPData {
        private final String otp;
        private final LocalDateTime expiryTime;

        public OTPData(String otp, LocalDateTime expiryTime) {
            this.otp = otp;
            this.expiryTime = expiryTime;
        }
    }
}