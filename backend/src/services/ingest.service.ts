import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import prisma from "./prisma";
import { AppError } from "../middleware/error.middleware";

export class IngestService {
  private getProjectRoot(): string {
    const cwd = process.cwd();
    return cwd.endsWith("backend") ? path.resolve(cwd, "..") : cwd;
  }

  private getPythonExecutable(): string {
    // 1. Check virtual environment paths relative to project root first
    const rootPath = this.getProjectRoot();
    const winVenv = path.join(rootPath, "scraper", ".venv", "Scripts", "python.exe");
    const unixVenv = path.join(rootPath, "scraper", ".venv", "bin", "python");

    if (fs.existsSync(winVenv)) {
      console.log(`[Ingest] Using Windows virtualenv Python: ${winVenv}`);
      return winVenv;
    }
    if (fs.existsSync(unixVenv)) {
      console.log(`[Ingest] Using Unix/Mac virtualenv Python: ${unixVenv}`);
      return unixVenv;
    }

    // 2. Use env variable if defined (e.g. PYTHON_CMD=python3 on Railway)
    if (process.env.PYTHON_CMD) {
      console.log(`[Ingest] Using PYTHON_CMD from env: ${process.env.PYTHON_CMD}`);
      return process.env.PYTHON_CMD;
    }

    // 3. On Linux/Railway, python3 is the standard. On Windows, python.
    const fallback = process.platform === "win32" ? "python" : "python3";
    console.log(`[Ingest] Virtualenv not found. Falling back to global '${fallback}'`);
    return fallback;
  }

  async triggerIngest() {
    // Check if there is already an active running job to prevent parallel overlapping ingestion runs
    const activeJob = await prisma.ingestJob.findFirst({
      where: {
        status: {
          in: ["PENDING", "RUNNING"],
        },
      },
    });

    if (activeJob) {
      throw new AppError(
        `An ingestion job is already running (Job ID: ${activeJob.id}). Please wait for it to complete.`,
        400
      );
    }

    // Create the job record in PENDING state
    const job = await prisma.ingestJob.create({
      data: {
        status: "PENDING",
        message: "Job triggered, preparing to spawn pipeline.",
      },
    });

    const jobId = job.id;
    const pythonExe = this.getPythonExecutable();
    const scraperScript = path.join(this.getProjectRoot(), "scraper", "main.py");

    console.log(`[Ingest] Spawning scraper process: ${pythonExe} ${scraperScript} --job-id ${jobId}`);

    // Spawn the scraper pipeline in background (non-blocking)
    const scraperProcess = spawn(pythonExe, [scraperScript, "--job-id", jobId]);

    // Track output logs for backend diagnostics
    scraperProcess.stdout.on("data", (data) => {
      console.log(`[Python Scraper stdout]: ${data.toString().trim()}`);
    });

    scraperProcess.stderr.on("data", (data) => {
      console.error(`[Python Scraper stderr]: ${data.toString().trim()}`);
    });

    // Handle startup errors (e.g. executable not found)
    scraperProcess.on("error", async (err) => {
      console.error("[Ingest] Failed to start scraper process:", err);
      try {
        await prisma.ingestJob.update({
          where: { id: jobId },
          data: {
            status: "FAILED",
            completedAt: new Date(),
            message: `Failed to start Python process: ${err.message}`,
          },
        });
      } catch (dbErr) {
        console.error("[Ingest] Failed to record process startup error in database:", dbErr);
      }
    });

    // Handle unexpected early exits where Python doesn't complete writing status
    scraperProcess.on("close", async (code) => {
      console.log(`[Ingest] Scraper process exited with code ${code}`);
      
      // Check database to see if job status was updated by Python. 
      // If it's still PENDING or RUNNING, but the process has exited, it means it crashed before finalizing.
      try {
        const finalJob = await prisma.ingestJob.findUnique({ where: { id: jobId } });
        if (finalJob && (finalJob.status === "PENDING" || finalJob.status === "RUNNING")) {
          const status = code === 0 ? "COMPLETED" : "FAILED";
          const msg = code === 0 
            ? "Completed process but status was not set." 
            : `Process exited unexpectedly with non-zero exit code: ${code}`;
            
          await prisma.ingestJob.update({
            where: { id: jobId },
            data: {
              status,
              completedAt: new Date(),
              message: msg,
            },
          });
        }
      } catch (dbErr) {
        console.error("[Ingest] Failed to verify process exit status in database:", dbErr);
      }
    });

    return { jobId };
  }

  async getJobStatus(jobId: string) {
    const job = await prisma.ingestJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new AppError(`Ingestion job with ID ${jobId} not found`, 404);
    }

    return {
      id: job.id,
      status: job.status.toLowerCase(), // Return lowercase as requested in the API spec (pending, running, completed, failed)
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      message: job.message,
    };
  }
}

export const ingestService = new IngestService();
