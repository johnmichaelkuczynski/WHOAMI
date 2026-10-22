import { createInsertSchema } from "drizzle-zod";
import { boolean, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export type AssessmentKind = "interests" | "personality" | "riasec" | "ipip";
export type AssessmentQuestion = {
  id: string;
  prompt: string;
  trait: string;
  keying?: "positive" | "reverse";
};
export type AssessmentAnswer = { questionId: string; score: number };
export type TraitScore = { trait: string; score: number };

export const careerAssessmentsTable = pgTable("career_assessments", {
  id: serial("id").primaryKey(),
  kind: text("kind", { enum: ["interests", "personality", "riasec", "ipip"] }).notNull(),
  questions: jsonb("questions").$type<AssessmentQuestion[]>().notNull(),
  answers: jsonb("answers").$type<AssessmentAnswer[]>().notNull().default([]),
  scores: jsonb("scores").$type<TraitScore[]>().notNull().default([]),
  verificationRun: boolean("verification_run").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const insertCareerAssessmentSchema = createInsertSchema(careerAssessmentsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCareerAssessment = z.infer<typeof insertCareerAssessmentSchema>;
export type CareerAssessment = typeof careerAssessmentsTable.$inferSelect;
