import { createInsertSchema } from "drizzle-zod";
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { appUsersTable } from "./app-users";
import { z } from "zod/v4";

export const careerRecommendationsTable = pgTable("career_recommendations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => appUsersTable.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["book", "activity"] }).notNull(),
  title: text("title").notNull(),
  reason: text("reason").notNull(),
  status: text("status", { enum: ["new", "saved", "tried", "dismissed"] })
    .notNull()
    .default("new"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCareerRecommendationSchema = createInsertSchema(careerRecommendationsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCareerRecommendation = z.infer<typeof insertCareerRecommendationSchema>;
export type CareerRecommendation = typeof careerRecommendationsTable.$inferSelect;
