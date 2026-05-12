import express from "express";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import { createClient } from "redis";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Redis Client ─────────────────────────────────────────────────────────────
const redis = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

redis.on("error", (err) => console.error("[Redis] Error:", err));
redis.on("connect", () => console.log("[Redis] Connected"));

// ── Redis Helpers ─────────────────────────────────────────────────────────────

async function getUsers(): Promise<any[]> {
  const data = await redis.get("users");
  return data ? JSON.parse(data) : [];
}

async function saveUsers(users: any[]) {
  await redis.set("users", JSON.stringify(users));
}

async function getSessions(): Promise<any[]> {
  const data = await redis.get("sessions");
  return data ? JSON.parse(data) : [];
}

async function saveSessions(sessions: any[]) {
  await redis.set("sessions", JSON.stringify(sessions));
}

async function getMessages(): Promise<any[]> {
  const data = await redis.get("messages");
  return data ? JSON.parse(data) : [];
}

async function saveMessages(messages: any[]) {
  await redis.set("messages", JSON.stringify(messages));
}

// ── Server ────────────────────────────────────────────────────────────────────

async function startServer() {
  // Connect Redis before anything else
  await redis.connect();

  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  // ── CORS — must be first ────────────────────────────────────────────────
  app.use(
    cors({
      origin: process.env.FRONTEND_URL || "https://nexus-smart-ai.vercel.app",
      credentials: true,
    })
  );

  app.use(express.json());
  app.use(cookieParser());

  // ── Auth Middleware ─────────────────────────────────────────────────────
  const authMiddleware = async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const userId = req.cookies.userId;
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const users = await getUsers();
    const user = users.find((u: any) => u.id === userId);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    (req as any).user = user;
    next();
  };

  // ── Auth Routes ─────────────────────────────────────────────────────────

  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { username, email, password } = req.body;
      const users = await getUsers();

      if (users.find((u: any) => u.username === username))
        return res.status(400).json({ error: "Username already exists" });

      if (users.find((u: any) => u.email === email))
        return res.status(400).json({ error: "Email already exists" });

      const domain = email.split("@")[1];
      const allowedDomains = [
        "gmail.com", "yahoo.com", "email.com",
        "outlook.com", "hotmail.com", "icloud.com",
      ];
      if (!allowedDomains.includes(domain))
        return res.status(400).json({
          error: "Please use a common email provider (e.g., gmail.com)",
        });

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const newUser = {
        id: String(Date.now()),
        name: username,
        email,
        username,
        password,
        isVerified: false,
        otp,
        otpExpiry: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      };
      users.push(newUser);
      await saveUsers(users);

      console.log(`[Signup OTP] ${email}: ${otp}`);
      res.json({
        message: "Registration successful. Please verify your account.",
        email: newUser.email,
        otpSimulated: otp,
      });
    } catch (err) {
      console.error("[Signup Error]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/resend-otp", async (req, res) => {
    try {
      const { email } = req.body;
      const users = await getUsers();
      const user = users.find((u: any) => u.email === email);
      if (!user) return res.status(404).json({ error: "Account not found" });

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      if (!user.isVerified) { user.otp = otp; user.otpExpiry = expiry; }
      if (user.resetOtp)    { user.resetOtp = otp; user.resetOtpExpiry = expiry; }

      await saveUsers(users);
      console.log(`[Resend OTP] ${email}: ${otp}`);
      res.json({ message: "Verification code sent successfully", otpSimulated: otp });
    } catch (err) {
      console.error("[Resend OTP Error]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/verify-otp", async (req, res) => {
    try {
      const { email, otpCode } = req.body;
      const users = await getUsers();
      const user = users.find((u: any) => u.email === email);

      if (!user) return res.status(404).json({ error: "User not found" });
      if (user.otp !== otpCode) return res.status(400).json({ error: "Invalid verification code" });
      if (new Date() > new Date(user.otpExpiry)) return res.status(400).json({ error: "Code expired" });

      user.isVerified = true;
      user.otp = null;
      user.otpExpiry = null;
      await saveUsers(users);

      res.cookie("userId", user.id, { httpOnly: true, sameSite: "none", secure: true });
      res.json({
        user: { id: user.id, name: user.name, email: user.email, username: user.username },
        message: "Verified successfully",
      });
    } catch (err) {
      console.error("[Verify OTP Error]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      const users = await getUsers();
      const user = users.find((u: any) => u.email === email);
      if (!user) return res.status(404).json({ error: "No account found with this email" });

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      user.resetOtp = otp;
      user.resetOtpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await saveUsers(users);

      console.log(`[Forgot Password OTP] ${email}: ${otp}`);
      res.json({ message: "Password reset code sent", otpSimulated: otp });
    } catch (err) {
      console.error("[Forgot Password Error]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { email, otpCode, newPassword } = req.body;
      const users = await getUsers();
      const user = users.find((u: any) => u.email === email);

      if (!user) return res.status(404).json({ error: "User not found" });
      if (user.resetOtp !== otpCode) return res.status(400).json({ error: "Invalid code" });
      if (new Date() > new Date(user.resetOtpExpiry)) return res.status(400).json({ error: "Code expired" });

      user.password = newPassword;
      user.resetOtp = null;
      user.resetOtpExpiry = null;
      await saveUsers(users);

      res.json({ message: "Password updated successfully" });
    } catch (err) {
      console.error("[Reset Password Error]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const users = await getUsers();
      const user = users.find(
        (u: any) => u.username === username && u.password === password
      );
      if (!user) return res.status(401).json({ error: "Invalid username or password" });
      if (!user.isVerified)
        return res.status(403).json({ error: "Account not verified", email: user.email });

      res.cookie("userId", user.id, { httpOnly: true, sameSite: "none", secure: true });
      res.json({
        user: { id: user.id, name: user.name, email: user.email, username: user.username },
        message: "Login successful",
      });
    } catch (err) {
      console.error("[Login Error]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", (_req, res) => {
    res.clearCookie("userId", { sameSite: "none", secure: true });
    res.json({ message: "Logged out" });
  });

  app.get("/api/auth/status", async (req, res) => {
    const userId = req.cookies.userId;
    if (userId) {
      const users = await getUsers();
      const user = users.find((u: any) => u.id === userId);
      if (user) return res.json({ authenticated: true, userId });
    }
    res.status(401).json({ authenticated: false });
  });

  app.get("/api/auth/me", authMiddleware, (req, res) => {
    const user = (req as any).user;
    res.json({
      user: { id: user.id, name: user.name, email: user.email, username: user.username },
    });
  });

  // ── Chat Routes ─────────────────────────────────────────────────────────

  app.get("/api/chat/sessions", authMiddleware, async (req, res) => {
    try {
      const user = (req as any).user;
      const sessions = await getSessions();
      const userSessions = sessions
        .filter((s: any) => s.userId === user.id)
        .sort(
          (a: any, b: any) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      res.json({ sessions: userSessions });
    } catch (err) {
      console.error("[Get Sessions Error]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/chat/new-session", authMiddleware, async (req, res) => {
    try {
      const user = (req as any).user;
      const sessions = await getSessions();
      const newSession = {
        id: Date.now(),
        userId: user.id,
        sessionName: "New Chat",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      sessions.push(newSession);
      await saveSessions(sessions);
      res.json(newSession);
    } catch (err) {
      console.error("[New Session Error]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/chat/session/:sessionId", authMiddleware, async (req, res) => {
    try {
      const { sessionId } = req.params;
      let sessions = await getSessions();
      let messages = await getMessages();
      sessions = sessions.filter((s: any) => String(s.id) !== sessionId);
      messages = messages.filter((m: any) => String(m.sessionId) !== sessionId);
      await saveSessions(sessions);
      await saveMessages(messages);
      res.json({ message: "Chat deleted" });
    } catch (err) {
      console.error("[Delete Session Error]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/chat/rename", authMiddleware, async (req, res) => {
    try {
      const { sessionId, name } = req.body;
      const sessions = await getSessions();
      const session = sessions.find((s: any) => s.id === Number(sessionId));
      if (!session) return res.status(404).json({ error: "Session not found" });
      session.sessionName = name;
      session.updatedAt = new Date().toISOString();
      await saveSessions(sessions);
      res.json({ message: "Session renamed", session });
    } catch (err) {
      console.error("[Rename Session Error]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/chat/generate-title", authMiddleware, async (req, res) => {
    const { firstMessage } = req.body;
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return res.json({
        title:
          firstMessage.length > 30
            ? firstMessage.substring(0, 27) + "..."
            : firstMessage,
      });
    }

    try {
      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
              {
                role: "system",
                content:
                  "Generate a very short (max 4 words) descriptive title for a chat that starts with the following message. Return only the title text, no quotes or punctuation.",
              },
              { role: "user", content: firstMessage },
            ],
            max_tokens: 20,
          }),
        }
      );
      const data: any = await response.json();
      const title = data.choices?.[0]?.message?.content
        ?.trim()
        .replace(/^["']|["']$/g, "");
      res.json({ title: title || firstMessage.substring(0, 30) });
    } catch (error) {
      console.error("Groq AI Error:", error);
      res.json({ title: firstMessage.substring(0, 30) });
    }
  });

  app.delete("/api/chat/sessions", authMiddleware, async (req, res) => {
    try {
      const user = (req as any).user;
      let sessions = await getSessions();
      let messages = await getMessages();
      const userSessionIds = sessions
        .filter((s: any) => s.userId === user.id)
        .map((s: any) => s.id);
      sessions = sessions.filter((s: any) => s.userId !== user.id);
      messages = messages.filter(
        (m: any) => !userSessionIds.includes(m.sessionId)
      );
      await saveSessions(sessions);
      await saveMessages(messages);
      res.json({ message: "All chats cleared" });
    } catch (err) {
      console.error("[Clear Sessions Error]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/chat/history/:sessionId", authMiddleware, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const messages = await getMessages();
      const sessionMessages = messages.filter(
        (m: any) => String(m.sessionId) === sessionId
      );
      res.json({ messages: sessionMessages });
    } catch (err) {
      console.error("[Get History Error]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/chat/send", authMiddleware, async (req, res) => {
    try {
      const { message, sessionId } = req.body;
      const user = (req as any).user;
      const sessions = await getSessions();
      const messages = await getMessages();

      let targetSessionId = sessionId;
      let isNewSessionHeader = false;

      if (!targetSessionId) {
        const newSession = {
          id: Date.now(),
          userId: user.id,
          sessionName:
            message.length > 30
              ? message.substring(0, 27) + "..."
              : message,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        sessions.push(newSession);
        targetSessionId = newSession.id;
      } else {
        const session = sessions.find(
          (s: any) => s.id === Number(targetSessionId)
        );
        if (session && session.sessionName === "New Chat") {
          session.sessionName =
            message.length > 30
              ? message.substring(0, 27) + "..."
              : message;
          isNewSessionHeader = true;
        }
      }

      const newMessage = {
        id: Date.now(),
        sessionId: targetSessionId,
        role: "user",
        content: message,
        timestamp: new Date().toISOString(),
      };
      messages.push(newMessage);

      const aiResponseContent = `I received your message: "${message}". How can I help you further?`;
      const aiMessage = {
        id: Date.now() + 1,
        sessionId: targetSessionId,
        role: "assistant",
        content: aiResponseContent,
        timestamp: new Date().toISOString(),
      };
      messages.push(aiMessage);

      const session = sessions.find(
        (s: any) => s.id === Number(targetSessionId)
      );
      if (session) session.updatedAt = new Date().toISOString();

      await saveSessions(sessions);
      await saveMessages(messages);

      res.json({
        response: aiResponseContent,
        sessionId: targetSessionId,
        isNewSessionHeader,
      });
    } catch (err) {
      console.error("[Send Message Error]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Static / Vite ────────────────────────────────────────────────────────

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
