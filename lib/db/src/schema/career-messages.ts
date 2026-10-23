import { createInsertSchema } from "drizzle-zod";
import { pgTable, serial, text, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { careerConversationsTable } from "./career-conversations";
import { z } from "zod/v4";

export const careerMessagesTable = pgTable("career_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => careerConversationsTable.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  requestKey: text("request_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("career_messages_request_role_unique").on(table.conversationId, table.requestKey, table.role),
]);

export const insertCareerMessageSchema = createInsertSchema(careerMessagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCareerMessage = z.infer<typeof insertCareerMessageSchema>;
export type CareerMessage = typeof careerMessagesTable.$inferSelect;
