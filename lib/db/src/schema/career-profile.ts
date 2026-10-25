import { createInsertSchema } from "drizzle-zod";
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { appUsersTable } from "./app-users";
import { z } from "zod/v4";

export const careerProfilesTable = pgTable("career_profiles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => appUsersTable.id, { onDelete: "cascade" }),
  summary: text("summary").notNull().default(""),
  strengths: text("strengths").array().notNull().default([]),
  interests: text("interests").array().notNull().default([]),
  workPreferences: text("work_preferences").array().notNull().default([]),
  freshStartedAt: timestamp("fresh_started_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertCareerProfileSchema = createInsertSchema(careerProfilesTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertCareerProfile = z.infer<typeof insertCareerProfileSchema>;
export type CareerProfile = typeof careerProfilesTable.$inferSelect;
