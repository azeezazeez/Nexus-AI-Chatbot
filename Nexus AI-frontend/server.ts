import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_FILE = path.join(__dirname, "db.json");

// Initial DB structure
const initialDb = {
  users: [] as any[],
  sessions: [] as any[],
  messages: [] as any[],
};

// Load DB
function loadDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2));
      return initialDb;
    }
    const data = fs.readFileSync(DB_FILE, "utf-8");
    return JSON.parse(data || JSON.stringify(initialDb));
  } catch (err) {
    console.error("DB Load Error:", err);
    return initialDb;
  }
}

// Save DB
function saveDb(data: any) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());

  // Simple Auth Middleware
  const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    let userId = req.cookies.userId;
    
    // Support Bearer token for mobile/iframe compatibility
    const authHeader = req.headers.authorization;
    if (!userId && authHeader && authHeader.startsWith('Bearer ')) {
      userId = authHeader.substring(7);
    }

    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const db = loadDb();
    const user = db.users.find((u: any) => u.id === userId);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    (req as any).user = user;
    next();
  };

  // --- API Routes ---

  // auth routes
  app.post("/api/auth/signup", (req, res) => {
    const { username, email, password } = req.body;
    const db = loadDb();

    if (db.users.find((u: any) => u.username === username)) {
      return res.status(400).json({ error: "Username already exists" });
    }

    if (db.users.find((u: any) => u.email === email)) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const domain = email.split("@")[1];
    const allowedDomains = ["gmail.com", "yahoo.com", "email.com", "outlook.com", "hotmail.com", "icloud.com"];
    if (!allowedDomains.includes(domain)) {
      return res.status(400).json({ error: `Please use a common email provider (e.g., gmail.com)` });
    }

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
    db.users.push(newUser);
    saveDb(db);

    console.log(`[Signup OTP] ${email}: ${otp}`);
    res.json({ message: "Registration successful. Please verify your account.", email: newUser.email, otpSimulated: otp });
  });

  app.post("/api/auth/resend-otp", (req, res) => {
    const { email } = req.body;
    const db = loadDb();
    const user = db.users.find((u: any) => u.email === email);
    if (!user) return res.status(404).json({ error: "Account not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // If user is not verified, resend signup OTP
    if (!user.isVerified) {
      user.otp = otp;
      user.otpExpiry = expiry;
    } 
    // If user has a resetOtp, they are in forgot password flow
    if (user.resetOtp) {
      user.resetOtp = otp;
      user.resetOtpExpiry = expiry;
    }

    saveDb(db);
    console.log(`[Resend OTP] ${email}: ${otp}`);
    res.json({ message: "Verification code sent successfully", otpSimulated: otp });
  });

  app.post("/api/auth/verify-otp", (req, res) => {
    const { email, otpCode } = req.body; // user used otpCode in api.ts
    const db = loadDb();
    const user = db.users.find((u: any) => u.email === email);

    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.otp !== otpCode) return res.status(400).json({ error: "Invalid verification code" });
    if (new Date() > new Date(user.otpExpiry)) return res.status(400).json({ error: "Code expired" });

    user.isVerified = true;
    user.otp = null;
    user.otpExpiry = null;
    saveDb(db);

    res.cookie("userId", user.id, { httpOnly: true, sameSite: "none", secure: true });
    res.json({
      user: { id: user.id, name: user.name, email: user.email, username: user.username },
      token: user.id,
      message: "Verified successfully",
    });
  });

  app.post("/api/auth/forgot-password", (req, res) => {
    const { email } = req.body;
    const db = loadDb();
    const user = db.users.find((u: any) => u.email === email);

    if (!user) return res.status(404).json({ error: "No account found with this email" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetOtp = otp;
    user.resetOtpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    saveDb(db);

    console.log(`[Forgot Password OTP] ${email}: ${otp}`);
    res.json({ message: "Password reset code sent", otpSimulated: otp });
  });

  app.post("/api/auth/reset-password", (req, res) => {
    const { email, otpCode, newPassword } = req.body;
    const db = loadDb();
    const user = db.users.find((u: any) => u.email === email);

    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.resetOtp !== otpCode) return res.status(400).json({ error: "Invalid code" });
    if (new Date() > new Date(user.resetOtpExpiry)) return res.status(400).json({ error: "Code expired" });

    user.password = newPassword;
    user.resetOtp = null;
    user.resetOtpExpiry = null;
    saveDb(db);

    res.json({ message: "Password updated successfully" });
  });

  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    const db = loadDb();
    const user = db.users.find((u: any) => u.username === username && u.password === password);
    if (!user) return res.status(401).json({ error: "Invalid username or password" });
    if (!user.isVerified) return res.status(403).json({ error: "Account not verified", email: user.email });

    res.cookie("userId", user.id, { httpOnly: true, sameSite: "none", secure: true });
    res.json({
      user: { id: user.id, name: user.name, email: user.email, username: user.username },
      token: user.id,
      message: "Login successful",
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("userId", { sameSite: "none", secure: true });
    res.json({ message: "Logged out" });
  });

  app.get("/api/auth/status", (req, res) => {
    let userId = req.cookies.userId;

    const authHeader = req.headers.authorization;
    if (!userId && authHeader && authHeader.startsWith('Bearer ')) {
      userId = authHeader.substring(7);
    }

    if (userId) {
      const db = loadDb();
      const user = db.users.find((u: any) => u.id === userId);
      if (user) return res.json({ authenticated: true, userId, user: { id: user.id, name: user.name, email: user.email, username: user.username } });
    }
    res.status(401).json({ authenticated: false });
  });

  app.get("/api/auth/me", authMiddleware, (req, res) => {
    const user = (req as any).user;
    res.json({ user: { id: user.id, name: user.name, email: user.email, username: user.username } });
  });

  // chat routes
  app.get("/api/chat/sessions", authMiddleware, (req, res) => {
    const user = (req as any).user;
    const db = loadDb();
    const sessions = db.sessions.filter((s: any) => s.userId === user.id).sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    res.json({ sessions });
  });

  app.post("/api/chat/new-session", authMiddleware, (req, res) => {
    const user = (req as any).user;
    const db = loadDb();
    const newSession = {
      id: Date.now(),
      userId: user.id,
      sessionName: "New Chat",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.sessions.push(newSession);
    saveDb(db);
    res.json(newSession);
  });

  app.delete("/api/chat/session/:sessionId", authMiddleware, (req, res) => {
    const { sessionId } = req.params;
    const db = loadDb();
    const sid = Number(sessionId);
    db.sessions = db.sessions.filter((s: any) => s.id !== sid && String(s.id) !== sessionId);
    db.messages = db.messages.filter((m: any) => m.sessionId !== sid && String(m.sessionId) !== sessionId);
    saveDb(db);
    res.json({ message: "Chat deleted" });
  });

  app.patch("/api/chat/rename", authMiddleware, (req, res) => {
    const { sessionId, name } = req.body;
    const db = loadDb();
    const session = db.sessions.find((s: any) => s.id === Number(sessionId));
    if (!session) return res.status(404).json({ error: "Session not found" });
    
    session.sessionName = name;
    session.updatedAt = new Date().toISOString();
    saveDb(db);
    res.json({ message: "Session renamed", session });
  });

  app.post("/api/chat/generate-title", authMiddleware, async (req, res) => {
    const { firstMessage } = req.body;
    const apiKey = process.env.GROQ_API_KEY;

    const fallbackTitle = firstMessage.length > 30 
      ? firstMessage.substring(0, 27) + "..." 
      : firstMessage;

    if (!apiKey) {
      console.log("GROQ_API_KEY is not set, using fallback title.");
      return res.json({ title: fallbackTitle });
    }

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "meta-llama/llama-4-scout-17b-16e-instruct",
          messages: [
            {
              role: "system",
              content: "Generate a very short (max 3 words) descriptive title for a chat that starts with the following message. Return ONLY the title text. No punctuation, no quotes."
            },
            {
              role: "user",
              content: firstMessage
            }
          ],
          max_tokens: 20
        }),
        // Add a timeout if possible, or just catch errors
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Groq API error response:", errorData);
        return res.json({ title: fallbackTitle });
      }

      const data: any = await response.json();
      const title = data.choices?.[0]?.message?.content?.trim().replace(/^["']|["']$/g, '');
      res.json({ title: title || fallbackTitle });
    } catch (error) {
      console.error("Groq AI Fetch Error:", error);
      res.json({ title: fallbackTitle });
    }
  });

  app.get("/api/chat/search", authMiddleware, async (req, res) => {
    const { q } = req.query;
    if (!q) return res.json({ sessions: [] });

    const user = (req as any).user;
    const db = loadDb();
    const userSessions = db.sessions.filter((s: any) => s.userId === user.id);
    
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      // Fallback to simple keyword search
      const results = userSessions.filter((s: any) => 
        s.sessionName.toLowerCase().includes(String(q).toLowerCase())
      );
      return res.json({ sessions: results });
    }

    try {
      const chatSummaries = userSessions.map((s: any) => ({
        id: s.id,
        name: s.sessionName
      }));

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "meta-llama/llama-4-scout-17b-16e-instruct",
          messages: [
            {
              role: "system",
              content: "You are a chat search assistant. Given a list of chat titles and a search query, return a comma-separated list of ONLY the numeric IDs of the chats that are relevant to the query. If none are relevant, return 'none'."
            },
            {
              role: "user",
              content: `Chats: ${JSON.stringify(chatSummaries)}\nQuery: ${q}`
            }
          ],
          max_tokens: 100
        }),
      });

      if (response.ok) {
        const data: any = await response.json();
        const content = data.choices?.[0]?.message?.content || "";
        if (content.toLowerCase().includes("none")) {
          return res.json({ sessions: [] });
        }
        const ids = content.split(",").map((id: string) => Number(id.trim())).filter((id: number) => !isNaN(id));
        const results = userSessions.filter((s: any) => ids.includes(s.id));
        return res.json({ sessions: results });
      }
      
      throw new Error("Groq Search failed");
    } catch (error) {
      console.error("AI Search error:", error);
      const results = userSessions.filter((s: any) => 
        s.sessionName.toLowerCase().includes(String(q).toLowerCase())
      );
      return res.json({ sessions: results });
    }
  });

  app.delete("/api/chat/sessions", authMiddleware, (req, res) => {
    const user = (req as any).user;
    const db = loadDb();
    const userSessionIds = db.sessions.filter((s: any) => s.userId === user.id).map((s: any) => s.id);
    db.sessions = db.sessions.filter((s: any) => s.userId !== user.id);
    db.messages = db.messages.filter((m: any) => !userSessionIds.includes(m.sessionId));
    saveDb(db);
    res.json({ message: "All chats cleared" });
  });

  app.get("/api/chat/history/:sessionId", authMiddleware, (req, res) => {
    const { sessionId } = req.params;
    const db = loadDb();
    const messages = db.messages.filter((m: any) => String(m.sessionId) === sessionId);
    res.json({ messages });
  });

  app.post("/api/chat/send", authMiddleware, async (req, res) => {
    const { message, sessionId } = req.body;
    const user = (req as any).user;
    const db = loadDb();

    let targetSessionId = sessionId;
    let isNewSessionHeader = false;

    if (!targetSessionId) {
      const newSession = {
        id: Date.now(),
        userId: user.id,
        sessionName: message.length > 30 ? message.substring(0, 27) + "..." : message,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.sessions.push(newSession);
      targetSessionId = newSession.id;
    } else {
      // Check if this is the first real message in the session to rename it
      const session = db.sessions.find((s: any) => s.id === Number(targetSessionId));
      if (session && session.sessionName === "New Chat") {
        session.sessionName = message.length > 30 ? message.substring(0, 27) + "..." : message;
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
    db.messages.push(newMessage);

    const apiKey = process.env.GROQ_API_KEY;
    let aiResponseContent = `I received your message: "${message}". (Note: GROQ_API_KEY is not set)`;

    if (apiKey) {
      try {
        const history = db.messages.filter((m: any) => Number(m.sessionId) === Number(targetSessionId));
        const groqMessages = history.map((m: any) => ({
          role: m.role,
          content: m.content
        })).slice(-10); // Last 10 messages for context

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            messages: [
              { role: "system", content: "You are Nexus AI, a helpful and polite assistant. Keep your responses concise and structured unless asked otherwise." },
              ...groqMessages
            ],
            max_tokens: 1024
          }),
        });

        if (response.ok) {
          const data: any = await response.json();
          aiResponseContent = data.choices?.[0]?.message?.content || "No response from AI.";
        } else {
          const errorData = await response.json().catch(() => ({}));
          console.error("Groq Chat Error:", errorData);
          aiResponseContent = "I'm sorry, I'm having trouble connecting to my brain right now.";
        }
      } catch (error) {
        console.error("Groq AI Send Error:", error);
        aiResponseContent = "Something went wrong while processing your request.";
      }
    }

    const aiMessage = {
      id: Date.now() + 1,
      sessionId: targetSessionId,
      role: "assistant",
      content: aiResponseContent,
      timestamp: new Date().toISOString(),
    };
    db.messages.push(aiMessage);

    // Update session updatedAt
    const session = db.sessions.find((s: any) => s.id === Number(targetSessionId));
    if (session) {
      session.updatedAt = new Date().toISOString();
    }

    saveDb(db);
    res.json({ 
      response: aiResponseContent, 
      sessionId: targetSessionId,
      isNewSessionHeader 
    });
  });

  // --- End API Routes ---

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
