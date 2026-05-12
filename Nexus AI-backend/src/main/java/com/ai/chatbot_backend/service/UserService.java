package com.ai.chatbot_backend.service;

import com.ai.chatbot_backend.dto.LoginRequest;
import com.ai.chatbot_backend.dto.RegisterRequest;
import com.ai.chatbot_backend.dto.UserResponse;
import com.ai.chatbot_backend.dto.User;
import com.ai.chatbot_backend.exception.AIServiceException;
import com.ai.chatbot_backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserService {
    private final UserRepository userRepository;

    public void markAsVerified(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new AIServiceException("User not found"));
        user.setVerified(true);
        userRepository.save(user);
        log.info("✅ User marked as verified: {}", email);
    }

    // Find by email
    public Optional<User> findByEmail(String email) {
        log.debug("Finding user by email: {}", email);
        return userRepository.findByEmail(email);
    }

    // Find by username
    public Optional<User> findByUsername(String username) {
        log.debug("Finding user by username: {}", username);
        return userRepository.findByUsername(username);
    }

    // Find by email or username (for login)
    public Optional<User> findByEmailOrUsername(String emailOrUsername) {
        log.debug("Finding user by email or username: {}", emailOrUsername);
        return userRepository.findByEmailOrUsername(emailOrUsername);
    }

    // Check if email exists
    public boolean existsByEmail(String email) {
        return userRepository.existsByEmail(email);
    }

    // Check if username exists
    public boolean existsByUsername(String username) {
        return userRepository.existsByUsername(username);
    }

    // Update password
    public void updatePassword(String email, String newPassword) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new AIServiceException("User not found"));
        user.setPassword(newPassword);
        userRepository.save(user);
        log.info("Password updated for user: {}", email);
    }

    // Register new user
    public UserResponse register(RegisterRequest request) {
        log.info("=== REGISTER ATTEMPT ===");
        log.info("Username received: '{}'", request.getUsername());
        log.info("Email received: '{}'", request.getEmail());
        log.info("FullName received: '{}'", request.getFullName());

        try {
            // Validate username is not email format
            if (request.getUsername() == null || request.getUsername().trim().isEmpty()) {
                throw new AIServiceException("Username is required");
            }

            if (request.getUsername().contains("@")) {
                log.warn("Username contains @ symbol - this is invalid. Username should not be email format");
                throw new AIServiceException("Username cannot be an email address. Please choose a different username");
            }

            // Check if username exists
            boolean usernameExists = userRepository.existsByUsername(request.getUsername());
            log.info("Username exists check result: {}", usernameExists);

            if (usernameExists) {
                throw new AIServiceException("Username already exists");
            }

            // Check if email exists
            boolean emailExists = userRepository.existsByEmail(request.getEmail());
            log.info("Email exists check result: {}", emailExists);

            if (emailExists) {
                throw new AIServiceException("Email already exists");
            }

            // Create new user with separate username and email
            User user = User.builder()
                    .username(request.getUsername().trim())
                    .email(request.getEmail().trim().toLowerCase())
                    .password(request.getPassword())
                    .fullName(request.getFullName())
                    .Verified(false)
                    .build();

            user = userRepository.save(user);
            log.info("✅ User saved successfully - ID: {}, Username: {}, Email: {}",
                    user.getId(), user.getUsername(), user.getEmail());

            // Build response
            UserResponse response = new UserResponse();
            response.setId(user.getId());
            response.setUsername(user.getUsername());
            response.setEmail(user.getEmail());
            response.setFullName(user.getFullName());
            response.setCreatedAt(user.getCreatedAt());

            return response;

        } catch (AIServiceException e) {
            throw e;
        } catch (Exception e) {
            log.error("❌ REGISTER FAILED - Error: {}", e.getMessage(), e);
            throw new AIServiceException("Registration failed: " + e.getMessage());
        }
    }

    // Login user
    public User login(LoginRequest request) {
        log.info("=== LOGIN ATTEMPT ===");
        log.info("Login input: '{}'", request.getUsername());

        // Try to find by email first, then by username
        User user = userRepository.findByEmail(request.getUsername()).orElse(null);

        if (user == null) {
            log.info("User not found by email, trying username...");
            user = userRepository.findByUsername(request.getUsername()).orElse(null);
        }

        if (user == null) {
            log.error("❌ User not found with: {}", request.getUsername());
            throw new AIServiceException("Invalid credentials");
        }

        log.info("✅ Found user - Username: {}, Email: {}", user.getUsername(), user.getEmail());
        log.info("Stored password hash: {}", user.getPassword());
        log.info("Provided password: {}", request.getPassword());

        // Password comparison (temporary - should use BCrypt in production)
        if (!user.getPassword().equals(request.getPassword())) {
            log.error("❌ Password mismatch for user: {}", user.getUsername());
            throw new AIServiceException("Invalid credentials");
        }

        log.info("✅ LOGIN SUCCESS for user: {}", user.getUsername());
        return user;
    }

    // Get user by ID
    public User getUserById(Long id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new AIServiceException("User not found"));
    }
}
