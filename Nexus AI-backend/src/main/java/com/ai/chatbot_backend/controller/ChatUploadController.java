package com.ai.chatbot_backend.controller; 

import com.ai.chatbot_backend.dto.FileResponseDto;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/files")  // Changed to /api/files to avoid conflicts
@CrossOrigin(origins = "*")
public class FileUploadController {  // Renamed for clarity

    private static final String UPLOAD_DIRECTORY = "uploads/";

    @PostMapping("/upload")
    public ResponseEntity<?> uploadFile(@RequestParam("file") MultipartFile file) {

        // 1. Reject empty files
        if (file.isEmpty()) {
            return ResponseEntity
                    .status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "No file selected"));
        }

        try {
            // 2. Create uploads/ directory if it doesn't exist
            Path uploadPath = Paths.get(UPLOAD_DIRECTORY);
            if (!Files.exists(uploadPath)) {
                Files.createDirectories(uploadPath);
            }

            // 3. Extract extension from original filename
            String originalFileName = file.getOriginalFilename();
            String extension = "";
            if (originalFileName != null && originalFileName.contains(".")) {
                extension = originalFileName.substring(originalFileName.lastIndexOf("."));
            }

            // 4. Generate unique filename using UUID
            String uniqueFileName = UUID.randomUUID().toString() + extension;

            // 5. Save the file to disk
            Path targetPath = uploadPath.resolve(uniqueFileName);
            Files.copy(file.getInputStream(), targetPath);

            // 6. Build and return response DTO
            FileResponseDto responseDto = FileResponseDto.builder()
                    .id(System.currentTimeMillis())
                    .filename(uniqueFileName)
                    .originalName(originalFileName)
                    .mimetype(file.getContentType())
                    .size(file.getSize())
                    .path("/uploads/" + uniqueFileName)
                    .build();

            return ResponseEntity.ok(Map.of("file", responseDto));

        } catch (IOException e) {
            return ResponseEntity
                    .status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "File upload failed: " + e.getMessage()));
        }
    }
    
    // Optional: Add endpoint to serve files
    @GetMapping("/download/{filename}")
    public ResponseEntity<?> downloadFile(@PathVariable String filename) {
        try {
            Path filePath = Paths.get(UPLOAD_DIRECTORY).resolve(filename);
            if (!Files.exists(filePath)) {
                return ResponseEntity.notFound().build();
            }
            
            byte[] fileData = Files.readAllBytes(filePath);
            return ResponseEntity.ok()
                    .header("Content-Type", "application/octet-stream")
                    .header("Content-Disposition", "attachment; filename=\"" + filename + "\"")
                    .body(fileData);
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "File download failed"));
        }
    }
}
