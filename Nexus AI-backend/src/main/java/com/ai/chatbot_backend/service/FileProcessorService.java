package com.ai.chatbot_backend.service;

import net.sourceforge.tess4j.Tesseract;
import net.sourceforge.tess4j.TesseractException;
import org.apache.tika.Tika;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

@Service
public class FileProcessorService {

    private final Tesseract tesseract;
    private final Tika tika = new Tika();

    public FileProcessorService(@Value("${tesseract.data.path:/usr/share/tesseract-ocr/4.00/tessdata}") String tessDataPath) {
        this.tesseract = new Tesseract();
        this.tesseract.setDatapath(tessDataPath);
        this.tesseract.setLanguage("eng");
    }

    public String extractContent(MultipartFile file) throws IOException {
        String contentType = file.getContentType();
        if (contentType == null) {
            contentType = tika.detect(file.getInputStream());
        }

        if (contentType.startsWith("image/")) {
            return extractImageText(file);
        } else if (contentType.equals("text/plain") ||
                   contentType.equals("text/markdown") ||
                   contentType.equals("text/csv") ||
                   contentType.contains("javascript") ||
                   contentType.contains("html") ||
                   contentType.contains("xml") ||
                   contentType.equals("application/json")) {
            return new String(file.getBytes(), StandardCharsets.UTF_8);
        } else {
            return "[Unsupported file type: " + file.getOriginalFilename() + "]";
        }
    }

    private String extractImageText(MultipartFile file) throws IOException {
        try {
            BufferedImage image = ImageIO.read(file.getInputStream());
            if (image == null) {
                return "[Could not decode image: " + file.getOriginalFilename() + "]";
            }
            return tesseract.doOCR(image);
        } catch (TesseractException e) {
            throw new IOException("OCR failed: " + e.getMessage(), e);
        }
    }
}
