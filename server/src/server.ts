import "dotenv/config";

import app from "./app";
import { connectDB } from "./config/db";
import { logger } from "./utils/logger";

const PORT = Number(process.env.PORT) || 5000;

// =====================================
// START EXPRESS SERVER
// =====================================

const startServer = async (): Promise<void> => {
  try {
    // Connect to MongoDB before starting Express.
    await connectDB();

    // Start the backend.
    app.listen(PORT, () => {
      logger.info(
        {
          event: "server.started",
          port: PORT,
        },
        "E-commerce API started",
      );
    });
  } catch (error) {
    // Do not log full database connection
    // errors because they may contain secrets.
    logger.fatal(
      {
        event: "server.startup_failed",
        errorType: error instanceof Error ? error.name : "UnknownError",
      },
      "Unable to start E-commerce API",
    );

    process.exit(1);
  }
};

void startServer();
