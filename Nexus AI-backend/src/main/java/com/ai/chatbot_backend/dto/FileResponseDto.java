package com.ai.chatbot_backend.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class FileResponseDto {
    private Long id;
    private String filename;
    private String originalName;
    private String mimetype;
    private Long size;
    private String path;
}
