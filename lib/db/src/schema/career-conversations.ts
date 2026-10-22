import { createInsertSchema } from "drizzle-zod";
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const careerConversationsTable = pgTable("career_conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull().default("A reflection"),
  summary: text("summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertCareerConversationSchema = createInsertSchema(careerConversationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCareerConversation = z.infer<typeof insertCareerConversationSchema>;
export type CareerConversation = typeof careerConversationsTable.$inferSelect;
