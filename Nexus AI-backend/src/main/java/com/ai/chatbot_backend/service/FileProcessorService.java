package com.ai.chatbot_backend.service;

import lombok.extern.slf4j.Slf4j;
import net.sourceforge.tess4j.Tesseract;
import net.sourceforge.tess4j.TesseractException;
import org.apache.tika.Tika;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

@Service
@Slf4j
public class FileProcessorService {

    // Lazy — don't initialise Tika at startup; defer until first file upload.
    // new Tika() triggers a TikaConfig ServiceLoader classpath scan which
    // contributes to the 189-second startup time you're seeing.
    private volatile Tika tika;

    private final boolean ocrAvailable;
    private final Tesseract tesseract;

    public FileProcessorService(
            @Value("${tesseract.data.path:/usr/share/tesseract-ocr/4.00/tessdata}") String tessDataPath) {

        // ─────────────────────────────────────────────────────────────────────
        // WHY THIS CHECK IS CRITICAL
        // ─────────────────────────────────────────────────────────────────────
        // Tesseract uses JNI to call a native C++ library (libtesseract.so).
        // If the language data file (eng.traineddata) is missing and you call
        // tesseract.doOCR(), the native code crashes with SIGSEGV — a signal
        // that kills the JVM process entirely (PID 1 on Render).
        // Java's try/catch cannot intercept a SIGSEGV; the JVM is already dead.
        // The ONLY safe fix is to never call doOCR() when tessdata is absent.
        // ─────────────────────────────────────────────────────────────────────
        File engTrainedData = new File(tessDataPath, "eng.traineddata");

        if (engTrainedData.exists()) {
            Tesseract t = new Tesseract();
            t.setDatapath(tessDataPath);
            t.setLanguage("eng");
            this.tesseract = t;
            this.ocrAvailable = true;
            log.info("✅ Tesseract OCR ready — tessdata: {}", tessDataPath);
        } else {
            this.tesseract = null;
            this.ocrAvailable = false;
            // Warn but do NOT throw — the app should still start and serve chat requests.
            // Only image OCR will be unavailable.
            log.warn("⚠️  Tesseract tessdata not found at '{}' (eng.traineddata missing). " +
                     "Image OCR is disabled. Fix: add a Dockerfile that installs " +
                     "tesseract-ocr and tesseract-ocr-eng, or set the " +
                     "tesseract.data.path property to the correct path.", tessDataPath);
        }
    }

    public String extractContent(MultipartFile file) throws IOException {
        String contentType = file.getContentType();
        if (contentType == null) {
            contentType = getTika().detect(file.getInputStream());
        }

        if (contentType.startsWith("image/")) {
            // ── Guard: never call doOCR() unless tessdata is confirmed present ──
            if (!ocrAvailable) {
                return "[Image received ('" + file.getOriginalFilename() + "') but OCR is " +
                       "not available on this server. Please paste or describe the image " +
                       "content in your message text instead.]";
            }
            try {
                return extractImageText(file);
            } catch (Exception e) {
                // This catches TesseractException from Java-level failures only.
                // A native SIGSEGV cannot reach here — that's why the guard above exists.
                log.warn("OCR failed for '{}': {}", file.getOriginalFilename(), e.getMessage());
                return "[Image detected but text extraction failed: " + e.getMessage() + "]";
            }
        }

        if (contentType.equals("text/plain")     ||
            contentType.equals("text/markdown")  ||
            contentType.equals("text/csv")       ||
            contentType.contains("javascript")   ||
            contentType.contains("html")         ||
            contentType.contains("xml")          ||
            contentType.equals("application/json")) {
            return new String(file.getBytes(), StandardCharsets.UTF_8);
        }

        return "[Unsupported file type: " + file.getOriginalFilename() + "]";
    }

    private String extractImageText(MultipartFile file) throws IOException {
        try {
            BufferedImage image = ImageIO.read(file.getInputStream());
            if (image == null) {
                return "[Could not decode image: " + file.getOriginalFilename() + "]";
            }
            String result = tesseract.doOCR(image);
            return (result == null || result.trim().isEmpty())
                    ? "[No text found in image]"
                    : result;
        } catch (TesseractException e) {
            throw new IOException("OCR failed: " + e.getMessage(), e);
        }
    }

    // Lazy Tika initialisation — avoids 45-second classpath scan at startup
    private Tika getTika() {
        if (this.tika == null) {
            synchronized (this) {
                if (this.tika == null) {
                    this.tika = new Tika();
                }
            }
        }
        return this.tika;
    }
}
