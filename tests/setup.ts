import dotenv from "dotenv";
dotenv.config({ path: ".env.test" });

// Override DB to use test database
process.env.DB_NAME = process.env.DB_NAME || "linguablob_test";
process.env.JWT_SECRET = "test-secret-not-for-production";
