import "dotenv/config";

import app from "./app";
import { connectDB } from "./config/db";

const PORT = Number(process.env.PORT) || 5000;

const startServer = async (): Promise<void> => {
  try {
    // Connect to MongoDB first
    await connectDB();

    // Start Express after successful database connection
    app.listen(PORT, () => {
      console.log(
        `Server running at http://localhost:${PORT}`
      );
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();