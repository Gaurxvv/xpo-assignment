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
// Allow all origins for dev/assessment, or configure specific origin in prod
app.use(cors());

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
