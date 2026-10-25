import { Router, type IRouter, type Request } from "express";
import { and, count, desc, eq, gte, isNotNull, isNull, ne, type AnyColumn } from "drizzle-orm";
import { appUsersTable, db } from "@workspace/db";
import {
  careerAssessmentsTable,
  careerConversationsTable,
  careerMessagesTable,
  careerProfilesTable,
  careerRecommendationsTable,
  type AssessmentKind,
  type AssessmentQuestion,
  type TraitScore,
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
  synthesizeProfileFromEvidence,
  summarizeReflection,
} from "../lib/career-ai";

const router: IRouter = Router();

function authenticatedUserId(req: Request): string {
  if (!req.authUser) throw new Error("Authentication middleware did not provide a user.");
  return req.authUser.id;
}

async function getOrCreateProfile(userId: string): Promise<CareerProfile> {
  return db.transaction(async (tx) => {
    // Serialize first-profile creation for this user without imposing a destructive
    // unique-constraint migration on the existing single-user profile table.
    await tx
      .select({ id: appUsersTable.id })
      .from(appUsersTable)
      .where(eq(appUsersTable.id, userId))
      .for("update");
    const [existing] = await tx
      .select()
      .from(careerProfilesTable)
      .where(eq(careerProfilesTable.userId, userId))
      .limit(1);
    if (existing) return existing;
    const [profile] = await tx
      .insert(careerProfilesTable)
      .values({ userId, summary: "", strengths: [], interests: [], workPreferences: [] })
      .returning();
    if (!profile) throw new Error("Unable to initialize the career profile.");
    return profile;
  });
}

function profileSnapshot(profile: CareerProfile) {
  return {
    summary: profile.summary,
    strengths: profile.strengths,
    interests: profile.interests,
    workPreferences: profile.workPreferences,
  };
}

function sinceFreshStart(column: AnyColumn, profile: CareerProfile) {
  return profile.freshStartedAt ? gte(column, profile.freshStartedAt) : undefined;
}

function sameWorkspace(profile: CareerProfile) {
  return profile.freshStartedAt
    ? eq(careerProfilesTable.freshStartedAt, profile.freshStartedAt)
    : isNull(careerProfilesTable.freshStartedAt);
}

router.post("/discovery/fresh-start", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  await getOrCreateProfile(userId);
  const [profile] = await db.update(careerProfilesTable).set({
    summary: "", strengths: [], interests: [], workPreferences: [],
    freshStartedAt: new Date(), updatedAt: new Date(),
  }).where(eq(careerProfilesTable.userId, userId)).returning();
  res.json(GetCareerProfileResponse.parse(profile));
});

function logAiError(req: Request, error: unknown) {
  req.log.error({ err: error }, "Career exploration AI request failed");
}

router.get("/discovery/profile", async (req, res): Promise<void> => {
  const profile = await getOrCreateProfile(authenticatedUserId(req));
  res.json(GetCareerProfileResponse.parse(profile));
});

router.patch("/discovery/profile", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  const parsed = UpdateCareerProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const profile = await getOrCreateProfile(userId);
  const [updated] = await db
    .update(careerProfilesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(careerProfilesTable.id, profile.id), eq(careerProfilesTable.userId, userId)))
    .returning();
  res.json(UpdateCareerProfileResponse.parse(updated));
});

router.get("/discovery/conversations", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  const profile = await getOrCreateProfile(userId);
  const conversations = await db
    .select()
    .from(careerConversationsTable)
    .where(eq(careerConversationsTable.userId, userId))
    .orderBy(desc(careerConversationsTable.updatedAt));
  res.json(ListCareerConversationsResponse.parse(conversations.map(conversation => ({
    ...conversation,
    archived: !!profile.freshStartedAt && conversation.createdAt < profile.freshStartedAt,
  }))));
});

router.post("/discovery/conversations", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  const parsed = CreateCareerConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [conversation] = await db
    .insert(careerConversationsTable)
    .values({ title: parsed.data.title, userId })
    .returning();
  res.status(201).json(CreateCareerConversationResponse.parse(conversation));
});

router.get("/discovery/conversations/:id/messages", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  const parsed = ListCareerMessagesParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [conversation] = await db
    .select({ id: careerConversationsTable.id })
    .from(careerConversationsTable)
    .where(and(eq(careerConversationsTable.id, parsed.data.id), eq(careerConversationsTable.userId, userId)))
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
  const userId = authenticatedUserId(req);
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
    .where(and(eq(careerConversationsTable.id, params.data.id), eq(careerConversationsTable.userId, userId)))
    .limit(1);
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found." });
    return;
  }
  const requestKey = req.get("Idempotency-Key");
  const profile = await getOrCreateProfile(userId);
  if (profile.freshStartedAt && conversation.createdAt < profile.freshStartedAt) {
    res.status(409).json({ error: "This is a saved past chat. Start a new conversation to continue in your fresh workspace." });
    return;
  }
  if (requestKey && !/^[a-zA-Z0-9-]{16,80}$/.test(requestKey)) {
    res.status(400).json({ error: "Invalid message request identifier." });
    return;
  }
  if (requestKey) {
    const saved = await db.select().from(careerMessagesTable).where(and(
      eq(careerMessagesTable.conversationId, conversation.id),
      eq(careerMessagesTable.requestKey, requestKey),
    ));
    const userMessage = saved.find((message) => message.role === "user");
    const assistantMessage = saved.find((message) => message.role === "assistant");
    if (userMessage && assistantMessage) {
      if (userMessage.content !== body.data.content) {
        res.status(409).json({ error: "This request identifier belongs to a different message." });
        return;
      }
      res.json(SendCareerMessageResponse.parse({ userMessage, assistantMessage }));
      return;
    }
  }
  const messages = await db
    .select()
    .from(careerMessagesTable)
    .where(eq(careerMessagesTable.conversationId, conversation.id))
    .orderBy(careerMessagesTable.createdAt);
  let assistantTurnsSinceProposal = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant") continue;
    if (
      /^the problem:/im.test(message.content) &&
      /^the fix:/im.test(message.content)
    ) {
      break;
    }
    assistantTurnsSinceProposal += 1;
  }
  const proposalRequired = assistantTurnsSinceProposal >= 2;
  const [savedReflections, recentUserMessages, recentAssessments] = await Promise.all([
    db
      .select({
        title: careerConversationsTable.title,
        summary: careerConversationsTable.summary,
      })
      .from(careerConversationsTable)
      .where(and(isNotNull(careerConversationsTable.summary), eq(careerConversationsTable.userId, userId), sinceFreshStart(careerConversationsTable.createdAt, profile)))
      .orderBy(desc(careerConversationsTable.updatedAt))
      .limit(8),
    db
      .select({
        title: careerConversationsTable.title,
        content: careerMessagesTable.content,
      })
      .from(careerMessagesTable)
      .innerJoin(
        careerConversationsTable,
        eq(careerMessagesTable.conversationId, careerConversationsTable.id),
      )
      .where(
        and(
          ne(careerMessagesTable.conversationId, conversation.id),
          eq(careerMessagesTable.role, "user"),
          eq(careerConversationsTable.userId, userId),
          sinceFreshStart(careerConversationsTable.createdAt, profile),
        ),
      )
      .orderBy(desc(careerMessagesTable.createdAt))
      .limit(8),
    db
      .selectDistinctOn([careerAssessmentsTable.kind], {
        kind: careerAssessmentsTable.kind,
        scores: careerAssessmentsTable.scores,
        completedAt: careerAssessmentsTable.completedAt,
      })
      .from(careerAssessmentsTable)
      .where(
        and(
          isNotNull(careerAssessmentsTable.completedAt),
          eq(careerAssessmentsTable.verificationRun, false),
          eq(careerAssessmentsTable.userId, userId),
          sinceFreshStart(careerAssessmentsTable.createdAt, profile),
        ),
      )
      .orderBy(careerAssessmentsTable.kind, desc(careerAssessmentsTable.completedAt)),
  ]);
  const memoryContext = JSON.stringify({
    profile: profileSnapshot(profile),
    savedReflections: savedReflections.map(({ title, summary }) => ({
      title,
      summary: summary?.slice(0, 1200),
    })),
    recentUserMessages: recentUserMessages.map(({ title, content }) => ({
      title,
      content: content.slice(0, 500),
    })),
    recentExploratoryAssessments: recentAssessments,
  });
  let reply: string;
  try {
    reply = await reflectOnMessage(
      memoryContext,
      [
        ...messages.slice(-18).map((message) => ({
          role: message.role,
          content: message.content,
        })),
        { role: "user", content: body.data.content },
      ],
      proposalRequired,
    );
  } catch (error) {
    logAiError(req, error);
    res.status(502).json({ error: "The AI could not respond just now. Please try again." });
    return;
  }
  const insertedMessages = await db
    .insert(careerMessagesTable)
    .values([
      { conversationId: conversation.id, role: "user", content: body.data.content, requestKey },
      { conversationId: conversation.id, role: "assistant", content: reply, requestKey },
    ])
    .onConflictDoNothing()
    .returning();
  const persistedMessages = insertedMessages.length === 2 ? insertedMessages : await db
    .select().from(careerMessagesTable).where(and(
      eq(careerMessagesTable.conversationId, conversation.id),
      eq(careerMessagesTable.requestKey, requestKey!),
    ));
  const userMessage = persistedMessages.find((message) => message.role === "user");
  const assistantMessage = persistedMessages.find((message) => message.role === "assistant");
  if (!userMessage || !assistantMessage || userMessage.content !== body.data.content) {
    res.status(409).json({ error: "The message could not be reconciled. Please reload this conversation before trying again." });
    return;
  }
  await db
    .update(careerConversationsTable)
    .set({
      title:
        conversation.title === "A reflection"
          ? body.data.content.trim().replace(/\s+/g, " ").slice(0, 64) || "A reflection"
          : conversation.title,
      updatedAt: new Date(),
    })
    .where(and(eq(careerConversationsTable.id, conversation.id), eq(careerConversationsTable.userId, userId)));
  res.status(201).json(
    SendCareerMessageResponse.parse({ userMessage, assistantMessage }),
  );
});

router.post("/discovery/conversations/:id/summary", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  const params = SummarizeCareerConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [conversation] = await db
    .select()
    .from(careerConversationsTable)
    .where(and(eq(careerConversationsTable.id, params.data.id), eq(careerConversationsTable.userId, userId)))
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
  const profile = await getOrCreateProfile(userId);
  let reflection: Awaited<ReturnType<typeof summarizeReflection>>;
  if (profile.freshStartedAt && conversation.createdAt < profile.freshStartedAt) {
    res.status(409).json({ error: "Past chats are read-only after starting fresh." });
    return;
  }
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
    .where(and(eq(careerProfilesTable.id, profile.id), eq(careerProfilesTable.userId, userId), sameWorkspace(profile)))
    .returning();
  if (!updatedProfile) {
    res.status(409).json({ error: "Your workspace was reset while this summary was being prepared. The old summary was not added." });
    return;
  }
  await db
    .update(careerConversationsTable)
    .set({ summary: reflection.summary, updatedAt: new Date() })
    .where(and(eq(careerConversationsTable.id, conversation.id), eq(careerConversationsTable.userId, userId)));
  res.json(
    SummarizeCareerConversationResponse.parse({
      conversationId: conversation.id,
      summary: reflection.summary,
      profile: updatedProfile,
    }),
  );
});

router.get("/discovery/assessments", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  const profile = await getOrCreateProfile(userId);
  const assessments = await db
    .select({
      id: careerAssessmentsTable.id,
      kind: careerAssessmentsTable.kind,
      questions: careerAssessmentsTable.questions,
      answers: careerAssessmentsTable.answers,
      scores: careerAssessmentsTable.scores,
      completedAt: careerAssessmentsTable.completedAt,
      verificationRun: careerAssessmentsTable.verificationRun,
    })
    .from(careerAssessmentsTable)
    .where(and(isNotNull(careerAssessmentsTable.completedAt), eq(careerAssessmentsTable.userId, userId), sinceFreshStart(careerAssessmentsTable.createdAt, profile)))
    .orderBy(desc(careerAssessmentsTable.completedAt));
  res.json(ListAssessmentResultsResponse.parse(assessments));
});

router.post("/discovery/assessments/start", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  const startedAt = new Date();
  const parsed = StartAssessmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const verificationRun =
    parsed.data.verificationRun === true && process.env.NODE_ENV !== "production";
  const previousQuestions =
    parsed.data.kind === "riasec" || parsed.data.kind === "ipip"
      ? (
          await db
            .select({ questions: careerAssessmentsTable.questions })
            .from(careerAssessmentsTable)
            .where(and(eq(careerAssessmentsTable.kind, parsed.data.kind), eq(careerAssessmentsTable.userId, userId)))
        ).flatMap((assessment) => assessment.questions)
      : [];
  let questions: AssessmentQuestion[];
  try {
    questions = await createAssessmentQuestions(
      parsed.data.kind,
      previousQuestions,
      verificationRun,
    );
  } catch (error) {
    logAiError(req, error);
    res.status(502).json({ error: "The assessment could not be prepared. Please try again." });
    return;
  }
  const [session] = await db
    .insert(careerAssessmentsTable)
    .values({
      kind: parsed.data.kind,
      userId,
      questions,
      answers: [],
      scores: [],
      verificationRun,
      createdAt: startedAt,
    })
    .returning();
  res.status(201).json(
    StartAssessmentResponse.parse({
      id: session.id,
      kind: session.kind,
      questions: session.questions,
      verificationRun: session.verificationRun,
    }),
  );
});

router.post("/discovery/assessments/:id/submit", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
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
    .where(and(eq(careerAssessmentsTable.id, params.data.id), eq(careerAssessmentsTable.userId, userId)))
    .limit(1);
  if (!assessment) {
    res.status(404).json({ error: "Assessment not found." });
    return;
  }
  if (assessment.completedAt) {
    res.status(409).json({ error: "This assessment has already been completed." });
    return;
  }
  const activeProfile = await getOrCreateProfile(userId);
  if (activeProfile.freshStartedAt && assessment.createdAt < activeProfile.freshStartedAt) {
    res.status(409).json({ error: "This test belongs to a previous workspace. Start a new test." });
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
  const scores = scoreAssessment(assessment.questions, answers, assessment.kind as AssessmentKind);
  const completedAt = new Date();
  const [updated] = await db
    .update(careerAssessmentsTable)
    .set({ answers, scores, completedAt })
    .where(and(eq(careerAssessmentsTable.id, assessment.id), eq(careerAssessmentsTable.userId, userId)))
    .returning();
  let profileUpdated = false;
  if (!updated.verificationRun) {
    const profile = await getOrCreateProfile(userId);
    const [savedConversationSummaries, completedAssessments] = await Promise.all([
      db
        .select({
          title: careerConversationsTable.title,
          summary: careerConversationsTable.summary,
        })
        .from(careerConversationsTable)
        .where(and(isNotNull(careerConversationsTable.summary), eq(careerConversationsTable.userId, userId), sinceFreshStart(careerConversationsTable.createdAt, profile)))
        .orderBy(desc(careerConversationsTable.updatedAt))
        .limit(8),
      db
        .select({
          kind: careerAssessmentsTable.kind,
          scores: careerAssessmentsTable.scores,
          completedAt: careerAssessmentsTable.completedAt,
        })
        .from(careerAssessmentsTable)
        .where(
          and(
            isNotNull(careerAssessmentsTable.completedAt),
            eq(careerAssessmentsTable.verificationRun, false),
            eq(careerAssessmentsTable.userId, userId),
            sinceFreshStart(careerAssessmentsTable.createdAt, profile),
          ),
        )
        .orderBy(desc(careerAssessmentsTable.completedAt))
        .limit(8),
    ]);
    let profileUpdate: Pick<
      CareerProfile,
      "summary" | "strengths" | "interests" | "workPreferences"
    >;
    try {
      profileUpdate = await synthesizeProfileFromEvidence(
        profile,
        savedConversationSummaries,
        completedAssessments.map((item) => ({
          ...item,
          kind: item.kind as AssessmentKind,
        })),
      );
    } catch (error) {
      logAiError(req, error);
      const scoreNote = `Exploratory ${assessment.kind} scores (${scores
        .map((score) => `${score.trait}: ${score.score}`)
        .join(", ")}). This is a reflection signal, not a measure of ability.`;
      profileUpdate = {
        summary: [profile.summary.trim(), scoreNote].filter(Boolean).join("\n\n"),
        strengths: profile.strengths,
        interests:
          assessment.kind === "riasec"
            ? [...new Set([...profile.interests, ...scores.slice(0, 3).map((score) => `${score.trait} interest`)])].slice(0, 8)
            : profile.interests,
        workPreferences:
          assessment.kind === "ipip"
            ? [...new Set([...profile.workPreferences, ...scores.slice(0, 2).map((score) => `${score.trait} pattern`)])].slice(0, 8)
            : profile.workPreferences,
      };
    }
    const [updatedProfile] = await db
      .update(careerProfilesTable)
      .set({ ...profileUpdate, updatedAt: new Date() })
      .where(and(eq(careerProfilesTable.id, profile.id), eq(careerProfilesTable.userId, userId), sameWorkspace(profile)))
      .returning();
    profileUpdated = Boolean(updatedProfile);
  }
  res.status(201).json(
    SubmitAssessmentResponse.parse({
      id: updated.id,
      kind: updated.kind,
      questions: updated.questions,
      answers: updated.answers,
      scores: updated.scores,
      completedAt: updated.completedAt,
      verificationRun: updated.verificationRun,
      profileUpdated,
    }),
  );
});

router.get("/discovery/recommendations", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  const profile = await getOrCreateProfile(userId);
  const recommendations = await db
    .select()
    .from(careerRecommendationsTable)
    .where(and(eq(careerRecommendationsTable.status, "new"), eq(careerRecommendationsTable.userId, userId), sinceFreshStart(careerRecommendationsTable.createdAt, profile)))
    .orderBy(desc(careerRecommendationsTable.createdAt));
  res.json(ListCareerRecommendationsResponse.parse(recommendations));
});

router.post("/discovery/recommendations", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  const startedAt = new Date();
  const profile = await getOrCreateProfile(userId);
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
    .values(suggestions.map((suggestion) => ({ ...suggestion, userId, status: "new" as const, createdAt: startedAt })))
    .returning();
  res.status(201).json(GenerateCareerRecommendationsResponse.parse(created));
});

router.patch("/discovery/recommendations/:id", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
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
    .where(and(eq(careerRecommendationsTable.id, params.data.id), eq(careerRecommendationsTable.userId, userId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Recommendation not found." });
    return;
  }
  res.json(UpdateCareerRecommendationResponse.parse(updated));
});

router.get("/discovery/dashboard", async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  const profile = await getOrCreateProfile(userId);
  const [
    [conversationCount],
    [assessmentCount],
    [recommendationCount],
    latestConversation,
    conversations,
    assessments,
    recommendations,
  ] = await Promise.all([
    db.select({ count: count() }).from(careerConversationsTable).where(and(eq(careerConversationsTable.userId, userId), sinceFreshStart(careerConversationsTable.createdAt, profile))),
    db
      .select({ count: count() })
      .from(careerAssessmentsTable)
      .where(
        and(
          isNotNull(careerAssessmentsTable.completedAt),
          eq(careerAssessmentsTable.verificationRun, false),
          eq(careerAssessmentsTable.userId, userId),
          sinceFreshStart(careerAssessmentsTable.createdAt, profile),
        ),
      ),
    db
      .select({ count: count() })
      .from(careerRecommendationsTable)
      .where(and(eq(careerRecommendationsTable.status, "new"), eq(careerRecommendationsTable.userId, userId), sinceFreshStart(careerRecommendationsTable.createdAt, profile))),
    db
      .select({ summary: careerConversationsTable.summary })
      .from(careerConversationsTable)
      .where(and(isNotNull(careerConversationsTable.summary), eq(careerConversationsTable.userId, userId), sinceFreshStart(careerConversationsTable.createdAt, profile)))
      .orderBy(desc(careerConversationsTable.updatedAt))
      .limit(1),
    db
      .select({ title: careerConversationsTable.title, createdAt: careerConversationsTable.updatedAt })
      .from(careerConversationsTable)
      .where(and(eq(careerConversationsTable.userId, userId), sinceFreshStart(careerConversationsTable.createdAt, profile)))
      .orderBy(desc(careerConversationsTable.updatedAt))
      .limit(4),
    db
      .select({ kind: careerAssessmentsTable.kind, createdAt: careerAssessmentsTable.completedAt })
      .from(careerAssessmentsTable)
      .where(
        and(
          isNotNull(careerAssessmentsTable.completedAt),
          eq(careerAssessmentsTable.verificationRun, false),
          eq(careerAssessmentsTable.userId, userId),
          sinceFreshStart(careerAssessmentsTable.createdAt, profile),
        ),
      )
      .orderBy(desc(careerAssessmentsTable.completedAt))
      .limit(4),
    db
      .select({ title: careerRecommendationsTable.title, createdAt: careerRecommendationsTable.createdAt })
      .from(careerRecommendationsTable)
      .where(and(eq(careerRecommendationsTable.userId, userId), sinceFreshStart(careerRecommendationsTable.createdAt, profile)))
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
              label:
                item.kind === "riasec"
                  ? "RIASEC interest test completed"
                  : item.kind === "ipip"
                    ? "Big Five work-style test completed"
                    : item.kind === "interests"
                      ? "Interest reflection completed"
                      : "Work-style reflection completed",
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
