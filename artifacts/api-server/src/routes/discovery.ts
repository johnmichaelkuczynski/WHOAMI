import { Router, type IRouter, type Request } from "express";
import { count, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  careerAssessmentsTable,
  careerConversationsTable,
  careerMessagesTable,
  careerProfilesTable,
  careerRecommendationsTable,
  type AssessmentQuestion,
  type CareerProfile,
} from "@workspace/db";
import {
  CreateCareerConversationBody,
  CreateCareerConversationResponse,
  GenerateCareerRecommendationsResponse,
  GetCareerProfileResponse,
  GetDiscoveryDashboardResponse,
  ListAssessmentResultsResponse,
  ListCareerConversationsResponse,
  ListCareerMessagesParams,
  ListCareerMessagesResponse,
  ListCareerRecommendationsResponse,
  SendCareerMessageBody,
  SendCareerMessageParams,
  SendCareerMessageResponse,
  StartAssessmentBody,
  StartAssessmentResponse,
  SubmitAssessmentBody,
  SubmitAssessmentParams,
  SubmitAssessmentResponse,
  SummarizeCareerConversationParams,
  SummarizeCareerConversationResponse,
  UpdateCareerProfileBody,
  UpdateCareerProfileResponse,
  UpdateCareerRecommendationBody,
  UpdateCareerRecommendationParams,
  UpdateCareerRecommendationResponse,
} from "@workspace/api-zod";
import {
  createAssessmentQuestions,
  createRecommendations,
  reflectOnMessage,
  scoreAssessment,
  summarizeReflection,
} from "../lib/career-ai";

const router: IRouter = Router();

async function getOrCreateProfile(): Promise<CareerProfile> {
  const [existing] = await db
    .select()
    .from(careerProfilesTable)
    .where(eq(careerProfilesTable.id, 1))
    .limit(1);
  if (existing) return existing;
  await db
    .insert(careerProfilesTable)
    .values({ id: 1, summary: "", strengths: [], interests: [], workPreferences: [] })
    .onConflictDoNothing();
  const [profile] = await db
    .select()
    .from(careerProfilesTable)
    .where(eq(careerProfilesTable.id, 1))
    .limit(1);
  if (!profile) throw new Error("Unable to initialize the career profile.");
  return profile;
}

function profileSnapshot(profile: CareerProfile) {
  return {
    summary: profile.summary,
    strengths: profile.strengths,
    interests: profile.interests,
    workPreferences: profile.workPreferences,
  };
}

function logAiError(req: Request, error: unknown) {
  req.log.error({ err: error }, "Career exploration AI request failed");
}

router.get("/discovery/profile", async (_req, res): Promise<void> => {
  const profile = await getOrCreateProfile();
  res.json(GetCareerProfileResponse.parse(profile));
});

router.patch("/discovery/profile", async (req, res): Promise<void> => {
  const parsed = UpdateCareerProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const profile = await getOrCreateProfile();
  const [updated] = await db
    .update(careerProfilesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(careerProfilesTable.id, profile.id))
    .returning();
  res.json(UpdateCareerProfileResponse.parse(updated));
});

router.get("/discovery/conversations", async (_req, res): Promise<void> => {
  const conversations = await db
    .select()
    .from(careerConversationsTable)
    .orderBy(desc(careerConversationsTable.updatedAt));
  res.json(ListCareerConversationsResponse.parse(conversations));
});

router.post("/discovery/conversations", async (req, res): Promise<void> => {
  const parsed = CreateCareerConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [conversation] = await db
    .insert(careerConversationsTable)
    .values({ title: parsed.data.title })
    .returning();
  res.status(201).json(CreateCareerConversationResponse.parse(conversation));
});

router.get("/discovery/conversations/:id/messages", async (req, res): Promise<void> => {
  const parsed = ListCareerMessagesParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [conversation] = await db
    .select({ id: careerConversationsTable.id })
    .from(careerConversationsTable)
    .where(eq(careerConversationsTable.id, parsed.data.id))
    .limit(1);
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found." });
    return;
  }
  const messages = await db
    .select()
    .from(careerMessagesTable)
    .where(eq(careerMessagesTable.conversationId, parsed.data.id))
    .orderBy(careerMessagesTable.createdAt);
  res.json(ListCareerMessagesResponse.parse(messages));
});

router.post("/discovery/conversations/:id/messages", async (req, res): Promise<void> => {
  const params = SendCareerMessageParams.safeParse(req.params);
  const body = SendCareerMessageBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [conversation] = await db
    .select()
    .from(careerConversationsTable)
    .where(eq(careerConversationsTable.id, params.data.id))
    .limit(1);
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found." });
    return;
  }
  const messages = await db
    .select()
    .from(careerMessagesTable)
    .where(eq(careerMessagesTable.conversationId, conversation.id))
    .orderBy(careerMessagesTable.createdAt);
  const profile = await getOrCreateProfile();
  let reply: string;
  try {
    reply = await reflectOnMessage(
      profile.summary,
      [
        ...messages.slice(-18).map((message) => ({
          role: message.role,
          content: message.content,
        })),
        { role: "user", content: body.data.content },
      ],
    );
  } catch (error) {
    logAiError(req, error);
    res.status(502).json({ error: "The AI could not respond just now. Please try again." });
    return;
  }
  const [userMessage, assistantMessage] = await db
    .insert(careerMessagesTable)
    .values([
      { conversationId: conversation.id, role: "user", content: body.data.content },
      { conversationId: conversation.id, role: "assistant", content: reply },
    ])
    .returning();
  await db
    .update(careerConversationsTable)
    .set({
      title:
        conversation.title === "A reflection"
          ? body.data.content.trim().replace(/\s+/g, " ").slice(0, 64) || "A reflection"
          : conversation.title,
      updatedAt: new Date(),
    })
    .where(eq(careerConversationsTable.id, conversation.id));
  res.status(201).json(
    SendCareerMessageResponse.parse({ userMessage, assistantMessage }),
  );
});

router.post("/discovery/conversations/:id/summary", async (req, res): Promise<void> => {
  const params = SummarizeCareerConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [conversation] = await db
    .select()
    .from(careerConversationsTable)
    .where(eq(careerConversationsTable.id, params.data.id))
    .limit(1);
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found." });
    return;
  }
  const messages = await db
    .select()
    .from(careerMessagesTable)
    .where(eq(careerMessagesTable.conversationId, conversation.id))
    .orderBy(careerMessagesTable.createdAt);
  if (messages.length === 0) {
    res.status(400).json({ error: "Add a few messages before summarizing." });
    return;
  }
  const profile = await getOrCreateProfile();
  let reflection: Awaited<ReturnType<typeof summarizeReflection>>;
  try {
    reflection = await summarizeReflection(
      profileSnapshot(profile),
      messages.map((message) => `${message.role}: ${message.content}`).join("\n"),
    );
  } catch (error) {
    logAiError(req, error);
    res.status(502).json({ error: "The AI could not summarize this conversation. Please try again." });
    return;
  }
  const [updatedProfile] = await db
    .update(careerProfilesTable)
    .set({ ...reflection.profile, updatedAt: new Date() })
    .where(eq(careerProfilesTable.id, profile.id))
    .returning();
  await db
    .update(careerConversationsTable)
    .set({ summary: reflection.summary, updatedAt: new Date() })
    .where(eq(careerConversationsTable.id, conversation.id));
  res.json(
    SummarizeCareerConversationResponse.parse({
      conversationId: conversation.id,
      summary: reflection.summary,
      profile: updatedProfile,
    }),
  );
});

router.get("/discovery/assessments", async (_req, res): Promise<void> => {
  const assessments = await db
    .select({
      id: careerAssessmentsTable.id,
      kind: careerAssessmentsTable.kind,
      scores: careerAssessmentsTable.scores,
      completedAt: careerAssessmentsTable.completedAt,
    })
    .from(careerAssessmentsTable)
    .where(isNotNull(careerAssessmentsTable.completedAt))
    .orderBy(desc(careerAssessmentsTable.completedAt));
  res.json(ListAssessmentResultsResponse.parse(assessments));
});

router.post("/discovery/assessments/start", async (req, res): Promise<void> => {
  const parsed = StartAssessmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let questions: AssessmentQuestion[];
  try {
    questions = await createAssessmentQuestions(parsed.data.kind);
  } catch (error) {
    logAiError(req, error);
    res.status(502).json({ error: "The assessment could not be prepared. Please try again." });
    return;
  }
  const [session] = await db
    .insert(careerAssessmentsTable)
    .values({ kind: parsed.data.kind, questions, answers: [], scores: [] })
    .returning();
  res.status(201).json(
    StartAssessmentResponse.parse({
      id: session.id,
      kind: session.kind,
      questions: session.questions,
    }),
  );
});

router.post("/discovery/assessments/:id/submit", async (req, res): Promise<void> => {
  const params = SubmitAssessmentParams.safeParse(req.params);
  const body = SubmitAssessmentBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [assessment] = await db
    .select()
    .from(careerAssessmentsTable)
    .where(eq(careerAssessmentsTable.id, params.data.id))
    .limit(1);
  if (!assessment) {
    res.status(404).json({ error: "Assessment not found." });
    return;
  }
  if (assessment.completedAt) {
    res.status(409).json({ error: "This assessment has already been completed." });
    return;
  }
  const questionIds = new Set(assessment.questions.map((question) => question.id));
  const answers = body.data.answers;
  if (
    answers.length !== questionIds.size ||
    new Set(answers.map((answer) => answer.questionId)).size !== answers.length ||
    answers.some((answer) => !questionIds.has(answer.questionId))
  ) {
    res.status(400).json({ error: "Answer every question once before submitting." });
    return;
  }
  const scores = scoreAssessment(assessment.questions, answers);
  const completedAt = new Date();
  const [updated] = await db
    .update(careerAssessmentsTable)
    .set({ answers, scores, completedAt })
    .where(eq(careerAssessmentsTable.id, assessment.id))
    .returning();
  res.status(201).json(
    SubmitAssessmentResponse.parse({
      id: updated.id,
      kind: updated.kind,
      scores: updated.scores,
      completedAt: updated.completedAt,
    }),
  );
});

router.get("/discovery/recommendations", async (_req, res): Promise<void> => {
  const recommendations = await db
    .select()
    .from(careerRecommendationsTable)
    .where(eq(careerRecommendationsTable.status, "new"))
    .orderBy(desc(careerRecommendationsTable.createdAt));
  res.json(ListCareerRecommendationsResponse.parse(recommendations));
});

router.post("/discovery/recommendations", async (req, res): Promise<void> => {
  const profile = await getOrCreateProfile();
  let suggestions: Awaited<ReturnType<typeof createRecommendations>>;
  try {
    suggestions = await createRecommendations(profileSnapshot(profile));
  } catch (error) {
    logAiError(req, error);
    res.status(502).json({ error: "Recommendations could not be generated. Please try again." });
    return;
  }
  const created = await db
    .insert(careerRecommendationsTable)
    .values(suggestions.map((suggestion) => ({ ...suggestion, status: "new" as const })))
    .returning();
  res.status(201).json(GenerateCareerRecommendationsResponse.parse(created));
});

router.patch("/discovery/recommendations/:id", async (req, res): Promise<void> => {
  const params = UpdateCareerRecommendationParams.safeParse(req.params);
  const body = UpdateCareerRecommendationBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [updated] = await db
    .update(careerRecommendationsTable)
    .set({ status: body.data.status })
    .where(eq(careerRecommendationsTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Recommendation not found." });
    return;
  }
  res.json(UpdateCareerRecommendationResponse.parse(updated));
});

router.get("/discovery/dashboard", async (_req, res): Promise<void> => {
  const profile = await getOrCreateProfile();
  const [
    [conversationCount],
    [assessmentCount],
    [recommendationCount],
    latestConversation,
    conversations,
    assessments,
    recommendations,
  ] = await Promise.all([
    db.select({ count: count() }).from(careerConversationsTable),
    db
      .select({ count: count() })
      .from(careerAssessmentsTable)
      .where(isNotNull(careerAssessmentsTable.completedAt)),
    db
      .select({ count: count() })
      .from(careerRecommendationsTable)
      .where(eq(careerRecommendationsTable.status, "new")),
    db
      .select({ summary: careerConversationsTable.summary })
      .from(careerConversationsTable)
      .where(isNotNull(careerConversationsTable.summary))
      .orderBy(desc(careerConversationsTable.updatedAt))
      .limit(1),
    db
      .select({ title: careerConversationsTable.title, createdAt: careerConversationsTable.updatedAt })
      .from(careerConversationsTable)
      .orderBy(desc(careerConversationsTable.updatedAt))
      .limit(4),
    db
      .select({ kind: careerAssessmentsTable.kind, createdAt: careerAssessmentsTable.completedAt })
      .from(careerAssessmentsTable)
      .where(isNotNull(careerAssessmentsTable.completedAt))
      .orderBy(desc(careerAssessmentsTable.completedAt))
      .limit(4),
    db
      .select({ title: careerRecommendationsTable.title, createdAt: careerRecommendationsTable.createdAt })
      .from(careerRecommendationsTable)
      .orderBy(desc(careerRecommendationsTable.createdAt))
      .limit(4),
  ]);
  const recentActivity = [
    ...conversations.map((item) => ({
      kind: "conversation" as const,
      label: item.title,
      createdAt: item.createdAt,
    })),
    ...assessments.flatMap((item) =>
      item.createdAt
        ? [
            {
              kind: "assessment" as const,
              label: item.kind === "interests" ? "Interest reflection completed" : "Work-style reflection completed",
              createdAt: item.createdAt,
            },
          ]
        : [],
    ),
    ...recommendations.map((item) => ({
      kind: "recommendation" as const,
      label: item.title,
      createdAt: item.createdAt,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 6);
  res.json(
    GetDiscoveryDashboardResponse.parse({
      profile,
      conversationCount: conversationCount.count,
      assessmentCount: assessmentCount.count,
      recommendationCount: recommendationCount.count,
      latestSummary: latestConversation[0]?.summary ?? null,
      recentActivity,
    }),
  );
});

export default router;
