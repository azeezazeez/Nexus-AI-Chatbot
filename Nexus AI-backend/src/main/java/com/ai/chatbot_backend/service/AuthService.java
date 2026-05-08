package com.ai.chatbot_backend.service;

import com.ai.chatbot_backend.dto.*;
import com.ai.chatbot_backend.repository.UserRepository;
import com.ai.chatbot_backend.repository.OTPRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuthService {

    private final UserRepository userRepository;
    private final OTPRepository otpRepository;
    private final EmailService emailService;
    private final KafkaProducerService kafkaProducerService;

    private static final SecureRandom random = new SecureRandom();
    private static final int OTP_EXPIRY_MINUTES = 10;

    private String generateOTP() {
        return String.format("%06d", random.nextInt(1000000));
    }

    private OTP saveOTP(String email) {
        otpRepository.deleteByEmail(email);
        String otpCode = generateOTP();
        OTP otp = OTP.builder()
                .email(email)
                .otpCode(otpCode)
                .expiryTime(LocalDateTime.now().plusMinutes(OTP_EXPIRY_MINUTES))
                .verified(false)
                .build();
        return otpRepository.save(otp);
    }

    @Transactional
    public ResponseEntity<ApiResponse> verifyOTP(VerifyOTPRequest request) {
        try {
            log.info("Verifying OTP for email: {}", request.getEmail());

            Optional<OTP> otpOptional = otpRepository.findByEmailAndOtpCodeAndVerifiedFalse(
                    request.getEmail(),
                    request.getOtpCode());

            if (otpOptional.isEmpty()) {
                log.warn("Invalid OTP attempt for email: {}", request.getEmail());
                return ResponseEntity.badRequest()
                        .body(new ApiResponse(false, "Invalid OTP", null));
            }

            OTP otp = otpOptional.get();
            if (otp.getExpiryTime().isBefore(LocalDateTime.now())) {
                log.warn("Expired OTP attempt for email: {}", request.getEmail());
                return ResponseEntity.badRequest()
                        .body(new ApiResponse(false, "OTP has expired", null));
            }

            otp.setVerified(true);
            otpRepository.save(otp);

            Optional<User> userOptional = userRepository.findByEmail(request.getEmail());
            userOptional.ifPresent(user -> {
                // user.setVerified(true); // Uncomment if you have verified field in User entity
                userRepository.save(user);
                log.info("User verified successfully: {}", request.getEmail());
            });

            // Send Kafka event
            kafkaProducerService.sendUserEvent("USER_VERIFIED", request.getEmail());

            return ResponseEntity.ok(new ApiResponse(true, "Email verified successfully", null));

        } catch (Exception e) {
            log.error("OTP verification error: {}", e.getMessage(), e);
            return ResponseEntity.badRequest()
                    .body(new ApiResponse(false, "Verification failed: " + e.getMessage(), null));
        }
    }

    public ResponseEntity<ApiResponse> resendOTP(ResendOTPRequest request) {
        try {
            log.info("Resending OTP for email: {}", request.getEmail());

            Optional<User> userOptional = userRepository.findByEmail(request.getEmail());

            if (userOptional.isEmpty()) {
                log.warn("Email not found for resend OTP: {}", request.getEmail());
                return ResponseEntity.badRequest()
                        .body(new ApiResponse(false, "Email not found", null));
            }

            OTP otp = saveOTP(request.getEmail());
            emailService.sendOTPEmail(request.getEmail(), otp.getOtpCode());

            // Send Kafka event
            kafkaProducerService.sendUserEvent("OTP_RESENT", request.getEmail());

            return ResponseEntity.ok(new ApiResponse(true, "New OTP sent to your email", null));

        } catch (Exception e) {
            log.error("Resend OTP error: {}", e.getMessage(), e);
            return ResponseEntity.badRequest()
                    .body(new ApiResponse(false, "Failed to resend OTP: " + e.getMessage(), null));
        }
    }

    public ResponseEntity<ApiResponse> forgotPassword(ForgotPasswordRequest request) {
        try {
            log.info("Processing forgot password for email: {}", request.getEmail());

            Optional<User> userOptional = userRepository.findByEmail(request.getEmail());

            if (userOptional.isEmpty()) {
                log.warn("Email not found for forgot password: {}", request.getEmail());
                return ResponseEntity.badRequest()
                        .body(new ApiResponse(false, "Email not found", null));
            }

            OTP otp = saveOTP(request.getEmail());
            emailService.sendPasswordResetOTP(request.getEmail(), otp.getOtpCode());

            // Send Kafka event
            kafkaProducerService.sendUserEvent("PASSWORD_RESET_REQUESTED", request.getEmail());

            return ResponseEntity.ok(new ApiResponse(true, "Password reset OTP sent to your email", null));

        } catch (Exception e) {
            log.error("Forgot password error: {}", e.getMessage(), e);
            return ResponseEntity.badRequest()
                    .body(new ApiResponse(false, "Failed to process request: " + e.getMessage(), null));
        }
    }

    @Transactional
    public ResponseEntity<ApiResponse> resetPassword(ResetPasswordRequest request) {
        try {
            log.info("Resetting password for email: {}", request.getEmail());

            // Validate OTP
            Optional<OTP> otpOptional = otpRepository.findByEmailAndOtpCodeAndVerifiedFalse(
                    request.getEmail(),
                    request.getOtpCode());

            if (otpOptional.isEmpty()) {
                log.warn("Invalid OTP for password reset: {}", request.getEmail());
                return ResponseEntity.badRequest()
                        .body(new ApiResponse(false, "Invalid OTP", null));
            }

            OTP otp = otpOptional.get();
            if (otp.getExpiryTime().isBefore(LocalDateTime.now())) {
                log.warn("Expired OTP for password reset: {}", request.getEmail());
                return ResponseEntity.badRequest()
                        .body(new ApiResponse(false, "OTP has expired", null));
            }

            // Mark OTP as verified
            otp.setVerified(true);
            otpRepository.save(otp);

            // Update password
            Optional<User> userOptional = userRepository.findByEmail(request.getEmail());
            if (userOptional.isEmpty()) {
                log.warn("User not found for password reset: {}", request.getEmail());
                return ResponseEntity.badRequest()
                        .body(new ApiResponse(false, "User not found", null));
            }

            User user = userOptional.get();
            user.setPassword(request.getNewPassword()); // Store plain password
            userRepository.save(user);

            log.info("Password reset successful for email: {}", request.getEmail());

            // Send Kafka event
            kafkaProducerService.sendUserEvent("PASSWORD_RESET_SUCCESS", request.getEmail());

            return ResponseEntity.ok(new ApiResponse(true, "Password reset successfully", null));

        } catch (Exception e) {
            log.error("Reset password error: {}", e.getMessage(), e);
            return ResponseEntity.badRequest()
                    .body(new ApiResponse(false, "Failed to reset password: " + e.getMessage(), null));
        }
    }
}