package com.ai.chatbot_backend.controller;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.nio.file.*;
import java.util.*;

@RestController
@RequestMapping("/api/files")
@Slf4j
public class FileController {

    @Value("${file.upload.dir:uploads}")
    private String uploadDir;

    private static final List<String> ALLOWED_TYPES = List.of(
        "image/jpeg", "image/png", "image/gif", "image/webp",
        "application/pdf", "text/plain"
    );

    @PostMapping("/upload")
    public ResponseEntity<Map<String, Object>> uploadFile(@RequestParam("file") MultipartFile file) {
        Map<String, Object> response = new HashMap<>();
        try {
            // Validate file
            if (file.isEmpty()) {
                response.put("error", "File is empty");
                return ResponseEntity.badRequest().body(response);
            }

            String contentType = file.getContentType();
            if (contentType == null || !ALLOWED_TYPES.contains(contentType)) {
                response.put("error", "File type not allowed. Allowed: images, PDF, text");
                return ResponseEntity.badRequest().body(response);
            }

            if (file.getSize() > 10 * 1024 * 1024) { // 10MB
                response.put("error", "File too large. Max size is 10MB");
                return ResponseEntity.badRequest().body(response);
            }

            // Create upload directory if it doesn't exist
            Path uploadPath = Paths.get(uploadDir);
            if (!Files.exists(uploadPath)) {
                Files.createDirectories(uploadPath);
            }

            // Generate unique filename
            String originalName = file.getOriginalFilename();
            String extension = "";
            if (originalName != null && originalName.contains(".")) {
                extension = originalName.substring(originalName.lastIndexOf("."));
            }
            String uniqueFileName = UUID.randomUUID().toString() + extension;

            // Save file
            Path filePath = uploadPath.resolve(uniqueFileName);
            Files.copy(file.getInputStream(), filePath, StandardCopyOption.REPLACE_EXISTING);

            log.info("File uploaded: {} -> {}", originalName, uniqueFileName);

            // Build response
            Map<String, Object> fileInfo = new HashMap<>();
            fileInfo.put("id", uniqueFileName);
            fileInfo.put("originalName", originalName);
            fileInfo.put("fileName", uniqueFileName);
            fileInfo.put("contentType", contentType);
            fileInfo.put("size", file.getSize());
            fileInfo.put("url", "/uploads/" + uniqueFileName);
            fileInfo.put("isImage", contentType.startsWith("image/"));

            response.put("file", fileInfo);
            response.put("success", true);
            response.put("message", "File uploaded successfully");

            return ResponseEntity.ok(response);

        } catch (IOException e) {
            log.error("File upload error: {}", e.getMessage(), e);
            response.put("error", "Failed to upload file: " + e.getMessage());
            return ResponseEntity.internalServerError().body(response);
        }
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> response = new HashMap<>();
        response.put("status", "ok");
        response.put("uploadDir", uploadDir);
        return ResponseEntity.ok(response);
    }
}
