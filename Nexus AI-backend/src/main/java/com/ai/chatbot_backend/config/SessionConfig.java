package com.ai.chatbot_backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;

@Configuration
public class SessionConfig {

    @Bean
    public CookieSerializer cookieSerializer() {
        DefaultCookieSerializer serializer = new DefaultCookieSerializer();
        serializer.setSameSite("None");              // allows cross-site (Vercel → Render)
        serializer.setUseSecureCookie(true);         // ✅ fixed: required when SameSite=None
        serializer.setUseHttpOnlyCookie(true);
        serializer.setCookieName("NEXUS_SESSION");
        serializer.setCookieMaxAge(86400);           // 24 hours
        return serializer;
    }
}
