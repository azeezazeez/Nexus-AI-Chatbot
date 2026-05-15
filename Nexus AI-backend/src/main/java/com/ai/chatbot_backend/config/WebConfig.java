package com.ai.chatbot_backend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOrigins(
                    "http://localhost:3000",
                    "http://localhost:5173",
                    "http://localhost:4173",
                    "https://nexus-smart-ai.vercel.app",
                    "https://www.nexus-smart-ai.vercel.app",
                    "https://nexus-smart-ai-git-main.vercel.app",
                    "https://nexus-smart-ai-azeezazeez7989.vercel.app"
                )
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD")
                .allowedHeaders("*")
                .exposedHeaders("Authorization", "Content-Type", "Set-Cookie")
                .allowCredentials(true)
                .maxAge(3600);
    }
}
