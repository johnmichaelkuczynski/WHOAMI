import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { appUsersTable } from "./app-users";

export const appSessionsTable = pgTable("app_sessions", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => appUsersTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AppSession = typeof appSessionsTable.$inferSelect;
