import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import clusterRoutes from "./routes/cluster.routes";
import ingestRoutes from "./routes/ingest.routes";
import { errorHandler } from "./middleware/error.middleware";

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// CORS configuration
// Allows requests from the frontend (Vercel URL in prod, localhost in dev)
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3050",
  process.env.FRONTEND_URL,        // e.g. https://xpo-assignment.vercel.app
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. curl, Postman, Railway health checks)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// Parse JSON request bodies
app.use(express.json());

// Diagnostic endpoint
app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date() });
});

// Register routes
app.use("/", clusterRoutes);
app.use("/", ingestRoutes);

// Global Error Handler Middleware (must be registered after routes)
app.use(errorHandler);

// Start server
app.listen(port, () => {
  console.log(`[Server] News Pulse API server listening at http://localhost:${port}`);
});
